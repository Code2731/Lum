use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::env;
use std::process::Command;
use tauri::{Emitter, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TerminalBlock {
    id: String,
    command: String,
    output: String,
    explanation: Option<String>,
    analysis: Option<String>,
    suggestion: Option<String>,
    #[serde(rename = "type")]
    block_type: String, // "shell" | "ai" | "error-analysis"
    status: String,    // "executing" | "completed" | "error"
    cwd: String,
    #[serde(rename = "gitBranch")]
    git_branch: Option<String>,
}

#[tauri::command]
fn save_session(blocks: Vec<TerminalBlock>) -> Result<(), String> {
    let home = env::var("HOME").or_else(|_| env::var("USERPROFILE")).map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home).join(".lum_session.json");
    let json = serde_json::to_string_pretty(&blocks).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_session() -> Result<Vec<TerminalBlock>, String> {
    let home = env::var("HOME").or_else(|_| env::var("USERPROFILE")).map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home).join(".lum_session.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let blocks: Vec<TerminalBlock> = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(blocks)
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
                .filter_map(|e| e.ok().and_then(|entry| entry.file_name().into_string().ok()))
                .collect()
        })
        .unwrap_or_default();

    SystemContext { cwd, git_branch, files }
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
    let res = client.get("http://localhost:11434/api/tags").send().await.map_err(|e| e.to_string())?;
    
    #[derive(Debug, Serialize, Deserialize)]
    struct Model { name: String }
    #[derive(Debug, Serialize, Deserialize)]
    struct ModelListResponse { models: Vec<Model> }

    let json: ModelListResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(json.models.into_iter().map(|m| m.name).collect())
}

#[tauri::command]
async fn generate_ai_command(prompt: String, model: String, context: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let request_body = OllamaRequest {
        model,
        prompt: format!(
            "You are a terminal expert. Convert the user's natural language request into a single executable shell command.\n\
             Context: {}\n\
             Request: {}\n\
             Respond ONLY with a JSON object: {{\"command\": \"the command\", \"explanation\": \"short explanation\"}}.",
            context, prompt
        ),
        stream: false,
    };

    let response = client.post("http://localhost:11434/api/generate").json(&request_body).send().await.map_err(|e| e.to_string())?;
    let ollama_res: OllamaResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(ollama_res.response)
}

#[tauri::command]
async fn analyze_error(command: String, stderr: String, model: String, context: String) -> Result<String, String> {
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
             Respond ONLY with a JSON object: {{\"analysis\": \"reason\", \"suggestion\": \"fixed command\"}}.",
            command, stderr, context
        ),
        stream: false,
    };

    let response = client.post("http://localhost:11434/api/generate").json(&request_body).send().await.map_err(|e| e.to_string())?;
    let ollama_res: OllamaResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(ollama_res.response)
}

#[tauri::command]
fn write_to_pty(data: String, state: State<'_, TerminalState>) -> Result<(), String> {
    let mut writer = state.writer.lock().unwrap();
    writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 }).expect("failed to open pty");
    let shell = if cfg!(target_os = "windows") { "powershell.exe" } else { "zsh" };
    let cmd = CommandBuilder::new(shell);
    let mut _child = pair.slave.spawn_command(cmd).expect("failed to spawn shell");
    let mut reader = pair.master.try_clone_reader().expect("failed to clone reader");
    let writer = pair.master.take_writer().expect("failed to take writer");
    let terminal_state = TerminalState { writer: Arc::new(Mutex::new(writer)) };

    tauri::Builder::default()
        .manage(terminal_state)
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let handle = app.handle().clone();
            thread::spawn(move || {
                let mut buffer = [0u8; 1024];
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(n) => {
                            let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                            handle.emit("pty-data", data).unwrap();
                        }
                        Err(_) => break,
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_system_context, 
            generate_ai_command, 
            analyze_error, 
            write_to_pty, 
            check_ollama_status,
            list_models,
            save_session,
            load_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
