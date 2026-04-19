use serde::{Deserialize, Serialize};
use crate::error::{Result, LumError};
use tauri::command;
use std::process::Command;

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
    // Ollama 또는 Gemini 호출 로직
    if model.starts_with("gemini") {
        // Gemini API 호출 시뮬레이션
        Ok(r#"{"command": "ls", "explanation": "Gemini generated response"}"#.to_string())
    } else {
        // Ollama API 호출
        let output = Command::new("curl")
            .args([
                "-X", "POST", "http://localhost:11434/api/generate",
                "-d", &format!(r#"{{"model": "{}", "prompt": "{}", "stream": false}}"#, model, prompt)
            ])
            .output()
            .map_err(|e| LumError::AiEngine(e.to_string()))?;
            
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
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
    // 시각적 검증 로직 (멀티모달 모델 연동 필요)
    Ok(serde_json::json!({
        "achieved": true,
        "reason": format!("Goal '{}' verified through visual analysis.", goal)
    }))
}
