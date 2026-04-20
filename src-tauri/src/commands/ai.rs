use crate::commands::config::load_config;
use crate::error::{LumError, Result};
use serde::{Deserialize, Serialize};
use tauri::command;

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

/// xLLM OpenAI 호환 Chat Completions API 호출
/// 엔드포인트: POST {base_url}/v1/chat/completions
async fn call_xllm(client: &reqwest::Client, model: &str, prompt: &str) -> Result<String> {
    let config = load_config()?;
    let base_url = config.xllm_url();
    let url = format!("{}/v1/chat/completions", base_url);

    let mut req = client.post(&url).json(&serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "stream": false
    }));

    // API 키는 선택적 — 로컬 서버는 불필요
    if let Some(key) = config.xllm_api_key {
        req = req.header("x-api-key", key);
    }

    let response = req
        .send()
        .await
        .map_err(|e| LumError::Network(format!("xLLM 서버 연결 실패 ({}): {}", base_url, e)))?;

    let res_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    // OpenAI 호환 응답: choices[0].message.content
    res_json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| LumError::AiEngine(format!("xLLM 응답 파싱 실패: {}", res_json)))
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
