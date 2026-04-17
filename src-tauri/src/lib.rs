use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::env;
use std::io::{Read, Write};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Action {
    #[serde(rename = "type")]
    action_type: String,
    cmd: Option<String>,
    path: Option<String>,
    content: Option<String>,
    label: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ReasoningStep {
    agent: String,   // "Planner" | "Coder" | "Reviewer"
    content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TerminalBlock {
    id: String,
    command: String,
    output: String,
    explanation: Option<String>,
    actions: Option<Vec<Action>>,
    analysis: Option<String>,
    suggestion: Option<String>,
    #[serde(rename = "type")]
    block_type: String,
    status: String,
    cwd: String,
    #[serde(rename = "gitBranch")]
    git_branch: Option<String>,
    embedding: Option<Vec<f32>>,
    #[serde(rename = "reasoningSteps")]
    reasoning_steps: Option<Vec<ReasoningStep>>, // 사고 과정 필드 추가
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Pane {
    id: String,
    blocks: Vec<TerminalBlock>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Tab {
    id: String,
    name: String,
    panes: Vec<Pane>,
    #[serde(rename = "activePaneId")]
    active_pane_id: String,
    orientation: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct McpServerConfig {
    name: String,
    command: String,
    args: Vec<String>,
    enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppConfig {
    theme: String, // "dark", "light", "custom"
    font_size: u32,
    opacity: f32,
    accent_color: String,
    gemini_api_key: Option<String>, // Gemini API 키 추가
    mcp_servers: Vec<McpServerConfig>, // MCP 서버 설정 추가
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font_size: 14,
            opacity: 0.95,
            accent_color: "#a78bfa".to_string(),
            gemini_api_key: None,
            mcp_servers: vec![],
        }
    }
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot_product / (norm_a * norm_b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = AppConfig::default();
        assert_eq!(config.theme, "dark");
        assert_eq!(config.accent_color, "#a78bfa");
    }

    #[test]
    fn test_cosine_similarity() {
        let vec1 = vec![1.0, 0.0, 0.0];
        let vec2 = vec![1.0, 0.0, 0.0];
        let vec3 = vec![0.0, 1.0, 0.0];

        assert!((cosine_similarity(&vec1, &vec2) - 1.0).abs() < 1e-6); // 동일 벡터
        assert!((cosine_similarity(&vec1, &vec3) - 0.0).abs() < 1e-6); // 직교 벡터
    }
}

#[tauri::command]
fn get_completions(cwd: String, partial: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&cwd);
    if !path.exists() {
        return Ok(vec![]);
    }

    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut matches = Vec::new();

    for entry in entries {
        if let Ok(entry) = entry {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&partial) {
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                if is_dir {
                    matches.push(format!("{}/", name));
                } else {
                    matches.push(name);
                }
            }
        }
    }
    matches.sort();
    Ok(matches)
}

#[tauri::command]
fn load_config() -> Result<AppConfig, String> {
    let home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home).join(".lum_config.json");
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let config: AppConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<(), String> {
    let home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home).join(".lum_config.json");
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_session(tabs: Vec<Tab>) -> Result<(), String> {
    let home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home).join(".lum_session.json");
    let json = serde_json::to_string_pretty(&tabs).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_session() -> Result<Vec<Tab>, String> {
    let home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home).join(".lum_session.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let tabs: Vec<Tab> = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(tabs)
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaResponse {
    response: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SystemContext {
    cwd: String,
    git_branch: Option<String>,
    files: Vec<String>,
    project_summary: String, // 프로젝트 요약 정보 추가
}

fn get_project_summary_info(cwd: &str) -> String {
    use ignore::WalkBuilder;
    let mut summary = String::from("Project Structure:\n");
    let mut file_count = 0;

    // 1. 파일 트리 요약 (최대 50개 파일만 표시하여 컨텍스트 절약)
    for result in WalkBuilder::new(cwd).build() {
        if let Ok(entry) = result {
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                if file_count < 50 {
                    let path = entry.path().strip_prefix(cwd).unwrap_or(entry.path());
                    summary.push_str(&format!("- {}\n", path.display()));
                    file_count += 1;
                }
            }
        }
    }

    // 2. 주요 설정 파일 내용 포함 (내용이 너무 길면 앞부분만)
    let key_files = ["package.json", "Cargo.toml", "README.md", "CLAUDE.md"];
    summary.push_str("\nKey Files Content:\n");
    for file_name in key_files {
        let path = std::path::Path::new(cwd).join(file_name);
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                let snippet = if content.len() > 500 {
                    &content[..500]
                } else {
                    &content
                };
                summary.push_str(&format!("--- {} ---\n{}\n", file_name, snippet));
            }
        }
    }

    summary
}

#[tauri::command]
fn get_system_context() -> SystemContext {
    let cwd = env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "/".to_string());

    let git_branch = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        });

    let files = std::fs::read_dir(&cwd)
        .map(|entries| {
            entries
                .filter_map(|e| {
                    e.ok()
                        .and_then(|entry| entry.file_name().into_string().ok())
                })
                .collect()
        })
        .unwrap_or_default();

    let project_summary = get_project_summary_info(&cwd);

    SystemContext {
        cwd,
        git_branch,
        files,
        project_summary,
    }
}

#[tauri::command]
async fn check_ollama_status() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    match client.get("http://localhost:11434/api/tags").send().await {
        Ok(res) => Ok(res.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn list_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    #[derive(Debug, Serialize, Deserialize)]
    struct Model {
        name: String,
    }
    #[derive(Debug, Serialize, Deserialize)]
    struct ModelListResponse {
        models: Vec<Model>,
    }

    let json: ModelListResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(json.models.into_iter().map(|m| m.name).collect())
}

mod burn_inference;
mod sandbox;
mod mcp;
mod memory;
mod audio;
mod swarm;

#[tauri::command]
async fn generate_ai_command(
    prompt: String,
    model: String,
    context: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    // WebGPU 로컬 모델 처리
    if model.starts_with("webgpu-") {
        return burn_inference::generate_local_webgpu(prompt).await;
    }

    // GEMINI_SYSTEM_MD 환경 변수 확인 (Gemini CLI 업데이트 대응)
    let custom_system_prompt = env::var("GEMINI_SYSTEM_MD")
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_else(|| "".to_string());

    let full_prompt = if !custom_system_prompt.is_empty() {
        format!("System: {}\nContext: {}\nRequest: {}", custom_system_prompt, context, prompt)
    } else {
        format!(
            "You are a terminal expert. Convert the user's natural language request into executable steps.\n\
             Context: {}\n\
             Request: {}\n\
             Respond ONLY with a JSON object in this format:\n\
             {{\n\
               \"command\": \"the primary command\",\n\
               \"explanation\": \"markdown explanation\",\n\
               \"actions\": [\n\
                 {{ \"type\": \"run\", \"cmd\": \"command to run\", \"label\": \"Step label\" }},\n\
                 {{ \"type\": \"create\", \"path\": \"file path\", \"content\": \"file content\", \"label\": \"Create file label\" }}\n\
               ],\n\
               \"visualData\": {{\n\
                 \"type\": \"chart\",\n\
                 \"chartType\": \"line | bar | area | pie\",\n\
                 \"data\": [{{ \"x\": \"label\", \"y1\": 10, \"y2\": 20 }}],\n\
                 \"config\": {{ \"xKey\": \"x\", \"yKeys\": [\"y1\", \"y2\"], \"title\": \"Chart Title\" }}\n\
               }},\n\
               \"toolCalls\": [\n\
                 {{ \"server\": \"server_name\", \"tool\": \"tool_name\", \"arguments\": {{ \"arg1\": \"val1\" }} }}\n\
               ],\n\
               \"healingPlan\": [\n\
                 {{ \"type\": \"run | create\", \"cmd\": \"command\", \"path\": \"path\", \"content\": \"content\", \"label\": \"Reason for this step\" }}\n\
               ]\n\
             }}\n\
             Note: Include 'visualData' ONLY if visualization is needed.\n\
             Note: Include 'toolCalls' if you need external information.\n\
             Note: Include 'healingPlan' ONLY if you are in SELF_HEALING mode to fix an error.\n\
             Important: Use markdown in 'explanation'. Ensure the JSON is valid.",
            context, prompt
        )
    };

    if model.starts_with("gemini-") {
        // Gemini API 호출
        let config = load_config().unwrap_or_default();
        let api_key = config.gemini_api_key.ok_or("Gemini API Key is missing. Please set it in Settings.")?;
        
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model, api_key
        );

        let request_body = serde_json::json!({
            "contents": [{
                "parts": [{ "text": full_prompt }]
            }]
        });

        let response = client
            .post(url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let res_json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let result_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .ok_or("Failed to parse Gemini response")?;
        
        Ok(result_text.to_string())
    } else {
        // Ollama API 호출 (기존 로직)
        let request_body = OllamaRequest {
            model,
            prompt: full_prompt,
            stream: false,
        };

        let response = client
            .post("http://localhost:11434/api/generate")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let ollama_res: OllamaResponse = response.json().await.map_err(|e| e.to_string())?;
        Ok(ollama_res.response)
    }
}

#[tauri::command]
async fn analyze_error(
    command: String,
    stderr: String,
    model: String,
    context: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let request_body = OllamaRequest {
        model,
        prompt: format!(
            "The following command failed: `{}`.\n\
             Error: `{}`.\n\
             Context: {}\n\
             Analyze and suggest a fix.\n\
             Respond ONLY with a JSON object: {{\"analysis\": \"markdown analysis\", \"suggestion\": \"fixed command\"}}.\n\
             Use markdown in 'analysis' for clarity.",
            command, stderr, context
        ),
        stream: false,
    };

    let response = client
        .post("http://localhost:11434/api/generate")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let ollama_res: OllamaResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(ollama_res.response)
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaEmbeddingRequest {
    model: String,
    prompt: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaEmbeddingResponse {
    embedding: Vec<f32>,
}

#[tauri::command]
async fn generate_embedding(prompt: String, model: String) -> Result<Vec<f32>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let request_body = OllamaEmbeddingRequest { model, prompt };

    let response = client
        .post("http://localhost:11434/api/embeddings")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let ollama_res: OllamaEmbeddingResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(ollama_res.embedding)
}

use std::collections::HashMap;

pub struct TerminalState {
    pub writers: Arc<Mutex<HashMap<String, Arc<Mutex<Box<dyn Write + Send>>>>>>,
}

#[tauri::command]
fn spawn_pty(
    tab_id: String,
    cwd: Option<String>,
    state: State<'_, TerminalState>,
    handle: tauri::AppHandle,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("failed to open pty");

    let shell = if cfg!(target_os = "windows") {
        "powershell.exe"
    } else {
        "zsh"
    };
    let mut cmd = CommandBuilder::new(shell);

    if let Some(path) = cwd {
        let p = std::path::Path::new(&path);
        if p.exists() {
            cmd.cwd(p.to_path_buf());
        }
    }
    let mut _child = pair
        .slave
        .spawn_command(cmd)
        .expect("failed to spawn shell");
    let mut reader = pair
        .master
        .try_clone_reader()
        .expect("failed to clone reader");
    let writer = pair.master.take_writer().expect("failed to take writer");

    {
        let mut writers = state.writers.lock().unwrap();
        writers.insert(tab_id.clone(), Arc::new(Mutex::new(writer)));
    }

    let tab_id_clone = tab_id.clone();
    thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    handle
                        .emit(
                            "pty-data",
                            serde_json::json!({ "tab_id": tab_id_clone, "data": data }),
                        )
                        .unwrap();
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn write_to_pty(
    tab_id: String,
    data: String,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let writers = state.writers.lock().unwrap();
    if let Some(writer_arc) = writers.get(&tab_id) {
        let mut writer = writer_arc.lock().unwrap();
        writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Tab not found".to_string())
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaPullRequest {
    name: String,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OllamaPullResponse {
    status: String,
    digest: Option<String>,
    total: Option<u64>,
    completed: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaDeleteRequest {
    name: String,
}

#[tauri::command]
async fn pull_model(name: String, handle: tauri::AppHandle) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3600)) // 다운로드는 시간이 오래 걸릴 수 있으므로 1시간 타임아웃
        .build()
        .map_err(|e| e.to_string())?;

    let request_body = OllamaPullRequest {
        name: name.clone(),
        stream: true,
    };
    let res = client
        .post("http://localhost:11434/api/pull")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    use futures_util::StreamExt;
    let mut stream = res.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        if let Ok(line) = serde_json::from_slice::<OllamaPullResponse>(&chunk) {
            handle.emit("pull-progress", line).unwrap();
        }
    }

    Ok(())
}

#[tauri::command]
async fn delete_model(name: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let request_body = OllamaDeleteRequest { name };

    let res = client
        .delete("http://localhost:11434/api/delete")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to delete model: {}", res.status()))
    }
}

#[tauri::command]
fn create_file(path: String, content: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CodeChunk {
    path: String,
    content: String,
    embedding: Option<Vec<f32>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProjectIndex {
    chunks: Vec<CodeChunk>,
}

#[tauri::command]
async fn index_project(model: String, handle: tauri::AppHandle) -> Result<usize, String> {
    use ignore::WalkBuilder;
    let cwd = env::current_dir().map_err(|e| e.to_string())?;
    let mut chunks = Vec::new();

    // 1. 파일 스캔 및 내용 읽기
    for result in WalkBuilder::new(&cwd).build() {
        if let Ok(entry) = result {
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                let path = entry.path().to_path_buf();
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

                // 소스코드 파일들만 인덱싱 (ts, tsx, rs, js, py 등)
                if ["ts", "tsx", "rs", "js", "py", "html", "css", "md"].contains(&ext) {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        let relative_path = path
                            .strip_prefix(&cwd)
                            .unwrap_or(&path)
                            .to_string_lossy()
                            .to_string();

                        // 2. 간단한 라인 단위 청킹 (500자 내외로 쪼개기)
                        for chunk_content in content.as_str().split("\n\n") {
                            if chunk_content.trim().is_empty() {
                                continue;
                            }
                            chunks.push(CodeChunk {
                                path: relative_path.clone(),
                                content: chunk_content.trim().to_string(),
                                embedding: None,
                            });
                        }
                    }
                }
            }
        }
    }

    // 3. 벡터화 (Ollama 임베딩 API 호출) - 속도를 위해 일부만 샘플링하거나 병렬 처리 가능하지만 여기서는 순차 처리
    let client = reqwest::Client::new();
    let _total = chunks.len();
    let mut indexed_count = 0;

    for chunk in chunks.iter_mut().take(100) {
        // 데모를 위해 우선 100개 청크만 제한
        let req = OllamaEmbeddingRequest {
            model: model.clone(),
            prompt: chunk.content.clone(),
        };
        if let Ok(res) = client
            .post("http://localhost:11434/api/embeddings")
            .json(&req)
            .send()
            .await
        {
            if let Ok(data) = res.json::<OllamaEmbeddingResponse>().await {
                chunk.embedding = Some(data.embedding);
                indexed_count += 1;
                handle
                    .emit(
                        "index-progress",
                        serde_json::json!({ "current": indexed_count, "total": 100 }),
                    )
                    .unwrap();
            }
        }
    }

    // 인덱스 저장 (간편하게 전역 상태나 파일로 관리 가능)
    let index_path = std::path::Path::new(&env::var("HOME").unwrap_or_else(|_| ".".to_string()))
        .join(".lum_code_index.json");
    let json = serde_json::to_string(&chunks).map_err(|e| e.to_string())?;
    std::fs::write(index_path, json).map_err(|e| e.to_string())?;

    Ok(indexed_count)
}

#[tauri::command]
async fn search_codebase(query: String, model: String) -> Result<Vec<CodeChunk>, String> {
    let client = reqwest::Client::new();
    let req = OllamaEmbeddingRequest {
        model,
        prompt: query,
    };
    let res = client
        .post("http://localhost:11434/api/embeddings")
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let query_emb: OllamaEmbeddingResponse = res.json().await.map_err(|e| e.to_string())?;

    // 저장된 인덱스 로드
    let index_path = std::path::Path::new(&env::var("HOME").unwrap_or_else(|_| ".".to_string()))
        .join(".lum_code_index.json");
    if !index_path.exists() {
        return Ok(vec![]);
    }
    let json = std::fs::read_to_string(index_path).map_err(|e| e.to_string())?;
    let chunks: Vec<CodeChunk> = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    // 유사도 검색
    let mut scored: Vec<(f32, CodeChunk)> = chunks
        .into_iter()
        .filter(|c| c.embedding.is_some())
        .map(|c| {
            let sim = cosine_similarity(&query_emb.embedding, c.embedding.as_ref().unwrap());
            (sim, c)
        })
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
    Ok(scored.into_iter().take(5).map(|(_, c)| c).collect())
}

#[tauri::command]
async fn check_wgpu_support() -> Result<bool, String> {
    let instance = wgpu::Instance::default();
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: None,
        })
        .await;

    Ok(adapter.is_some())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let terminal_state = TerminalState {
        writers: Arc::new(Mutex::new(HashMap::new())),
    };

    tauri::Builder::default()
        .manage(terminal_state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_context,
            generate_ai_command,
            analyze_error,
            write_to_pty,
            check_ollama_status,
            list_models,
            save_session,
            load_session,
            get_completions,
            load_config,
            save_config,
            spawn_pty,
            create_file,
            pull_model,
            delete_model,
            generate_embedding,
            index_project,
            search_codebase,
            check_wgpu_support,
            sandbox::verify_command_safety,
            mcp::call_mcp_tool,
            mcp::list_internal_tools,
            memory::add_to_memory,
            memory::search_memory,
            audio::start_voice_recording,
            audio::stop_voice_recording,
            swarm::start_p2p_node,
            swarm::list_peers,
            swarm::send_swarm_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
