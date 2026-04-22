use crate::platform;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn session_path() -> PathBuf {
    platform::home_dir().join(".lum_session.json")
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionTab {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct SessionData {
    pub version: u32,
    pub tabs: Vec<SessionTab>,
    pub active_tab_id: String,
}

#[tauri::command]
pub fn save_session(data: SessionData) -> Result<(), String> {
    let path = session_path();
    let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_session() -> Result<SessionData, String> {
    let path = session_path();
    let json = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}
