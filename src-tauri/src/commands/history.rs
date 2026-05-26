use crate::commands::config::{load_config, XLLM_DEFAULT_URL};
use crate::commands::rag::embed;
use crate::commands::recall_backend;
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
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();
    let base_url = load_config()
        .map(|c| c.xllm_url())
        .unwrap_or_else(|_| XLLM_DEFAULT_URL.to_string());
    let embedding = embed(&client, &base_url, &model, &command)
        .await
        .unwrap_or_default();

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
    let requested_backend = load_config().ok().and_then(|c| c.recall_vector_backend);
    let vector_backend = recall_backend::resolve_backend(requested_backend.as_deref());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();
    let base_url = load_config()
        .map(|c| c.xllm_url())
        .unwrap_or_else(|_| XLLM_DEFAULT_URL.to_string());
    let q_emb = embed(&client, &base_url, &model, &query)
        .await
        .ok_or_else(|| "임베딩 생성 실패".to_string())?;

    let store = load();
    let mut scored: Vec<(f32, &HistoryEntry)> = store
        .entries
        .iter()
        .filter(|e| !e.embedding.is_empty())
        .map(|e| (vector_backend.similarity(&q_emb, &e.embedding), e))
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

/// Phase 118 — recall에서 import. 임베딩 포함 전체 entry 반환.
pub fn search_history_raw() -> Vec<HistoryEntry> {
    load().entries
}

/// Phase 118 — id 매칭으로 일괄 삭제. 반환: 삭제된 개수.
pub fn forget_by_ids(ids: &[String]) -> usize {
    let mut store = load();
    let before = store.entries.len();
    let id_set: std::collections::HashSet<&str> = ids.iter().map(|s| s.as_str()).collect();
    store.entries.retain(|e| !id_set.contains(e.id.as_str()));
    let removed = before - store.entries.len();
    if removed > 0 {
        save(&store);
    }
    removed
}

/// Phase 118 — 지정 timestamp(초) 이전 항목 삭제.
pub fn forget_before(ts_s: u64) -> usize {
    let mut store = load();
    let before = store.entries.len();
    store.entries.retain(|e| e.timestamp >= ts_s);
    let removed = before - store.entries.len();
    if removed > 0 {
        save(&store);
    }
    removed
}
