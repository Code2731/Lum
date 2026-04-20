use serde::{Deserialize, Serialize};
use crate::error::{Result, LumError};
use crate::commands::config::load_config;
use tauri::command;

const GEMINI_BASE_URL: &str =
    "https://generativelanguage.googleapis.com/v1beta/models";

const OLLAMA_URL: &str = "http://localhost:11434/api/generate";

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

// ─── Gemini 헬퍼 ────────────────────────────────────────────────────────────

/// Gemini API 요청 본문을 생성한다.
/// 공식 문서 기준: 이미지를 텍스트보다 먼저 배치해야 한다.
fn build_gemini_body(prompt: &str, image_base64: Option<&str>) -> serde_json::Value {
    let mut parts: Vec<serde_json::Value> = Vec::new();

    // 1. 이미지를 먼저 추가 (멀티모달 시 텍스트 앞에 위치해야 함)
    if let Some(img) = image_base64 {
        parts.push(serde_json::json!({
            "inline_data": {
                "mime_type": "image/png",
                "data": img
            }
        }));
    }

    // 2. 텍스트 프롬프트를 이미지 뒤에 추가
    parts.push(serde_json::json!({ "text": prompt }));

    serde_json::json!({
        "contents": [{ "parts": parts }]
    })
}

/// Gemini API 응답에서 텍스트를 추출한다.
fn extract_gemini_text(res: &serde_json::Value) -> Result<String> {
    // 에러 응답 감지
    if let Some(err) = res.get("error") {
        return Err(LumError::AiEngine(
            err["message"].as_str().unwrap_or("Unknown Gemini error").to_string(),
        ));
    }

    // candidates가 비어있거나 없는 경우
    let text = res["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| LumError::AiEngine(
            format!("Unexpected Gemini response structure: {}", res)
        ))?;

    Ok(text.to_string())
}

/// Gemini API를 호출하고 텍스트 응답을 반환한다.
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

    let response = client
        .post(&url)
        // 공식 문서 권장: API 키를 쿼리 파라미터 대신 헤더로 전달
        .header("x-goog-api-key", &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?;

    let res_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    extract_gemini_text(&res_json)
}

// ─── Ollama 헬퍼 ─────────────────────────────────────────────────────────────

async fn call_ollama(
    client: &reqwest::Client,
    model: &str,
    prompt: &str,
) -> Result<String> {
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false
    });

    let response = client
        .post(OLLAMA_URL)
        .json(&body)
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?;

    let res_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    res_json["response"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| LumError::AiEngine("Ollama 응답 파싱 실패".to_string()))
}

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

/// AI 커맨드 생성: Gemini 또는 Ollama를 모델명 기준으로 선택한다.
/// image_data: 선택적 Base64 PNG (멀티모달 요청용)
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
        call_ollama(&client, &model, &full_prompt).await
    }
}

/// 에러 분석: 실패한 커맨드와 stderr를 AI에 전달한다.
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

/// 시각적 목표 달성 검증: 스크린샷을 Gemini 멀티모달로 분석한다.
/// Ollama는 멀티모달 미지원이므로 Gemini 모델이 필요하다.
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

    // Gemini 모델만 멀티모달 지원
    if !model.starts_with("gemini") {
        return Ok(serde_json::json!({
            "achieved": false,
            "reason": "시각적 목표 검증에는 Gemini 모델이 필요합니다.",
            "nextActions": []
        }));
    }

    let prompt = format!(
        "You are a visual AI agent verifying OS automation goals.\n\
         Goal: {}\n\
         Iteration: {}/10\n\
         Look at the provided screenshot and determine:\n\
         1. Was the goal achieved? (achieved: true/false)\n\
         2. Describe the current screen state.\n\
         3. If not achieved, list the next computer actions needed.\n\
         Respond ONLY with a JSON object (no markdown fences):\n\
         {{\"achieved\": false, \"reason\": \"...\", \"nextActions\": [\n\
           {{\"type\": \"mouse_move\", \"x\": 500, \"y\": 300, \"click\": true}},\n\
           {{\"type\": \"type_text\", \"text\": \"Hello\", \"enter\": false}},\n\
           {{\"type\": \"scroll\", \"x\": 500, \"y\": 300, \"amount\": 3}},\n\
           {{\"type\": \"key_combo\", \"modifier\": \"cmd\", \"key\": \"v\"}},\n\
           {{\"type\": \"click\", \"x\": 100, \"y\": 200, \"button\": \"right\"}}\n\
         ]}}",
        goal, iteration
    );

    let raw = call_gemini(&client, &model, &prompt, Some(&screenshot_base64)).await?;

    // JSON 블록 추출 (마크다운 펜스 제거)
    let json_str = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    serde_json::from_str(json_str).map_err(|e| {
        LumError::AiEngine(format!("Gemini 응답 JSON 파싱 실패: {}. 원본: {}", e, raw))
    })
}
