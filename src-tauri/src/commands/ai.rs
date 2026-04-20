use serde::{Deserialize, Serialize};
use crate::error::{Result, LumError};
use tauri::command;

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

#[command]
pub async fn generate_ai_command(
    prompt: String,
    model: String,
    context: String,
) -> Result<String> {
    let client = reqwest::Client::new();

    if model.starts_with("gemini") {
        // Gemini API 호출 (스텁 — API 키 연동 필요)
        Ok(r#"{"command": "ls", "explanation": "Gemini generated response"}"#.to_string())
    } else {
        // Ollama API 호출
        let body = serde_json::json!({
            "model": model,
            "prompt": format!("Context: {}\nRequest: {}", context, prompt),
            "stream": false
        });

        let response = client
            .post("http://localhost:11434/api/generate")
            .json(&body)
            .send()
            .await
            .map_err(|e| LumError::AiEngine(e.to_string()))?;

        response
            .text()
            .await
            .map_err(|e| LumError::AiEngine(e.to_string()))
    }
}

#[command]
pub async fn analyze_error(
    command: String,
    stderr: String,
    model: String,
    context: String,
) -> Result<String> {
    let prompt = format!("Command '{}' failed with error: {}. Context: {}", command, stderr, context);
    generate_ai_command(prompt, model, context).await
}

#[command]
pub async fn verify_vision_goal(
    goal: String,
    _screenshot_base64: String,
) -> Result<serde_json::Value> {
    // TODO: Gemini 멀티모달 API 연동 시 _screenshot_base64를 실제로 전달
    Ok(serde_json::json!({
        "achieved": false,
        "reason": format!("Visual verification for '{}' not yet implemented.", goal),
        "nextActions": []
    }))
}
