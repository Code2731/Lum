use crate::error::{LumError, Result};
use crate::platform;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// SSH 저장 프로필 항목
#[derive(Serialize, Deserialize, Clone)]
pub struct SshProfileEntry {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_path: Option<String>,
}

fn profiles_path() -> PathBuf {
    platform::home_dir().join(".lum_ssh_profiles.json")
}

fn load_profiles() -> Vec<SshProfileEntry> {
    let path = profiles_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_profiles(profiles: &[SshProfileEntry]) -> Result<()> {
    let json = serde_json::to_string_pretty(profiles)
        .map_err(|e| LumError::Io(e.to_string()))?;
    std::fs::write(profiles_path(), json).map_err(|e| LumError::Io(e.to_string()))
}

#[tauri::command]
pub fn list_ssh_profiles() -> Result<Vec<SshProfileEntry>> {
    Ok(load_profiles())
}

#[tauri::command]
pub fn save_ssh_profile(profile: SshProfileEntry) -> Result<()> {
    let mut profiles = load_profiles();
    if let Some(pos) = profiles.iter().position(|p| p.id == profile.id) {
        profiles[pos] = profile;
    } else {
        profiles.push(profile);
    }
    write_profiles(&profiles)
}

#[tauri::command]
pub fn delete_ssh_profile(id: String) -> Result<()> {
    let mut profiles = load_profiles();
    profiles.retain(|p| p.id != id);
    write_profiles(&profiles)
}
