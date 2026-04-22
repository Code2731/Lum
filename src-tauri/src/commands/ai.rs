use crate::commands::config::{load_config, AppConfig};
use crate::error::{LumError, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{command, Emitter};

const XLLM_TOKEN_EVENT: &str = "xllm_token";
const SSE_MAX_LINE_BUF: usize = 64 * 1024;

const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";

#[derive(Debug, Serialize, Deserialize)]
pub struct AIResponse {
    pub command: String,
    pub explanation: String,
    pub r#type: String,
    pub actions: Option<Vec<serde_json::Value>>,
    pub review_report: Option<serde_json::Value>,
    pub visual_data: Option<serde_json::Value>,
    pub dynamic_ui: Option<String>,
}

// ─── xLLM (TabbyAPI / ExLlamaV2) ────────────────────────────────────────────

/// 공통 요청 바디 생성 — PD Disaggregation / SSD / Sparse Attention / KV Cache
fn xllm_body(config: &AppConfig, model: &str, prompt: &str, stream: bool) -> serde_json::Value {
    let is_long = prompt.len() > config.pd_threshold_chars.unwrap_or(8000) as usize;

    // ③ KV Cache — 긴 컨텍스트면 Q4 강제
    let cache_mode = if is_long { "Q4" } else { config.cache_mode.as_deref().unwrap_or("Q8") };

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "stream": stream,
        "cache_mode": cache_mode,
    });

    // ① PD Disaggregation — 긴 컨텍스트 decode 단계 안정화
    if is_long {
        body["temperature"] = serde_json::Value::from(0.3f32);
        body["top_p"] = serde_json::Value::from(0.85f32);
    }

    // ④ SSD (Speculative Speculative Decoding) — 드래프트 모델 설정 시 활성화
    if let Some(ref draft) = config.draft_model {
        body["draft_model"] = serde_json::Value::String(draft.clone());
        body["speculative_ngram"] = true.into();
        body["speculative_ngram_token_count"] =
            (config.speculative_n_draft.unwrap_or(5) as u64).into();
    }

    // ⑤ Dynamic Sparse Attention — 활성화 시 attention sink + top-k 헤드 제한
    if config.sparse_attention.unwrap_or(false) {
        body["attention_sink_size"] = 4u64.into();
        body["top_k_attn"] = (config.sparse_top_k.unwrap_or(64) as u64).into();
    }

    body
}

/// xLLM 단일 응답 호출 (기존 호환)
pub async fn call_xllm(client: &reqwest::Client, model: &str, prompt: &str) -> Result<String> {
    let config = load_config()?;
    let base_url = config.xllm_url();
    let url = format!("{}/v1/chat/completions", base_url);

    let body = xllm_body(&config, model, prompt, false);

    let mut req = client.post(&url).json(&body);
    if let Some(key) = config.xllm_api_key {
        req = req.header("x-api-key", key);
    }

    let res_json: serde_json::Value = req
        .send()
        .await
        .map_err(|e| LumError::Network(format!("xLLM 서버 연결 실패 ({}): {}", base_url, e)))?
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    res_json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| LumError::AiEngine(format!("xLLM 응답 파싱 실패: {}", res_json)))
}

/// ⑥ EPD 스트리밍 호출 — SSE 파싱 후 토큰마다 Tauri 이벤트 emit
async fn call_xllm_stream(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    model: &str,
    prompt: &str,
) -> Result<String> {
    let config = load_config()?;
    let base_url = config.xllm_url();
    let url = format!("{}/v1/chat/completions", base_url);

    let body = xllm_body(&config, model, prompt, true);

    let mut req = client.post(&url).json(&body);
    if let Some(key) = config.xllm_api_key {
        req = req.header("x-api-key", key);
    }

    let response = req
        .send()
        .await
        .map_err(|e| LumError::Network(format!("xLLM 스트림 연결 실패 ({}): {}", base_url, e)))?;

    let mut byte_stream = response.bytes_stream();
    let mut full_text = String::new();
    let mut line_buf = String::new();

    while let Some(chunk) = byte_stream.next().await {
        let bytes = chunk.map_err(|e| LumError::AiEngine(e.to_string()))?;
        line_buf.push_str(&String::from_utf8_lossy(&bytes));

        if line_buf.len() > SSE_MAX_LINE_BUF {
            return Err(LumError::AiEngine("SSE 응답 버퍼 초과 — 서버 응답이 비정상입니다".to_string()));
        }

        while let Some(nl) = line_buf.find('\n') {
            let line = line_buf[..nl].trim().to_string();
            line_buf.drain(..nl + 1);

            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(token) = json["choices"][0]["delta"]["content"].as_str() {
                        if !token.is_empty() {
                            full_text.push_str(token);
                            let _ = app.emit(XLLM_TOKEN_EVENT, token.to_string());
                        }
                    }
                }
            }
        }
    }

    Ok(full_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with(f: impl FnOnce(&mut AppConfig)) -> AppConfig {
        let mut c = AppConfig::default();
        f(&mut c);
        c
    }

    #[test]
    fn body_short_context_uses_q8_and_no_temperature() {
        let c = AppConfig::default();
        let body = xllm_body(&c, "model", "hello", false);
        assert_eq!(body["cache_mode"], "Q8");
        assert!(body["temperature"].is_null());
        assert_eq!(body["stream"], false);
    }

    #[test]
    fn body_long_context_forces_q4_and_low_temperature() {
        let c = config_with(|c| c.pd_threshold_chars = Some(5));
        let body = xllm_body(&c, "model", "this is longer than 5", false);
        assert_eq!(body["cache_mode"], "Q4");
        let temp = body["temperature"].as_f64().unwrap();
        assert!((temp - 0.3).abs() < 0.01);
        let top_p = body["top_p"].as_f64().unwrap();
        assert!((top_p - 0.85).abs() < 0.01);
    }

    #[test]
    fn body_ssd_params_injected_when_draft_model_set() {
        let c = config_with(|c| {
            c.draft_model = Some("DeepSeek-1.3B".to_string());
            c.speculative_n_draft = Some(6);
        });
        let body = xllm_body(&c, "model", "prompt", false);
        assert_eq!(body["draft_model"], "DeepSeek-1.3B");
        assert_eq!(body["speculative_ngram"], true);
        assert_eq!(body["speculative_ngram_token_count"], 6);
    }

    #[test]
    fn body_ssd_default_n_draft_is_5() {
        let c = config_with(|c| c.draft_model = Some("draft".to_string()));
        let body = xllm_body(&c, "model", "prompt", false);
        assert_eq!(body["speculative_ngram_token_count"], 5);
    }

    #[test]
    fn body_no_ssd_when_draft_model_absent() {
        let c = AppConfig::default();
        let body = xllm_body(&c, "model", "prompt", false);
        assert!(body["draft_model"].is_null());
        assert!(body["speculative_ngram"].is_null());
    }

    #[test]
    fn body_sparse_attention_params_injected_when_enabled() {
        let c = config_with(|c| {
            c.sparse_attention = Some(true);
            c.sparse_top_k = Some(32);
        });
        let body = xllm_body(&c, "model", "prompt", false);
        assert_eq!(body["attention_sink_size"], 4);
        assert_eq!(body["top_k_attn"], 32);
    }

    #[test]
    fn body_sparse_attention_default_top_k_is_64() {
        let c = config_with(|c| c.sparse_attention = Some(true));
        let body = xllm_body(&c, "model", "prompt", false);
        assert_eq!(body["top_k_attn"], 64);
    }

    #[test]
    fn body_sparse_attention_absent_when_disabled() {
        let c = AppConfig::default();
        let body = xllm_body(&c, "model", "prompt", false);
        assert!(body["attention_sink_size"].is_null());
    }

    #[test]
    fn body_stream_flag_respected() {
        let c = AppConfig::default();
        assert_eq!(xllm_body(&c, "m", "p", false)["stream"], false);
        assert_eq!(xllm_body(&c, "m", "p", true)["stream"], true);
    }
}

/// xLLM 서버 상태 확인 — /v1/models 엔드포인트로 핑
#[command]
pub async fn check_xllm_status() -> Result<bool> {
    let config = load_config()?;
    let url = format!("{}/v1/models", config.xllm_url());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    Ok(client.get(&url).send().await.is_ok())
}

/// xLLM에서 로드된 모델 목록 조회
#[command]
pub async fn list_xllm_models() -> Result<Vec<String>> {
    let config = load_config()?;
    let url = format!("{}/v1/models", config.xllm_url());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let mut req = client.get(&url);
    if let Some(key) = &config.xllm_api_key {
        req = req.header("x-api-key", key);
    }

    let res_json: serde_json::Value = req
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    // OpenAI 호환 모델 목록: data[].id
    let models = res_json["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

fn build_gemini_body(prompt: &str, image_base64: Option<&str>) -> serde_json::Value {
    let mut parts: Vec<serde_json::Value> = Vec::new();

    // 공식 문서 기준: 이미지를 텍스트보다 먼저 배치
    if let Some(img) = image_base64 {
        parts.push(serde_json::json!({
            "inline_data": { "mime_type": "image/png", "data": img }
        }));
    }
    parts.push(serde_json::json!({ "text": prompt }));

    serde_json::json!({ "contents": [{ "parts": parts }] })
}

fn extract_gemini_text(res: &serde_json::Value) -> Result<String> {
    if let Some(err) = res.get("error") {
        return Err(LumError::AiEngine(
            err["message"]
                .as_str()
                .unwrap_or("Unknown Gemini error")
                .to_string(),
        ));
    }
    res["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| LumError::AiEngine(format!("Unexpected Gemini response: {}", res)))
}

async fn call_gemini(
    client: &reqwest::Client,
    model: &str,
    prompt: &str,
    image_base64: Option<&str>,
) -> Result<String> {
    let config = load_config()?;
    let api_key = config.gemini_api_key.ok_or_else(|| {
        LumError::Config("Gemini API Key가 없습니다. 설정에서 입력해 주세요.".to_string())
    })?;

    let url = format!("{}/{}:generateContent", GEMINI_BASE_URL, model);
    let body = build_gemini_body(prompt, image_base64);

    let res_json: serde_json::Value = client
        .post(&url)
        .header("x-goog-api-key", &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    extract_gemini_text(&res_json)
}

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

/// AI 커맨드 생성.
/// - gemini-* 모델 → Gemini Cloud API (API 키 필요)
/// - 그 외 → xLLM 로컬 서버 (API 키 불필요)
#[command]
pub async fn generate_ai_command(
    prompt: String,
    model: String,
    context: String,
    image_data: Option<String>,
) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let full_prompt = format!("Context: {}\nRequest: {}", context, prompt);

    if model.starts_with("gemini") {
        call_gemini(&client, &model, &full_prompt, image_data.as_deref()).await
    } else {
        call_xllm(&client, &model, &full_prompt).await
    }
}

/// ⑥ EPD 스트리밍 AI 커맨드 — 첫 토큰을 즉시 `xllm_token` 이벤트로 전달
/// Gemini 모델은 SSE를 지원하지 않으므로 비스트리밍 폴백
#[command]
pub async fn stream_ai_command(
    app: tauri::AppHandle,
    prompt: String,
    model: String,
    context: String,
) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let full_prompt = format!("Context: {}\nRequest: {}", context, prompt);

    if model.starts_with("gemini") {
        // Gemini는 스트리밍 미지원 — 단일 응답 반환
        let result = call_gemini(&client, &model, &full_prompt, None).await?;
        let _ = app.emit(XLLM_TOKEN_EVENT, result.clone());
        Ok(result)
    } else {
        call_xllm_stream(&app, &client, &model, &full_prompt).await
    }
}

/// 에러 분석
#[command]
pub async fn analyze_error(
    command: String,
    stderr: String,
    model: String,
    context: String,
) -> Result<String> {
    let prompt = format!(
        "Command '{}' failed with error:\n{}\nContext: {}\n\
         Analyze and suggest a fix. Respond with JSON: \
         {{\"analysis\": \"...\", \"suggestion\": \"fixed command\"}}",
        command, stderr, context
    );
    generate_ai_command(prompt, model, context, None).await
}

/// 시각적 목표 달성 검증 (Gemini 멀티모달 전용)
#[command]
pub async fn verify_vision_goal(
    goal: String,
    screenshot_base64: String,
    model: String,
    iteration: u32,
) -> Result<serde_json::Value> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    if !model.starts_with("gemini") {
        return Ok(serde_json::json!({
            "achieved": false,
            "reason": "시각적 목표 검증은 Gemini 모델에서만 지원됩니다. 설정에서 gemini 모델을 선택하세요.",
            "nextActions": []
        }));
    }

    let prompt = format!(
        "You are a visual AI agent verifying OS automation goals.\n\
         Goal: {}\nIteration: {}/10\n\
         Look at the screenshot and determine if the goal was achieved.\n\
         Respond ONLY with JSON (no markdown):\n\
         {{\"achieved\": false, \"reason\": \"...\", \"nextActions\": [\
         {{\"type\": \"mouse_move\", \"x\": 0, \"y\": 0, \"click\": true}}, \
         {{\"type\": \"type_text\", \"text\": \"\", \"enter\": false}}, \
         {{\"type\": \"scroll\", \"x\": 0, \"y\": 0, \"amount\": 3}}, \
         {{\"type\": \"key_combo\", \"modifier\": \"cmd\", \"key\": \"v\"}}, \
         {{\"type\": \"click\", \"x\": 0, \"y\": 0, \"button\": \"left\"}}\
         ]}}",
        goal, iteration
    );

    let raw = call_gemini(&client, &model, &prompt, Some(&screenshot_base64)).await?;

    let json_str = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    serde_json::from_str(json_str)
        .map_err(|e| LumError::AiEngine(format!("응답 JSON 파싱 실패: {}. 원본: {}", e, raw)))
}

/// 커맨드 설명 — ? prefix 입력 시 AI가 역할·옵션·주의사항을 한국어로 설명
#[command]
pub async fn explain_command(command: String, model: String) -> Result<String> {
    let config = load_config()?;
    let prompt = format!(
        "다음 터미널 커맨드를 초보자도 이해할 수 있도록 한국어로 설명하세요.\n\
형식:\n\
- 첫 줄: 한 줄 요약\n\
- 주요 옵션/인수 설명 (있을 경우)\n\
- 주의사항 (있을 경우)\n\
마크다운 없이 일반 텍스트로만 출력하세요.\n\n\
커맨드: {}",
        command
    );
    let client = reqwest::Client::new();
    if !model.is_empty() && (config.xllm_base_url.is_some() || config.coding_model.is_some()) {
        match call_xllm(&client, &model, &prompt).await {
            Ok(r) => return Ok(r.trim().to_string()),
            Err(_) => {}
        }
    }
    // Gemini 폴백
    if let Some(key) = &config.gemini_api_key {
        if !key.is_empty() {
            match call_gemini(&client, &model, &prompt, None).await {
                Ok(r) => return Ok(r.trim().to_string()),
                Err(_) => {}
            }
        }
    }
    Err(LumError::AiEngine("AI 엔진을 사용할 수 없습니다. xLLM 또는 Gemini API 키를 설정하세요.".into()))
}
