use crate::commands::config::{load_config, AppConfig};
use crate::error::{LumError, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{command, Emitter};

const XLLM_TOKEN_EVENT: &str = "xllm_token";
const SSE_MAX_LINE_BUF: usize = 64 * 1024;

pub type AiStreamCancel = Arc<AtomicBool>;

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

// ─── xLLM (TabbyAPI / MLX-LM / OpenAI 호환) ────────────────────────────────

/// 서버에서 현재 로드된 첫 번째 모델 ID 조회 (MLX-LM·TabbyAPI 공통)
async fn get_server_model_id(client: &reqwest::Client, base_url: &str) -> String {
    let url = format!("{}/v1/models", base_url);
    let Ok(resp) = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
    else {
        return "default".to_string();
    };
    let Ok(json) = resp.json::<serde_json::Value>().await else {
        return "default".to_string();
    };
    json["data"][0]["id"]
        .as_str()
        .unwrap_or("default")
        .to_string()
}

/// 공통 요청 바디 생성 — PD Disaggregation / SSD / Sparse Attention / KV Cache.
/// images가 있으면 OpenAI vision 포맷으로 content 배열 구성 (data URI).
fn xllm_body(
    config: &AppConfig,
    model: &str,
    prompt: &str,
    stream: bool,
    images: &[String],
) -> serde_json::Value {
    let is_long = prompt.len() > config.pd_threshold_chars.unwrap_or(8000) as usize;

    // ③ KV Cache — 긴 컨텍스트면 Q4 강제
    let cache_mode = if is_long {
        "Q4"
    } else {
        config.cache_mode.as_deref().unwrap_or("Q8")
    };

    // max_tokens = 출력 토큰 수 (전체 컨텍스트 창이 아님!).
    // max_seq_len과 같게 두면 prompt + completion이 컨텍스트를 초과해 TabbyAPI가 abort함.
    // 컨텍스트의 절반(2048~4096) 정도를 출력 한계로 사용.
    let max_tokens = config.max_seq_len.unwrap_or(4096).saturating_div(2).max(512).min(8192);

    // 이미지 있으면 OpenAI vision 포맷 (content: Array), 없으면 단순 string
    let content = if images.is_empty() {
        serde_json::Value::String(prompt.to_string())
    } else {
        let mut parts = vec![serde_json::json!({ "type": "text", "text": prompt })];
        for url in images {
            parts.push(serde_json::json!({
                "type": "image_url",
                "image_url": { "url": url },
            }));
        }
        serde_json::Value::Array(parts)
    };

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": content }],
        "stream": stream,
        "max_tokens": max_tokens,
        "stop": ["<|im_end|>", "<|endoftext|>", "<|im_start|>"],
    });
    let _ = cache_mode; // 모델 로드 시 설정값 — per-request 파라미터 아님

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

    body
}

/// 임베디드 GGUF가 이 요청을 처리할 수 있는지 — 로드 상태 + 이미지 미입력.
/// 이미지가 있으면 GGUF 텍스트 모델로 vision 처리 불가 → HTTP 폴백.
/// non-feature 빌드는 `try_embedded_inference*` 스텁이 직접 None을 반환하므로
/// 이 헬퍼 자체를 컴파일 안 함 (dead_code 회피).
#[cfg(feature = "embedded-ai")]
fn embedded_can_serve(images: &[String]) -> bool {
    images.is_empty() && crate::commands::mistralrs_inline::loaded_key().is_some()
}

/// 임베디드 mistralrs가 로드돼있고 이미지 입력이 없으면 in-process 추론 시도.
/// `Some(result)` = 임베디드 사용 (성공/실패 무관 — 폴백 안 함), `None` = HTTP 폴백 필요.
#[cfg(feature = "embedded-ai")]
async fn try_embedded_inference(prompt: &str, images: &[String]) -> Option<Result<String>> {
    if !embedded_can_serve(images) {
        return None;
    }
    Some(
        crate::commands::mistralrs_inline::infer_once(prompt)
            .await
            .map_err(|e| LumError::AiEngine(format!("embedded inference failed: {e}"))),
    )
}

#[cfg(not(feature = "embedded-ai"))]
async fn try_embedded_inference(_prompt: &str, _images: &[String]) -> Option<Result<String>> {
    None
}

/// 임베디드 mistralrs가 로드돼있으면 토큰별 스트리밍 추론. `xllm_token` 이벤트로 emit.
/// `cancel`이 true가 되면 stream drop으로 추론 중단.
#[cfg(feature = "embedded-ai")]
async fn try_embedded_inference_stream(
    app: &tauri::AppHandle,
    prompt: &str,
    images: &[String],
    cancel: &Arc<AtomicBool>,
    show_reasoning: bool,
) -> Option<Result<String>> {
    if !embedded_can_serve(images) {
        return None;
    }
    Some(
        crate::commands::mistralrs_inline::infer_stream(
            app,
            prompt,
            cancel,
            show_reasoning,
            XLLM_TOKEN_EVENT,
        )
        .await
        .map_err(|e| LumError::AiEngine(format!("embedded streaming failed: {e}"))),
    )
}

#[cfg(not(feature = "embedded-ai"))]
async fn try_embedded_inference_stream(
    _app: &tauri::AppHandle,
    _prompt: &str,
    _images: &[String],
    _cancel: &Arc<AtomicBool>,
    _show_reasoning: bool,
) -> Option<Result<String>> {
    None
}

/// xLLM 단일 응답 호출 (기존 호환). 임베디드 GGUF 우선, 미로드면 HTTP 폴백.
pub async fn call_xllm(client: &reqwest::Client, _model: &str, prompt: &str) -> Result<String> {
    if let Some(result) = try_embedded_inference(prompt, &[]).await {
        return result;
    }

    let config = load_config()?;
    let base_url = config.xllm_url();
    let url = format!("{}/v1/chat/completions", base_url);

    // 서버의 실제 로드된 모델 ID 사용 (MLX-LM·TabbyAPI 공통)
    let actual_model = get_server_model_id(client, &base_url).await;
    let body = xllm_body(&config, &actual_model, prompt, false, &[]);

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

    let msg = &res_json["choices"][0]["message"];
    // content 우선, 없으면 reasoning/reasoning_content (추론 모델 지원)
    msg["content"]
        .as_str()
        .or_else(|| msg["reasoning"].as_str())
        .or_else(|| msg["reasoning_content"].as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| LumError::AiEngine(format!("xLLM 응답 파싱 실패: {}", res_json)))
}

/// OpenAI 호환 SSE 스트리밍 호출 — TabbyAPI · mistral.rs 공용
/// api_key: x-api-key 헤더 (TabbyAPI 전용, mistral.rs는 None)
async fn call_compat_stream(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    prompt: &str,
    images: &[String],
    base_url: &str,
    api_key: Option<String>,
    cancel: &Arc<AtomicBool>,
) -> Result<String> {
    let config = load_config()?;
    let url = format!("{}/v1/chat/completions", base_url);
    let actual_model = get_server_model_id(client, base_url).await;
    let body = xllm_body(&config, &actual_model, prompt, true, images);

    let mut req = client.post(&url).json(&body);
    if let Some(key) = api_key {
        req = req.header("x-api-key", key);
    }

    let response = req.send().await.map_err(|e| {
        LumError::Network(format!(
            "xLLM 서버에 연결할 수 없습니다 ({}): {}",
            base_url, e
        ))
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LumError::AiEngine(format!(
            "xLLM 서버 오류 HTTP {} ({}): {}",
            status,
            base_url,
            if body.is_empty() {
                "응답 없음".to_string()
            } else {
                body.chars().take(200).collect()
            }
        )));
    }

    let mut byte_stream = response.bytes_stream();
    let mut full_text = String::new();
    let mut line_buf = String::new();

    while let Some(chunk) = byte_stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let bytes = chunk.map_err(|e| LumError::AiEngine(e.to_string()))?;
        line_buf.push_str(&String::from_utf8_lossy(&bytes));

        if line_buf.len() > SSE_MAX_LINE_BUF {
            return Err(LumError::AiEngine(
                "SSE 응답 버퍼 초과 — 서버 응답이 비정상입니다".to_string(),
            ));
        }

        while let Some(nl) = line_buf.find('\n') {
            let line = line_buf[..nl].trim().to_string();
            line_buf.drain(..nl + 1);

            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    let delta = &json["choices"][0]["delta"];
                    // content가 있으면 그대로 전달
                    if let Some(t) = delta["content"].as_str() {
                        if !t.is_empty() {
                            full_text.push_str(t);
                            let _ = app.emit(XLLM_TOKEN_EVENT, t.to_string());
                        }
                    }
                    // reasoning/reasoning_content 토큰 — show_reasoning 설정 따라 표시/숨김
                    else if let Some(t) = delta["reasoning"]
                        .as_str()
                        .or_else(|| delta["reasoning_content"].as_str())
                    {
                        if !t.is_empty() {
                            full_text.push_str(t);
                            if config.show_reasoning.unwrap_or(true) {
                                let _ = app.emit(XLLM_TOKEN_EVENT, t.to_string());
                            }
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
    fn body_short_context_no_cache_mode_no_temperature() {
        // 회귀 가드 — cache_mode는 모델 로드 시점 옵션. 추론 body에 넣으면 TabbyAPI가
        // "Chat completion aborted"로 거부함. 짧은 컨텍스트엔 temperature도 안 박혀야 함.
        let c = AppConfig::default();
        let body = xllm_body(&c, "model", "hello", false, &[]);
        assert!(body["cache_mode"].is_null(), "cache_mode가 body에 들어가면 TabbyAPI 거부");
        assert!(body["temperature"].is_null());
        assert_eq!(body["stream"], false);
    }

    #[test]
    fn body_long_context_low_temperature_no_cache_mode() {
        // 긴 컨텍스트엔 PD 모드용 temperature/top_p가 박히지만, cache_mode는 여전히 부재해야 함.
        let c = config_with(|c| c.pd_threshold_chars = Some(5));
        let body = xllm_body(&c, "model", "this is longer than 5", false, &[]);
        assert!(body["cache_mode"].is_null());
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
        let body = xllm_body(&c, "model", "prompt", false, &[]);
        assert_eq!(body["draft_model"], "DeepSeek-1.3B");
        assert_eq!(body["speculative_ngram"], true);
        assert_eq!(body["speculative_ngram_token_count"], 6);
    }

    #[test]
    fn body_ssd_default_n_draft_is_5() {
        let c = config_with(|c| c.draft_model = Some("draft".to_string()));
        let body = xllm_body(&c, "model", "prompt", false, &[]);
        assert_eq!(body["speculative_ngram_token_count"], 5);
    }

    #[test]
    fn body_no_ssd_when_draft_model_absent() {
        let c = AppConfig::default();
        let body = xllm_body(&c, "model", "prompt", false, &[]);
        assert!(body["draft_model"].is_null());
        assert!(body["speculative_ngram"].is_null());
    }

    #[test]
    fn body_stream_flag_respected() {
        let c = AppConfig::default();
        assert_eq!(xllm_body(&c, "m", "p", false, &[])["stream"], false);
        assert_eq!(xllm_body(&c, "m", "p", true, &[])["stream"], true);
    }

    #[tokio::test]
    async fn try_embedded_inference_skips_when_images_present() {
        // 이미지 있으면 feature 활성/비활성 무관 항상 None — GGUF 텍스트 모델 처리 불가.
        // 회귀 가드: 라우팅이 실수로 이미지를 임베디드에 보내면 모델이 텍스트만 보고 답해
        // 사용자 요청과 무관한 응답이 나옴.
        let imgs = vec!["data:image/png;base64,xxx".to_string()];
        let r = try_embedded_inference("hello", &imgs).await;
        assert!(r.is_none(), "이미지 있으면 임베디드 라우팅 스킵 후 HTTP/Gemini 폴백");
    }

    #[cfg(not(feature = "embedded-ai"))]
    #[tokio::test]
    async fn try_embedded_inference_none_without_feature() {
        // 비활성 빌드: 항상 None — embedded-ai 코드는 단 한 줄도 실행되지 않음.
        assert!(try_embedded_inference("hello", &[]).await.is_none());
        let imgs = vec!["img".to_string()];
        assert!(try_embedded_inference("hello", &imgs).await.is_none());
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
    images: Option<Vec<String>>,
    // engine: 명시적 엔진 — "heavy" = mistral.rs 강제, "fast"/None = TabbyAPI
    engine: Option<String>,
    cancel_flag: tauri::State<'_, AiStreamCancel>,
) -> Result<String> {
    cancel_flag.store(false, Ordering::Relaxed);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    // prompt에 남아있는 `!!` 접두사 제거 (Heavy 라우팅 신호로만 사용)
    let cleaned_prompt = prompt.trim_start_matches("!!").trim_start().to_string();
    let full_prompt = format!("Context: {}\nRequest: {}", context, cleaned_prompt);
    let imgs = images.unwrap_or_default();

    if model.starts_with("gemini") {
        let single_image = imgs.first().map(|s| s.as_str());
        let result = call_gemini(&client, &model, &full_prompt, single_image).await?;
        let _ = app.emit(XLLM_TOKEN_EVENT, result.clone());
        Ok(result)
    } else {
        let _ = engine;
        let config = load_config()?;
        // 임베디드 GGUF 로드돼있으면 토큰별 스트리밍 — HTTP 우회.
        let show_reasoning = config.show_reasoning.unwrap_or(true);
        if let Some(result) =
            try_embedded_inference_stream(&app, &full_prompt, &imgs, &cancel_flag, show_reasoning).await
        {
            return result;
        }
        call_compat_stream(&app, &client, &full_prompt, &imgs, &config.xllm_url(), config.xllm_api_key.clone(), &cancel_flag).await
    }
}

#[command]
pub fn cancel_ai_stream(cancel_flag: tauri::State<'_, AiStreamCancel>) {
    cancel_flag.store(true, Ordering::Relaxed);
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
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();
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
    Err(LumError::AiEngine(
        "AI 엔진을 사용할 수 없습니다. xLLM 또는 Gemini API 키를 설정하세요.".into(),
    ))
}
