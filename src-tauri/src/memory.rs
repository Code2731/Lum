use crate::commands::{config::load_config, recall_backend};
use crate::platform;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryEntry {
    pub content: String,
    pub embedding: Vec<f32>,
    pub timestamp: u64,
    /// RAG 코드 청크의 소스 파일 rel_path. history/healing entry는 None.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SemanticMemory {
    pub entries: Vec<MemoryEntry>,
    /// rel_path → mtime_secs — 증분 인덱싱용 mtime 캐시.
    #[serde(default)]
    pub file_mtimes: HashMap<String, u64>,
}

impl SemanticMemory {
    pub fn load() -> Self {
        let path = platform::home_dir().join(".lum_memory.json");
        if let Ok(data) = fs::read_to_string(path) {
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let path = platform::home_dir().join(".lum_memory.json");
        let data = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, data).map_err(|e| e.to_string())
    }
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na * nb)
}

#[tauri::command]
pub async fn add_to_memory(content: String, embedding: Vec<f32>) -> Result<(), String> {
    let mut memory = SemanticMemory::load();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    memory.entries.push(MemoryEntry {
        content,
        embedding,
        timestamp,
        file: None,
    });

    if memory.entries.len() > 1000 {
        memory.entries.drain(0..memory.entries.len() - 1000);
    }

    memory.save()
}

/// Phase 118 — recall에서 호출. timestamp(s) 일치하는 entry들 일괄 삭제.
pub fn forget_by_ts(timestamps: &[u64]) -> Result<usize, String> {
    let mut mem = SemanticMemory::load();
    let before = mem.entries.len();
    let target_set: std::collections::HashSet<u64> = timestamps.iter().copied().collect();
    mem.entries.retain(|e| !target_set.contains(&e.timestamp));
    let removed = before - mem.entries.len();
    if removed > 0 {
        mem.save()?;
    }
    Ok(removed)
}

/// Phase 118 — 지정 ts(초) 이전 entry 일괄 삭제.
pub fn forget_before(ts_s: u64) -> Result<usize, String> {
    let mut mem = SemanticMemory::load();
    let before = mem.entries.len();
    mem.entries.retain(|e| e.timestamp >= ts_s);
    let removed = before - mem.entries.len();
    if removed > 0 {
        mem.save()?;
    }
    Ok(removed)
}

#[tauri::command]
pub async fn search_memory(query_embedding: Vec<f32>, limit: usize) -> Result<Vec<String>, String> {
    let requested_backend = load_config().ok().and_then(|c| c.recall_vector_backend);
    let vector_backend = recall_backend::resolve_backend(requested_backend.as_deref());
    let memory = SemanticMemory::load();
    let mut scored: Vec<(f32, String)> = memory
        .entries
        .iter()
        .map(|entry| {
            let score = vector_backend.similarity(&query_embedding, &entry.embedding);
            (score, entry.content.clone())
        })
        .filter(|(score, _)| *score > 0.7) // 유사도 임계값
        .collect();

    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    Ok(scored
        .into_iter()
        .take(limit)
        .map(|(_, content)| content)
        .collect())
}
