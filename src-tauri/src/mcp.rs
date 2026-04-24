// Phase 74 — MCP (Model Context Protocol) 서버 관리 + 제대로 된 핸드셰이크
//
// 프로토콜: initialize → initialized(notification) → tools/list / tools/call
// 서버 목록은 ~/.lum_mcp.json 에 영속.

use crate::platform;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

const CONFIG_FILE: &str = ".lum_mcp.json";
const HANDSHAKE_TIMEOUT_MS: u64 = 5000;
const CALL_TIMEOUT_MS: u64 = 30000;

// ─── Config ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct McpServerSpec {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 사용자 편의용 설명 (UI 표시)
    #[serde(default)]
    pub description: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct McpConfig {
    #[serde(default)]
    pub servers: Vec<McpServerSpec>,
}

fn config_path() -> PathBuf {
    platform::home_dir().join(CONFIG_FILE)
}

fn load_config() -> McpConfig {
    match std::fs::read_to_string(config_path()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => McpConfig::default(),
    }
}

fn save_config(cfg: &McpConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(config_path(), json).map_err(|e| e.to_string())
}

// ─── 런타임 상태 ─────────────────────────────────────────────────────────────

pub struct McpProcess {
    pub child: Child,
    pub stdin: std::process::ChildStdin,
    pub reader: BufReader<std::process::ChildStdout>,
    pub initialized: bool,
    pub next_id: AtomicU64,
}

pub struct McpState {
    pub servers: Arc<Mutex<HashMap<String, McpProcess>>>,
}

// ─── JSON-RPC 헬퍼 ───────────────────────────────────────────────────────────

/// request: id가 있는 요청. response를 기다림.
fn rpc_request(
    process: &mut McpProcess,
    method: &str,
    params: Value,
    timeout_ms: u64,
) -> Result<Value, String> {
    let id = process.next_id.fetch_add(1, Ordering::Relaxed);
    let req = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });
    let line = serde_json::to_string(&req).map_err(|e| e.to_string())? + "\n";
    process
        .stdin
        .write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;
    process.stdin.flush().map_err(|e| e.to_string())?;

    read_response_with_timeout(process, id, timeout_ms)
}

/// notification: id 없음. 응답 없이 보내기만.
fn rpc_notify(process: &mut McpProcess, method: &str, params: Value) -> Result<(), String> {
    let req = json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    });
    let line = serde_json::to_string(&req).map_err(|e| e.to_string())? + "\n";
    process
        .stdin
        .write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;
    process.stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// 응답이 올 때까지 읽되, 매칭 id가 아니면 스킵(서버 보낸 다른 noti). 타임아웃 초과 시 에러.
fn read_response_with_timeout(
    process: &mut McpProcess,
    id: u64,
    timeout_ms: u64,
) -> Result<Value, String> {
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        if std::time::Instant::now() >= deadline {
            return Err(format!("MCP 응답 타임아웃 ({} ms)", timeout_ms));
        }
        let mut line = String::new();
        match process.reader.read_line(&mut line) {
            Ok(0) => return Err("MCP 서버가 stdout을 닫음 (프로세스 종료)".into()),
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let Ok(v) = serde_json::from_str::<Value>(trimmed) else {
                    continue; // JSON 아닌 로그 라인 스킵
                };
                // 해당 id 응답인지 확인
                match v.get("id").and_then(|i| i.as_u64()) {
                    Some(recv_id) if recv_id == id => {
                        if let Some(err) = v.get("error") {
                            return Err(format!("MCP 에러: {}", err));
                        }
                        return Ok(v.get("result").cloned().unwrap_or(Value::Null));
                    }
                    _ => continue, // notification이나 다른 id — 무시
                }
            }
            Err(e) => return Err(format!("MCP stdout 읽기 실패: {}", e)),
        }
    }
}

// ─── 서버 수명 관리 ───────────────────────────────────────────────────────────

fn spawn_server(spec: &McpServerSpec) -> Result<McpProcess, String> {
    let mut cmd = Command::new(&spec.command);
    cmd.args(&spec.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null()); // stderr 로그는 일단 버림 (나중에 파일 redirect 가능)
    for (k, v) in &spec.env {
        cmd.env(k, v);
    }
    // Windows: 새 콘솔 창 안 뜨게
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("MCP 서버 '{}' spawn 실패: {}", spec.name, e))?;
    let stdin = child.stdin.take().ok_or("stdin 없음")?;
    let stdout = child.stdout.take().ok_or("stdout 없음")?;
    Ok(McpProcess {
        child,
        stdin,
        reader: BufReader::new(stdout),
        initialized: false,
        next_id: AtomicU64::new(1),
    })
}

fn ensure_initialized(process: &mut McpProcess) -> Result<(), String> {
    if process.initialized {
        return Ok(());
    }
    // 1. initialize request
    let params = json!({
        "protocolVersion": "2024-11-05",
        "capabilities": { "tools": {} },
        "clientInfo": { "name": "LUM Terminal", "version": env!("CARGO_PKG_VERSION") },
    });
    let _ = rpc_request(process, "initialize", params, HANDSHAKE_TIMEOUT_MS)?;
    // 2. initialized notification (응답 없음)
    rpc_notify(process, "notifications/initialized", json!({}))?;
    process.initialized = true;
    Ok(())
}

fn get_or_start(
    servers: &mut HashMap<String, McpProcess>,
    spec: &McpServerSpec,
) -> Result<(), String> {
    if !servers.contains_key(&spec.name) {
        let proc = spawn_server(spec)?;
        servers.insert(spec.name.clone(), proc);
    }
    let p = servers.get_mut(&spec.name).unwrap();
    ensure_initialized(p)?;
    Ok(())
}

fn stop_server(servers: &mut HashMap<String, McpProcess>, name: &str) {
    if let Some(mut proc) = servers.remove(name) {
        let _ = proc.child.kill();
        let _ = proc.child.wait();
    }
}

// ─── Tauri 커맨드: 설정 ──────────────────────────────────────────────────────

#[tauri::command]
pub fn list_mcp_servers() -> Vec<McpServerSpec> {
    load_config().servers
}

#[tauri::command]
pub fn save_mcp_server(spec: McpServerSpec) -> Result<(), String> {
    if spec.name.trim().is_empty() {
        return Err("서버 이름이 필요합니다".into());
    }
    let mut cfg = load_config();
    if let Some(idx) = cfg.servers.iter().position(|s| s.name == spec.name) {
        cfg.servers[idx] = spec;
    } else {
        cfg.servers.push(spec);
    }
    save_config(&cfg)
}

#[tauri::command]
pub fn delete_mcp_server(name: String, state: tauri::State<'_, McpState>) -> Result<(), String> {
    // 실행 중이면 먼저 중지
    if let Ok(mut servers) = state.servers.lock() {
        stop_server(&mut servers, &name);
    }
    let mut cfg = load_config();
    cfg.servers.retain(|s| s.name != name);
    save_config(&cfg)
}

// ─── Tauri 커맨드: 실행 ──────────────────────────────────────────────────────

#[tauri::command]
pub fn mcp_stop_server(name: String, state: tauri::State<'_, McpState>) -> Result<(), String> {
    if let Ok(mut servers) = state.servers.lock() {
        stop_server(&mut servers, &name);
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_list_tools(
    server_name: String,
    state: tauri::State<'_, McpState>,
) -> Result<Value, String> {
    let spec = load_config()
        .servers
        .into_iter()
        .find(|s| s.name == server_name)
        .ok_or_else(|| format!("등록되지 않은 서버: {}", server_name))?;

    let mut servers = state.servers.lock().map_err(|_| "lock 오류".to_string())?;
    get_or_start(&mut servers, &spec)?;
    let process = servers.get_mut(&server_name).unwrap();
    rpc_request(process, "tools/list", json!({}), CALL_TIMEOUT_MS)
}

#[tauri::command]
pub async fn mcp_call_tool(
    server_name: String,
    tool_name: String,
    arguments: Value,
    state: tauri::State<'_, McpState>,
) -> Result<Value, String> {
    let spec = load_config()
        .servers
        .into_iter()
        .find(|s| s.name == server_name)
        .ok_or_else(|| format!("등록되지 않은 서버: {}", server_name))?;

    let mut servers = state.servers.lock().map_err(|_| "lock 오류".to_string())?;
    get_or_start(&mut servers, &spec)?;
    let process = servers.get_mut(&server_name).unwrap();
    let params = json!({ "name": tool_name, "arguments": arguments });
    rpc_request(process, "tools/call", params, CALL_TIMEOUT_MS)
}

/// 간편 Quick Start 프리셋 — 공식 MCP 서버들을 기본 비활성으로 등록
#[tauri::command]
pub fn mcp_install_presets() -> Result<Vec<McpServerSpec>, String> {
    let home = platform::home_dir().to_string_lossy().to_string();
    let presets = vec![
        McpServerSpec {
            name: "filesystem".into(),
            command: "npx".into(),
            args: vec![
                "-y".into(),
                "@modelcontextprotocol/server-filesystem".into(),
                home,
            ],
            env: HashMap::new(),
            enabled: false,
            description: Some("로컬 파일 읽기/쓰기 (홈 디렉토리 접근)".into()),
        },
        McpServerSpec {
            name: "playwright".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@playwright/mcp@latest".into()],
            env: HashMap::new(),
            enabled: false,
            description: Some("브라우저 자동화 · 스크린샷 · 접근성 트리".into()),
        },
        McpServerSpec {
            name: "git".into(),
            command: "uvx".into(),
            args: vec!["mcp-server-git".into()],
            env: HashMap::new(),
            enabled: false,
            description: Some("Git 저장소 조회·diff·blame".into()),
        },
    ];

    let mut cfg = load_config();
    for p in &presets {
        if !cfg.servers.iter().any(|s| s.name == p.name) {
            cfg.servers.push(p.clone());
        }
    }
    save_config(&cfg)?;
    Ok(cfg.servers)
}

// ─── 내장 툴 목록 (레거시 — 프론트엔드 호환용) ──────────────────────────────

#[tauri::command]
pub fn list_internal_tools() -> Vec<serde_json::Value> {
    vec![] // 레거시 스텁 제거 — 실제 툴은 MCP 서버 tools/list로 조회
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_default_servers_empty() {
        let cfg = McpConfig::default();
        assert_eq!(cfg.servers.len(), 0);
    }

    #[test]
    fn server_spec_enabled_defaults_true() {
        let spec: McpServerSpec =
            serde_json::from_str(r#"{"name":"x","command":"y","args":[]}"#).unwrap();
        assert!(spec.enabled);
    }

    #[test]
    fn server_spec_name_required() {
        // save_mcp_server는 빈 name 거부
        assert!(save_mcp_server(McpServerSpec::default()).is_err());
    }
}
