use crate::commands::config::load_config;
use crate::error::{LumError, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone)]
pub struct XllmModelInfo {
    pub id: String,
    pub max_seq_len: Option<u32>,
    pub cache_mode: Option<String>,
    pub rope_scale: Option<f32>,
}

/// macOS/Linux: mlx_lm.server 프로세스의 `--model` 인자에서 실제 로드된 모델 ID 추출.
/// `/v1/models`가 캐시 목록을 MRU 순으로 반환해 첫 엔트리가 로드된 모델과 다른 문제 우회.
#[cfg(not(windows))]
fn detect_mlx_loaded_model() -> Option<String> {
    let out = std::process::Command::new("ps")
        .args(["-Ao", "command="])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    for line in stdout.lines() {
        if !line.contains("mlx_lm.server") {
            continue;
        }
        // "--model <value>" 뒤 토큰 추출 (공백 포함 경로는 보통 없음, 경로엔 공백 허용)
        let mut tokens = line.split_whitespace();
        while let Some(t) = tokens.next() {
            if t == "--model" {
                if let Some(v) = tokens.next() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

#[cfg(windows)]
fn detect_mlx_loaded_model() -> Option<String> {
    None // Windows는 TabbyAPI 기본이라 /v1/model 폴백이 정확
}

fn is_network_error(err: &LumError) -> bool {
    matches!(err, LumError::Network(_))
}

async fn fetch_xllm_model_info_one(
    client: &reqwest::Client,
    base_url: &str,
    xllm_api_key: Option<&String>,
) -> Result<XllmModelInfo> {
    // 1차: /v1/model (단수) — 실제 로드된 모델만 반환
    let model_url = format!("{}/v1/model", base_url);
    let mut req = client.get(&model_url);
    if let Some(key) = xllm_api_key {
        req = req.header("x-api-key", key);
    }
    if let Ok(resp) = req.send().await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(id) = json["id"].as_str() {
                return Ok(XllmModelInfo {
                    id: id.to_string(),
                    max_seq_len: json["parameters"]["max_seq_len"].as_u64().map(|v| v as u32),
                    cache_mode: json["parameters"]["cache_mode"]
                        .as_str()
                        .map(|s| s.to_string()),
                    rope_scale: json["parameters"]["rope_scale"].as_f64().map(|v| v as f32),
                });
            }
            if json.get("detail").is_some() {
                return Ok(XllmModelInfo {
                    id: "unknown".to_string(),
                    max_seq_len: None,
                    cache_mode: None,
                    rope_scale: None,
                });
            }
        }
    }

    // 2차 폴백: /v1/models 첫 엔트리
    let models_url = format!("{}/v1/models", base_url);
    let mut req2 = client.get(&models_url);
    if let Some(key) = xllm_api_key {
        req2 = req2.header("x-api-key", key);
    }
    let res: serde_json::Value = req2
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    let id = res["data"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|f| f["id"].as_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(XllmModelInfo {
        id,
        max_seq_len: None,
        cache_mode: None,
        rope_scale: None,
    })
}

async fn fetch_xllm_model_info(
    client: &reqwest::Client,
    base_urls: &[String],
    xllm_api_key: Option<&String>,
) -> Result<XllmModelInfo> {
    let mut last_network_error: Option<LumError> = None;
    let total = base_urls.len();

    for (idx, base_url) in base_urls.iter().enumerate() {
        match fetch_xllm_model_info_one(client, base_url, xllm_api_key).await {
            Ok(info) => return Ok(info),
            Err(err) if is_network_error(&err) && idx + 1 < total => {
                last_network_error = Some(err);
            }
            Err(err) => return Err(err),
        }
    }

    Err(last_network_error.unwrap_or_else(|| {
        LumError::Network("xLLM 모델 조회에 사용 가능한 후보 URL이 없습니다".into())
    }))
}

async fn post_xllm_with_candidates(
    client: &reqwest::Client,
    base_urls: &[String],
    path: &str,
    body: serde_json::Value,
    xllm_api_key: Option<&String>,
    xllm_admin_key: Option<&String>,
) -> Result<reqwest::Response> {
    let mut last_network_error: Option<LumError> = None;
    let total = base_urls.len();

    for (idx, base_url) in base_urls.iter().enumerate() {
        let url = format!("{}/{}", base_url, path);
        let mut req = client.post(&url).json(&body);
        if let Some(key) = xllm_api_key {
            req = req.header("x-api-key", key);
        }
        if let Some(key) = xllm_admin_key {
            req = req.header("x-admin-key", key);
        }

        match req.send().await {
            Ok(resp) => return Ok(resp),
            Err(err) if idx + 1 < total => {
                last_network_error = Some(LumError::Network(err.to_string()));
            }
            Err(err) => {
                return Err(LumError::Network(format!(
                    "xLLM post 요청 실패 ({}): {}",
                    url, err
                )))
            }
        }
    }

    Err(last_network_error.unwrap_or_else(|| {
        LumError::Network("xLLM post 요청에 사용 가능한 후보 URL이 없습니다".into())
    }))
}

/// 현재 로드된 모델 정보 조회.
/// Apple Silicon(MLX-LM): ps 파서로 --model 인자 읽기
/// TabbyAPI: /v1/model(단수) 먼저 — 실제 로드된 모델만 반환.
///   /v1/models(복수)는 디렉토리의 모든 모델을 MRU 순으로 반환해 첫 엔트리가
///   로드된 모델과 다른 문제가 있어 fallback으로만 사용.
#[tauri::command]
pub async fn get_xllm_model_info() -> Result<XllmModelInfo> {
    let config = load_config()?;
    let base_urls = config.xllm_url_candidates();

    // MLX-LM 먼저 시도 (ps --model)
    if let Some(model) = detect_mlx_loaded_model() {
        return Ok(XllmModelInfo {
            id: model,
            max_seq_len: None,
            cache_mode: None,
            rope_scale: None,
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    fetch_xllm_model_info(&client, &base_urls, config.xllm_api_key.as_ref()).await
}

/// ② 모델 전환 (TabbyAPI POST /v1/model/load)
/// cache_mode: "Q4" | "Q8" | "FP16"
/// max_seq_len: 컨텍스트 창 크기 (Q4 KV cache에서는 32768도 가능)
#[tauri::command]
pub async fn switch_xllm_model(
    app: AppHandle,
    model_name: String,
    cache_mode: Option<String>,
    max_seq_len: Option<u32>,
) -> Result<String> {
    let config = load_config()?;
    let base_urls = config.xllm_url_candidates();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // 큰 모델은 3~5분 소요
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let mut body = serde_json::json!({ "model_name": model_name });
    let cm = cache_mode
        .as_deref()
        .or(config.cache_mode.as_deref())
        .unwrap_or("Q8");
    body["cache_mode"] = serde_json::Value::String(cm.to_string());
    let msl = max_seq_len.or(config.max_seq_len).unwrap_or(8192);
    body["max_seq_len"] = serde_json::Value::Number(msl.into());

    let resp = post_xllm_with_candidates(
        &client,
        &base_urls,
        "v1/model/load",
        body,
        config.xllm_api_key.as_ref(),
        config.xllm_admin_key.as_ref(),
    )
    .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(LumError::AiEngine(format!(
            "모델 로드 실패 HTTP {}: {}",
            status, body_text
        )));
    }

    // SSE 스트림 파싱 — TabbyAPI는 진행률을 chunk로 보내고, 실패 시 {"error":...} 보냄
    let mut stream = resp.bytes_stream();
    let mut line_buf = String::new();
    let mut last_module = 0u64;
    let mut last_modules = 0u64;

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| LumError::Network(e.to_string()))?;
        line_buf.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(nl) = line_buf.find('\n') {
            let line = line_buf[..nl].trim().to_string();
            line_buf.drain(..nl + 1);
            let Some(data) = line.strip_prefix("data: ") else {
                continue;
            };
            let Ok(json) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };

            if let Some(err) = json.get("error") {
                let msg = err
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("알 수 없는 오류");
                return Err(LumError::AiEngine(format!(
                    "모델 '{}' 로드 실패: {}",
                    model_name,
                    msg.trim()
                )));
            }

            if let (Some(m), Some(total)) = (
                json.get("module").and_then(|v| v.as_u64()),
                json.get("modules").and_then(|v| v.as_u64()),
            ) {
                last_module = m;
                last_modules = total;
                let _ = app.emit(
                    "xllm_load_progress",
                    serde_json::json!({
                        "model": model_name,
                        "module": m,
                        "modules": total,
                        "percent": (m as f32 / total.max(1) as f32 * 100.0) as u32,
                    }),
                );
            }
        }
    }

    if last_modules > 0 && last_module < last_modules {
        return Err(LumError::AiEngine(format!(
            "모델 로드가 중단됨 ({}/{})",
            last_module, last_modules
        )));
    }

    Ok(format!(
        "모델 '{}' 로드 완료 (cache_mode={}, max_seq_len={})",
        model_name, cm, msl
    ))
}

/// 현재 모델 언로드 (TabbyAPI POST /v1/model/unload)
#[tauri::command]
pub async fn unload_xllm_model() -> Result<String> {
    let config = load_config()?;
    let base_urls = config.xllm_url_candidates();
    let client = reqwest::Client::new();
    let _resp = post_xllm_with_candidates(
        &client,
        &base_urls,
        "v1/model/unload",
        serde_json::json!({}),
        None,
        config.xllm_admin_key.as_ref(),
    )
    .await?;

    Ok("모델 언로드 완료".to_string())
}
