//! LUM MCP server (Phase 82a 골격)
//!
//! 외부 LLM agent(CrewAI / Claude Desktop / 기타 MCP client)가 LUM의 자체 도구를
//! stdio MCP 프로토콜로 호출할 수 있게 노출. LUM 본 binary와 분리되어 독립 실행.
//!
//! 프로토콜:
//! - stdin: 한 줄당 JSON-RPC 2.0 request
//! - stdout: 한 줄당 JSON-RPC 2.0 response (notifications는 응답 없음)
//!
//! 지원 메서드:
//! - initialize → 서버 정보 + capabilities 반환
//! - tools/list → 사용 가능한 도구 정의 반환
//! - tools/call → 도구 실행 + content array 반환
//! - notifications/initialized → 응답 없음 (handshake 완료 신호)
//!
//! 첫 단계(82a)에선 read_file / list_directory 두 개만. 도구 확장은 82b.

use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use tauri_app_lib::commands::{edit_apply, repo_map, test_runner};

const PROTOCOL_VERSION: &str = "2024-11-05";
const SERVER_NAME: &str = "lum-mcp-server";
const SERVER_VERSION: &str = "0.1.0";

/// JSON-RPC 표준 에러 코드.
const PARSE_ERROR: i32 = -32700;
const METHOD_NOT_FOUND: i32 = -32601;
const INVALID_PARAMS: i32 = -32602;

/// async 도구 호출용 shared tokio runtime.
/// 매 요청마다 Runtime::new() 하면 thread pool 재생성 비용 — 한 번만 만들고 재사용.
fn shared_runtime() -> &'static tokio::runtime::Runtime {
    use std::sync::OnceLock;
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("tokio runtime")
    })
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break, // EOF
        };
        if line.trim().is_empty() {
            continue;
        }

        let req: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                write_response(
                    &mut stdout,
                    &error_response(Value::Null, PARSE_ERROR, &format!("Parse error: {e}")),
                );
                continue;
            }
        };

        if let Some(resp) = handle_request(&req) {
            write_response(&mut stdout, &resp);
        }
    }
}

fn write_response(stdout: &mut impl Write, resp: &Value) {
    if writeln!(stdout, "{}", resp).is_ok() {
        let _ = stdout.flush();
    }
}

/// notifications/* 메서드는 None 반환 (응답 없음). 그 외엔 항상 Some.
fn handle_request(req: &Value) -> Option<Value> {
    let id = req.get("id").cloned().unwrap_or(Value::Null);
    let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or(Value::Null);

    if method.starts_with("notifications/") {
        return None;
    }

    let result = match method {
        "initialize" => initialize_response(),
        "tools/list" => json!({ "tools": tool_definitions() }),
        "tools/call" => match dispatch_tool_call(&params) {
            Ok(content) => json!({ "content": content, "isError": false }),
            Err(msg) => json!({
                "content": [{ "type": "text", "text": msg }],
                "isError": true
            }),
        },
        _ => return Some(error_response(id, METHOD_NOT_FOUND, "Method not found")),
    };

    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

fn initialize_response() -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": SERVER_NAME, "version": SERVER_VERSION }
    })
}

fn error_response(id: Value, code: i32, msg: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": msg }
    })
}

// ── 도구 정의 ─────────────────────────────────────────────────────────────

fn tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "read_file",
            "description": "Read a UTF-8 file and return its full content.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "File path." }
                },
                "required": ["path"]
            }
        }),
        json!({
            "name": "read_file_lines",
            "description": "Read a slice of a UTF-8 file by line range (1-indexed, inclusive). Useful for partial reads of large files.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "start_line": { "type": "integer", "minimum": 1, "default": 1 },
                    "end_line": { "type": "integer", "minimum": 1, "description": "Omit to read until EOF." }
                },
                "required": ["path"]
            }
        }),
        json!({
            "name": "list_directory",
            "description": "List entries at a path (one per line, prefixed FILE/DIR).",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }
        }),
        json!({
            "name": "git_diff",
            "description": "Run `git diff` (unstaged) or `git diff --cached` (staged) at a working directory.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "cwd": { "type": "string", "description": "Repo root." },
                    "staged": { "type": "boolean", "default": false }
                },
                "required": ["cwd"]
            }
        }),
        json!({
            "name": "apply_edit_block",
            "description": "Apply a SEARCH/REPLACE block to a file (LUM Phase 70 edit engine). Exact match preferred, fuzzy whitespace fallback.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "cwd": { "type": "string" },
                    "file": { "type": "string", "description": "File path relative to cwd (path traversal blocked)." },
                    "search": { "type": "string", "description": "Empty string to create a new file." },
                    "replace": { "type": "string" }
                },
                "required": ["cwd", "file", "search", "replace"]
            }
        }),
        json!({
            "name": "get_repo_map",
            "description": "Generate a tree-sitter + PageRank repo map (LUM Phase 70). Returns a token-budget-bounded summary of the most important files and symbols.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "cwd": { "type": "string" },
                    "token_budget": { "type": "integer", "minimum": 256, "default": 4096 }
                },
                "required": ["cwd"]
            }
        }),
        json!({
            "name": "run_tests",
            "description": "Auto-detect and run the project's test suite (LUM Phase 73). Captures stdout/stderr tail + pass/fail.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "cwd": { "type": "string" },
                    "command": { "type": "string", "description": "Override auto-detected command. Optional." },
                    "timeout_secs": { "type": "integer", "minimum": 1, "maximum": 900, "default": 120 }
                },
                "required": ["cwd"]
            }
        }),
    ]
}

fn dispatch_tool_call(params: &Value) -> Result<Vec<Value>, String> {
    let name = params
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing tool name".to_string())?;
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    match name {
        "read_file" => tool_read_file(&args),
        "read_file_lines" => tool_read_file_lines(&args),
        "list_directory" => tool_list_directory(&args),
        "git_diff" => tool_git_diff(&args),
        "apply_edit_block" => tool_apply_edit_block(&args),
        "get_repo_map" => tool_get_repo_map(&args),
        "run_tests" => tool_run_tests(&args),
        other => Err(format!("Unknown tool: {other}")),
    }
}

// ── 도구 구현 ─────────────────────────────────────────────────────────────

fn require_string_arg(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing or invalid '{key}' argument"))
}

fn tool_read_file(args: &Value) -> Result<Vec<Value>, String> {
    let path = require_string_arg(args, "path")?;
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("read_file failed for '{path}': {e}"))?;
    Ok(vec![json!({ "type": "text", "text": content })])
}

fn tool_list_directory(args: &Value) -> Result<Vec<Value>, String> {
    let path = require_string_arg(args, "path")?;
    let entries =
        std::fs::read_dir(&path).map_err(|e| format!("list_directory failed for '{path}': {e}"))?;
    let mut lines = Vec::new();
    for entry in entries.flatten() {
        let kind = entry
            .file_type()
            .map(|t| if t.is_dir() { "DIR " } else { "FILE" })
            .unwrap_or("?   ");
        let name = entry.file_name().to_string_lossy().to_string();
        lines.push(format!("{kind} {name}"));
    }
    lines.sort();
    Ok(vec![json!({ "type": "text", "text": lines.join("\n") })])
}

fn tool_read_file_lines(args: &Value) -> Result<Vec<Value>, String> {
    let path = require_string_arg(args, "path")?;
    let start = args
        .get("start_line")
        .and_then(|v| v.as_u64())
        .unwrap_or(1)
        .max(1) as usize;
    let end = args
        .get("end_line")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize);
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("read_file_lines failed for '{path}': {e}"))?;
    let lines: Vec<&str> = content.lines().collect();
    let lo = start.saturating_sub(1).min(lines.len());
    let hi = end.map(|e| e.min(lines.len())).unwrap_or(lines.len());
    if lo >= hi {
        return Ok(vec![json!({ "type": "text", "text": "" })]);
    }
    Ok(vec![
        json!({ "type": "text", "text": lines[lo..hi].join("\n") }),
    ])
}

fn tool_git_diff(args: &Value) -> Result<Vec<Value>, String> {
    let cwd = require_string_arg(args, "cwd")?;
    let staged = args
        .get("staged")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("diff");
    if staged {
        cmd.arg("--cached");
    }
    let output = cmd
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git_diff spawn failed: {e}"))?;
    if !output.status.success() && output.stdout.is_empty() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git_diff failed: {err}"));
    }
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(vec![
        json!({ "type": "text", "text": if text.is_empty() { "(no diff)".to_string() } else { text } }),
    ])
}

fn tool_apply_edit_block(args: &Value) -> Result<Vec<Value>, String> {
    let cwd = require_string_arg(args, "cwd")?;
    let file = require_string_arg(args, "file")?;
    let search = require_string_arg(args, "search").unwrap_or_default();
    let replace = require_string_arg(args, "replace").unwrap_or_default();
    let result = shared_runtime()
        .block_on(edit_apply::apply_edit_block(cwd, file, search, replace))
        .map_err(|e| format!("apply_edit_block failed: {e:?}"))?;
    let summary = format!(
        "applied={} fuzzy={} file={}{}",
        result.applied,
        result.fuzzy,
        result.file,
        result
            .reason
            .map(|r| format!(" reason={r}"))
            .unwrap_or_default()
    );
    Ok(vec![json!({ "type": "text", "text": summary })])
}

fn tool_get_repo_map(args: &Value) -> Result<Vec<Value>, String> {
    let cwd = require_string_arg(args, "cwd")?;
    let token_budget = args
        .get("token_budget")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize);
    let map = shared_runtime()
        .block_on(repo_map::get_repo_map(cwd, token_budget, None, None))
        .map_err(|e| format!("get_repo_map failed: {e:?}"))?;
    Ok(vec![json!({ "type": "text", "text": map })])
}

fn tool_run_tests(args: &Value) -> Result<Vec<Value>, String> {
    let cwd = require_string_arg(args, "cwd")?;
    let command = args
        .get("command")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string());
    let timeout_secs = args.get("timeout_secs").and_then(|v| v.as_u64());
    let result = shared_runtime()
        .block_on(test_runner::run_tests(cwd, command, timeout_secs))
        .map_err(|e| format!("run_tests failed: {e:?}"))?;
    // TestResult를 그대로 JSON 직렬화 — 호출자가 success/duration_ms/stdout_tail/stderr_tail 구분 사용
    let payload = serde_json::to_value(&result)
        .map_err(|e| format!("run_tests result serialize failed: {e}"))?;
    Ok(vec![json!({ "type": "text", "text": payload.to_string() })])
}

// ── 단위 테스트 ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn req(method: &str, params: Value) -> Value {
        json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
    }

    #[test]
    fn initialize_returns_protocol_version() {
        let resp = handle_request(&req("initialize", json!({}))).unwrap();
        assert_eq!(resp["result"]["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(resp["result"]["serverInfo"]["name"], SERVER_NAME);
    }

    #[test]
    fn tools_list_returns_all_phase82b_tools() {
        let resp = handle_request(&req("tools/list", json!({}))).unwrap();
        let tools = resp["result"]["tools"].as_array().unwrap();
        let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
        // Phase 82a (2개) + 82b (5개) = 7개 — 새 도구 추가 시 이 테스트 갱신
        for expected in [
            "read_file",
            "read_file_lines",
            "list_directory",
            "git_diff",
            "apply_edit_block",
            "get_repo_map",
            "run_tests",
        ] {
            assert!(names.contains(&expected), "tools/list missing: {expected}");
        }
        assert_eq!(tools.len(), 7);
    }

    #[test]
    fn unknown_method_returns_error() {
        let resp = handle_request(&req("nonexistent_method", json!({}))).unwrap();
        assert_eq!(resp["error"]["code"], METHOD_NOT_FOUND);
    }

    #[test]
    fn notifications_have_no_response() {
        let resp = handle_request(&req("notifications/initialized", json!({})));
        assert!(resp.is_none());
    }

    #[test]
    fn read_file_returns_content() {
        let dir = std::env::temp_dir().join(format!("lum_mcp_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let f = dir.join("hello.txt");
        std::fs::write(&f, "hello mcp").unwrap();
        let result = tool_read_file(&json!({ "path": f.to_str().unwrap() })).unwrap();
        assert_eq!(result[0]["text"], "hello mcp");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_file_missing_path_arg_errors() {
        let err = tool_read_file(&json!({})).unwrap_err();
        assert!(err.contains("Missing"));
    }

    #[test]
    fn read_file_nonexistent_path_errors() {
        let err = tool_read_file(&json!({ "path": "Z:/__nope__/__nope__.txt" })).unwrap_err();
        assert!(err.contains("read_file failed"));
    }

    #[test]
    fn list_directory_lists_entries() {
        let dir = std::env::temp_dir().join(format!("lum_mcp_ls_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        std::fs::write(dir.join("a.txt"), "").unwrap();
        std::fs::create_dir_all(dir.join("subdir")).unwrap();
        let result = tool_list_directory(&json!({ "path": dir.to_str().unwrap() })).unwrap();
        let text = result[0]["text"].as_str().unwrap();
        assert!(text.contains("FILE a.txt"));
        assert!(text.contains("DIR  subdir"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tools_call_dispatches_to_read_file() {
        let dir = std::env::temp_dir().join(format!("lum_mcp_dispatch_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let f = dir.join("d.txt");
        std::fs::write(&f, "dispatched").unwrap();
        let resp = handle_request(&req(
            "tools/call",
            json!({ "name": "read_file", "arguments": { "path": f.to_str().unwrap() } }),
        ))
        .unwrap();
        assert_eq!(resp["result"]["isError"], false);
        assert_eq!(resp["result"]["content"][0]["text"], "dispatched");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tools_call_unknown_tool_returns_is_error_true() {
        let resp = handle_request(&req(
            "tools/call",
            json!({ "name": "nonexistent_tool", "arguments": {} }),
        ))
        .unwrap();
        assert_eq!(resp["result"]["isError"], true);
    }

    #[test]
    fn parse_error_for_invalid_json_returns_id_null() {
        // 시뮬레이션 — parse error 직접 호출
        let resp = error_response(Value::Null, PARSE_ERROR, "Parse error: ...");
        assert!(resp["id"].is_null());
        assert_eq!(resp["error"]["code"], PARSE_ERROR);
    }

    // INVALID_PARAMS 코드는 추후 schema validation에서 사용 — 현재는 미사용 상수.
    // 다음 phase에서 도구별 schema 검증 추가 시 활용.
    #[test]
    fn invalid_params_constant_defined() {
        assert_eq!(INVALID_PARAMS, -32602);
    }

    #[test]
    fn read_file_lines_full_range() {
        let dir = std::env::temp_dir().join(format!("lum_mcp_lines_full_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let f = dir.join("a.txt");
        std::fs::write(&f, "L1\nL2\nL3").unwrap();
        let r = tool_read_file_lines(&json!({ "path": f.to_str().unwrap() })).unwrap();
        assert_eq!(r[0]["text"], "L1\nL2\nL3");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_file_lines_slice_2_to_3() {
        let dir = std::env::temp_dir().join(format!("lum_mcp_lines_slice_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let f = dir.join("b.txt");
        std::fs::write(&f, "L1\nL2\nL3\nL4").unwrap();
        let r = tool_read_file_lines(
            &json!({ "path": f.to_str().unwrap(), "start_line": 2, "end_line": 3 }),
        )
        .unwrap();
        assert_eq!(r[0]["text"], "L2\nL3");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_file_lines_clamp_out_of_range() {
        let dir = std::env::temp_dir().join(format!("lum_mcp_lines_clamp_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let f = dir.join("c.txt");
        std::fs::write(&f, "L1\nL2").unwrap();
        // start > 파일 길이 → 빈 결과
        let r = tool_read_file_lines(&json!({ "path": f.to_str().unwrap(), "start_line": 99 }))
            .unwrap();
        assert_eq!(r[0]["text"], "");
        let _ = std::fs::remove_dir_all(&dir);
    }

    // git_diff / apply_edit_block / get_repo_map / run_tests는 외부 IO·subprocess·git repo 필요해서
    // 단위 테스트 어려움 — dispatch 라우팅이 동작하는지(존재하는 도구로 인식되는지)만 확인.
    #[test]
    fn dispatch_recognizes_all_phase82b_tools() {
        for name in [
            "read_file_lines",
            "git_diff",
            "apply_edit_block",
            "get_repo_map",
            "run_tests",
        ] {
            // 인자 없이 호출 → dispatch는 도구를 찾고 도구 함수 안에서 인자 누락 에러를 냄.
            // "Unknown tool"이 아닌 게 핵심.
            let err = dispatch_tool_call(&json!({ "name": name, "arguments": {} })).unwrap_err();
            assert!(
                !err.contains("Unknown tool"),
                "dispatch failed to recognize '{name}': {err}"
            );
        }
    }
}
