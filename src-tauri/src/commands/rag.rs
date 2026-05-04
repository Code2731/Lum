use crate::commands::config::load_config;
use crate::memory::{cosine_similarity, MemoryEntry, SemanticMemory};
use futures::future::join_all;
use ignore::Walk;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tree_sitter::{Language, Node, Parser, Query, QueryCursor};

const CHUNK_SIZE: usize = 600;
const CHUNK_OVERLAP: usize = 100;
// 함수/클래스 본문이 이보다 크면 600자 fallback으로 내부 분할 — 매우 긴 함수가
// 단일 임베딩으로 묶이면 검색 정밀도 저하.
const AST_CHUNK_MAX_CHARS: usize = 2000;
// 모듈 헤더(top-level imports/const/comment) 최소 길이 — 이보다 짧으면 임베딩 무가치.
const MODULE_HEADER_MIN_CHARS: usize = 10;

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
    struct OllamaReq<'a> {
        model: &'a str,
        prompt: &'a str,
    }
    #[derive(Deserialize)]
    struct OllamaRes {
        embedding: Vec<f32>,
    }

    client
        .post(format!("{base_url}/api/embeddings"))
        .timeout(Duration::from_secs(30))
        .json(&OllamaReq {
            model,
            prompt: text,
        })
        .send()
        .await
        .ok()?
        .json::<OllamaRes>()
        .await
        .ok()
        .map(|r| r.embedding)
}

/// 자동 임베딩 백엔드 선택 — Ollama 설정 시 Ollama, 아니면 xLLM /v1/embeddings
pub async fn embed_auto(
    client: &reqwest::Client,
    xllm_model: &str,
    text: &str,
) -> Option<Vec<f32>> {
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

// ─── Phase 137-A: AST 기반 청킹 ─────────────────────────────────────────────
// 600자 고정 청킹은 함수 중간을 잘라 임베딩 품질 저하.
// 함수/클래스 단위로 끊고, top-level imports/const/comment는 module 청크로 묶음.
// 비지원 언어 또는 파싱 실패 시 None — 호출자가 600자 fallback로.

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub(crate) enum AstLang {
    Rust,
    TypeScript,
    Tsx,
    JavaScript,
    Python,
}

pub(crate) fn detect_ast_lang(path: &Path) -> Option<AstLang> {
    let ext = path.extension()?.to_str()?;
    Some(match ext {
        "rs" => AstLang::Rust,
        "ts" => AstLang::TypeScript,
        "tsx" => AstLang::Tsx,
        "js" | "mjs" | "cjs" | "jsx" => AstLang::JavaScript,
        "py" | "pyi" => AstLang::Python,
        _ => return None,
    })
}

fn ast_grammar(l: AstLang) -> Language {
    match l {
        AstLang::Rust => tree_sitter_rust::LANGUAGE.into(),
        AstLang::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        AstLang::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
        AstLang::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
        AstLang::Python => tree_sitter_python::LANGUAGE.into(),
    }
}

/// 청크 단위 쿼리 — `@chunk.<kind>`로 풀 노드, `@name`으로 식별자 캡처.
/// 인터페이스/메서드는 클래스 안에 contain되므로 후처리에서 자동 dedup.
fn chunk_query(l: AstLang) -> &'static str {
    match l {
        AstLang::Rust => {
            r#"
            (function_item name: (identifier) @name) @chunk.fn
            (struct_item name: (type_identifier) @name) @chunk.struct
            (enum_item name: (type_identifier) @name) @chunk.enum
            (trait_item name: (type_identifier) @name) @chunk.trait
            (impl_item) @chunk.impl
            (mod_item name: (identifier) @name) @chunk.mod
            "#
        }
        AstLang::TypeScript | AstLang::Tsx => {
            r#"
            (function_declaration name: (identifier) @name) @chunk.fn
            (class_declaration name: (type_identifier) @name) @chunk.class
            (interface_declaration name: (type_identifier) @name) @chunk.interface
            (method_definition name: (property_identifier) @name) @chunk.method
            "#
        }
        AstLang::JavaScript => {
            r#"
            (function_declaration name: (identifier) @name) @chunk.fn
            (class_declaration name: (identifier) @name) @chunk.class
            (method_definition name: (property_identifier) @name) @chunk.method
            "#
        }
        AstLang::Python => {
            r#"
            (function_definition name: (identifier) @name) @chunk.fn
            (class_definition name: (identifier) @name) @chunk.class
            "#
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AstChunk {
    pub kind: String,
    pub name: String,
    pub body: String,
}

fn collect_top_level_chunks(
    content: &str,
    lang: AstLang,
) -> Option<Vec<(usize, usize, String, String)>> {
    let grammar = ast_grammar(lang);
    let mut parser = Parser::new();
    parser.set_language(&grammar).ok()?;
    let tree = parser.parse(content, None)?;
    let root = tree.root_node();

    let q_str = chunk_query(lang);
    let q = Query::new(&grammar, q_str).ok()?;
    let mut cursor = QueryCursor::new();

    let capture_names = q.capture_names().to_vec();
    let name_idx = capture_names
        .iter()
        .position(|n| *n == "name")
        .map(|i| i as u32);
    let chunk_kinds: HashMap<u32, String> = capture_names
        .iter()
        .enumerate()
        .filter_map(|(i, n)| {
            let s: &str = n;
            s.strip_prefix("chunk.")
                .map(|k| (i as u32, k.to_string()))
        })
        .collect();

    let mut raw: Vec<(usize, usize, String, String)> = Vec::new();
    let bytes = content.as_bytes();
    for m in cursor.matches(&q, root, bytes) {
        let mut name_str = String::new();
        let mut chunk_node: Option<Node> = None;
        let mut kind = String::from("node");
        for cap in m.captures {
            if Some(cap.index) == name_idx {
                name_str = cap.node.utf8_text(bytes).unwrap_or("").to_string();
            } else if let Some(k) = chunk_kinds.get(&cap.index) {
                chunk_node = Some(cap.node);
                kind = k.clone();
            }
        }
        if let Some(n) = chunk_node {
            let start = n.start_byte();
            let end = n.end_byte();
            if end > start && end <= content.len() {
                raw.push((start, end, kind, name_str));
            }
        }
    }
    Some(raw)
}

/// 함수/클래스 단위 분할 + 외부 영역(top-level)은 module 청크로.
/// 큰 함수(>AST_CHUNK_MAX_CHARS)는 600자 fallback으로 내부 분할 — `name#{i}` 헤더.
pub(crate) fn chunk_by_ast(content: &str, lang: AstLang) -> Option<Vec<AstChunk>> {
    let raw = collect_top_level_chunks(content, lang)?;
    if raw.is_empty() && content.trim().len() < MODULE_HEADER_MIN_CHARS {
        return Some(Vec::new());
    }

    // contain된 노드 제거 — `impl_item`이 함수를 포함, 클래스가 메서드 포함 시 inner는 drop.
    // start ASC, end DESC 정렬 후 누적 outer 검사.
    let mut sorted = raw.clone();
    sorted.sort_by_key(|r| (r.0, std::cmp::Reverse(r.1)));
    let mut top: Vec<(usize, usize, String, String)> = Vec::new();
    for r in sorted {
        let contained = top.iter().any(|t| t.0 <= r.0 && r.1 <= t.1 && (t.0, t.1) != (r.0, r.1));
        if !contained {
            top.push(r);
        }
    }
    top.sort_by_key(|r| r.0);

    // 모듈 헤더 — top 청크들 사이의 외부 영역 합치기.
    let mut module_parts: Vec<&str> = Vec::new();
    let mut pos = 0usize;
    for (s, e, _, _) in &top {
        if pos < *s {
            module_parts.push(&content[pos..*s]);
        }
        pos = *e;
    }
    if pos < content.len() {
        module_parts.push(&content[pos..]);
    }
    let module_body = module_parts.join("\n").trim().to_string();

    let mut out: Vec<AstChunk> = Vec::new();
    if module_body.chars().count() >= MODULE_HEADER_MIN_CHARS {
        out.push(AstChunk {
            kind: "module".into(),
            name: String::new(),
            body: module_body,
        });
    }

    for (start, end, kind, name) in top {
        let body = &content[start..end];
        let char_count = body.chars().count();
        if char_count <= AST_CHUNK_MAX_CHARS {
            out.push(AstChunk {
                kind,
                name,
                body: body.to_string(),
            });
        } else {
            // 큰 함수/클래스는 600자 fallback으로 내부 분할.
            for (i, sub) in chunk_text(body).into_iter().enumerate() {
                let suffix_name = if name.is_empty() {
                    format!("#{}", i + 1)
                } else {
                    format!("{}#{}", name, i + 1)
                };
                out.push(AstChunk {
                    kind: kind.clone(),
                    name: suffix_name,
                    body: sub,
                });
            }
        }
    }
    Some(out)
}

/// 임베딩 키 헤더 — `[fn verify_token | src/auth.rs]` 형태.
/// 모듈은 name 비어있음 → `[module | src/auth.rs]`.
/// fallback(비지원 언어)는 `[src/auth.rs]` (기존 형식 유지).
fn fmt_chunk_key(chunk: &AstChunk, rel_path: &str) -> String {
    if chunk.name.is_empty() {
        format!("[{} | {}]\n{}", chunk.kind, rel_path, chunk.body)
    } else {
        format!(
            "[{} {} | {}]\n{}",
            chunk.kind, chunk.name, rel_path, chunk.body
        )
    }
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

        // Phase 137-A: AST 청킹 우선, 비지원 언어/파싱 실패 시 600자 fallback.
        match detect_ast_lang(path).and_then(|l| chunk_by_ast(&text, l)) {
            Some(ast_chunks) if !ast_chunks.is_empty() => {
                for c in ast_chunks {
                    contents.push(fmt_chunk_key(&c, &rel_path));
                }
            }
            _ => {
                for chunk in chunk_text(&text) {
                    contents.push(format!("[{}]\n{}", rel_path, chunk));
                }
            }
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
async fn search_with_client(
    client: &reqwest::Client,
    query: &str,
    limit: usize,
) -> Vec<SearchResult> {
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
        ctx.push_str(&format!(
            "=== 현재 파일: {} ===\n{}\n\n",
            file_path, file_content
        ));
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // ─── Phase 137-A: AST 청킹 회귀 가드 ────────────────────────────────────

    #[test]
    fn detect_ast_lang_확장자_매핑() {
        assert_eq!(detect_ast_lang(&PathBuf::from("a.rs")), Some(AstLang::Rust));
        assert_eq!(detect_ast_lang(&PathBuf::from("a.ts")), Some(AstLang::TypeScript));
        assert_eq!(detect_ast_lang(&PathBuf::from("a.tsx")), Some(AstLang::Tsx));
        assert_eq!(detect_ast_lang(&PathBuf::from("a.js")), Some(AstLang::JavaScript));
        assert_eq!(detect_ast_lang(&PathBuf::from("a.mjs")), Some(AstLang::JavaScript));
        assert_eq!(detect_ast_lang(&PathBuf::from("a.py")), Some(AstLang::Python));
        assert_eq!(detect_ast_lang(&PathBuf::from("a.go")), None);
        assert_eq!(detect_ast_lang(&PathBuf::from("a.txt")), None);
        assert_eq!(detect_ast_lang(&PathBuf::from("README")), None);
    }

    #[test]
    fn ast_청킹_rust_top_level_함수와_struct() {
        let src = r#"use std::path::Path;

const X: u32 = 42;

fn first(a: i32) -> i32 {
    a + 1
}

struct Foo {
    bar: u32,
}

fn second(b: i32) -> i32 {
    let x = first(b);
    x * 2
}
"#;
        let chunks = chunk_by_ast(src, AstLang::Rust).expect("파싱 성공");
        // module(use+const) + first + Foo + second
        let kinds: Vec<&str> = chunks.iter().map(|c| c.kind.as_str()).collect();
        assert!(kinds.contains(&"module"), "module 헤더 누락: {:?}", kinds);
        assert!(kinds.iter().filter(|k| **k == "fn").count() == 2, "fn 2개여야: {:?}", kinds);
        assert!(kinds.contains(&"struct"), "struct 누락: {:?}", kinds);

        // 이름 검증
        let names: Vec<&str> = chunks.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"first"), "{:?}", names);
        assert!(names.contains(&"second"), "{:?}", names);
        assert!(names.contains(&"Foo"), "{:?}", names);

        // module 본문에 const와 use가 들어가야
        let module = chunks.iter().find(|c| c.kind == "module").unwrap();
        assert!(module.body.contains("use std::path::Path"), "{}", module.body);
        assert!(module.body.contains("const X"), "{}", module.body);
    }

    #[test]
    fn ast_청킹_python_class에_메서드는_contain되어_제거() {
        let src = r#"import os

class Greeter:
    def hello(self):
        return "hi"

    def goodbye(self):
        return "bye"

def standalone():
    pass
"#;
        let chunks = chunk_by_ast(src, AstLang::Python).expect("파싱 성공");
        let kinds: Vec<&str> = chunks.iter().map(|c| c.kind.as_str()).collect();
        // module + class Greeter + fn standalone — 메서드는 클래스에 contain되어 제거.
        assert!(kinds.iter().filter(|k| **k == "fn").count() == 1, "standalone만: {:?}", kinds);
        assert!(kinds.contains(&"class"), "{:?}", kinds);
        let names: Vec<&str> = chunks.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"Greeter"), "{:?}", names);
        assert!(names.contains(&"standalone"), "{:?}", names);
        assert!(!names.contains(&"hello"), "메서드 hello는 클래스에 흡수: {:?}", names);
    }

    #[test]
    fn ast_청킹_typescript_클래스와_인터페이스() {
        let src = r#"import { foo } from "./foo";

interface User {
    name: string;
    age: number;
}

export class Auth {
    verify(token: string): boolean {
        return token.length > 0;
    }
}

function login(u: string) {
    return u;
}
"#;
        let chunks = chunk_by_ast(src, AstLang::TypeScript).expect("파싱 성공");
        let kinds: Vec<&str> = chunks.iter().map(|c| c.kind.as_str()).collect();
        assert!(kinds.contains(&"interface"), "{:?}", kinds);
        assert!(kinds.contains(&"class"), "{:?}", kinds);
        assert!(kinds.contains(&"fn"), "{:?}", kinds);
        let names: Vec<&str> = chunks.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"User"), "{:?}", names);
        assert!(names.contains(&"Auth"), "{:?}", names);
        assert!(names.contains(&"login"), "{:?}", names);
        // 메서드 verify는 클래스에 흡수돼야
        assert!(!names.contains(&"verify"), "{:?}", names);
    }

    #[test]
    fn ast_청킹_큰_함수는_600자_fallback으로_분할() {
        // 함수 본문이 AST_CHUNK_MAX_CHARS(2000자) 초과 → 내부 분할.
        let huge_body: String = "    let z = 1;\n".repeat(180); // ~2700 chars
        let src = format!(
            "fn small() {{ }}\n\nfn huge() {{\n{}}}\n",
            huge_body
        );
        let chunks = chunk_by_ast(&src, AstLang::Rust).expect("파싱 성공");
        let huge_chunks: Vec<&AstChunk> = chunks
            .iter()
            .filter(|c| c.kind == "fn" && c.name.starts_with("huge"))
            .collect();
        assert!(
            huge_chunks.len() >= 2,
            "huge 함수는 분할되어야: {} 청크, names={:?}",
            huge_chunks.len(),
            huge_chunks.iter().map(|c| &c.name).collect::<Vec<_>>()
        );
        assert!(
            huge_chunks.iter().all(|c| c.name.contains("#")),
            "분할 청크는 #1, #2 suffix: {:?}",
            huge_chunks.iter().map(|c| &c.name).collect::<Vec<_>>()
        );
    }

    #[test]
    fn ast_청킹_빈_파일_또는_심볼_없음() {
        // 짧은 빈 파일 → 빈 벡터 (module 헤더 cutoff 아래).
        let chunks = chunk_by_ast("// hi", AstLang::Rust).expect("파싱 성공");
        assert!(chunks.is_empty() || chunks.iter().all(|c| c.kind == "module"));

        // 짧고 심볼 없는 코드
        let src = "let x = 1;"; // top-level let은 Rust에서 invalid지만 파서는 통과
        let chunks = chunk_by_ast(src, AstLang::Rust).expect("파싱 성공");
        // 심볼 0개 + module 본문 충분히 짧으면 빈 벡터, 길면 module 1개.
        assert!(chunks.len() <= 1, "{:?}", chunks);
    }

    #[test]
    fn fmt_chunk_key_헤더_형식() {
        let fn_chunk = AstChunk {
            kind: "fn".into(),
            name: "verify_token".into(),
            body: "fn verify_token() {}".into(),
        };
        let key = fmt_chunk_key(&fn_chunk, "src/auth.rs");
        assert!(key.starts_with("[fn verify_token | src/auth.rs]\n"), "{}", key);

        let module_chunk = AstChunk {
            kind: "module".into(),
            name: String::new(),
            body: "use std;".into(),
        };
        let key = fmt_chunk_key(&module_chunk, "src/lib.rs");
        assert!(key.starts_with("[module | src/lib.rs]\n"), "{}", key);
    }

    #[test]
    fn ast_청킹_javascript_클래스_메서드_흡수() {
        let src = r#"
class Counter {
    constructor() { this.n = 0; }
    inc() { this.n += 1; }
}

function helper() { return 42; }
"#;
        let chunks = chunk_by_ast(src, AstLang::JavaScript).expect("파싱 성공");
        let names: Vec<&str> = chunks.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"Counter"), "{:?}", names);
        assert!(names.contains(&"helper"), "{:?}", names);
        // 메서드 inc/constructor는 클래스에 흡수
        assert!(!names.contains(&"inc"), "{:?}", names);
    }
}
