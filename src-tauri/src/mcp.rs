use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::io::{Write, BufReader, BufRead};
use serde_json::json;

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct McpToolCall {
    pub server_name: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

#[tauri::command]
pub async fn call_mcp_tool(
    server_command: String,
    server_args: Vec<String>,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<String, String> {
    // 1. MCP 서버 프로세스 실행 (stdio 방식)
    let mut child = Command::new(server_command)
        .args(server_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn MCP server: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let mut reader = BufReader::new(stdout);

    // 2. JSON-RPC 2.0 요청 생성 (MCP 규약)
    // 실제 MCP 핸드쉐이크(initialize) 과정이 필요하지만, 프로토타입을 위해 즉시 call 시도
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
    stdin.write_all(request_str.as_bytes()).map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;

    // 3. 응답 대기 및 읽기
    let mut response = String::new();
    reader.read_line(&mut response).map_err(|e| e.to_string())?;

    // 4. 프로세스 종료 (실제로는 재사용을 위해 유지하는 것이 좋음)
    let _ = child.kill();

    Ok(response)
}

#[tauri::command]
pub fn list_internal_tools() -> Vec<serde_json::Value> {
    // LUM 내부에서 기본적으로 제공하는 도구 목록
    vec![
        json!({
            "name": "read_file",
            "description": "파일의 내용을 읽습니다.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                }
            }
        }),
        json!({
            "name": "google_search",
            "description": "구글 검색을 수행합니다. (외부 MCP 서버 필요)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" }
                }
            }
        })
    ]
}
