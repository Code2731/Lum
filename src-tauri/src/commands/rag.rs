use crate::commands::config::load_config;
use crate::memory::{cosine_similarity, MemoryEntry, SemanticMemory};
use futures::future::join_all;
use ignore::Walk;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

const CHUNK_SIZE: usize = 600;
const CHUNK_OVERLAP: usize = 100;

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

pub async fn embed(
    client: &reqwest::Client,
    base_url: &str,
    model: &str,
    text: &str,
) -> Option<Vec<f32>> {
    let res = client
        .post(format!("{base_url}/v1/embeddings"))
        .timeout(Duration::from_secs(30))
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

/// Ollama /api/embeddings 호출 — nomic-embed-text 등 전용 모델 또는 채팅 모델 사용
async fn embed_ollama(
    client: &reqwest::Client,
    base_url: &str,
    model: &str,
    text: &str,
) -> Option<Vec<f32>> {
    #[derive(Serialize)]
    struct OllamaReq<'a> { model: &'a str, prompt: &'a str }
    #[derive(Deserialize)]
    struct OllamaRes { embedding: Vec<f32> }

    client
        .post(format!("{base_url}/api/embeddings"))
        .timeout(Duration::from_secs(30))
        .json(&OllamaReq { model, prompt: text })
        .send()
        .await
        .ok()?
        .json::<OllamaRes>()
        .await
        .ok()
        .map(|r| r.embedding)
}

/// 자동 임베딩 백엔드 선택 — Ollama 설정 시 Ollama, 아니면 xLLM /v1/embeddings
pub async fn embed_auto(client: &reqwest::Client, xllm_model: &str, text: &str) -> Option<Vec<f32>> {
    if let Ok(cfg) = load_config() {
        if let Some(m) = cfg.ollama_model.as_ref().filter(|s| !s.is_empty()) {
            let base_url = cfg.ollama_url();
            if let Some(v) = embed_ollama(client, &base_url, m, text).await {
                return Some(v);
            }
        }
    }
    let base_url = load_config()
        .map(|c| c.xllm_url())
        .unwrap_or_else(|_| "http://127.0.0.1:5000".to_string());
    embed(client, &base_url, xllm_model, text).await
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
fn rag_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap_or_default()
}

#[tauri::command]
pub async fn index_project(root_path: String, model: String) -> Result<IndexResult, String> {
    let client = rag_client();
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
            "rs" | "ts"
                | "tsx"
                | "js"
                | "jsx"
                | "py"
                | "go"
                | "md"
                | "toml"
                | "json"
                | "yaml"
                | "yml"
                | "txt"
                | "sh"
                | "css"
                | "html"
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
        .map(|c| embed_auto(&client, &model, c))
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
    let client = rag_client();
    let embedding = embed_auto(&client, &model, &query)
        .await
        .ok_or("임베딩 생성 실패 — Ollama 또는 xLLM 서버 상태를 확인하세요.")?;

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
    let client = rag_client();
    embed_auto(&client, &model, &text)
        .await
        .ok_or("임베딩 생성 실패 — Ollama 또는 xLLM 서버 상태를 확인하세요.".to_string())
}

/// 내부 RAG 검색 — embed_auto 기반, 임베딩 불가 시 빈 벡터 반환
async fn search_with_client(client: &reqwest::Client, query: &str, limit: usize) -> Vec<SearchResult> {
    let Some(embedding) = embed_auto(client, "default", query).await else {
        return vec![];
    };
    let memory = crate::memory::SemanticMemory::load();
    let mut scored: Vec<SearchResult> = memory
        .entries
        .iter()
        .map(|e| SearchResult {
            content: e.content.clone(),
            score: crate::memory::cosine_similarity(&embedding, &e.embedding),
        })
        .filter(|r| r.score > 0.5)
        .collect();
    scored.sort_by(|a, b| b.score.total_cmp(&a.score));
    scored.truncate(limit);
    scored
}

/// 현재 파일 내용 + RAG 스니펫을 합쳐 AI 프롬프트 컨텍스트 반환.
/// 임베딩 서버 미구성 시 파일 내용만 반환하며, 에러는 반환하지 않음(빈 문자열 폴백).
#[tauri::command]
pub async fn rag_context_for_file(
    file_path: String,
    query: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let client = rag_client();
    let lim = limit.unwrap_or(5).max(1).min(10);

    let file_content = std::fs::read_to_string(&file_path)
        .map(|s| {
            let chars: Vec<char> = s.chars().collect();
            if chars.len() > 3000 {
                let t: String = chars[..3000].iter().collect();
                format!("{}\n... (이하 생략)", t)
            } else {
                s
            }
        })
        .unwrap_or_default();

    let snippets = search_with_client(&client, &query, lim).await;

    let mut ctx = String::new();
    if !file_content.is_empty() {
        ctx.push_str(&format!("=== 현재 파일: {} ===\n{}\n\n", file_path, file_content));
    }
    if !snippets.is_empty() {
        ctx.push_str("=== 관련 코드 스니펫 (RAG) ===\n");
        for s in snippets {
            ctx.push_str(&format!("{}\n---\n", s.content));
        }
        ctx.push('\n');
    }
    Ok(ctx)
}
