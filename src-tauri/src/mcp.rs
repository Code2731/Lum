// MCP (Model Context Protocol) 서버 관리 + stdio 핸드셰이크
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
const MCP_PROTOCOL_VERSION: &str = "2024-11-05";
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

fn find_server_spec(name: &str) -> Result<McpServerSpec, String> {
    load_config()
        .servers
        .into_iter()
        .find(|s| s.name == name)
        .ok_or_else(|| format!("등록되지 않은 서버: {}", name))
}

// ─── 런타임 상태 ─────────────────────────────────────────────────────────────

pub struct McpProcess {
    child: Child,
    stdin: std::process::ChildStdin,
    reader: BufReader<std::process::ChildStdout>,
    initialized: bool,
    next_id: AtomicU64,
}

impl McpProcess {
    fn next_request_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }
}

/// 서버별로 inner Mutex를 둬서 한 서버 I/O가 다른 서버 호출을 막지 않게 함.
/// outer Mutex는 insert/remove만 보호.
pub struct McpState {
    pub servers: Arc<Mutex<HashMap<String, Arc<Mutex<McpProcess>>>>>,
}

// ─── JSON-RPC 헬퍼 ───────────────────────────────────────────────────────────

fn send_line<W: Write>(writer: &mut W, msg: &Value) -> Result<(), String> {
    let line = serde_json::to_string(msg).map_err(|e| e.to_string())? + "\n";
    writer
        .write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())
}

fn rpc_request(
    process: &mut McpProcess,
    method: &str,
    params: Value,
    timeout_ms: u64,
) -> Result<Value, String> {
    let id = process.next_request_id();
    let req = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });
    send_line(&mut process.stdin, &req)?;
    read_response_with_timeout(process, id, timeout_ms)
}

fn rpc_notify(process: &mut McpProcess, method: &str, params: Value) -> Result<(), String> {
    let msg = json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    });
    send_line(&mut process.stdin, &msg)
}

/// 주어진 id의 응답만 반환. 다른 id·notification은 스킵. 타임아웃 경과 시 에러.
fn read_response_with_timeout(
    process: &mut McpProcess,
    target_id: u64,
    timeout_ms: u64,
) -> Result<Value, String> {
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        if std::time::Instant::now() >= deadline {
            return Err(format!("MCP 응답 타임아웃 ({} ms)", timeout_ms));
        }
        let mut line = String::new();
        let n = process
            .reader
            .read_line(&mut line)
            .map_err(|e| format!("MCP stdout 읽기 실패: {}", e))?;
        if n == 0 {
            return Err("MCP 서버가 stdout을 닫음 (프로세스 종료)".into());
        }
        if let Some(result) = match_response(line.trim(), target_id) {
            return result;
        }
    }
}

/// 한 줄을 파싱해 target_id와 매칭되는 응답이면 Some(Ok/Err), 아니면 None(skip).
fn match_response(line: &str, target_id: u64) -> Option<Result<Value, String>> {
    if line.is_empty() {
        return None;
    }
    let v: Value = serde_json::from_str(line).ok()?;
    let id = v.get("id")?.as_u64()?;
    if id != target_id {
        return None;
    }
    if let Some(err) = v.get("error") {
        return Some(Err(format!("MCP 에러: {}", err)));
    }
    Some(Ok(v.get("result").cloned().unwrap_or(Value::Null)))
}

// ─── 서버 수명 관리 ───────────────────────────────────────────────────────────

fn spawn_server(spec: &McpServerSpec) -> Result<McpProcess, String> {
    let mut cmd = Command::new(&spec.command);
    cmd.args(&spec.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for (k, v) in &spec.env {
        cmd.env(k, v);
    }
    // Windows: 자식 프로세스가 별도 콘솔 창 띄우지 않도록
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
    let params = json!({
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": { "tools": {} },
        "clientInfo": { "name": "LUM Terminal", "version": env!("CARGO_PKG_VERSION") },
    });
    let _ = rpc_request(process, "initialize", params, HANDSHAKE_TIMEOUT_MS)?;
    rpc_notify(process, "notifications/initialized", json!({}))?;
    process.initialized = true;
    Ok(())
}

/// 서버 핸들을 얻는다. 없으면 spawn + 핸드셰이크, 있으면 기존 Arc<Mutex<...>> 반환.
/// outer HashMap 락은 insert 동안만 잡고, I/O는 caller가 inner Mutex 잡아 진행.
fn acquire_server(
    state: &McpState,
    spec: &McpServerSpec,
) -> Result<Arc<Mutex<McpProcess>>, String> {
    {
        let servers = state
            .servers
            .lock()
            .map_err(|_| "servers lock 오류".to_string())?;
        if let Some(arc) = servers.get(&spec.name) {
            return Ok(Arc::clone(arc));
        }
    }
    // 새로 spawn — outer 락 밖에서 비용 큰 작업 수행 후 락 재획득해 insert
    let mut proc = spawn_server(spec)?;
    ensure_initialized(&mut proc)?;
    let arc = Arc::new(Mutex::new(proc));
    let mut servers = state
        .servers
        .lock()
        .map_err(|_| "servers lock 오류".to_string())?;
    // 경쟁: 다른 스레드가 이미 넣었다면 그걸 반환, spawn한 건 drop → kill
    if let Some(existing) = servers.get(&spec.name) {
        return Ok(Arc::clone(existing));
    }
    servers.insert(spec.name.clone(), Arc::clone(&arc));
    Ok(arc)
}

fn stop_server_by_name(state: &McpState, name: &str) {
    let Ok(mut servers) = state.servers.lock() else {
        return;
    };
    if let Some(arc) = servers.remove(name) {
        drop(servers); // outer 락 빠르게 해제
        if let Ok(mut proc) = arc.lock() {
            let _ = proc.child.kill();
            let _ = proc.child.wait();
        }
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
    stop_server_by_name(&state, &name);
    let mut cfg = load_config();
    cfg.servers.retain(|s| s.name != name);
    save_config(&cfg)
}

#[tauri::command]
pub fn mcp_stop_server(name: String, state: tauri::State<'_, McpState>) -> Result<(), String> {
    stop_server_by_name(&state, &name);
    Ok(())
}

// ─── Tauri 커맨드: RPC ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn mcp_list_tools(
    server_name: String,
    state: tauri::State<'_, McpState>,
) -> Result<Value, String> {
    let spec = find_server_spec(&server_name)?;
    let arc = acquire_server(&state, &spec)?;
    let mut proc = arc.lock().map_err(|_| "process lock 오류".to_string())?;
    rpc_request(&mut proc, "tools/list", json!({}), CALL_TIMEOUT_MS)
}

#[tauri::command]
pub async fn mcp_call_tool(
    server_name: String,
    tool_name: String,
    arguments: Value,
    state: tauri::State<'_, McpState>,
) -> Result<Value, String> {
    let spec = find_server_spec(&server_name)?;
    let arc = acquire_server(&state, &spec)?;
    let mut proc = arc.lock().map_err(|_| "process lock 오류".to_string())?;
    let params = json!({ "name": tool_name, "arguments": arguments });
    rpc_request(&mut proc, "tools/call", params, CALL_TIMEOUT_MS)
}

/// 공식 MCP 서버들을 기본 비활성으로 등록
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

#[tauri::command]
pub fn list_internal_tools() -> Vec<serde_json::Value> {
    vec![] // 레거시 스텁 — 실제 툴은 MCP 서버 tools/list로 조회
}

/// AI에게 주입할 시스템 프롬프트 — 활성화된 서버의 툴 목록 + 호출 포맷 지시.
/// 서버 시작/초기화는 안 함 (빠른 호출). 캐시된 tools만 사용.
/// 활성 서버가 없으면 빈 문자열 반환 — 프롬프트 오염 방지.
#[tauri::command]
pub async fn mcp_system_prompt(state: tauri::State<'_, McpState>) -> Result<String, String> {
    let cfg = load_config();
    let enabled: Vec<_> = cfg.servers.into_iter().filter(|s| s.enabled).collect();
    if enabled.is_empty() {
        return Ok(String::new());
    }

    // 이미 실행 중인 서버의 툴 목록만 수집 (blocking tools/list는 prompt 빌드 시 피함)
    let mut lines = vec![
        "다음 도구들을 호출할 수 있습니다. 필요할 때만 사용하고, 아니면 일반 답변만 하세요."
            .to_string(),
        "호출 형식 (여러 번 사용 가능, 독립된 줄에):".to_string(),
        "<tool_use server=\"<서버명>\" name=\"<툴명>\" args='{\"json\":\"value\"}' />".to_string(),
        "".to_string(),
        "사용 가능한 도구:".to_string(),
    ];

    let servers = state
        .servers
        .lock()
        .map_err(|_| "servers lock 오류".to_string())?;

    let mut any_tool = false;
    for spec in &enabled {
        let Some(arc) = servers.get(&spec.name) else {
            continue; // 서버가 아직 시작 안 됨 — list_tools로 한 번 호출된 적 없음
        };
        let Ok(proc) = arc.lock() else { continue };
        if !proc.initialized {
            continue;
        }
        // 이미 initialized된 서버만 포함 (런타임에 수집된 툴 목록은 따로 저장 안 하므로
        // 여기선 서버 이름과 description만 노출. AI가 툴 이름 모르면 list_tools 한 번 UI에서 호출 필요)
        let desc = spec.description.as_deref().unwrap_or("");
        lines.push(format!("- 서버 `{}`: {}", spec.name, desc));
        any_tool = true;
    }

    if !any_tool {
        return Ok(String::new());
    }

    lines.push("".into());
    lines.push(
        "호출 예: <tool_use server=\"playwright\" name=\"screenshot\" args='{\"url\":\"http://localhost:3000\"}' />"
            .into(),
    );
    Ok(lines.join("\n"))
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
        assert!(save_mcp_server(McpServerSpec::default()).is_err());
    }

    #[test]
    fn match_response_target_id_ok() {
        let line = r#"{"jsonrpc":"2.0","id":7,"result":{"x":1}}"#;
        let r = match_response(line, 7).unwrap().unwrap();
        assert_eq!(r["x"], 1);
    }

    #[test]
    fn match_response_wrong_id_returns_none() {
        let line = r#"{"jsonrpc":"2.0","id":99,"result":{}}"#;
        assert!(match_response(line, 7).is_none());
    }

    #[test]
    fn match_response_notification_returns_none() {
        // id 없는 notification
        let line = r#"{"jsonrpc":"2.0","method":"x/y","params":{}}"#;
        assert!(match_response(line, 7).is_none());
    }

    #[test]
    fn match_response_error_propagated() {
        let line =
            r#"{"jsonrpc":"2.0","id":7,"error":{"code":-32601,"message":"method not found"}}"#;
        assert!(match_response(line, 7).unwrap().is_err());
    }

    #[test]
    fn match_response_empty_line_returns_none() {
        assert!(match_response("", 7).is_none());
        assert!(match_response("not json", 7).is_none());
    }
}
