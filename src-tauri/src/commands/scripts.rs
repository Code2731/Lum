use crate::platform;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn scripts_path() -> PathBuf {
    platform::home_dir().join(".lum_scripts.json")
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub description: String,
    pub commands: Vec<String>,
    pub created_at: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct ScriptStore {
    scripts: Vec<Script>,
}

fn load_store() -> ScriptStore {
    let path = scripts_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_store(store: &ScriptStore) -> Result<(), String> {
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(scripts_path(), json).map_err(|e| e.to_string())
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub fn list_scripts() -> Result<Vec<Script>, String> {
    Ok(load_store().scripts)
}

#[tauri::command]
pub fn save_script(
    name: String,
    description: String,
    commands: Vec<String>,
) -> Result<Script, String> {
    let now = unix_now();
    let mut store = load_store();
    let script = Script {
        id: format!("sc-{now}"),
        name,
        description,
        commands,
        created_at: now,
    };
    store.scripts.push(script.clone());
    save_store(&store)?;
    Ok(script)
}

#[tauri::command]
pub fn delete_script(id: String) -> Result<(), String> {
    let mut store = load_store();
    store.scripts.retain(|s| s.id != id);
    save_store(&store)
}
