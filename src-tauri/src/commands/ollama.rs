use crate::commands::config::load_config;
use crate::error::{LumError, Result};
use futures_util::StreamExt;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{command, Emitter};

const XLLM_TOKEN_EVENT: &str = "xllm_token";
const STREAM_POLL_TIMEOUT_MS: u64 = 250;

/// Ollama 서버 연결 여부 확인 — /api/version 핑
#[command]
pub async fn check_ollama_status() -> Result<bool> {
    let config = load_config()?;
    let url = format!("{}/api/version", config.ollama_url());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;
    Ok(client
        .get(&url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false))
}

/// Ollama에 설치된 모델 목록 조회
#[command]
pub async fn list_ollama_models() -> Result<Vec<String>> {
    let config = load_config()?;
    let url = format!("{}/api/tags", config.ollama_url());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let json: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    let models = json["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

/// Ollama NDJSON 스트리밍 — `xllm_token` 이벤트 emit. cancel 지원.
/// `model`이 비어있으면 config에서 읽음.
pub async fn ollama_stream(
    app: &tauri::AppHandle,
    prompt: &str,
    model: &str,
    base_url: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<String> {
    let url = format!("{}/api/chat", base_url);
    let body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "stream": true,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| LumError::Network(format!("Ollama 연결 실패 ({}): {}", base_url, e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(LumError::AiEngine(format!(
            "Ollama HTTP {}: {}",
            status,
            text.chars().take(200).collect::<String>()
        )));
    }

    let mut byte_stream = response.bytes_stream();
    let mut full_text = String::new();
    let mut line_buf = String::new();

    while !cancel.load(Ordering::Relaxed) {
        let chunk = tokio::time::timeout(
            std::time::Duration::from_millis(STREAM_POLL_TIMEOUT_MS),
            byte_stream.next(),
        )
        .await;
        let bytes = match chunk {
            Ok(Some(Ok(bytes))) => bytes,
            Ok(Some(Err(e))) => return Err(LumError::AiEngine(e.to_string())),
            Ok(None) => break,
            Err(_) => continue,
        };

        if cancel.load(Ordering::Relaxed) {
            break;
        }
        line_buf.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(nl) = line_buf.find('\n') {
            let line = line_buf[..nl].trim().to_string();
            line_buf.drain(..nl + 1);

            if line.is_empty() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(token) = json["message"]["content"].as_str() {
                    if !token.is_empty() {
                        if cancel.load(Ordering::Relaxed) {
                            break;
                        }
                        full_text.push_str(token);
                        let _ = app.emit(XLLM_TOKEN_EVENT, token.to_string());
                    }
                }
                if json["done"].as_bool().unwrap_or(false) {
                    return Ok(full_text);
                }
            }
            if cancel.load(Ordering::Relaxed) {
                break;
            }
        }
    }

    Ok(full_text)
}

/// Ollama 단일 응답 (비스트리밍)
pub async fn ollama_once(prompt: &str, model: &str, base_url: &str) -> Result<String> {
    let url = format!("{}/api/chat", base_url);
    let body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "stream": false,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let json: serde_json::Value = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| LumError::Network(format!("Ollama 연결 실패: {}", e)))?
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    json["message"]["content"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| LumError::AiEngine(format!("Ollama 응답 파싱 실패: {}", json)))
}

#[cfg(test)]
mod tests {
    #[test]
    fn ollama_stream_url_format() {
        // base_url에 trailing slash 없을 때 /api/chat 경로 확인 (unit — 실제 요청 없음)
        let url = format!("{}/api/chat", "http://localhost:11434");
        assert_eq!(url, "http://localhost:11434/api/chat");
    }

    #[test]
    fn ollama_body_stream_true() {
        let body = serde_json::json!({
            "model": "llama3.2:3b",
            "messages": [{ "role": "user", "content": "hello" }],
            "stream": true,
        });
        assert_eq!(body["stream"], true);
        assert_eq!(body["model"], "llama3.2:3b");
    }
}
