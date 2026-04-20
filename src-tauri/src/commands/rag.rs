use crate::memory::{cosine_similarity, MemoryEntry, SemanticMemory};
use futures::future::join_all;
use ignore::Walk;
use serde::{Deserialize, Serialize};
use std::path::Path;

const CHUNK_SIZE: usize = 600;
const CHUNK_OVERLAP: usize = 100;
const XLLM_BASE: &str = "http://localhost:5000";

#[derive(Serialize)]
struct EmbeddingRequest {
    model: String,
    input: String,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Serialize, Deserialize)]
pub struct IndexResult {
    pub files: usize,
    pub chunks: usize,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub content: String,
    pub score: f32,
}

async fn embed(client: &reqwest::Client, model: &str, text: &str) -> Option<Vec<f32>> {
    let res = client
        .post(format!("{XLLM_BASE}/v1/embeddings"))
        .json(&EmbeddingRequest {
            model: model.to_string(),
            input: text.to_string(),
        })
        .send()
        .await
        .ok()?;
    let parsed: EmbeddingResponse = res.json().await.ok()?;
    parsed.data.into_iter().next().map(|d| d.embedding)
}

fn chunk_text(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + CHUNK_SIZE).min(chars.len());
        chunks.push(chars[start..end].iter().collect());
        if end == chars.len() {
            break;
        }
        start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    chunks
}

#[tauri::command]
pub async fn index_project(root_path: String, model: String) -> Result<IndexResult, String> {
    let client = reqwest::Client::new();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("시스템 시간 오류: {}", e))?
        .as_secs();

    // 파일 목록 + 청크 수집
    let mut contents: Vec<String> = Vec::new();
    let mut file_count = 0usize;

    for entry in Walk::new(Path::new(&root_path))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
    {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !matches!(
            ext,
            "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "md" | "toml" | "json" | "yaml"
                | "yml" | "txt" | "sh" | "css" | "html"
        ) {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        if text.len() < 10 {
            continue;
        }
        let rel_path = path
            .strip_prefix(&root_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        file_count += 1;
        for chunk in chunk_text(&text) {
            contents.push(format!("[{}]\n{}", rel_path, chunk));
        }
    }

    // 모든 청크를 병렬로 임베딩
    let futures: Vec<_> = contents
        .iter()
        .map(|c| embed(&client, &model, c))
        .collect();
    let embeddings = join_all(futures).await;

    let mut memory = SemanticMemory::load();
    let chunk_count = embeddings.iter().filter(|e| e.is_some()).count();

    for (content, embedding) in contents.into_iter().zip(embeddings) {
        if let Some(embedding) = embedding {
            memory.entries.push(MemoryEntry {
                content,
                embedding,
                timestamp,
            });
        }
    }

    // 최신 5000개만 보존
    if memory.entries.len() > 5000 {
        let keep = memory.entries.len() - 5000;
        memory.entries.drain(0..keep);
    }

    memory.save().map_err(|e| e.to_string())?;
    Ok(IndexResult {
        files: file_count,
        chunks: chunk_count,
    })
}

#[tauri::command]
pub async fn search_codebase(
    query: String,
    model: String,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::new();
    let embedding = embed(&client, &model, &query)
        .await
        .ok_or("임베딩 생성 실패 — xLLM 서버 상태를 확인하세요.")?;

    let memory = SemanticMemory::load();
    let mut scored: Vec<SearchResult> = memory
        .entries
        .iter()
        .map(|e| SearchResult {
            content: e.content.clone(),
            score: cosine_similarity(&embedding, &e.embedding),
        })
        .filter(|r| r.score > 0.5)
        .collect();

    scored.sort_by(|a, b| b.score.total_cmp(&a.score));
    scored.truncate(limit.max(1).min(20));
    Ok(scored)
}

#[tauri::command]
pub async fn generate_embedding(text: String, model: String) -> Result<Vec<f32>, String> {
    let client = reqwest::Client::new();
    embed(&client, &model, &text)
        .await
        .ok_or("임베딩 생성 실패 — xLLM 서버 상태를 확인하세요.".to_string())
}
