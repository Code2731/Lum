use crate::platform;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn session_path() -> PathBuf {
    platform::home_dir().join(".lum_session.json")
}

fn backup_corrupt_session(path: &PathBuf, err: &str) {
    if !path.exists() {
        return;
    }

    let mut backup = path.with_extension("json.bak");
    if backup.exists() {
        let mut i = 1_u32;
        while backup.exists() {
            backup = path.with_extension(format!("json.bak.{i}"));
            i += 1;
        }
    }

    if fs::copy(path, &backup).is_ok() {
        eprintln!("session parse error: {err} (backup: {})", backup.display());
    }
}

fn empty_session() -> SessionData {
    SessionData {
        version: 1,
        tabs: vec![SessionTab {
            id: "tab-1".to_string(),
            title: "Shell 1".to_string(),
            split_dir: None,
            cwd: None,
            split_cwd: None,
            icon: Some("terminal".to_string()),
            color: None,
            group: None,
            ssh_profile: None,
        }],
        active_tab_id: "tab-1".to_string(),
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionSshProfile {
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionTab {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_profile: Option<SessionSshProfile>,
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
    match fs::read_to_string(&path) {
        Ok(json) => match serde_json::from_str(&json) {
            Ok(session) => Ok(session),
            Err(err) => {
                backup_corrupt_session(&path, &err.to_string());
                Ok(empty_session())
            }
        },
        Err(err) => Err(err.to_string()),
    }
}
