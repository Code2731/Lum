use crate::platform;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn workspace_path() -> PathBuf {
    platform::home_dir().join(".lum_workspaces.json")
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WorkspaceTab {
    pub id: String,
    pub title: String,
    pub cwd: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_cwd: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub tabs: Vec<WorkspaceTab>,
    pub active_tab_id: String,
    pub created_at: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct WorkspaceStore {
    workspaces: Vec<Workspace>,
}

fn load_store() -> WorkspaceStore {
    let path = workspace_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_store(store: &WorkspaceStore) -> Result<(), String> {
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(workspace_path(), json).map_err(|e| e.to_string())
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub fn save_workspace(name: String, tabs: Vec<WorkspaceTab>, active_tab_id: String) -> Result<Workspace, String> {
    let mut store = load_store();
    let ws = Workspace {
        id: format!("ws-{}", unix_now()),
        name,
        tabs,
        active_tab_id,
        created_at: unix_now(),
    };
    store.workspaces.push(ws.clone());
    save_store(&store)?;
    Ok(ws)
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<Workspace>, String> {
    Ok(load_store().workspaces)
}

#[tauri::command]
pub fn delete_workspace(id: String) -> Result<(), String> {
    let mut store = load_store();
    store.workspaces.retain(|w| w.id != id);
    save_store(&store)
}
