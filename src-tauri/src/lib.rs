use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, State};

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

pub struct TerminalState {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

#[tauri::command]
async fn generate_ai_command(prompt: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let request_body = OllamaRequest {
        model: "llama3".to_string(),
        prompt: format!(
            "You are a terminal expert. Only respond with executable shell commands in JSON format. \
             Example: {{\"command\": \"ls -la\"}}. Prompt: {}",
            prompt
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
        "zsh" // Default for macOS
    };

    let cmd = CommandBuilder::new(shell);
    let mut child = pair.slave.spawn_command(cmd).expect("failed to spawn shell");

    let mut reader = pair.master.try_clone_reader().expect("failed to clone reader");
    let writer = pair.master.take_writer().expect("failed to take writer");

    let terminal_state = TerminalState {
        writer: Arc::new(Mutex::new(writer)),
    };

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
        .invoke_handler(tauri::generate_handler![generate_ai_command, write_to_pty])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
