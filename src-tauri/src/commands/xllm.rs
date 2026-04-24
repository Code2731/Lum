use crate::commands::config::load_config;
use crate::error::{LumError, Result};
use serde::{Deserialize, Serialize};

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

/// 현재 로드된 모델 정보 조회.
/// Apple Silicon(MLX-LM): ps 파서로 --model 인자 읽기 (가장 정확)
/// 그 외: /v1/models 첫 엔트리 → /v1/model 폴백
#[tauri::command]
pub async fn get_xllm_model_info() -> Result<XllmModelInfo> {
    let config = load_config()?;
    let base_url = config.xllm_url();

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

    let models_url = format!("{}/v1/models", base_url);
    let mut req = client.get(&models_url);
    if let Some(key) = &config.xllm_api_key {
        req = req.header("x-api-key", key);
    }
    if let Ok(resp) = req.send().await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(first) = json["data"].as_array().and_then(|a| a.first()) {
                return Ok(XllmModelInfo {
                    id: first["id"].as_str().unwrap_or("unknown").to_string(),
                    max_seq_len: None,
                    cache_mode: None,
                    rope_scale: None,
                });
            }
        }
    }

    // TabbyAPI 전용 /v1/model 폴백
    let model_url = format!("{}/v1/model", base_url);
    let mut req2 = client.get(&model_url);
    if let Some(key) = &config.xllm_api_key {
        req2 = req2.header("x-api-key", key);
    }
    let res: serde_json::Value = req2
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    Ok(XllmModelInfo {
        id: res["id"].as_str().unwrap_or("unknown").to_string(),
        max_seq_len: res["parameters"]["max_seq_len"].as_u64().map(|v| v as u32),
        cache_mode: res["parameters"]["cache_mode"]
            .as_str()
            .map(|s| s.to_string()),
        rope_scale: res["parameters"]["rope_scale"].as_f64().map(|v| v as f32),
    })
}

/// ② 모델 전환 (TabbyAPI POST /v1/model/load)
/// cache_mode: "Q4" | "Q8" | "FP16"
/// max_seq_len: 컨텍스트 창 크기 (Q4 KV cache에서는 32768도 가능)
#[tauri::command]
pub async fn switch_xllm_model(
    model_name: String,
    cache_mode: Option<String>,
    max_seq_len: Option<u32>,
) -> Result<String> {
    let config = load_config()?;
    let url = format!("{}/v1/model/load", config.xllm_url());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120)) // 모델 로드는 최대 2분
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    // TabbyAPI 모델 로드 요청 구성
    let mut body = serde_json::json!({ "name": model_name });

    // KV cache quantization 설정
    let cm = cache_mode
        .as_deref()
        .or(config.cache_mode.as_deref())
        .unwrap_or("Q8");
    body["cache_mode"] = serde_json::Value::String(cm.to_string());

    // 최대 시퀀스 길이 — Q4 캐시면 더 긴 컨텍스트 허용
    let msl = max_seq_len.or(config.max_seq_len).unwrap_or(8192);
    body["max_seq_len"] = serde_json::Value::Number(msl.into());

    let mut req = client.post(&url).json(&body);
    if let Some(key) = &config.xllm_admin_key {
        req = req.header("x-admin-key", key);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?;

    if resp.status().is_success() {
        Ok(format!(
            "모델 '{}' 로드 완료 (cache_mode={}, max_seq_len={})",
            model_name, cm, msl
        ))
    } else {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        Err(LumError::AiEngine(format!(
            "모델 로드 실패 HTTP {}: {}",
            status, body_text
        )))
    }
}

/// 현재 모델 언로드 (TabbyAPI POST /v1/model/unload)
#[tauri::command]
pub async fn unload_xllm_model() -> Result<String> {
    let config = load_config()?;
    let url = format!("{}/v1/model/unload", config.xllm_url());
    let client = reqwest::Client::new();

    let mut req = client.post(&url).json(&serde_json::json!({}));
    if let Some(key) = &config.xllm_admin_key {
        req = req.header("x-admin-key", key);
    }

    req.send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?;

    Ok("모델 언로드 완료".to_string())
}
