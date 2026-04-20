use crate::platform;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryEntry {
    pub content: String,
    pub embedding: Vec<f32>,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SemanticMemory {
    pub entries: Vec<MemoryEntry>,
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
    });

    if memory.entries.len() > 1000 {
        memory.entries.drain(0..memory.entries.len() - 1000);
    }

    memory.save()
}

#[tauri::command]
pub async fn search_memory(query_embedding: Vec<f32>, limit: usize) -> Result<Vec<String>, String> {
    let memory = SemanticMemory::load();
    let mut scored: Vec<(f32, String)> = memory
        .entries
        .iter()
        .map(|entry| {
            let score = cosine_similarity(&query_embedding, &entry.embedding);
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
