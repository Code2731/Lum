use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::io::{Write, BufReader, BufRead};
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct McpToolCall {
    pub server_name: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

pub struct McpProcess {
    pub child: Child,
    pub stdin: std::process::ChildStdin,
    pub reader: BufReader<std::process::ChildStdout>,
}

pub struct McpState {
    pub servers: Arc<Mutex<HashMap<String, McpProcess>>>,
}

#[tauri::command]
pub async fn call_mcp_tool(
    server_name: String,
    server_command: String,
    server_args: Vec<String>,
    tool_name: String,
    arguments: serde_json::Value,
    state: tauri::State<'_, McpState>,
) -> Result<String, String> {
    let mut servers = state.servers.lock().unwrap();

    // 1. 서버 프로세스가 없으면 실행
    if !servers.contains_key(&server_name) {
        println!("Starting MCP Server: {}", server_name);
        let mut child = Command::new(server_command)
            .args(server_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn MCP server {}: {}", server_name, e))?;

        let stdin = child.stdin.take().ok_or("Failed to open stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
        let reader = BufReader::new(stdout);

        servers.insert(server_name.clone(), McpProcess { child, stdin, reader });
    }

    let process = servers.get_mut(&server_name).unwrap();

    // 2. JSON-RPC 요청 전송
    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    });

    let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())? + "\n";
    process.stdin.write_all(request_str.as_bytes()).map_err(|e| e.to_string())?;
    process.stdin.flush().map_err(|e| e.to_string())?;

    // 3. 응답 읽기
    let mut response = String::new();
    process.reader.read_line(&mut response).map_err(|e| e.to_string())?;

    Ok(response)
}

#[tauri::command]
pub fn list_internal_tools() -> Vec<serde_json::Value> {
    vec![
        json!({
            "name": "read_file",
            "description": "Read file content",
            "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } }
        }),
        json!({
            "name": "google_search",
            "description": "Search Google via MCP",
            "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } }
        })
    ]
}
