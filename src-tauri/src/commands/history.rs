use crate::commands::rag::embed;
use crate::memory::cosine_similarity;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub command: String,
    pub exit_code: i32,
    pub cwd: String,
    pub timestamp: u64,
    pub embedding: Vec<f32>,
}

#[derive(Serialize, Deserialize, Default)]
struct HistoryStore {
    entries: Vec<HistoryEntry>,
}

fn history_path() -> std::path::PathBuf {
    crate::platform::home_dir().join(".lum_history.json")
}

fn load() -> HistoryStore {
    fs::read_to_string(history_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(store: &HistoryStore) {
    if let Ok(json) = serde_json::to_string(store) {
        let _ = fs::write(history_path(), json);
    }
}

/// 커맨드 블록 완료 시 임베딩 생성 + 히스토리 저장
#[tauri::command]
pub async fn add_history_entry(
    command: String,
    exit_code: i32,
    cwd: String,
    model: String,
) -> Result<(), String> {
    if command.trim().is_empty() {
        return Ok(());
    }
    let client = reqwest::Client::new();
    let embedding = embed(&client, &model, &command).await.unwrap_or_default();

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let entry = HistoryEntry {
        id: format!("{}-{}", ts, command.len()),
        command,
        exit_code,
        cwd,
        timestamp: ts,
        embedding,
    };

    let mut store = load();
    store.entries.push(entry);
    if store.entries.len() > 2000 {
        store.entries.drain(0..store.entries.len() - 2000);
    }
    save(&store);
    Ok(())
}

/// 자연어 쿼리로 시맨틱 히스토리 검색
#[tauri::command]
pub async fn search_history(
    query: String,
    model: String,
    limit: usize,
) -> Result<Vec<HistoryEntry>, String> {
    let client = reqwest::Client::new();
    let q_emb = embed(&client, &model, &query)
        .await
        .ok_or_else(|| "임베딩 생성 실패".to_string())?;

    let store = load();
    let mut scored: Vec<(f32, &HistoryEntry)> = store
        .entries
        .iter()
        .filter(|e| !e.embedding.is_empty())
        .map(|e| (cosine_similarity(&q_emb, &e.embedding), e))
        .filter(|(s, _)| *s > 0.25)
        .collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));

    Ok(scored
        .into_iter()
        .take(limit.max(1).min(50))
        .map(|(_, e)| e.clone())
        .collect())
}

/// 최근 히스토리 (임베딩 없이 빠르게 반환)
#[tauri::command]
pub fn get_recent_history(limit: usize) -> Vec<HistoryEntry> {
    let store = load();
    store
        .entries
        .iter()
        .rev()
        .take(limit.min(100))
        .cloned()
        .collect()
}
