// ReAct Agent — Think → Action → Observe 루프
//
// >> 프리픽스로 시작하는 태스크를 멀티턴 LLM + 도구 호출로 처리.
// shell / read_file / list_dir / get_repo_map / git_diff / run_tests 6종 도구 지원.
// 각 단계를 `react_event` Tauri 이벤트로 프론트엔드에 스트리밍.

use crate::commands::ai::call_xllm;
use crate::commands::repo_map::build_repo_map;
use crate::commands::test_runner::detect_test_command;
use crate::error::{LumError, Result};
use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::{command, AppHandle, Emitter, Manager};
use tokio::process::Command as TokioCommand;

const REACT_EVENT: &str = "react_event";
const MAX_STEPS: usize = 15;
// 도구 결과 문자 제한 — LLM 컨텍스트 보호
const TOOL_OUTPUT_LIMIT: usize = 4000;

// ─── 취소 플래그 ──────────────────────────────────────────────────────────────

static CANCEL_FLAG: OnceLock<Arc<AtomicBool>> = OnceLock::new();

fn cancel_flag() -> &'static Arc<AtomicBool> {
    CANCEL_FLAG.get_or_init(|| Arc::new(AtomicBool::new(false)))
}

// ─── 이벤트 타입 ──────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct ReactEvent {
    /// "thought" | "action" | "observation" | "answer" | "error" | "status"
    pub kind: String,
    pub content: String,
    /// ACTION 이벤트 시 도구 이름
    pub tool: Option<String>,
    /// 총 단계 수 (status 이벤트)
    pub step: Option<usize>,
}

fn emit_event(app: &AppHandle, kind: &str, content: impl Into<String>, tool: Option<&str>, step: Option<usize>) {
    let _ = app.emit(REACT_EVENT, ReactEvent {
        kind: kind.to_string(),
        content: content.into(),
        tool: tool.map(|t| t.to_string()),
        step,
    });
}

// ─── 시스템 프롬프트 ───────────────────────────────────────────────────────────

const BASE_PROMPT: &str = r#"당신은 터미널 에이전트입니다. 주어진 목표를 달성하기 위해 도구를 사용합니다.

내장 도구:
- shell({"cmd": "명령어"}) — Windows=cmd /C, 그 외=sh -c (stdout+stderr 반환)
- read_file({"path": "파일경로"}) — 파일 내용 읽기
- list_dir({"path": "경로"}) — 디렉토리 목록
- get_repo_map({"cwd": "경로"}) — 코드베이스 구조 요약
- git_diff({"cwd": "경로"}) — git diff 조회
- run_tests({"cwd": "경로"}) — 테스트 자동 감지 후 실행"#;

const PROMPT_TAIL: &str = r#"응답 형식 (반드시 준수):
THOUGHT: <현재 상황 분석 및 다음 행동 이유>
ACTION: 도구명({"param": "값"})

최종 답변 시:
THOUGHT: <결론 도출 이유>
ANSWER: <사용자에게 전달할 최종 답변>

규칙:
- ACTION과 ANSWER 중 하나만 출력 (둘 다 출력 금지)
- THOUGHT는 항상 ACTION/ANSWER 앞에 위치
- 이전 OBSERVATION으로 충분한 정보를 얻었으면 즉시 ANSWER 출력
- 동일 도구를 같은 인수로 2회 이상 호출 금지
- 불필요한 도구 호출 최소화
- 한국어로 응답"#;

/// Phase 121: 활성 MCP 서버/도구 목록을 동적으로 시스템 프롬프트에 주입.
/// mcp_tools가 비었으면 MCP 섹션 자체를 생략 — 토큰 낭비 방지.
fn build_system_prompt(mcp_tools: &[McpToolEntry]) -> String {
    let mut s = String::from(BASE_PROMPT);
    if !mcp_tools.is_empty() {
        s.push_str("\n\nMCP 도구 (외부 서버):\n");
        s.push_str("- mcp({\"server\": \"이름\", \"tool\": \"도구\", \"arguments\": {...}}) — MCP 서버의 도구 호출\n");
        s.push_str("\n사용 가능한 MCP 도구:\n");
        for t in mcp_tools {
            let desc = if t.description.is_empty() {
                String::new()
            } else {
                format!(" — {}", t.description)
            };
            s.push_str(&format!("- {}/{}{}\n", t.server, t.tool, desc));
        }
    }
    s.push_str("\n\n");
    s.push_str(PROMPT_TAIL);
    s
}

#[derive(Clone)]
struct McpToolEntry {
    server: String,
    tool: String,
    description: String,
}

/// 활성 MCP 서버 각각에 tools/list를 호출해 평탄한 (server, tool, desc) 리스트로 모음.
/// 실패한 서버는 조용히 skip — 한 서버 다운으로 에이전트 시작이 막히면 안 됨.
async fn enumerate_mcp_tools(state: &tauri::State<'_, crate::mcp::McpState>) -> Vec<McpToolEntry> {
    let servers = crate::mcp::list_enabled_servers();
    let mut out = Vec::new();
    for spec in servers {
        let result = crate::mcp::mcp_list_tools(spec.name.clone(), state.clone()).await;
        let Ok(value) = result else { continue };
        let Some(tools) = value.get("tools").and_then(|t| t.as_array()) else { continue };
        for t in tools {
            let Some(name) = t.get("name").and_then(|n| n.as_str()) else { continue };
            // description은 길 수 있으니 80자로 trim — 시스템 프롬프트 토큰 보호.
            let description = t.get("description").and_then(|d| d.as_str()).unwrap_or("");
            let trimmed = if description.chars().count() > 80 {
                let cut: String = description.chars().take(80).collect();
                format!("{cut}…")
            } else {
                description.to_string()
            };
            out.push(McpToolEntry {
                server: spec.name.clone(),
                tool: name.to_string(),
                description: trimmed,
            });
        }
    }
    out
}

// ─── 도구 파싱 ────────────────────────────────────────────────────────────────

struct ParsedAction {
    tool: String,
    args: serde_json::Value,
}

/// LLM 출력에서 ACTION: tool({...}) 형식 파싱
fn parse_action(text: &str) -> Option<ParsedAction> {
    let line = text.lines().find(|l| l.trim_start().starts_with("ACTION:"))?;
    let rest = line.trim_start().trim_start_matches("ACTION:").trim();

    // tool_name({...}) 형식
    let paren = rest.find('(')?;
    let tool = rest[..paren].trim().to_string();
    let after_paren = rest[paren + 1..].trim();
    // 마지막 ')' 제거
    let json_end = after_paren.rfind(')')?;
    let json_str = after_paren[..json_end].trim();
    let args = serde_json::from_str(json_str).ok()?;
    Some(ParsedAction { tool, args })
}

/// LLM 출력에서 THOUGHT 추출
fn parse_thought(text: &str) -> String {
    text.lines()
        .find(|l| l.trim_start().starts_with("THOUGHT:"))
        .map(|l| l.trim_start().trim_start_matches("THOUGHT:").trim().to_string())
        .unwrap_or_default()
}

/// LLM 출력에서 ANSWER 추출
fn parse_answer(text: &str) -> Option<String> {
    // ANSWER: 이후 모든 내용
    let idx = text.find("ANSWER:")?;
    Some(text[idx + 7..].trim().to_string())
}

// ─── 도구 실행 ────────────────────────────────────────────────────────────────

async fn run_tool(
    app: &AppHandle,
    tool: &str,
    args: &serde_json::Value,
    cwd: &str,
) -> String {
    match tool {
        "shell" => {
            let cmd = args["cmd"].as_str().unwrap_or("").to_string();
            if cmd.is_empty() {
                return "오류: cmd 파라미터 누락".to_string();
            }
            run_shell(&cmd, cwd).await
        }
        "read_file" => {
            let path = args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() {
                return "오류: path 파라미터 누락".to_string();
            }
            read_file_tool(&path, cwd)
        }
        "list_dir" => {
            let path = args["path"].as_str().unwrap_or(cwd).to_string();
            list_dir_tool(&path, cwd)
        }
        "get_repo_map" => {
            let map_cwd = args["cwd"].as_str().unwrap_or(cwd).to_string();
            match build_repo_map(&map_cwd, 2048) {
                Ok(map) => truncate(&map),
                Err(e) => format!("오류: {e}"),
            }
        }
        "git_diff" => {
            let diff_cwd = args["cwd"].as_str().unwrap_or(cwd).to_string();
            run_git_diff(&diff_cwd).await
        }
        "run_tests" => {
            let test_cwd = args["cwd"].as_str().unwrap_or(cwd).to_string();
            run_tests_tool(&test_cwd).await
        }
        "mcp" => run_mcp_tool(app, args).await,
        _ => format!("알 수 없는 도구: {tool}"),
    }
}

/// Phase 121: MCP 서버 도구 호출. mcp({"server", "tool", "arguments"}).
async fn run_mcp_tool(app: &AppHandle, args: &serde_json::Value) -> String {
    let server = args["server"].as_str().unwrap_or("").trim().to_string();
    let tool = args["tool"].as_str().unwrap_or("").trim().to_string();
    if server.is_empty() || tool.is_empty() {
        return "오류: mcp는 server + tool 파라미터 모두 필요".to_string();
    }
    let arguments = args.get("arguments").cloned().unwrap_or(serde_json::json!({}));
    let state: tauri::State<'_, crate::mcp::McpState> = app.state();
    match crate::mcp::mcp_call_tool(server, tool, arguments, state).await {
        Ok(v) => {
            let pretty = serde_json::to_string_pretty(&v).unwrap_or_else(|_| v.to_string());
            truncate(&pretty)
        }
        Err(e) => format!("MCP 호출 실패: {e}"),
    }
}

async fn run_shell(cmd: &str, cwd: &str) -> String {
    let result = if cfg!(windows) {
        TokioCommand::new("cmd")
            .args(["/C", cmd])
            .current_dir(cwd)
            .output()
            .await
    } else {
        TokioCommand::new("sh")
            .args(["-c", cmd])
            .current_dir(cwd)
            .output()
            .await
    };
    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{stdout}{stderr}");
            truncate(&combined)
        }
        Err(e) => format!("셸 실행 실패: {e}"),
    }
}

fn resolve_path(path: &str, cwd: &str) -> std::path::PathBuf {
    let p = Path::new(path);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        Path::new(cwd).join(p)
    }
}

fn read_file_tool(path: &str, cwd: &str) -> String {
    let resolved = resolve_path(path, cwd);
    match std::fs::read_to_string(&resolved) {
        Ok(content) => truncate(&content),
        Err(e) => format!("파일 읽기 실패: {e}"),
    }
}

fn list_dir_tool(path: &str, cwd: &str) -> String {
    let resolved = resolve_path(path, cwd);
    match std::fs::read_dir(&resolved) {
        Ok(entries) => {
            let mut lines: Vec<String> = entries
                .flatten()
                .map(|e| {
                    let name = e.file_name().to_string_lossy().into_owned();
                    let is_dir = e.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
                    if is_dir { format!("{name}/") } else { name }
                })
                .collect();
            lines.sort();
            lines.join("\n")
        }
        Err(e) => format!("디렉토리 읽기 실패: {e}"),
    }
}

async fn run_git_diff(cwd: &str) -> String {
    let result = TokioCommand::new("git")
        .args(["diff"])
        .current_dir(cwd)
        .output()
        .await;
    match result {
        Ok(output) => {
            let diff = String::from_utf8_lossy(&output.stdout).to_string();
            if diff.trim().is_empty() { "변경사항 없음".to_string() } else { truncate(&diff) }
        }
        Err(e) => format!("git diff 실패: {e}"),
    }
}

async fn run_tests_tool(cwd: &str) -> String {
    let path = Path::new(cwd);
    let Some(test_cmd) = detect_test_command(path) else {
        return "테스트 커맨드를 감지하지 못했습니다.".to_string();
    };
    let result = if cfg!(windows) {
        TokioCommand::new("cmd")
            .args(["/C", &test_cmd.command])
            .current_dir(cwd)
            .output()
            .await
    } else {
        TokioCommand::new("sh")
            .args(["-c", &test_cmd.command])
            .current_dir(cwd)
            .output()
            .await
    };
    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let code = output.status.code().unwrap_or(-1);
            truncate(&format!("[{}: {}] (exit {})\n{}{}", test_cmd.project_type, test_cmd.command, code, stdout, stderr))
        }
        Err(e) => format!("테스트 실행 실패: {e}"),
    }
}

fn truncate(s: &str) -> String {
    if s.len() <= TOOL_OUTPUT_LIMIT {
        s.to_string()
    } else {
        format!("{}…({}자 생략)", &s[..TOOL_OUTPUT_LIMIT], s.len() - TOOL_OUTPUT_LIMIT)
    }
}

// ─── 메인 ReAct 루프 ─────────────────────────────────────────────────────────

#[command]
pub async fn react_agent_run(
    app: AppHandle,
    goal: String,
    cwd: String,
) -> Result<()> {
    cancel_flag().store(false, Ordering::Relaxed);

    // CWD 폴백 — 빈 문자열이면 현재 프로세스 작업 디렉토리 사용
    let effective_cwd = if cwd.is_empty() {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "C:\\".to_string())
    } else {
        cwd.clone()
    };

    emit_event(&app, "status", format!("목표: {goal}"), None, Some(0));

    // Phase 121: 활성 MCP 서버의 도구를 동적으로 시스템 프롬프트에 주입.
    let mcp_state: tauri::State<'_, crate::mcp::McpState> = app.state();
    let mcp_tools = enumerate_mcp_tools(&mcp_state).await;
    if !mcp_tools.is_empty() {
        emit_event(
            &app,
            "status",
            format!("MCP 도구 {}개 로드", mcp_tools.len()),
            None,
            Some(0),
        );
    }
    let mut conversation = format!(
        "{}\n\n목표: {goal}\n\nCWD: {effective_cwd}",
        build_system_prompt(&mcp_tools)
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    // 루프 방지: 최근 액션 히스토리 (tool+args 조합)
    let mut recent_actions: Vec<String> = Vec::new();

    for step in 0..MAX_STEPS {
        if cancel_flag().load(Ordering::Relaxed) {
            emit_event(&app, "status", "취소됨", None, Some(step));
            return Ok(());
        }

        emit_event(&app, "status", format!("단계 {} / {MAX_STEPS}", step + 1), None, Some(step + 1));

        // 로컬 전용 — embedded GGUF 우선, 미로드면 xLLM HTTP (127.0.0.1:8080)
        let response = match call_xllm(&client, "", &conversation).await {
            Ok(r) => r,
            Err(e) => {
                emit_event(&app, "error", format!("LLM 오류: {e}"), None, None);
                return Err(e);
            }
        };

        // THOUGHT 추출 → emit
        let thought = parse_thought(&response);
        if !thought.is_empty() {
            emit_event(&app, "thought", &thought, None, Some(step + 1));
        }

        // ANSWER 확인 — 완료
        if let Some(answer) = parse_answer(&response) {
            emit_event(&app, "answer", &answer, None, Some(step + 1));
            return Ok(());
        }

        // ACTION 파싱 → 도구 실행
        let Some(action) = parse_action(&response) else {
            // 파싱 실패 — 응답 전체를 ANSWER로 취급
            emit_event(&app, "answer", response.trim(), None, Some(step + 1));
            return Ok(());
        };

        // 동일 액션 반복 감지 → ANSWER 강제 요청
        let action_key = format!("{}:{}", action.tool, action.args);
        let repeat_count = recent_actions.iter().filter(|a| *a == &action_key).count();
        if repeat_count >= 2 {
            let force_prompt = format!(
                "{conversation}\n\n{response}\n\n[시스템]: 동일한 도구를 같은 인수로 반복 호출하고 있습니다. 지금까지 수집된 정보를 바탕으로 즉시 ANSWER를 출력하세요."
            );
            if let Ok(final_resp) = call_xllm(&client, "", &force_prompt).await {
                let answer = parse_answer(&final_resp)
                    .unwrap_or_else(|| final_resp.trim().to_string());
                emit_event(&app, "answer", &answer, None, Some(step + 1));
            }
            return Ok(());
        }
        recent_actions.push(action_key);

        // ACTION 이벤트 emit
        let action_desc = format!("{}({})", action.tool, action.args);
        emit_event(&app, "action", &action_desc, Some(&action.tool), Some(step + 1));

        // 도구 실행
        let observation = run_tool(&app, &action.tool, &action.args, &effective_cwd).await;
        emit_event(&app, "observation", &observation, None, Some(step + 1));

        // 대화 히스토리 업데이트 (최근 6턴만 유지해 컨텍스트 폭발 방지)
        let turn = format!("\n\n{response}\n\nOBSERVATION: {observation}");
        conversation.push_str(&turn);

        // 시스템 프롬프트 + 목표 제외 이전 턴이 6개 초과 시 앞부분 제거
        let turns: Vec<&str> = conversation.split("\n\nTHOUGHT:").collect();
        if turns.len() > 7 {
            let kept = turns[turns.len() - 6..].join("\n\nTHOUGHT:");
            conversation = format!("{}\n\nTHOUGHT:{}", turns[0], kept);
        }
    }

    // 최대 단계 초과
    emit_event(&app, "answer", "최대 단계에 도달했습니다. 현재까지의 정보를 바탕으로 결론을 내립니다.", None, Some(MAX_STEPS));
    Ok(())
}

#[command]
pub fn react_agent_cancel() {
    cancel_flag().store(true, Ordering::Relaxed);
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_thought_기본() {
        let text = "THOUGHT: 파일 목록을 확인한다\nACTION: list_dir({\"path\": \".\"})";
        assert_eq!(parse_thought(text), "파일 목록을 확인한다");
    }

    #[test]
    fn parse_action_도구명과_인수_파싱() {
        let text = "THOUGHT: 셸 실행\nACTION: shell({\"cmd\": \"ls -la\"})";
        let action = parse_action(text).unwrap();
        assert_eq!(action.tool, "shell");
        assert_eq!(action.args["cmd"].as_str(), Some("ls -la"));
    }

    #[test]
    fn parse_answer_추출() {
        let text = "THOUGHT: 완료\nANSWER: 총 5개의 파일이 있습니다.";
        assert_eq!(parse_answer(text).as_deref(), Some("총 5개의 파일이 있습니다."));
    }

    #[test]
    fn parse_answer_없으면_none() {
        let text = "THOUGHT: 계속\nACTION: shell({\"cmd\": \"ls\"})";
        assert!(parse_answer(text).is_none());
    }

    #[test]
    fn parse_action_없으면_none() {
        let text = "THOUGHT: 완료\nANSWER: 결과입니다.";
        assert!(parse_action(text).is_none());
    }

    #[test]
    fn truncate_길이_초과시_자름() {
        let long = "a".repeat(TOOL_OUTPUT_LIMIT + 100);
        let result = truncate(&long);
        assert!(result.len() < long.len());
        assert!(result.contains("생략"));
    }

    #[test]
    fn truncate_짧으면_그대로() {
        let short = "hello";
        assert_eq!(truncate(short), short);
    }

    #[test]
    fn build_prompt_omits_mcp_section_when_empty() {
        let s = build_system_prompt(&[]);
        assert!(!s.contains("MCP 도구"));
        assert!(s.contains("내장 도구"));
        assert!(s.contains("ANSWER:"));
    }

    #[test]
    fn build_prompt_includes_mcp_tool_listing() {
        let tools = vec![
            McpToolEntry {
                server: "playwright".into(),
                tool: "screenshot".into(),
                description: "브라우저 스크린샷".into(),
            },
            McpToolEntry {
                server: "git".into(),
                tool: "log".into(),
                description: String::new(),
            },
        ];
        let s = build_system_prompt(&tools);
        assert!(s.contains("MCP 도구"));
        assert!(s.contains("playwright/screenshot"));
        assert!(s.contains("브라우저 스크린샷"));
        assert!(s.contains("git/log"));
        // mcp 도구 호출 형식 안내가 들어가야 함
        assert!(s.contains("\"server\""));
        assert!(s.contains("\"tool\""));
    }

    #[test]
    fn parse_action_handles_mcp_tool() {
        let text = r#"THOUGHT: 스크린샷 찍자
ACTION: mcp({"server": "playwright", "tool": "screenshot", "arguments": {"url": "https://example.com"}})"#;
        let action = parse_action(text).unwrap();
        assert_eq!(action.tool, "mcp");
        assert_eq!(action.args["server"].as_str(), Some("playwright"));
        assert_eq!(action.args["tool"].as_str(), Some("screenshot"));
        assert_eq!(
            action.args["arguments"]["url"].as_str(),
            Some("https://example.com")
        );
    }
}
