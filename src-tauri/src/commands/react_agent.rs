// ReAct Agent — Think → Action → Observe 루프
//
// >> 프리픽스로 시작하는 태스크를 멀티턴 LLM + 도구 호출로 처리.
// shell / read_file / list_dir / get_repo_map / git_diff / run_tests / query_healing / analyze_failure_reasons / query_codebase / query_graph / find_callers / find_callees / trace_dependents / precise_* / scip_status / 데스크톱 제어 / MCP 도구를 지원.
// 각 단계를 `react_event` Tauri 이벤트로 프론트엔드에 스트리밍.

use crate::commands::ai::call_ai_with_backend;
use crate::commands::repo_map::build_repo_map;
use crate::commands::test_runner::detect_test_command;
use crate::error::{LumError, Result};
use crate::platform;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::future::Future;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{command, AppHandle, Emitter, Manager};
use tokio::io::AsyncReadExt;
use tokio::process::Command as TokioCommand;

const REACT_EVENT: &str = "react_event";
// 너무 크면 토큰 폭주·보너스 학습 데이터 오염 → 25에서 멈춤.
const MAX_STEPS: usize = 25;
// 도구 결과 문자 제한 — LLM 컨텍스트 보호
const TOOL_OUTPUT_LIMIT: usize = 4000;
const REFLEXION_TIMEOUT_SECS: u64 = 8;

// cwd 외부 또는 이 디렉터리 안에 떨어지는 경로는 모두 거부.
// 사용자가 명시적 절대경로를 입력해도 거부 — LLM 환각으로 시스템 파일이 변경되는 사고 방지.
const FORBIDDEN_PREFIXES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".lum_squads",
    ".lum_lora_runs",
    ".lum_mistral_models",
];

// ─── Progress Ledger — stuck 감지 + 단계적 회복 ─────────────────────────────

struct ProgressLedger {
    /// action_key → 호출 횟수
    action_counts: HashMap<String, usize>,
    /// 관찰 결과에서 추출한 핵심 사실 (최대 8개)
    key_facts: Vec<String>,
    /// 이번 run 총 stuck 이벤트 수
    stuck_total: usize,
}

impl ProgressLedger {
    fn new() -> Self {
        Self {
            action_counts: HashMap::new(),
            key_facts: Vec::new(),
            stuck_total: 0,
        }
    }

    /// action_key를 기록하고 현재 호출 횟수를 반환.
    fn record(&mut self, action_key: &str) -> usize {
        let c = self
            .action_counts
            .entry(action_key.to_string())
            .or_insert(0);
        *c += 1;
        *c
    }

    /// 도구 실행 결과에서 첫 줄을 key_fact로 흡수 (최대 8개, 120자 cap).
    fn absorb_observation(&mut self, tool: &str, obs: &str) {
        if self.key_facts.len() >= 8 {
            return;
        }
        let first = obs.lines().next().unwrap_or("").trim();
        if first.len() < 5 {
            return;
        }
        let fact = format!("[{}] {}", tool, &first[..first.len().min(120)]);
        if !self.key_facts.contains(&fact) {
            self.key_facts.push(fact);
        }
    }

    fn facts_str(&self) -> String {
        if self.key_facts.is_empty() {
            "없음".to_string()
        } else {
            self.key_facts
                .iter()
                .map(|f| format!("  - {f}"))
                .collect::<Vec<_>>()
                .join("\n")
        }
    }

    /// L1 회복 메시지 — 첫 반복. 힌트 주입 후 계속.
    fn recovery_l1(&self, action_key: &str) -> String {
        format!(
            "⚠ `{action_key}`를 이미 실행했습니다. 다른 도구·경로·인수를 사용하세요.\n\
             현재까지 수집된 정보:\n{}",
            self.facts_str()
        )
    }

    /// L2 회복 메시지 — 반복 3회 이상. 즉시 ANSWER 강제.
    fn recovery_l2(&self) -> String {
        format!(
            "⚠ 반복 패턴이 {}회 감지됐습니다. 목표를 재검토하거나 지금 당장 ANSWER를 출력하세요.\n\
             지금까지 파악된 사실:\n{}",
            self.stuck_total,
            self.facts_str()
        )
    }
}

// ─── TaskLedger outer loop — 복잡한 목표 사전 계획 + stuck 재계획 ─────────────

/// 20단어+, 120자+, 복수태스크 표지 → 복잡한 목표로 판정.
pub fn is_complex_goal(goal: &str) -> bool {
    if goal.split_whitespace().count() >= 20 {
        return true;
    }
    if goal.chars().count() >= 120 {
        return true;
    }
    let lower = goal.to_lowercase();
    // 영어 복수 태스크 표지
    if lower.contains(", and ") || lower.contains(" and also ") || lower.contains("; ") {
        return true;
    }
    // 한국어 복수 태스크 표지
    goal.contains("그리고") || goal.contains("다음으로") || goal.contains("또한")
}

/// LLM 응답에서 번호/대시 목록을 추출 — 최대 7단계, 5자 미만 무시.
pub fn parse_task_plan(response: &str) -> Vec<String> {
    let mut steps = Vec::new();
    for line in response.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let text = if let Some(rest) = t.strip_prefix(|c: char| c.is_ascii_digit()) {
            rest.trim_start_matches(['.', ')', ' '])
        } else if let Some(rest) = t.strip_prefix("- ") {
            rest
        } else if let Some(rest) = t.strip_prefix("• ") {
            rest
        } else {
            continue;
        };
        let text = text.trim();
        if text.len() >= 5 && steps.len() < 7 {
            steps.push(text.to_string());
        }
    }
    steps
}

/// 단계 목록을 번호 목록 문자열로 포맷 — 두 곳(초기 계획 주입 + 재계획 주입)에서 공유.
fn format_plan(steps: &[String]) -> String {
    steps
        .iter()
        .enumerate()
        .map(|(i, s)| format!("{}. {s}", i + 1))
        .collect::<Vec<_>>()
        .join("\n")
}

/// 목표에 대한 단계별 계획을 LLM에서 생성.
async fn generate_task_plan(
    app: &AppHandle,
    client: &reqwest::Client,
    goal: &str,
    backend: Option<&str>,
    model: &str,
) -> std::result::Result<String, String> {
    call_ai_with_backend(
        Some(app),
        client,
        model,
        &format!(
            "다음 목표를 달성하기 위한 구체적인 단계별 계획을 번호 목록(최대 7단계)으로 작성하세요. \
             번호 목록만 출력하세요:\n\n목표: {goal}\n\n계획:\n1."
        ),
        backend,
    )
    .await
    .map_err(|e| e.to_string())
}

// ─── 취소 플래그 ──────────────────────────────────────────────────────────────

static CANCEL_FLAG: OnceLock<Arc<AtomicBool>> = OnceLock::new();

fn cancel_flag() -> &'static Arc<AtomicBool> {
    CANCEL_FLAG.get_or_init(|| Arc::new(AtomicBool::new(false)))
}

/// 장시간 future를 짧은 주기로 폴링하면서 전역 취소 플래그를 감시.
/// 취소되면 None을 반환해 상위 루프가 즉시 중단할 수 있게 한다.
async fn await_with_cancel<F, T>(future: F) -> Option<T>
where
    F: Future<Output = T>,
{
    use tokio::time::{timeout, Duration};
    tokio::pin!(future);
    loop {
        if cancel_flag().load(Ordering::Relaxed) {
            return None;
        }
        match timeout(Duration::from_millis(80), &mut future).await {
            Ok(v) => return Some(v),
            Err(_) => continue,
        }
    }
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

fn emit_event(
    app: &AppHandle,
    kind: &str,
    content: impl Into<String>,
    tool: Option<&str>,
    step: Option<usize>,
) {
    let _ = app.emit(
        REACT_EVENT,
        ReactEvent {
            kind: kind.to_string(),
            content: content.into(),
            tool: tool.map(|t| t.to_string()),
            step,
        },
    );
}

// ─── 시스템 프롬프트 ───────────────────────────────────────────────────────────

const BASE_PROMPT: &str = r#"당신은 터미널 코딩 에이전트입니다. 주어진 목표를 달성하기 위해 도구를 사용해 코드를 읽고, 분석하고, 수정합니다.

읽기/분석 도구:
- read_file({"path": "파일경로"}) — 파일 내용 읽기
- list_dir({"path": "경로"}) — 디렉토리 목록
- get_repo_map({"cwd": "경로"}) — 코드베이스 구조 요약
- git_diff({"cwd": "경로"}) — git diff 조회
- query_healing({"query": "질문", "limit": 5, "since_days": 30}) — 자동치유(healing) 기록만 시맨틱 검색
- analyze_failure_reasons({"since_days": 30, "limit": 5}) — reject 거부 사유 빈도 Top-N 요약
- query_codebase({"query": "질문", "limit": 5}) — 인덱싱된 코드베이스 시맨틱 검색 (top-K 청크). grep과 달리 의미 매칭 — "auth 관련 함수 찾아" 같은 자연어 질의에 사용. 인덱스 비어있으면 안내 메시지가 반환되며, 그 경우 사용자에게 RAG 색인을 먼저 권장.
- query_graph({"query": "질문", "limit": 8, "depth": 3, "symbols": 4}) — 코드베이스 질의 + 주변 호출 그래프 요약(동일 심볼 기준 호출자/피호출자/영향도), 모듈 간 연결 요약, 연결 모듈 컨텍스트(요약/import 힌트) 포함.
- find_callers({"symbol": "함수명"}) — 이 함수를 호출하는 caller 목록 (tree-sitter 기반, 동명이인 미구분)
- find_callees({"symbol": "함수명"}) — 이 함수가 호출하는 callee 목록
- trace_dependents({"symbol": "함수명", "depth": 3}) — 변경 영향도 BFS (기본 depth=3, 최대 5)
- precise_callers({"symbol": "함수명"}) — scip가 있을 때 동명이인 해소 + 정밀 caller 목록(미지원시 tree-sitter fallback)
- scip_status() — scip 백엔드 상태, index.scip 존재 여부, opt-in 토글 상태를 조회.
- precise_definition({"symbol": "식별자"}) — scip가 있을 때 정확한 정의 위치(미지원시 tree-sitter fallback)"#;

const EXECUTION_PROMPT: &str = r#"
실행 도구 (Act 모드에서만 사용):
- shell({"cmd": "명령어"}) — Windows=cmd /C, 그 외=sh -c (stdout+stderr 반환)
- run_tests({"cwd": "경로"}) — 테스트 자동 감지 후 실행"#;

const EXECUTION_DISABLED_PROMPT: &str = r#"
실행 도구:
- 현재 모드에서는 shell/run_tests 도구를 호출하지 마세요."#;

const WRITE_PROMPT: &str = r#"
쓰기 도구 (CWD 내부 + 안전 경로만 허용 — .git/node_modules/target/dist/.lum_* 거부):
- write_file({"path": "...", "content": "...", "overwrite": false}) — 신규 파일 생성. 기존 파일은 overwrite=true 명시 필요.
- apply_patch({"path": "...", "search": "...", "replace": "..."}) — 단일 SEARCH/REPLACE. search는 파일 내 정확히 1회 매칭되어야 함 (앞뒤 컨텍스트 충분히 포함).
- delete_file({"path": "..."}) — 파일 삭제."#;

const WRITE_DISABLED_PROMPT: &str = r#"
쓰기 도구:
- 현재 모드에서는 write_file/apply_patch/delete_file 도구를 호출하지 마세요."#;

const DESKTOP_PROMPT: &str = r#"
데스크톱 제어 도구 (설정에서 활성화된 경우에만 동작):
- screenshot({}) — 현재 화면 PNG 캡처(base64). UI 상태 확인용.
- mouse({"x": 100, "y": 200, "click": false}) — 절대좌표로 마우스 이동. click=true면 left 클릭까지 수행.
- click({"x": 100, "y": 200, "button": "left"}) — 화면 절대좌표 클릭 (button: left/right/middle, 생략 시 left)
- type({"text": "입력할 텍스트", "enter": false}) — 키보드 텍스트 입력 (enter=true면 입력 후 Enter까지 수행)
- scroll({"x": 100, "y": 200, "amount": -120}) — 화면 절대좌표 기준 마우스 휠 스크롤 (amount>0: 아래, <0: 위)
- key_combo({"modifier": "cmd", "key": "k"}) — 단축키 조합 입력 (modifier: cmd/command/meta/super/win/windows, ctrl/control, alt/option, shift, cmdorctrl(commandorcontrol/controlorcommand/ctrlorcmd/cmd/ctrl); key: 1글자 또는 enter/return, space, tab, esc/escape, backspace, delete/del, up/down/left/right(또는 arrowup/arrowdown/arrowleft/arrowright), home/end, pageup(pgup)/pagedown(pgdn), f1~f12)"#;

const DESKTOP_DISABLED_PROMPT: &str = r#"
데스크톱 제어 도구:
- 현재 비활성화 상태입니다. screenshot/mouse/click/type/key_combo/scroll 도구를 호출하지 마세요.
- 사용자가 설정에서 활성화하면 그때만 데스크톱 제어 도구를 사용하세요."#;

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

const CODING_WORKFLOW_PROMPT: &str = r#"
코딩 워크플로우:
- 코드 수정 전 read_file 또는 get_repo_map으로 현재 상태 확인
- apply_patch가 "0개 매칭" 또는 "N개 매칭" 오류면 search 문자열에 앞뒤 라인을 더 포함해 다시 시도
- 변경 후 run_tests 실행해 회귀 검증 — 실패 시 OBSERVATION 분석 → 추가 apply_patch로 자가 수정
- 신규 디렉터리 필요 시 shell로 mkdir 먼저, 그 다음 write_file"#;

const REVIEW_MODE_PROMPT: &str = r#"
리뷰 모드:
- 목표가 코드/프로젝트 리뷰이면 파일을 수정하지 말고 읽기 전용 분석만 수행한다.
- 우선 list_dir/get_repo_map/git_diff/read_file/query_graph를 사용해 구조, 변경점, 위험 지점을 확인한다.
- shell/run_tests/write_file/apply_patch/delete_file/mcp/데스크톱 제어 도구는 사용하지 않는다.
- 최종 답변은 심각도 순으로 버그·회귀 위험·누락 테스트를 먼저 제시하고, 파일/영역 근거를 붙인다."#;

fn is_review_goal(goal: &str) -> bool {
    let lower = goal.to_lowercase();
    if has_mutation_intent(goal, &lower) {
        return false;
    }
    let ko_hits = [
        "코드 리뷰",
        "프로젝트 리뷰",
        "리포 리뷰",
        "레포 리뷰",
        "문제점 리뷰",
        "버그 찾아",
        "버그 찾",
    ];
    let en_hits = [
        "code review",
        "project review",
        "review this project",
        "review this repo",
        "review the repo",
        "find bugs",
    ];
    ko_hits.iter().any(|needle| goal.contains(needle))
        || en_hits.iter().any(|needle| lower.contains(needle))
}

fn has_mutation_intent(goal: &str, lower: &str) -> bool {
    let ko_hits = [
        "고쳐", "고치", "수정", "해결", "적용", "반영", "구현", "추가", "변경",
    ];
    let en_hits = [
        " and fix",
        " then fix",
        " fix them",
        " fix it",
        " fix bug",
        " fix issue",
        " patch",
        " resolve",
        " repair",
        " modify",
        " update",
        " implement",
        " apply",
        " change",
        " add ",
    ];
    ko_hits.iter().any(|needle| goal.contains(needle))
        || en_hits.iter().any(|needle| lower.contains(needle))
}

fn should_expose_desktop_tools_in_prompt(
    mode: ReactMode,
    review_mode: bool,
    desktop_tools_enabled: bool,
) -> bool {
    mode == ReactMode::Act && !review_mode && desktop_tools_enabled
}

fn should_expose_execution_tools_in_prompt(mode: ReactMode, review_mode: bool) -> bool {
    mode == ReactMode::Act && !review_mode
}

fn should_expose_write_tools_in_prompt(mode: ReactMode, review_mode: bool) -> bool {
    mode == ReactMode::Act && !review_mode
}

fn should_expose_mcp_tools_in_prompt(mode: ReactMode, review_mode: bool) -> bool {
    mode == ReactMode::Act && !review_mode
}

/// Phase 121: 활성 MCP 서버/도구 목록을 동적으로 시스템 프롬프트에 주입.
/// Phase 127: 자연어 goal과 매칭된 Skill markdown도 함께 주입.
/// mcp_tools/skills 비었으면 해당 섹션 생략 — 토큰 낭비 방지.
fn build_system_prompt(
    mcp_tools: &[McpToolEntry],
    skills: &[crate::commands::skills::Skill],
    execution_tools_enabled: bool,
    write_tools_enabled: bool,
    desktop_tools_enabled: bool,
    mcp_tools_enabled: bool,
) -> String {
    let mut s = String::from(BASE_PROMPT);
    if execution_tools_enabled {
        s.push_str(EXECUTION_PROMPT);
    } else {
        s.push_str(EXECUTION_DISABLED_PROMPT);
    }
    if write_tools_enabled {
        s.push_str(WRITE_PROMPT);
    } else {
        s.push_str(WRITE_DISABLED_PROMPT);
    }
    if desktop_tools_enabled {
        s.push_str(DESKTOP_PROMPT);
    } else {
        s.push_str(DESKTOP_DISABLED_PROMPT);
    }
    if mcp_tools_enabled && !mcp_tools.is_empty() {
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
    if !skills.is_empty() {
        s.push_str("\n\n관련 Skill (사용자 저장 절차 — 따를 수 있으면 따르되 상황에 맞게 적응):\n");
        for sk in skills {
            s.push_str(&format!(
                "\n### {}\n{}\n{}\n",
                sk.name,
                sk.description,
                crate::commands::skills::skill_prompt_markdown(sk)
            ));
        }
    }
    s.push_str("\n\n");
    s.push_str(PROMPT_TAIL);
    if execution_tools_enabled && write_tools_enabled {
        s.push_str(CODING_WORKFLOW_PROMPT);
    }
    s
}

#[derive(Clone)]
struct McpToolEntry {
    server: String,
    tool: String,
    description: String,
}

/// 한 서버의 tools/list 결과를 평탄한 McpToolEntry 벡터로 변환.
/// 실패·timeout·잘못된 응답은 모두 빈 벡터 반환 — 호출자는 신경 쓸 필요 없음.
fn flatten_mcp_tools(server: &str, value: &serde_json::Value) -> Vec<McpToolEntry> {
    let Some(tools) = value.get("tools").and_then(|t| t.as_array()) else {
        return Vec::new();
    };
    tools
        .iter()
        .filter_map(|t| {
            let name = t.get("name").and_then(|n| n.as_str())?;
            let description = t.get("description").and_then(|d| d.as_str()).unwrap_or("");
            // description은 길 수 있으니 80자로 trim — 시스템 프롬프트 토큰 보호.
            let trimmed = if description.chars().count() > 80 {
                let cut: String = description.chars().take(80).collect();
                format!("{cut}…")
            } else {
                description.to_string()
            };
            Some(McpToolEntry {
                server: server.to_string(),
                tool: name.to_string(),
                description: trimmed,
            })
        })
        .collect()
}

/// 활성 MCP 서버 각각에 tools/list를 호출해 평탄한 (server, tool, desc) 리스트로 모음.
/// 서버별로 2초 timeout — 한 서버가 느리거나 hang해도 ReAct 시작이 막히지 않음.
/// 모든 서버를 병렬 호출 — 직렬 시 서버 N개 × 응답시간 vs 병렬 max(응답시간).
async fn enumerate_mcp_tools(state: &tauri::State<'_, crate::mcp::McpState>) -> Vec<McpToolEntry> {
    use tokio::time::{timeout, Duration};
    let servers = crate::mcp::list_enabled_servers();
    let futs = servers.into_iter().map(|spec| {
        let name = spec.name.clone();
        let state = state.clone();
        async move {
            let res = timeout(
                Duration::from_secs(2),
                crate::mcp::mcp_list_tools(name.clone(), state),
            )
            .await;
            match res {
                Ok(Ok(v)) => flatten_mcp_tools(&name, &v),
                _ => Vec::new(),
            }
        }
    });
    futures_util::future::join_all(futs)
        .await
        .into_iter()
        .flatten()
        .collect()
}

// ─── 도구 파싱 ────────────────────────────────────────────────────────────────

struct ParsedAction {
    tool: String,
    args: serde_json::Value,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ReactMode {
    Plan,
    Act,
}

fn parse_mode(mode: Option<String>) -> ReactMode {
    match mode
        .as_deref()
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("plan") => ReactMode::Plan,
        _ => ReactMode::Act,
    }
}

/// LLM 출력에서 ACTION: tool({...}) 형식 파싱
fn parse_action(text: &str) -> Option<ParsedAction> {
    let line = text
        .lines()
        .find(|l| l.trim_start().starts_with("ACTION:"))?;
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
        .map(|l| {
            l.trim_start()
                .trim_start_matches("THOUGHT:")
                .trim()
                .to_string()
        })
        .unwrap_or_default()
}

/// LLM 출력에서 ANSWER 추출
fn parse_answer(text: &str) -> Option<String> {
    // ANSWER: 이후 모든 내용
    let idx = text.find("ANSWER:")?;
    Some(text[idx + 7..].trim().to_string())
}

fn reflexion_needs_retry(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("fail")
        || lower.contains("risk high")
        || lower.contains("risk_high")
        || lower.contains("high risk")
        || lower.contains("실패")
        || lower.contains("회귀 위험 높")
}

async fn run_reflexion(
    app: &AppHandle,
    client: &reqwest::Client,
    conversation: &str,
    goal: &str,
    candidate_answer: Option<&str>,
    backend: Option<&str>,
    model: &str,
) -> Option<String> {
    let candidate = candidate_answer.unwrap_or("최종 답변 미도출(단계 상한 도달)");
    let prompt = format!(
        "{conversation}\n\n[시스템-Reflexion]\n목표: {goal}\n현재 결론 후보: {candidate}\n지금까지의 과정으로 목표 달성 여부와 회귀 위험을 60자 이내 한 줄로 평가하세요.\n형식: ok: ... 또는 fail: ... 또는 risk_high: ..."
    );
    let fut = call_ai_with_backend(Some(app), client, model, &prompt, backend);
    let timed = tokio::time::timeout(std::time::Duration::from_secs(REFLEXION_TIMEOUT_SECS), fut);
    match await_with_cancel(timed).await {
        Some(Ok(Ok(resp))) => {
            let line = resp
                .lines()
                .find(|l| !l.trim().is_empty())
                .unwrap_or(resp.trim());
            if line.trim().is_empty() {
                None
            } else {
                Some(line.trim().to_string())
            }
        }
        _ => None,
    }
}

// ─── 도구 실행 ────────────────────────────────────────────────────────────────

async fn run_tool(
    app: &AppHandle,
    tool: &str,
    args: &serde_json::Value,
    cwd: &str,
    desktop_tools_enabled: bool,
    review_mode: bool,
    scip_tools_enabled: bool,
    mode: ReactMode,
    tool_whitelist: Option<&HashSet<String>>,
) -> String {
    if cancel_flag().load(Ordering::Relaxed) {
        return tool_cancel_message(tool);
    }
    // Phase 129: Plan 모드에서는 읽기/분석만 허용 — 쓰기 도구와 shell 실행은 차단.
    if is_plan_blocked_tool(mode, tool) {
        return format!("Plan 모드 차단: {tool} 도구는 승인 후 Act 모드에서만 실행됩니다.");
    }
    // 리뷰 모드에서는 읽기 전용 분석만 허용.
    if is_review_blocked_tool(review_mode, tool) {
        return review_mode_block_message(tool);
    }
    // Phase 129: Act 모드 + whitelist가 있으면 목록 외 도구 차단.
    if !is_whitelisted_in_act(mode, tool, tool_whitelist) {
        return format!("Act 모드 차단: '{tool}' 도구는 승인된 화이트리스트에 없습니다.");
    }

    let result = match tool {
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
            match build_repo_map(&map_cwd, 2048, None, &[]) {
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
        "query_healing" => {
            run_async_tool_with_cancel(run_query_healing_tool(args), "query_healing").await
        }
        "analyze_failure_reasons" => run_analyze_failure_reasons_tool(args),
        "query_codebase" => {
            run_async_tool_with_cancel(run_query_codebase_tool(args), "query_codebase").await
        }
        "query_graph" => {
            run_async_tool_with_cancel(run_query_graph_tool(args, cwd), "query_graph").await
        }
        "find_callers" => run_find_callers_tool(args, cwd),
        "find_callees" => run_find_callees_tool(args, cwd),
        "trace_dependents" => run_trace_dependents_tool(args, cwd),
        "precise_callers" => run_precise_callers_tool(args, cwd, scip_tools_enabled),
        "precise_definition" => run_precise_definition_tool(args, cwd, scip_tools_enabled),
        "scip_status" => run_scip_status_tool(cwd),
        "write_file" => write_file_tool(args, cwd),
        "apply_patch" => apply_patch_tool(args, cwd),
        "delete_file" => delete_file_tool(args, cwd),
        "screenshot" | "mouse" | "click" | "type" | "key_combo" | "scroll" => {
            run_async_tool_with_cancel(run_desktop_tool(tool, args, desktop_tools_enabled), tool).await
        }
        "mcp" => run_async_tool_with_cancel(run_mcp_tool(app, args), "mcp").await,
        _ => format!("알 수 없는 도구: {tool}"),
    };

    // 쓰기 도구가 성공한 경우 file_change emit — 프론트가 변경 파일 리스트를 누적해 표시.
    if matches!(tool, "write_file" | "apply_patch" | "delete_file")
        && !result.starts_with("오류")
        && !result.contains("실패")
    {
        if let Some(path) = args["path"].as_str() {
            emit_event(app, "file_change", path, Some(tool), None);
        }
    }

    result
}

async fn run_async_tool_with_cancel<F>(future: F, tool_name: &str) -> String
where
    F: Future<Output = String>,
{
    match await_with_cancel(future).await {
        Some(v) => v,
        None => tool_cancel_message(tool_name),
    }
}

fn tool_cancel_message(tool_name: &str) -> String {
    format!("{tool_name} 실행 취소됨")
}

fn is_plan_blocked_tool(mode: ReactMode, tool: &str) -> bool {
    mode == ReactMode::Plan
        && matches!(
            tool,
            "shell"
                | "run_tests"
                | "write_file"
                | "apply_patch"
                | "delete_file"
                | "mcp"
                | "screenshot"
                | "mouse"
                | "click"
                | "type"
                | "key_combo"
                | "scroll"
        )
}

fn is_review_blocked_tool(review_mode: bool, tool: &str) -> bool {
    review_mode
        && matches!(
            tool,
            "shell"
                | "run_tests"
                | "write_file"
                | "apply_patch"
                | "delete_file"
                | "mcp"
                | "screenshot"
                | "mouse"
                | "click"
                | "type"
                | "key_combo"
                | "scroll"
        )
}

fn review_mode_block_message(tool: &str) -> String {
    format!(
        "리뷰 모드 정책 차단: {tool} 도구는 읽기 전용 분석에서 허용되지 않습니다. (권한 오류 아님)"
    )
}

fn is_whitelisted_in_act(mode: ReactMode, tool: &str, whitelist: Option<&HashSet<String>>) -> bool {
    if mode != ReactMode::Act {
        return true;
    }
    match whitelist {
        Some(set) => normalize_tool_key(tool)
            .map(|key| set.contains(&key))
            .unwrap_or(false),
        None => true,
    }
}

fn should_apply_config_whitelist(apply_config_whitelist: Option<bool>) -> bool {
    apply_config_whitelist.unwrap_or(false)
}

fn normalize_tool_key(raw: &str) -> Option<String> {
    let key = raw.trim().to_ascii_lowercase();
    if key.is_empty() {
        None
    } else {
        Some(key)
    }
}

fn normalize_tool_whitelist(list: Option<Vec<String>>) -> Option<HashSet<String>> {
    let Some(list) = list else {
        return None;
    };
    let set: HashSet<String> = list
        .into_iter()
        .filter_map(|s| normalize_tool_key(&s))
        .collect();
    if set.is_empty() {
        None
    } else {
        Some(set)
    }
}

#[cfg(test)]
#[derive(Default)]
struct DesktopToolMock {
    screenshot: Option<std::result::Result<String, String>>,
    mouse: Option<std::result::Result<(), String>>,
    click: Option<std::result::Result<(), String>>,
    typing: Option<std::result::Result<(), String>>,
    scroll: Option<std::result::Result<(), String>>,
    key_combo: Option<std::result::Result<(), String>>,
}

#[cfg(test)]
static DESKTOP_TOOL_MOCK: OnceLock<Mutex<DesktopToolMock>> = OnceLock::new();

#[cfg(test)]
fn desktop_tool_mock_lock() -> &'static Mutex<DesktopToolMock> {
    DESKTOP_TOOL_MOCK.get_or_init(|| Mutex::new(DesktopToolMock::default()))
}

#[cfg(test)]
fn set_desktop_tool_mock(mock: DesktopToolMock) {
    *desktop_tool_mock_lock().lock().unwrap() = mock;
}

#[cfg(test)]
fn clear_desktop_tool_mock() {
    *desktop_tool_mock_lock().lock().unwrap() = DesktopToolMock::default();
}

async fn desktop_capture_screen() -> std::result::Result<String, String> {
    #[cfg(test)]
    {
        let mut guard = desktop_tool_mock_lock().lock().unwrap();
        if let Some(v) = guard.screenshot.take() {
            return v;
        }
    }
    crate::desktop::capture_screen().await
}

fn desktop_simulate_click(x: i32, y: i32, button: String) -> std::result::Result<(), String> {
    #[cfg(test)]
    {
        let mut guard = desktop_tool_mock_lock().lock().unwrap();
        if let Some(v) = guard.click.take() {
            return v;
        }
    }
    crate::desktop::simulate_click(x, y, button)
}

fn desktop_simulate_mouse(x: i32, y: i32, click: bool) -> std::result::Result<(), String> {
    #[cfg(test)]
    {
        let mut guard = desktop_tool_mock_lock().lock().unwrap();
        if let Some(v) = guard.mouse.take() {
            return v;
        }
    }
    crate::desktop::simulate_mouse(crate::desktop::MouseAction { x, y, click })
}

fn desktop_simulate_typing(text: String, enter: bool) -> std::result::Result<(), String> {
    #[cfg(test)]
    {
        let mut guard = desktop_tool_mock_lock().lock().unwrap();
        if let Some(v) = guard.typing.take() {
            return v;
        }
    }
    crate::desktop::simulate_keyboard(crate::desktop::KeyboardAction { text, enter })
}

fn desktop_simulate_key_combo(modifier: String, key: String) -> std::result::Result<(), String> {
    #[cfg(test)]
    {
        let mut guard = desktop_tool_mock_lock().lock().unwrap();
        if let Some(v) = guard.key_combo.take() {
            return v;
        }
    }
    crate::desktop::simulate_key_combo(modifier, key)
}

fn desktop_simulate_scroll(x: i32, y: i32, amount: i32) -> std::result::Result<(), String> {
    #[cfg(test)]
    {
        let mut guard = desktop_tool_mock_lock().lock().unwrap();
        if let Some(v) = guard.scroll.take() {
            return v;
        }
    }
    crate::desktop::simulate_scroll(x, y, amount)
}

async fn run_desktop_tool(tool: &str, args: &serde_json::Value, enabled: bool) -> String {
    if !enabled {
        return "데스크톱 제어가 비활성화되어 있습니다. 설정에서 활성화하세요.".to_string();
    }

    match tool {
        "screenshot" => match desktop_capture_screen().await {
            Ok(image_base64) => truncate(&image_base64),
            Err(e) => format!("스크린샷 실패: {e}"),
        },
        "mouse" => {
            let x = args["x"].as_i64().unwrap_or(i64::MIN);
            let y = args["y"].as_i64().unwrap_or(i64::MIN);
            if x == i64::MIN || y == i64::MIN {
                return "오류: mouse는 x, y 좌표가 필요합니다".to_string();
            }
            let Ok(x_i32) = i32::try_from(x) else {
                return format!("오류: x 좌표 범위를 벗어났습니다 ({x})");
            };
            let Ok(y_i32) = i32::try_from(y) else {
                return format!("오류: y 좌표 범위를 벗어났습니다 ({y})");
            };
            let do_click = args["click"].as_bool().unwrap_or(false);
            match desktop_simulate_mouse(x_i32, y_i32, do_click) {
                Ok(()) => format!("마우스 이동 성공: ({x}, {y}) click={do_click}"),
                Err(e) => format!("마우스 이동 실패: {e}"),
            }
        }
        "click" => {
            let x = args["x"].as_i64().unwrap_or(i64::MIN);
            let y = args["y"].as_i64().unwrap_or(i64::MIN);
            if x == i64::MIN || y == i64::MIN {
                return "오류: click은 x, y 좌표가 필요합니다".to_string();
            }
            let Ok(x_i32) = i32::try_from(x) else {
                return format!("오류: x 좌표 범위를 벗어났습니다 ({x})");
            };
            let Ok(y_i32) = i32::try_from(y) else {
                return format!("오류: y 좌표 범위를 벗어났습니다 ({y})");
            };
            let button = args["button"]
                .as_str()
                .unwrap_or("left")
                .trim()
                .to_lowercase();
            if !matches!(button.as_str(), "left" | "right" | "middle") {
                return format!("오류: click button은 left/right/middle만 허용됩니다 ({button})");
            }
            match desktop_simulate_click(x_i32, y_i32, button.clone()) {
                Ok(()) => format!("클릭 성공: ({x}, {y}, {button})"),
                Err(e) => format!("클릭 실패: {e}"),
            }
        }
        "type" => {
            let text = args["text"].as_str().unwrap_or("").to_string();
            if text.is_empty() {
                return "오류: type은 text 파라미터가 필요합니다".to_string();
            }
            let enter = args["enter"].as_bool().unwrap_or(false);
            match desktop_simulate_typing(text.clone(), enter) {
                Ok(()) => format!("입력 성공: {} chars (enter={enter})", text.chars().count()),
                Err(e) => format!("입력 실패: {e}"),
            }
        }
        "key_combo" => {
            let modifier = args["modifier"].as_str().unwrap_or("").trim().to_string();
            let key = args["key"].as_str().unwrap_or("").trim().to_string();
            if modifier.is_empty() || key.is_empty() {
                return "오류: key_combo는 modifier와 key 파라미터가 필요합니다".to_string();
            }
            match desktop_simulate_key_combo(modifier.clone(), key.clone()) {
                Ok(()) => format!("단축키 성공: {modifier}+{key}"),
                Err(e) => format!("단축키 실패: {e}"),
            }
        }
        "scroll" => {
            let x = args["x"].as_i64().unwrap_or(i64::MIN);
            let y = args["y"].as_i64().unwrap_or(i64::MIN);
            let amount = args["amount"].as_i64().unwrap_or(i64::MIN);
            if x == i64::MIN || y == i64::MIN || amount == i64::MIN {
                return "오류: scroll은 x, y, amount 파라미터가 필요합니다".to_string();
            }
            if amount == 0 {
                return "오류: scroll amount는 0일 수 없습니다".to_string();
            }
            let Ok(x_i32) = i32::try_from(x) else {
                return format!("오류: x 좌표 범위를 벗어났습니다 ({x})");
            };
            let Ok(y_i32) = i32::try_from(y) else {
                return format!("오류: y 좌표 범위를 벗어났습니다 ({y})");
            };
            let Ok(amount_i32) = i32::try_from(amount) else {
                return format!("오류: amount 범위를 벗어났습니다 ({amount})");
            };
            match desktop_simulate_scroll(x_i32, y_i32, amount_i32) {
                Ok(()) => format!("스크롤 성공: ({x}, {y}, {amount})"),
                Err(e) => format!("스크롤 실패: {e}"),
            }
        }
        _ => format!("알 수 없는 데스크톱 도구: {tool}"),
    }
}

/// Phase 121: MCP 서버 도구 호출. mcp({"server", "tool", "arguments"}).
async fn run_mcp_tool(app: &AppHandle, args: &serde_json::Value) -> String {
    let server = args["server"].as_str().unwrap_or("").trim().to_string();
    let tool = args["tool"].as_str().unwrap_or("").trim().to_string();
    if server.is_empty() || tool.is_empty() {
        return "오류: mcp는 server + tool 파라미터 모두 필요".to_string();
    }
    let arguments = args
        .get("arguments")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let state: tauri::State<'_, crate::mcp::McpState> = app.state();
    match crate::mcp::mcp_call_tool(server, tool, arguments, state).await {
        Ok(v) => {
            let pretty = serde_json::to_string_pretty(&v).unwrap_or_else(|_| v.to_string());
            truncate(&pretty)
        }
        Err(e) => format!("MCP 호출 실패: {e}"),
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
#[derive(Default)]
struct HealingToolMock {
    recall_result: Option<std::result::Result<Vec<crate::commands::recall::RecallEntry>, String>>,
    records_result:
        Option<std::result::Result<Vec<crate::commands::healing_dataset::HealingRecord>, String>>,
}

#[cfg(test)]
static HEALING_TOOL_MOCK: OnceLock<Mutex<HealingToolMock>> = OnceLock::new();

#[cfg(test)]
fn healing_tool_mock_lock() -> &'static Mutex<HealingToolMock> {
    HEALING_TOOL_MOCK.get_or_init(|| Mutex::new(HealingToolMock::default()))
}

#[cfg(test)]
fn set_healing_tool_mock(mock: HealingToolMock) {
    *healing_tool_mock_lock().lock().unwrap() = mock;
}

#[cfg(test)]
fn clear_healing_tool_mock() {
    *healing_tool_mock_lock().lock().unwrap() = HealingToolMock::default();
}

async fn recall_search_healing(
    query: String,
    since_ms: Option<u64>,
    limit: usize,
) -> std::result::Result<Vec<crate::commands::recall::RecallEntry>, String> {
    #[cfg(test)]
    {
        let mut guard = healing_tool_mock_lock().lock().unwrap();
        if let Some(v) = guard.recall_result.take() {
            return v;
        }
    }

    crate::commands::recall::recall_search(
        query,
        Some(vec!["healing".to_string()]),
        since_ms,
        None,
        String::new(),
        limit,
    )
    .await
    .map_err(|e| e.to_string())
}

fn list_healing_records(
) -> std::result::Result<Vec<crate::commands::healing_dataset::HealingRecord>, String> {
    #[cfg(test)]
    {
        let mut guard = healing_tool_mock_lock().lock().unwrap();
        if let Some(v) = guard.records_result.take() {
            return v;
        }
    }
    crate::commands::healing_dataset::list_healing_dataset().map_err(|e| e.to_string())
}

// ─── Phase 137-B: query_codebase 의미 검색 도구 ────────────────────────────────

#[cfg(test)]
#[derive(Default)]
struct CodebaseToolMock {
    search_result: Option<std::result::Result<Vec<crate::commands::rag::SearchResult>, String>>,
}

#[cfg(test)]
static CODEBASE_TOOL_MOCK: OnceLock<Mutex<CodebaseToolMock>> = OnceLock::new();

#[cfg(test)]
fn codebase_tool_mock_lock() -> &'static Mutex<CodebaseToolMock> {
    CODEBASE_TOOL_MOCK.get_or_init(|| Mutex::new(CodebaseToolMock::default()))
}

#[cfg(test)]
fn set_codebase_tool_mock(mock: CodebaseToolMock) {
    *codebase_tool_mock_lock().lock().unwrap() = mock;
}

#[cfg(test)]
fn clear_codebase_tool_mock() {
    *codebase_tool_mock_lock().lock().unwrap() = CodebaseToolMock::default();
}

async fn search_codebase_internal(
    query: String,
    limit: usize,
) -> std::result::Result<Vec<crate::commands::rag::SearchResult>, String> {
    #[cfg(test)]
    {
        let mut guard = codebase_tool_mock_lock().lock().unwrap();
        if let Some(v) = guard.search_result.take() {
            return v;
        }
    }
    // model="default"는 rag::search_with_client과 동일 — embed_auto가 ollama 우선,
    // xLLM 폴백 시 "default"는 placeholder로 받아들임.
    crate::commands::rag::search_codebase(query, "default".to_string(), limit).await
}

async fn run_query_codebase_tool(args: &serde_json::Value) -> String {
    let query = args["query"].as_str().unwrap_or("").trim().to_string();
    if query.is_empty() {
        return "오류: query_codebase는 query 파라미터가 필요합니다".to_string();
    }
    let limit = args["limit"]
        .as_u64()
        .and_then(|v| usize::try_from(v).ok())
        .unwrap_or(5)
        .clamp(1, 20);

    match search_codebase_internal(query.clone(), limit).await {
        Ok(results) => {
            if results.is_empty() {
                return format!(
                    "코드베이스 검색 결과 0건 (query=\"{query}\"). 인덱스가 비어있을 수 있습니다 — 사용자에게 RAG 색인(index_project)을 먼저 실행하도록 안내하세요."
                );
            }
            let mut out = Vec::new();
            out.push(format!(
                "코드베이스 검색 결과 {}건 (query=\"{}\")",
                results.len(),
                query
            ));
            for (idx, r) in results.iter().enumerate() {
                out.push(format!("{}. score={:.3}", idx + 1, r.score));
                out.push(r.content.clone());
                out.push("---".to_string());
            }
            truncate(&out.join("\n"))
        }
        Err(e) => format!("코드베이스 검색 실패: {e}"),
    }
}

fn parse_graph_symbol_from_chunk(content: &str) -> Option<String> {
    let header = content.lines().next()?.trim();
    if !header.starts_with('[') {
        return None;
    }
    let close = header.find(']')?;
    let inner = header[1..close].trim();

    // "[module | ...]" 형태는 모듈 단위 헤더이므로 호출 그래프 후보에서 제외.
    if inner.starts_with("module ") || inner == "module" {
        return None;
    }

    // 새 포맷: "[fn name | path]" 또는 "[class MyType | path]"
    let title_and_file = inner.split_once(" | ");
    if title_and_file.is_none() {
        return None;
    }
    let (symbol_with_kind, _) = title_and_file?;
    let mut split = symbol_with_kind.splitn(2, ' ');
    let kind = split.next()?;
    let symbol = split.next()?.trim();
    if symbol.is_empty() {
        return None;
    }

    // tree-sitter 헤더 메타가 충분히 신뢰되지 않는 경우를 막기 위한 방어.
    if symbol == kind || symbol == "*" || symbol.starts_with('#') {
        return None;
    }

    Some(symbol.to_string())
}

fn parse_graph_file_from_chunk(content: &str) -> Option<String> {
    let header = content.lines().next()?.trim();
    if !header.starts_with('[') {
        return None;
    }
    let close = header.find(']')?;
    let inner = header[1..close].trim();

    // 최신 포맷: "[fn name | path]" 또는 "[module | path]"
    // 레거시 포맷: "[path]" fallback.
    if let Some((_, file)) = inner.split_once(" | ") {
        let path = file.trim();
        if path.is_empty() {
            None
        } else {
            Some(path.to_string())
        }
    } else {
        Some(inner.to_string())
    }
}

fn parse_module_imports_from_file(path: &Path, max_imports: usize) -> Vec<String> {
    let mut imports = Vec::new();
    if max_imports == 0 {
        return imports;
    }
    let content = match std::fs::read_to_string(path) {
        Ok(v) => v,
        Err(_) => return imports,
    };
    // 과도하게 큰 파일은 모듈 컨텍스트 추출 비용을 줄이기 위해 상단 일부만 스캔.
    if content.len() > 240_000 {
        return imports;
    }

    let mut seen = std::collections::HashSet::new();
    for line in content.lines().take(220) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let (kind, body) = if let Some(rest) = trimmed.strip_prefix("use ") {
            ("rust_use", rest)
        } else if let Some(rest) = trimmed.strip_prefix("from ") {
            ("py_from", rest)
        } else if trimmed.starts_with("import ") {
            if trimmed.contains(" from ")
                || trimmed.contains("import \"")
                || trimmed.contains("import '")
            {
                ("js_import", trimmed)
            } else {
                ("py_import", trimmed)
            }
        } else if trimmed.starts_with("export ") {
            ("js_import", trimmed)
        } else if trimmed.starts_with("const ") && trimmed.contains("require(") {
            ("js_require", trimmed)
        } else {
            continue;
        };

        parse_graph_import_line(kind, body, trimmed, &mut imports, &mut seen);
        if imports.len() >= max_imports {
            break;
        }
    }

    imports
}

fn parse_graph_import_line(
    kind: &str,
    body: &str,
    full_line: &str,
    imports: &mut Vec<String>,
    seen: &mut std::collections::HashSet<String>,
) {
    let mut add_import = |value: &str| {
        let value = value.trim().trim_end_matches(';').trim().to_string();
        if value.is_empty() {
            return;
        }
        let normalized = value.to_string();
        if seen.insert(normalized.clone()) {
            imports.push(normalized);
        }
    };

    match kind {
        "rust_use" => {
            let clean = body.trim_end_matches(';').trim();
            if let Some((prefix, rest)) = clean.split_once("::{") {
                if let Some(end) = rest.find('}') {
                    let list = &rest[..end];
                    if list.trim().is_empty() || list.trim() == "self" {
                        add_import(prefix);
                        return;
                    }
                    for seg in list.split(',') {
                        let seg = seg.trim().trim_start_matches('{').trim_end_matches('}');
                        if seg.is_empty() || seg == "self" || seg == "*" {
                            continue;
                        }
                        let seg = if let Some((left, _)) = seg.split_once(" as ") {
                            left.trim()
                        } else {
                            seg
                        };
                        if seg.is_empty() || seg == "self" || seg == "*" {
                            continue;
                        }
                        add_import(&format!("{prefix}::{seg}"));
                    }
                    return;
                }
            }
            if let Some((left, _)) = body.split_once(" as ") {
                add_import(left);
            } else {
                add_import(body);
            }
        }
        "py_from" => {
            if let Some((module, _)) = body.split_once(" import ") {
                add_import(module);
            }
        }
        "py_import" => {
            let rest = full_line.trim_start_matches("import ").trim();
            for seg in rest.split(',') {
                let seg = seg.trim();
                if seg.is_empty() {
                    continue;
                }
                if let Some((left, _)) = seg.split_once(" as ") {
                    add_import(left);
                } else {
                    add_import(seg);
                }
            }
        }
        "js_import" => {
            if let Some(mod_name) = extract_first_quoted_path(full_line) {
                add_import(mod_name);
                return;
            }
            if let Some((_, after_from)) = full_line.split_once(" from ") {
                if let Some(mod_name) = extract_first_quoted_path(after_from) {
                    add_import(mod_name);
                }
            }
        }
        "js_require" => {
            if let Some(start) = full_line.find("require(") {
                if let Some(rest) = full_line.get(start + "require(".len()..) {
                    if let Some(mod_name) = extract_first_quoted_path(rest) {
                        add_import(mod_name);
                    }
                }
            }
        }
        _ => {}
    }
}

fn extract_first_quoted_path(value: &str) -> Option<&str> {
    for quote in ['"', '\''] {
        if let Some(start) = value.find(quote) {
            if let Some(end) = value[start + 1..].find(quote) {
                let head = start + 1;
                return Some(&value[head..head + end]);
            }
        }
    }
    None
}

fn normalize_graph_file_ref(raw: &str) -> String {
    let raw = raw.trim().replace('\\', "/");
    let (prefix, rel) = if raw.starts_with("//") {
        ("//", raw.trim_start_matches('/'))
    } else if raw.len() >= 2 && raw.as_bytes().get(1).is_some_and(|b| *b == b':') {
        let drive = &raw[..2];
        (drive, raw[2..].trim_start_matches('/'))
    } else if raw.starts_with('/') {
        ("/", raw.trim_start_matches('/'))
    } else {
        ("", raw.as_str())
    };
    if rel == "." {
        return ".".to_string();
    }

    let mut parts: Vec<&str> = Vec::new();
    for seg in rel.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." {
            if !prefix.is_empty() {
                if let Some(last) = parts.last() {
                    if *last != ".." {
                        parts.pop();
                        continue;
                    }
                }
            } else if !parts.is_empty() && parts.last() != Some(&"..") {
                parts.pop();
                continue;
            }
            parts.push("..");
            continue;
        }
        parts.push(seg);
    }

    if parts.is_empty() {
        if prefix == "/" {
            "/".to_string()
        } else {
            if !prefix.is_empty() {
                format!("{prefix}")
            } else {
                "".to_string()
            }
        }
    } else if !prefix.is_empty() {
        if prefix == "//" {
            format!("//{}", parts.join("/"))
        } else if prefix == "/" {
            format!("/{}", parts.join("/"))
        } else {
            format!("{prefix}/{}", parts.join("/"))
        }
    } else {
        parts.join("/")
    }
}

fn collect_graph_file_contexts(
    files: &[String],
    cwd: &str,
    max_files: usize,
    max_imports: usize,
) -> Vec<(String, Vec<String>)> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for raw in files.iter().take(max_files) {
        let norm_path = normalize_graph_file_ref(raw);
        if !seen.insert(norm_path.to_lowercase()) {
            continue;
        }

        let abs = if Path::new(raw).is_absolute() || Path::new(raw).exists() {
            PathBuf::from(raw)
        } else {
            let ref_path = Path::new(cwd).join(&norm_path);
            if ref_path.exists() {
                ref_path
            } else {
                Path::new(cwd).join(raw)
            }
        };
        let imports = parse_module_imports_from_file(&abs, max_imports);
        out.push((norm_path, imports));
    }
    out
}

fn collect_query_graph_module_links_by_imports(
    file_contexts: &[(String, Vec<String>)],
    available_modules: &std::collections::HashSet<String>,
) -> std::collections::HashMap<(String, String), usize> {
    let mut links: std::collections::HashMap<(String, String), usize> =
        std::collections::HashMap::new();

    for (source_file, imports) in file_contexts {
        let src = source_file.to_lowercase();
        if !available_modules.contains(&src) {
            continue;
        }
        let mut seen_pairs = std::collections::HashSet::new();
        for import in imports {
            for target in resolve_query_graph_import_target(import, source_file, available_modules)
            {
                if target == src {
                    continue;
                }
                let key = (src.clone(), target);
                if seen_pairs.insert(key.clone()) {
                    *links.entry(key).or_insert(0) += 1;
                }
            }
        }
    }

    links
}

fn collect_query_graph_module_links_by_calls(
    graph: &crate::commands::call_graph::CallGraph,
    symbols: &[String],
    available_modules: &std::collections::HashSet<String>,
) -> std::collections::HashMap<(String, String), usize> {
    let mut links: std::collections::HashMap<(String, String), usize> =
        std::collections::HashMap::new();

    for symbol in symbols {
        let caller_defs = graph.fn_defs.get(symbol).cloned().unwrap_or_default();
        let mut caller_modules = Vec::new();
        for caller_file in caller_defs {
            let normalized = normalize_graph_file_ref(&caller_file).to_lowercase();
            if available_modules.contains(&normalized) {
                caller_modules.push(normalized);
            }
        }
        if caller_modules.is_empty() {
            continue;
        }

        for callee in graph.find_callees(symbol) {
            if callee.defined_in.is_empty() {
                continue;
            }
            let mut callee_modules = Vec::new();
            for callee_file in callee.defined_in {
                let normalized = normalize_graph_file_ref(&callee_file).to_lowercase();
                if available_modules.contains(&normalized) {
                    callee_modules.push(normalized);
                }
            }
            if callee_modules.is_empty() {
                continue;
            }

            for caller_module in &caller_modules {
                for callee_module in &callee_modules {
                    if caller_module == callee_module {
                        continue;
                    }
                    *links
                        .entry((caller_module.clone(), callee_module.clone()))
                        .or_insert(0) += 1;
                }
            }
        }
    }

    links
}

fn resolve_query_graph_import_target(
    raw_import: &str,
    source_file: &str,
    available_modules: &std::collections::HashSet<String>,
) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for candidate in query_graph_import_candidates(raw_import) {
        for normalized in normalize_query_graph_import_candidate(&candidate, source_file) {
            if available_modules.contains(&normalized) && seen.insert(normalized.clone()) {
                out.push(normalized);
            }
        }
    }

    out
}

fn query_graph_import_candidates(raw_import: &str) -> Vec<String> {
    let trimmed = raw_import.trim().trim_end_matches(';').trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let tokens = trimmed.trim_matches(&['\"', '\''][..]).to_string();
    if tokens.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();

    if tokens.contains("::") {
        let mut segments: Vec<&str> = tokens
            .split("::")
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if !segments.is_empty() {
            while let Some(first) = segments.first() {
                if matches!(*first, "crate" | "self" | "super") {
                    segments.remove(0);
                } else {
                    break;
                }
            }
        }
        for take in 1..=segments.len() {
            let candidate = segments[..take].join("/");
            if seen.insert(candidate.clone()) {
                out.push(candidate);
            }
        }
    } else if tokens.starts_with('.') || tokens.starts_with('/') || tokens.contains('/') {
        if seen.insert(tokens.clone()) {
            out.push(tokens);
        }
    } else {
        if seen.insert(tokens.clone()) {
            out.push(tokens);
        }
    }

    out
}

fn normalize_query_graph_import_candidate(candidate: &str, source_file: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let absolute_candidate = if is_relative_query_graph_import(candidate) {
        if let Some(parent) = Path::new(source_file).parent() {
            let joined = parent.join(candidate);
            joined.to_string_lossy().to_string()
        } else {
            candidate.to_string()
        }
    } else {
        candidate.to_string()
    };
    let base = normalize_graph_file_ref(&absolute_candidate);
    if base.is_empty() || base == "." {
        return out;
    }
    let is_file_like = is_query_graph_file_like_path(&base);

    let mut extend_with = |candidate: String| {
        if !candidate.is_empty() && seen.insert(candidate.clone()) {
            out.push(candidate.to_lowercase());
        }
    };

    let has_extension = Path::new(&base).extension().is_some();
    extend_with(base.clone());
    if base.starts_with("src/") {
        if base.ends_with("/mod.rs") {
            let parent = base.trim_end_matches("/mod.rs").to_string();
            extend_with(parent);
        }
    } else if !is_file_like {
        extend_with(format!("src/{base}"));
    }

    if !has_extension {
        for ext in ["rs", "tsx", "ts", "js", "jsx", "py", "mjs", "cjs"].iter() {
            let with_ext = format!("{base}.{ext}");
            let with_src_ext = format!("src/{with_ext}");
            extend_with(with_ext);
            extend_with(with_src_ext);
        }
        if !base.ends_with("/mod.rs") {
            extend_with(format!("{base}/mod.rs"));
            extend_with(format!("src/{base}/mod.rs"));
        }
    }

    out
}

fn is_relative_query_graph_import(raw: &str) -> bool {
    raw.starts_with("./") || raw.starts_with("../") || raw == "."
}

fn is_query_graph_file_like_path(raw: &str) -> bool {
    raw.starts_with("../")
        || raw == ".."
        || raw.starts_with("./")
        || raw.starts_with('/')
        || (raw.len() >= 2 && raw.as_bytes().get(1).is_some_and(|b| *b == b':'))
}

fn escape_mermaid_label(raw: &str) -> String {
    raw.replace('\\', "\\\\").replace('"', "\\\"")
}

fn format_query_graph_mermaid_lines(
    sorted_links: &[((String, String), usize)],
    file_display_map: &std::collections::HashMap<String, String>,
    max_edges: usize,
) -> Option<Vec<String>> {
    if sorted_links.is_empty() {
        return None;
    }

    let mut lines = vec![
        "모듈 관계 다이어그램:".to_string(),
        "```mermaid".to_string(),
        "flowchart LR".to_string(),
    ];
    for ((from, to), _) in sorted_links.iter().take(max_edges) {
        let from_label = file_display_map.get(from).unwrap_or(from);
        let to_label = file_display_map.get(to).unwrap_or(to);
        lines.push(format!(
            "  \"{}\" --> \"{}\"",
            escape_mermaid_label(from_label),
            escape_mermaid_label(to_label)
        ));
    }
    lines.push("```".to_string());
    Some(lines)
}

fn format_graph_lines(
    symbol: &str,
    callers: &[crate::commands::call_graph::CallerInfo],
    callees: &[crate::commands::call_graph::CalleeInfo],
    dependents: &[crate::commands::call_graph::DependentNode],
    symbol_defs: &[String],
    max_depth: usize,
    max_items: usize,
) -> Vec<String> {
    let mut out = Vec::new();
    out.push(format!("  - {symbol}"));
    if symbol_defs.is_empty() {
        out.push("    - 정의 파일: 없음(동명이인/외부 호출 기반)".to_string());
    } else {
        out.push(format!("    - 정의 파일 {}개", symbol_defs.len()));
        for def in symbol_defs.iter().take(max_items) {
            out.push(format!("      - {def}"));
        }
        if symbol_defs.len() > max_items {
            out.push(format!(
                "      - ... {}개 추가",
                symbol_defs.len().saturating_sub(max_items)
            ));
        }
    }

    out.push(format!("    - 호출자 {}개", callers.len()));
    for caller in callers.iter().take(max_items) {
        out.push(format!("      - {} ({})", caller.fn_name, caller.file));
    }
    if callers.len() > max_items {
        out.push(format!(
            "      - ... {}개 추가",
            callers.len().saturating_sub(max_items)
        ));
    }
    if callers.is_empty() {
        out.push("      - 없음".to_string());
    }

    out.push(format!("    - 피호출자 {}개", callees.len()));
    for callee in callees.iter().take(max_items) {
        let defs = if callee.defined_in.is_empty() {
            "외부/내장".to_string()
        } else {
            callee.defined_in.join(", ")
        };
        out.push(format!("      - {} ({defs})", callee.name));
    }
    if callees.len() > max_items {
        out.push(format!(
            "      - ... {}개 추가",
            callees.len().saturating_sub(max_items)
        ));
    }
    if callees.is_empty() {
        out.push("      - 없음".to_string());
    }

    out.push(format!(
        "    - 영향도 depth≤{max_depth}: {}개",
        dependents.len()
    ));
    for dep in dependents
        .iter()
        .filter(|d| d.depth <= max_depth)
        .take(max_items)
    {
        out.push(format!(
            "      - depth {}: {} ({})",
            dep.depth, dep.name, dep.file
        ));
    }
    if dependents.len() > max_items {
        out.push(format!(
            "      - ... {}개 추가",
            dependents.len().saturating_sub(max_items)
        ));
    }
    if dependents.is_empty() {
        out.push("      - 없음".to_string());
    }
    out.push(
        "    - 동명이인 가능성: 식별자 충돌 시 결과가 섞일 수 있음 (필요 시 precise_* 사용)"
            .to_string(),
    );
    out
}

async fn run_query_graph_tool(args: &serde_json::Value, cwd: &str) -> String {
    let query = args["query"].as_str().unwrap_or("").trim().to_string();
    if query.is_empty() {
        return "오류: query_graph는 query 파라미터가 필요합니다".to_string();
    }
    let limit = args["limit"]
        .as_u64()
        .and_then(|v| usize::try_from(v).ok())
        .unwrap_or(8)
        .clamp(1, 20);
    let depth = args["depth"]
        .as_u64()
        .and_then(|v| usize::try_from(v).ok())
        .unwrap_or(3)
        .clamp(1, 5);
    let symbol_count = args["symbols"]
        .as_u64()
        .and_then(|v| usize::try_from(v).ok())
        .unwrap_or(4)
        .clamp(1, 8);

    let mut results = match search_codebase_internal(query.clone(), limit).await {
        Ok(results) => results,
        Err(e) => return format!("코드베이스 검색 실패: {e}"),
    };
    if results.is_empty() {
        return format!(
            "query_graph 검색 결과 0건 (query=\"{query}\"). 인덱스가 비어있을 수 있습니다 — 사용자에게 RAG 색인(index_project)을 먼저 실행하도록 안내하세요."
        );
    }

    results.sort_by(|a, b| b.score.total_cmp(&a.score));

    let max_file_context = 8usize;
    let max_imports_per_file = 6usize;
    let mut symbol_to_files: std::collections::HashMap<String, Vec<String>> = HashMap::new();
    let mut module_scores: std::collections::HashMap<String, f64> = HashMap::new();
    let mut symbol_file_pairs: std::collections::HashSet<String> = HashSet::new();
    let mut symbols = Vec::new();
    let mut seen_symbols = std::collections::HashSet::new();
    let mut seen_files = std::collections::HashSet::new();
    let mut files = Vec::new();
    for r in &results {
        let parsed_file =
            parse_graph_file_from_chunk(&r.content).map(|f| normalize_graph_file_ref(&f));
        if let Some(file_ref) = parsed_file.as_ref() {
            let file_key = file_ref.to_lowercase();
            *module_scores.entry(file_key).or_insert(0.0) += r.score as f64;
        }
        if symbols.len() < symbol_count {
            if let Some(symbol) = parse_graph_symbol_from_chunk(&r.content) {
                if seen_symbols.insert(symbol.clone()) {
                    symbols.push(symbol.clone());
                }
                if let Some(file_ref) = parsed_file.as_ref().map(|s| s.to_lowercase()) {
                    let symbol_key = format!("{}::{file_ref}", parsed_file.as_ref().unwrap());
                    if symbol_file_pairs.insert(symbol_key) {
                        symbol_to_files
                            .entry(file_ref)
                            .or_default()
                            .push(symbol.clone());
                    }
                }
            }
        }
        if let Some(file) = parsed_file {
            if seen_files.insert(file.to_lowercase()) && files.len() < max_file_context {
                files.push(file);
            }
        }
    }

    let mut out = Vec::new();
    out.push(format!(
        "query_graph 결과: \"{query}\" (snippets={}, depth={depth})",
        results.len()
    ));

    let mut module_summary: Vec<(String, Vec<String>, f64)> = symbol_to_files
        .into_iter()
        .map(|(file, mut symbol_list)| {
            symbol_list.sort();
            symbol_list.dedup();
            let score = module_scores.get(&file).copied().unwrap_or(0.0);
            (file, symbol_list, score)
        })
        .collect();
    for file in &files {
        let file_key = file.to_lowercase();
        if module_summary.iter().any(|(f, _, _)| f == &file_key) {
            continue;
        }
        if let Some(score) = module_scores.get(&file_key).copied() {
            if score > 0.0 {
                module_summary.push((file_key, Vec::new(), score));
            }
        }
    }
    module_summary.sort_by(|a, b| {
        b.2.partial_cmp(&a.2)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.1.len().cmp(&a.1.len()))
            .then_with(|| a.0.cmp(&b.0))
    });

    let file_contexts =
        collect_graph_file_contexts(&files, cwd, max_file_context, max_imports_per_file);
    let context_map: std::collections::HashMap<String, Vec<String>> = file_contexts
        .iter()
        .map(|(file, imports)| (file.to_lowercase(), imports.clone()))
        .collect();
    let module_set: std::collections::HashSet<String> =
        files.iter().map(|f| f.to_lowercase()).collect();
    let file_display_map: std::collections::HashMap<String, String> = files
        .iter()
        .map(|f| (f.to_lowercase(), f.clone()))
        .collect();
    let mut module_links = collect_query_graph_module_links_by_imports(&file_contexts, &module_set);

    if !module_summary.is_empty() {
        out.push(format!(
            "모듈 중심 요약 {}개:",
            module_summary.len().min(max_file_context)
        ));
        for (file, symbol_list, score) in module_summary.iter().take(max_file_context) {
            let display_file = files
                .iter()
                .find(|f| f.to_lowercase() == *file)
                .cloned()
                .unwrap_or_else(|| file.clone());
            let score_text = if *score > 0.0 {
                format!(" (점수 {:.3})", score)
            } else {
                String::new()
            };
            out.push(format!(
                "  - {display_file} (심볼 {cnt}개){score_text}",
                cnt = symbol_list.len()
            ));
            if symbol_list.is_empty() {
                out.push("    - 심볼 미탐지".to_string());
            } else {
                for symbol in symbol_list.iter().take(4) {
                    out.push(format!("    - {symbol}"));
                }
                if symbol_list.len() > 4 {
                    out.push(format!(
                        "    - ... {}개 추가",
                        symbol_list.len().saturating_sub(4)
                    ));
                }
            }
            if let Some(imports) = context_map.get(file) {
                if !imports.is_empty() {
                    out.push("    - 연결 모듈 힌트:".to_string());
                    for imp in imports.iter().take(3) {
                        out.push(format!("      - {imp}"));
                    }
                }
            }
        }
    }

    if !file_contexts.is_empty() {
        out.push(format!("연결 모듈 컨텍스트 {}개:", file_contexts.len()));
        for (file, imports) in file_contexts {
            out.push(format!("  - {file}"));
            if imports.is_empty() {
                out.push("    - import/사용 모듈 힌트 없음".to_string());
            } else {
                for imp in &imports {
                    out.push(format!("    - {imp}"));
                }
            }
        }
    }

    if symbols.is_empty() {
        out.push("관계 요약 대상 심볼이 없어 스니펫만 반환합니다.".to_string());
    } else {
        let symbol_set: HashSet<String> = symbols.iter().cloned().collect();
        let graph = crate::commands::call_graph::CallGraph::build(std::path::Path::new(cwd));
        let call_links = collect_query_graph_module_links_by_calls(&graph, &symbols, &module_set);
        for (key, score) in call_links {
            *module_links.entry(key).or_insert(0) += score;
        }
        out.push(format!(
            "관계 요약 대상 심볼 {}개 (최대 {symbol_count}개):",
            symbols.len()
        ));
        let mut symbol_links = Vec::new();
        for symbol in &symbols {
            let callers = graph.find_callers(symbol);
            let callees = graph.find_callees(symbol);
            let deps = graph.trace_dependents(symbol, depth);
            let mut defs = graph.fn_defs.get(symbol).cloned().unwrap_or_default();
            defs.sort();
            defs.dedup();
            for callee in &callees {
                if symbol_set.contains(&callee.name) {
                    symbol_links.push(format!("{symbol} -> {}", callee.name));
                }
            }
            out.extend(format_graph_lines(
                symbol, &callers, &callees, &deps, &defs, depth, 5,
            ));
        }
        symbol_links.sort();
        symbol_links.dedup();
        if !symbol_links.is_empty() {
            out.push(format!(
                "검색 심볼 간 호출 관계 {}개:",
                symbol_links.len().min(12)
            ));
            for link in symbol_links.iter().take(12) {
                out.push(format!("  - {link}"));
            }
        }
    }

    {
        let mut sorted_links: Vec<_> = module_links
            .into_iter()
            .map(|((from, to), score)| ((from, to), score))
            .collect();
        sorted_links.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.0 .0.cmp(&b.0 .0))
                .then_with(|| a.0 .1.cmp(&b.0 .1))
        });
        out.push(format!("모듈 연결 요약 {}개:", sorted_links.len().min(12)));
        let mut has_links = false;
        for ((from, to), score) in sorted_links.iter().take(12) {
            has_links = true;
            let from_label = file_display_map
                .get(from)
                .cloned()
                .unwrap_or_else(|| from.clone());
            let to_label = file_display_map
                .get(to)
                .cloned()
                .unwrap_or_else(|| to.clone());
            out.push(format!("  - {from_label} -> {to_label} (연결 {score}건)"));
        }
        if !has_links {
            out.push("  - 탐지된 모듈 연결 없음".to_string());
        }
        if has_links {
            if let Some(diagram) =
                format_query_graph_mermaid_lines(&sorted_links, &file_display_map, 12)
            {
                out.extend(diagram);
            }
        }
    }

    out.push("---".to_string());
    for (idx, result) in results.iter().enumerate() {
        if idx >= 6 {
            break;
        }
        out.push(format!("{}. score={:.3}", idx + 1, result.score));
        out.push(result.content.clone());
        out.push("---".to_string());
    }

    truncate(&out.join("\n"))
}

fn run_find_callers_tool(args: &serde_json::Value, cwd: &str) -> String {
    let symbol = args["symbol"].as_str().unwrap_or("").trim().to_string();
    if symbol.is_empty() {
        return "오류: symbol 파라미터 필요".to_string();
    }
    let graph = crate::commands::call_graph::CallGraph::build(std::path::Path::new(cwd));
    let callers = graph.find_callers(&symbol);
    if callers.is_empty() {
        return format!("`{symbol}`를 호출하는 함수를 찾지 못했습니다.");
    }
    let lines: Vec<String> = callers
        .iter()
        .map(|c| format!("  - {} ({})", c.fn_name, c.file))
        .collect();
    format!(
        "`{symbol}`의 호출자:\n{}\n[{}개] ⚠ tree-sitter 기반 — 동명이인 미구분",
        lines.join("\n"),
        callers.len()
    )
}

fn run_find_callees_tool(args: &serde_json::Value, cwd: &str) -> String {
    let symbol = args["symbol"].as_str().unwrap_or("").trim().to_string();
    if symbol.is_empty() {
        return "오류: symbol 파라미터 필요".to_string();
    }
    let graph = crate::commands::call_graph::CallGraph::build(std::path::Path::new(cwd));
    let callees = graph.find_callees(&symbol);
    if callees.is_empty() {
        return format!("`{symbol}`이 호출하는 함수를 찾지 못했습니다.");
    }
    let lines: Vec<String> = callees
        .iter()
        .map(|c| {
            if c.defined_in.is_empty() {
                format!("  - {} (외부/내장)", c.name)
            } else {
                format!("  - {} ({})", c.name, c.defined_in.join(", "))
            }
        })
        .collect();
    format!(
        "`{symbol}`이 호출하는 함수:\n{}\n[{}개]",
        lines.join("\n"),
        callees.len()
    )
}

fn run_trace_dependents_tool(args: &serde_json::Value, cwd: &str) -> String {
    let symbol = args["symbol"].as_str().unwrap_or("").trim().to_string();
    if symbol.is_empty() {
        return "오류: symbol 파라미터 필요".to_string();
    }
    let max_depth = args["depth"].as_u64().unwrap_or(3).min(5) as usize;
    let graph = crate::commands::call_graph::CallGraph::build(std::path::Path::new(cwd));
    let deps = graph.trace_dependents(&symbol, max_depth);
    if deps.is_empty() {
        return format!("`{symbol}`에 의존하는 함수를 찾지 못했습니다.");
    }
    let mut lines: Vec<String> = Vec::new();
    let mut cur_depth = 0;
    for d in &deps {
        if d.depth != cur_depth {
            cur_depth = d.depth;
            lines.push(format!("  depth={}:", d.depth));
        }
        lines.push(format!("    - {} ({})", d.name, d.file));
    }
    format!(
        "`{symbol}` 변경 영향 범위 (depth≤{max_depth}, BFS):\n{}\n[{}개] ⚠ 동명이인 가능성 있음",
        lines.join("\n"),
        deps.len()
    )
}

fn run_precise_callers_tool(args: &serde_json::Value, cwd: &str, scip_enabled: bool) -> String {
    let symbol = args["symbol"].as_str().unwrap_or("").trim().to_string();
    if symbol.is_empty() {
        return "오류: symbol 파라미터 필요".to_string();
    }
    let status_lines = scip_backend_status_lines(cwd);
    let fallback = run_find_callers_tool(args, cwd);
    if !scip_enabled {
        return format!(
            "`{symbol}` 정밀 caller 분석은 비활성입니다. 정확 모드 토글 활성화 후 재요청하세요.\n{fallback}\n{status_lines}"
        );
    }

    let backends = crate::commands::scip::detect_scip_backends(Some(cwd.to_string()));
    let available_count = backends.iter().filter(|b| b.available).count();
    let indexed_count = backends
        .iter()
        .filter(|backend| backend.available && backend.index_exists)
        .count();
    if available_count == 0 {
        return format!(
            "`{symbol}` 정밀 caller 분석은 SCIP index 기반 조회가 불가합니다. tree-sitter fallback으로 반환합니다.\n{fallback}\n[SCIP] {status_lines}"
        );
    }

    let result = crate::commands::scip::query_scip_callers(cwd, &symbol);
    if result.is_empty() {
        return format!(
            "`{symbol}` 정밀 caller 분석 결과가 없습니다. tree-sitter fallback으로 제공합니다.\n{fallback}\n{status_lines}"
        );
    }

    let status = if indexed_count == 0 {
        "SCIP 준비 중(index.scip 미생성). 현재는 fallback만 사용 가능합니다."
    } else {
        "SCIP 정밀 caller 조회 완료"
    };
    let index_status = format!("{status}\n{status_lines}");

    let mut lines = vec![format!("`{symbol}` 정밀 caller 후보:")];
    for item in result {
        if let Some(line) = item.line {
            if let Some(col) = item.column {
                lines.push(format!("- {} ({}:{line}:{col})", item.symbol, item.file));
            } else {
                lines.push(format!("- {} ({})", item.symbol, item.file));
            }
        } else {
            lines.push(format!("- {} ({})", item.symbol, item.file));
        }
    }
    lines.push(format!(
        "[SCIP] {} ({}건)",
        index_status,
        lines.len().saturating_sub(1)
    ));
    lines.join("\n")
}

fn scip_backend_status_lines(cwd: &str) -> String {
    let backends = crate::commands::scip::detect_scip_backends(Some(cwd.to_string()));
    let lines: Vec<String> = backends
        .into_iter()
        .map(|backend| {
            let installed = if backend.available {
                "설치됨"
            } else {
                "미설치"
            };
            let ready = if backend.index_exists {
                "index.scip 있음"
            } else {
                "index.scip 없음"
            };
            format!(
                " - {installed} / {ready} / {}({}) ({})",
                backend.language, backend.binary, backend.index_path
            )
        })
        .collect();

    if lines.is_empty() {
        "[SCIP] 백엔드 상태 정보 없음".to_string()
    } else {
        format!("[SCIP] 백엔드 상태:\n{}", lines.join("\n"))
    }
}

fn run_scip_status_tool(cwd: &str) -> String {
    let status = crate::commands::scip::scip_status(Some(cwd.to_string()));
    let mut lines = vec![format!(
        "SCIP 정밀 도구: {}",
        if status.enabled {
            "활성"
        } else {
            "비활성"
        }
    )];

    if status.backends.is_empty() {
        lines.push("백엔드 상태 정보 없음".to_string());
    } else {
        for backend in status.backends {
            let installed = if backend.available {
                "설치됨"
            } else {
                "미설치"
            };
            let ready = if backend.index_exists {
                "index.scip 있음"
            } else {
                "index.scip 없음"
            };
            lines.push(format!(
                "- {installed} / {ready} / {}/{} ({})",
                backend.language, backend.binary, backend.index_path
            ));
        }
    }

    lines.join("\n")
}

fn run_precise_definition_tool(args: &serde_json::Value, cwd: &str, scip_enabled: bool) -> String {
    let symbol = args["symbol"].as_str().unwrap_or("").trim().to_string();
    if symbol.is_empty() {
        return "오류: symbol 파라미터 필요".to_string();
    }
    let graph = crate::commands::call_graph::CallGraph::build(std::path::Path::new(cwd));
    let definitions = graph.fn_defs.get(&symbol).cloned().unwrap_or_default();
    let mut fallback = format!("`{symbol}`의 정의를 tree-sitter에서 찾지 못했습니다.");
    if !definitions.is_empty() {
        let fallback_lines: Vec<String> = definitions
            .iter()
            .map(|file| format!("  - {} ({file})", symbol))
            .collect();
        fallback = format!(
            "`{symbol}` 정의 후보(tree-sitter):\n{}\n",
            fallback_lines.join("\n")
        );
    }

    if !scip_enabled {
        let status = scip_backend_status_lines(cwd);
        return format!(
            "`{symbol}` 정밀 definition 분석은 비활성입니다. 정확 모드 토글 활성화 후 재요청하세요.\n{status}\n{fallback}"
        );
    }

    let status_lines = scip_backend_status_lines(cwd);
    let backends_for_status = crate::commands::scip::detect_scip_backends(Some(cwd.to_string()));
    let available_count = backends_for_status
        .iter()
        .filter(|backend| backend.available)
        .count();
    let indexed_count = backends_for_status
        .iter()
        .filter(|backend| backend.available && backend.index_exists)
        .count();
    let index_status = if available_count == 0 {
        "SCIP 설치가 감지되지 않아 tree-sitter fallback 결과입니다."
    } else if indexed_count == 0 {
        "SCIP 백엔드는 있으나 index.scip가 없어 tree-sitter fallback 결과입니다."
    } else {
        "SCIP 정밀 정의 조회 완료"
    };

    let result = crate::commands::scip::query_scip_symbol_definitions(cwd, &symbol);
    if result.is_empty() {
        let msg = format!(
            "`{symbol}`의 정의를 찾지 못했습니다. 파일 인덱스 미완성/동명이인일 수 있습니다."
        );
        return format!("{msg}\n[SCIP] {index_status}\n{fallback}\n{status_lines}");
    }

    let mut lines: Vec<String> = Vec::new();
    for item in result {
        if let Some(line) = item.line {
            if let Some(col) = item.column {
                lines.push(format!("  - {} ({}:{line}:{col})", item.symbol, item.file));
            } else {
                lines.push(format!("  - {} ({})", item.symbol, item.file));
            }
        } else {
            lines.push(format!("  - {} ({})", item.symbol, item.file));
        }
    }
    if lines.is_empty() {
        return format!(
            "`{symbol}` 정밀 정의 조회에 결과가 없습니다. tree-sitter fallback 결과를 사용합니다.\n{fallback}\n[SCIP] {index_status}\n{status_lines}"
        );
    }
    format!(
        "`{symbol}` 정밀 정의 후보:\n{}\n[SCIP] {index_status}\n{status_lines}",
        lines.join("\n")
    )
}

async fn run_query_healing_tool(args: &serde_json::Value) -> String {
    let query = args["query"].as_str().unwrap_or("").trim().to_string();
    if query.is_empty() {
        return "오류: query_healing은 query 파라미터가 필요합니다".to_string();
    }
    let limit = args["limit"]
        .as_u64()
        .and_then(|v| usize::try_from(v).ok())
        .unwrap_or(5)
        .clamp(1, 20);
    let since_days = args["since_days"].as_u64();
    let since_ms = since_days.map(|d| now_ms().saturating_sub(d.saturating_mul(86_400_000)));

    match recall_search_healing(query.clone(), since_ms, limit).await {
        Ok(entries) => {
            if entries.is_empty() {
                return format!("healing 검색 결과가 없습니다: \"{query}\"");
            }
            let mut out = Vec::new();
            out.push(format!(
                "healing 검색 결과 {}건 (query=\"{}\")",
                entries.len(),
                query
            ));
            for (idx, e) in entries.iter().enumerate() {
                let decision = e
                    .metadata
                    .get("decision")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let reason = e
                    .metadata
                    .get("failure_reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                out.push(format!(
                    "{}. [{}] score={:.3} ts_ms={}",
                    idx + 1,
                    decision,
                    e.score,
                    e.ts_ms
                ));
                out.push(format!("   - {}", e.title));
                if !reason.trim().is_empty() {
                    out.push(format!("   - 거부 사유: {}", reason.trim()));
                }
            }
            truncate(&out.join("\n"))
        }
        Err(e) => format!("healing 검색 실패: {e}"),
    }
}

fn run_analyze_failure_reasons_tool(args: &serde_json::Value) -> String {
    let since_days = args["since_days"].as_u64().unwrap_or(30);
    let limit = args["limit"]
        .as_u64()
        .and_then(|v| usize::try_from(v).ok())
        .unwrap_or(5)
        .clamp(1, 20);
    let cutoff_ms = if since_days == 0 {
        None
    } else {
        Some(now_ms().saturating_sub(since_days.saturating_mul(86_400_000)))
    };

    let records = match list_healing_records() {
        Ok(v) => v,
        Err(e) => return format!("healing 데이터 로드 실패: {e}"),
    };
    let mut freq: BTreeMap<String, usize> = BTreeMap::new();
    let mut total_reject = 0usize;
    for r in records {
        if r.decision != "reject" {
            continue;
        }
        if let Some(cutoff) = cutoff_ms {
            if r.ts_ms < cutoff {
                continue;
            }
        }
        total_reject += 1;
        let Some(reason) = r.failure_reason else {
            continue;
        };
        let key = reason.trim();
        if key.is_empty() {
            continue;
        }
        *freq.entry(key.to_string()).or_insert(0) += 1;
    }

    if total_reject == 0 {
        return if since_days == 0 {
            "reject 기록이 없습니다.".to_string()
        } else {
            format!("최근 {since_days}일 내 reject 기록이 없습니다.")
        };
    }
    if freq.is_empty() {
        return format!(
            "reject 기록 {total_reject}건은 있으나 failure_reason이 비어 있어 요약할 수 없습니다."
        );
    }

    let mut ranked: Vec<(String, usize)> = freq.into_iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    ranked.truncate(limit);

    let mut lines = Vec::new();
    if since_days == 0 {
        lines.push(format!(
            "reject 사유 빈도 Top {} (전체 기간, reject {}건)",
            ranked.len(),
            total_reject
        ));
    } else {
        lines.push(format!(
            "reject 사유 빈도 Top {} (최근 {}일, reject {}건)",
            ranked.len(),
            since_days,
            total_reject
        ));
    }
    for (idx, (reason, cnt)) in ranked.iter().enumerate() {
        lines.push(format!("{}. {}회 — {}", idx + 1, cnt, reason));
    }
    truncate(&lines.join("\n"))
}

async fn run_shell(cmd: &str, cwd: &str) -> String {
    let mut command = if cfg!(windows) {
        let mut c = TokioCommand::new("cmd");
        c.args(["/C", cmd]).current_dir(cwd);
        c
    } else {
        let mut c = TokioCommand::new("sh");
        c.args(["-c", cmd]).current_dir(cwd);
        c
    };
    match run_command_with_cancel(&mut command).await {
        Ok(output) => {
            if output.cancelled {
                return "셸 실행 취소됨".to_string();
            }
            let combined = format!("{}{}", output.stdout, output.stderr);
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
                    if is_dir {
                        format!("{name}/")
                    } else {
                        name
                    }
                })
                .collect();
            lines.sort();
            lines.join("\n")
        }
        Err(e) => format!("디렉토리 읽기 실패: {e}"),
    }
}

async fn run_git_diff(cwd: &str) -> String {
    let mut command = TokioCommand::new("git");
    command.args(["diff"]).current_dir(cwd);
    match run_command_with_cancel(&mut command).await {
        Ok(output) => {
            if output.cancelled {
                return "git diff 실행 취소됨".to_string();
            }
            let diff = output.stdout;
            if diff.trim().is_empty() {
                "변경사항 없음".to_string()
            } else {
                truncate(&diff)
            }
        }
        Err(e) => format!("git diff 실패: {e}"),
    }
}

async fn run_tests_tool(cwd: &str) -> String {
    let path = Path::new(cwd);
    let Some(test_cmd) = detect_test_command(path) else {
        return "테스트 커맨드를 감지하지 못했습니다.".to_string();
    };
    let mut command = if cfg!(windows) {
        let mut c = TokioCommand::new("cmd");
        c.args(["/C", &test_cmd.command]).current_dir(cwd);
        c
    } else {
        let mut c = TokioCommand::new("sh");
        c.args(["-c", &test_cmd.command]).current_dir(cwd);
        c
    };
    match run_command_with_cancel(&mut command).await {
        Ok(output) => {
            if output.cancelled {
                return truncate(&format!(
                    "[{}: {}] 실행 취소됨",
                    test_cmd.project_type, test_cmd.command
                ));
            }
            truncate(&format!(
                "[{}: {}] (exit {})\n{}{}",
                test_cmd.project_type,
                test_cmd.command,
                output.exit_code,
                output.stdout,
                output.stderr
            ))
        }
        Err(e) => format!("테스트 실행 실패: {e}"),
    }
}

struct CommandOutput {
    stdout: String,
    stderr: String,
    exit_code: i32,
    cancelled: bool,
}

async fn run_command_with_cancel(command: &mut TokioCommand) -> std::result::Result<CommandOutput, String> {
    use tokio::time::{timeout, Duration};

    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut stream) = stdout {
            let _ = stream.read_to_end(&mut buf).await;
        }
        String::from_utf8_lossy(&buf).to_string()
    });
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        if let Some(mut stream) = stderr {
            let _ = stream.read_to_end(&mut buf).await;
        }
        String::from_utf8_lossy(&buf).to_string()
    });

    let mut cancelled = false;
    let status = loop {
        if cancel_flag().load(Ordering::Relaxed) && !cancelled {
            cancelled = true;
            let _ = child.start_kill();
        }
        match timeout(Duration::from_millis(80), child.wait()).await {
            Ok(Ok(status)) => break status,
            Ok(Err(e)) => return Err(format!("프로세스 대기 실패: {e}")),
            Err(_) => continue,
        }
    };

    let stdout = stdout_task.await.unwrap_or_default();
    let stderr = stderr_task.await.unwrap_or_default();
    let exit_code = status.code().unwrap_or(-1);

    Ok(CommandOutput {
        stdout,
        stderr,
        exit_code,
        cancelled,
    })
}

fn truncate(s: &str) -> String {
    if s.len() <= TOOL_OUTPUT_LIMIT {
        s.to_string()
    } else {
        format!(
            "{}…({}자 생략)",
            &s[..TOOL_OUTPUT_LIMIT],
            s.len() - TOOL_OUTPUT_LIMIT
        )
    }
}

// ─── 쓰기 도구 안전 가드 ─────────────────────────────────────────────────────

/// 활성 백업이 있으면 이미 canonicalize된 cwd 재사용 — 매 write마다 syscall 절약.
/// 백업 미활성(테스트) 시에만 canonicalize 호출.
fn cwd_canonical_for(cwd: &str) -> std::result::Result<PathBuf, String> {
    if let Some(backup) = backup_lock().lock().unwrap().as_ref() {
        if backup.cwd_input == cwd {
            return Ok(backup.cwd.clone());
        }
    }
    std::fs::canonicalize(cwd).map_err(|e| format!("CWD가 유효하지 않습니다: {cwd} ({e})"))
}

/// path traversal 방어 — `..` 정규화 후 cwd 외부면 거부.
/// 신규 파일도 검증 가능하도록 부모 디렉터리만 canonicalize, 파일명은 그대로 결합.
fn validate_safe_path(path: &str, cwd: &str) -> std::result::Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("path가 비어있습니다".to_string());
    }
    let resolved = resolve_path(path, cwd);

    // 부모 디렉터리 canonicalize — 신규 파일이라도 부모가 존재해야 함.
    // 부모 자체도 신규면 LLM이 mkdir부터 시키도록 유도 (단순함 우선).
    let parent = resolved
        .parent()
        .ok_or_else(|| format!("부모 디렉터리를 알 수 없습니다: {}", resolved.display()))?;
    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|e| format!("부모 디렉터리가 없습니다: {} ({e})", parent.display()))?;
    let file_name = resolved
        .file_name()
        .ok_or_else(|| format!("파일명을 알 수 없습니다: {}", resolved.display()))?;
    let abs = canonical_parent.join(file_name);

    let cwd_canonical = cwd_canonical_for(cwd)?;

    if !abs.starts_with(&cwd_canonical) {
        return Err(format!(
            "CWD 외부 경로는 거부됩니다 (cwd={}, target={})",
            cwd_canonical.display(),
            abs.display()
        ));
    }

    // cwd 기준 상대경로의 첫 컴포넌트가 금지 목록에 있으면 거부.
    let rel = abs
        .strip_prefix(&cwd_canonical)
        .map_err(|_| "경로 검증 내부 오류".to_string())?;
    if let Some(first) = rel.components().next() {
        let first_str = first.as_os_str().to_string_lossy();
        if FORBIDDEN_PREFIXES.iter().any(|p| first_str == *p) {
            return Err(format!("금지 경로입니다: {}", first_str));
        }
        // ~/.lum_* 패턴(.lum_ 시작)도 보수적으로 거부 — LLM이 사용자 데이터를 건드리지 못하게.
        if first_str.starts_with(".lum_") {
            return Err(format!("LUM 내부 데이터 경로는 수정 금지: {}", first_str));
        }
    }
    Ok(abs)
}

// ─── 자동 백업 / 되돌리기 ─────────────────────────────────────────────────────
//
// 활성 ReAct run의 모든 쓰기 변경을 ~/.lum_react_backup 디렉터리에 디스크 백업.
// 단순함 우선 — 마지막 1개 run만 보관 (동시 실행은 squad worktree로 격리됨).
// 활성 백업이 없으면 도구는 noop으로 동작 → 단위 테스트 격리 자동 확보.

#[derive(Debug)]
struct ReactBackup {
    /// init 시 받은 원본 문자열 — `validate_safe_path` 캐시 키.
    /// validate가 같은 문자열로 호출되면 canonicalize 재호출 없이 `cwd` 재사용.
    cwd_input: String,
    cwd: PathBuf,
    backup_dir: PathBuf,
    /// abs_path → 첫 변경 직전 상태 마커. 같은 파일 N회 수정해도 첫 백업만 보존.
    entries: HashMap<PathBuf, BackupEntry>,
}

#[derive(Debug, Clone)]
enum BackupEntry {
    /// 변경 전 원본을 backup_dir로 복사함 — restore 시 원래 위치로 다시 복사.
    Original,
    /// run 시작 시점에 없던 파일 — restore 시 단순 삭제.
    Created,
}

static REACT_BACKUP: OnceLock<Mutex<Option<ReactBackup>>> = OnceLock::new();

fn backup_lock() -> &'static Mutex<Option<ReactBackup>> {
    REACT_BACKUP.get_or_init(|| Mutex::new(None))
}

fn react_backup_dir(cwd: &Path) -> Vec<PathBuf> {
    vec![
        platform::home_dir().join(".lum_react_backup"),
        cwd.join(".lum_react_backup"),
        std::env::temp_dir().join(".lum_react_backup"),
    ]
}

fn pick_react_backup_dir(cwd: &Path) -> Option<PathBuf> {
    for dir in react_backup_dir(cwd) {
        let _ = std::fs::remove_dir_all(&dir);
        if std::fs::create_dir_all(&dir).is_ok() && backup_dir_is_writable(&dir) {
            return Some(dir);
        }
    }
    None
}

fn backup_dir_is_writable(dir: &Path) -> bool {
    let probe = dir.join(".write_probe");
    match std::fs::write(&probe, b"ok") {
        Ok(()) => {
            let _ = std::fs::remove_file(probe);
            true
        }
        Err(_) => false,
    }
}

/// 새 ReAct run 시작 시 호출 — 기존 백업 dir 삭제 후 재생성, cwd 정규화 보관.
/// cwd canonicalize 실패 시 백업 미활성으로 fallback (도구는 그대로 작동, undo만 불가).
fn init_react_backup(cwd: &str) {
    let cwd_path = match std::fs::canonicalize(cwd) {
        Ok(p) => p,
        Err(_) => {
            // cwd 자체가 유효하지 않으면 백업 비활성 — 도구도 SafePath에서 막힐 것이므로 안전.
            *backup_lock().lock().unwrap() = None;
            return;
        }
    };
    let Some(backup_dir) = pick_react_backup_dir(&cwd_path) else {
        *backup_lock().lock().unwrap() = None;
        return;
    };
    *backup_lock().lock().unwrap() = Some(ReactBackup {
        cwd_input: cwd.to_string(),
        cwd: cwd_path,
        backup_dir,
        entries: HashMap::new(),
    });
}

/// 쓰기 도구가 abs_path에 변경을 가하기 직전 호출.
/// 활성 백업이 없으면 noop. 같은 파일 두 번째부턴 백업 안 함 (첫 원본만 보존).
fn track_pre_write(abs_path: &Path) -> std::result::Result<(), String> {
    let mut guard = backup_lock().lock().unwrap();
    let Some(backup) = guard.as_mut() else {
        return Ok(());
    };
    if backup.entries.contains_key(abs_path) {
        return Ok(());
    }
    let rel = abs_path
        .strip_prefix(&backup.cwd)
        .map_err(|_| format!("경로 계산 오류: {}", abs_path.display()))?;
    if abs_path.exists() {
        let dst = backup.backup_dir.join(rel);
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("백업 디렉터리 생성 실패: {} ({e})", parent.display()))?;
        }
        std::fs::copy(abs_path, &dst)
            .map_err(|e| format!("백업 복사 실패: {} ({e})", abs_path.display()))?;
        backup
            .entries
            .insert(abs_path.to_path_buf(), BackupEntry::Original);
    } else {
        backup
            .entries
            .insert(abs_path.to_path_buf(), BackupEntry::Created);
    }
    Ok(())
}

#[derive(Serialize, Default, Debug)]
pub struct UndoReport {
    pub restored: Vec<String>,
    pub removed: Vec<String>,
    pub errors: Vec<String>,
}

// ─── 위험도 분류 + 변경 사항 조회 ─────────────────────────────────────────────

/// 변경 위험도 — 프론트가 사후 승인 UI에서 강조 색상 결정에 사용.
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChangeRisk {
    /// 테스트 파일 — 자동 적용 권장.
    Low,
    /// 일반 소스 코드 — 검토 권장.
    Medium,
    /// 빌드/설정/환경 파일 — 신중 검토 필요.
    High,
}

/// 상대 경로(cwd 기준)를 보고 위험도 분류.
/// LLM 환각으로 빌드 설정이 깨지는 사고를 사용자에게 즉시 시각화하는 게 목표.
pub fn classify_change_risk(rel_path: &str) -> ChangeRisk {
    let norm = rel_path.replace('\\', "/").to_lowercase();
    let file_name = std::path::Path::new(&norm)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    // High — 빌드/설정/환경.
    const HIGH_FILENAMES: &[&str] = &[
        "cargo.toml",
        "cargo.lock",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "tauri.conf.json",
        "vite.config.ts",
        "vite.config.js",
        "vitest.config.ts",
        "vitest.config.js",
        "playwright.config.ts",
        "playwright.config.js",
        "tailwind.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        "build.rs",
        "rustfmt.toml",
        "rust-toolchain",
        "rust-toolchain.toml",
        "dockerfile",
        "docker-compose.yml",
        "docker-compose.yaml",
        "makefile",
    ];
    if HIGH_FILENAMES.iter().any(|h| file_name == *h) {
        return ChangeRisk::High;
    }
    if file_name.starts_with(".env") {
        return ChangeRisk::High;
    }
    // 빌드/CI 디렉터리 — 어떤 파일이든 신중.
    // contains는 sub-dir(예: src/scripts/foo) 잡고, prefix는 root 직속(scripts/foo) 잡음.
    const HIGH_DIRS_CONTAINS: &[&str] = &["/scripts/", "/.github/", "/.gitlab/", "/ci/"];
    const HIGH_DIRS_PREFIX: &[&str] = &["scripts/", ".github/", ".gitlab/", "ci/"];
    if HIGH_DIRS_CONTAINS.iter().any(|d| norm.contains(d))
        || HIGH_DIRS_PREFIX.iter().any(|p| norm.starts_with(p))
    {
        return ChangeRisk::High;
    }

    // Low — 테스트 파일/디렉터리.
    const TEST_DIRS: &[&str] = &["/tests/", "/test/", "/__tests__/", "/spec/"];
    if TEST_DIRS.iter().any(|d| norm.contains(d))
        || norm.starts_with("tests/")
        || norm.starts_with("test/")
        || norm.starts_with("e2e/")
        || norm.contains("/e2e/")
    {
        return ChangeRisk::Low;
    }
    // 파일명에 .test./.spec./_test 포함 — 언어별 컨벤션 다양.
    if file_name.contains(".test.")
        || file_name.contains(".spec.")
        || file_name.ends_with("_test.rs")
        || file_name.ends_with("_test.go")
        || file_name.ends_with("_test.py")
        || file_name.starts_with("test_")
    {
        return ChangeRisk::Low;
    }

    // 기본 — 일반 소스.
    ChangeRisk::Medium
}

/// 변경 파일의 종류 — 프론트 표시용.
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Created,
    Modified,
    Deleted,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct ChangeInfo {
    /// 절대 경로 — 프론트 표시·고유 ID 용도.
    pub path: String,
    /// cwd 기준 상대경로 — 위험도 분류 입력. cwd 외부면 절대경로 fallback.
    pub rel_path: String,
    pub kind: ChangeKind,
    pub risk: ChangeRisk,
}

/// 활성 ReAct 백업의 모든 변경 파일 + 위험도 분류 반환.
/// 활성 백업 없으면 빈 벡터 — 프론트가 "되돌리기" 버튼 노출 결정에 사용.
#[command]
pub fn react_agent_changes() -> Vec<ChangeInfo> {
    let guard = backup_lock().lock().unwrap();
    let Some(backup) = guard.as_ref() else {
        return Vec::new();
    };
    backup
        .entries
        .iter()
        .map(|(abs, entry)| {
            let rel_path = abs
                .strip_prefix(&backup.cwd)
                .map(|r| r.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| abs.display().to_string());
            let kind = match entry {
                BackupEntry::Created => ChangeKind::Created,
                BackupEntry::Original => {
                    if abs.exists() {
                        ChangeKind::Modified
                    } else {
                        ChangeKind::Deleted
                    }
                }
            };
            ChangeInfo {
                path: abs.display().to_string(),
                rel_path: rel_path.clone(),
                kind,
                risk: classify_change_risk(&rel_path),
            }
        })
        .collect()
}

/// 활성 백업의 모든 변경을 되돌림. 백업 자체는 한 번 사용 후 폐기.
fn restore_react_backup() -> std::result::Result<UndoReport, String> {
    let mut guard = backup_lock().lock().unwrap();
    let Some(backup) = guard.take() else {
        return Err("되돌릴 변경이 없습니다 (활성 ReAct 백업 없음)".into());
    };
    let mut report = UndoReport::default();
    for (abs, entry) in &backup.entries {
        match entry {
            BackupEntry::Created => match std::fs::remove_file(abs) {
                Ok(()) => report.removed.push(abs.display().to_string()),
                Err(e) => report
                    .errors
                    .push(format!("{}: 삭제 실패 — {e}", abs.display())),
            },
            BackupEntry::Original => {
                let rel = match abs.strip_prefix(&backup.cwd) {
                    Ok(r) => r,
                    Err(_) => {
                        report
                            .errors
                            .push(format!("{}: cwd 경계 외 — 복원 skip", abs.display()));
                        continue;
                    }
                };
                let src = backup.backup_dir.join(rel);
                match std::fs::copy(&src, abs) {
                    Ok(_) => report.restored.push(abs.display().to_string()),
                    Err(e) => report
                        .errors
                        .push(format!("{}: 복원 실패 — {e}", abs.display())),
                }
            }
        }
    }
    let _ = std::fs::remove_dir_all(&backup.backup_dir);
    Ok(report)
}

/// 활성 백업의 변경 파일 목록 — 테스트 검증용. 외부 노출은 `react_agent_changes` 사용.
#[cfg(test)]
fn list_tracked_changes() -> Vec<String> {
    let guard = backup_lock().lock().unwrap();
    guard
        .as_ref()
        .map(|b| b.entries.keys().map(|p| p.display().to_string()).collect())
        .unwrap_or_default()
}

fn write_file_tool(args: &serde_json::Value, cwd: &str) -> String {
    let path = args["path"].as_str().unwrap_or("").to_string();
    if path.is_empty() {
        return "오류: path 파라미터 누락".to_string();
    }
    let content = args["content"].as_str().unwrap_or("").to_string();
    let overwrite = args["overwrite"].as_bool().unwrap_or(false);

    let abs = match validate_safe_path(&path, cwd) {
        Ok(p) => p,
        Err(e) => return format!("오류: {e}"),
    };

    if abs.exists() && !overwrite {
        return format!(
            "오류: 파일이 이미 존재합니다 ({}). 덮어쓰려면 overwrite=true 또는 apply_patch 사용",
            abs.display()
        );
    }

    if let Err(e) = track_pre_write(&abs) {
        return format!("백업 준비 실패: {e}");
    }
    match std::fs::write(&abs, &content) {
        Ok(()) => format!("쓰기 성공: {} ({} bytes)", abs.display(), content.len()),
        Err(e) => format!("쓰기 실패: {e}"),
    }
}

fn apply_patch_tool(args: &serde_json::Value, cwd: &str) -> String {
    let path = args["path"].as_str().unwrap_or("").to_string();
    let search = args["search"].as_str().unwrap_or("").to_string();
    let replace = args["replace"].as_str().unwrap_or("").to_string();
    if path.is_empty() {
        return "오류: path 파라미터 누락".to_string();
    }
    if search.is_empty() {
        return "오류: search 파라미터가 비어있으면 안 됩니다 (전체 덮어쓰기는 write_file 사용)"
            .to_string();
    }
    if search == replace {
        return "오류: search와 replace가 동일합니다 — 변경사항 없음".to_string();
    }

    let abs = match validate_safe_path(&path, cwd) {
        Ok(p) => p,
        Err(e) => return format!("오류: {e}"),
    };

    let content = match std::fs::read_to_string(&abs) {
        Ok(c) => c,
        Err(e) => return format!("파일 읽기 실패: {e}"),
    };

    // 단일 walk — 첫 두 매칭 위치만 보면 충분 (0/1/2+ 분기에 동일).
    // 큰 파일에서 matches().count()+replacen()의 두 번 walk를 한 번으로 줄임.
    let mut indices = content.match_indices(&search);
    let Some((start, _)) = indices.next() else {
        return format!(
            "오류: search 문자열을 찾지 못했습니다 (path={}). 더 정확한 컨텍스트로 다시 시도하세요.",
            abs.display()
        );
    };
    if indices.next().is_some() {
        // 2건+ 매칭 — 정확한 카운트는 비싸니 보고 안 함.
        return format!(
            "오류: search 문자열이 2회 이상 매칭됩니다. 모호성 방지를 위해 거부 — 앞뒤 컨텍스트를 더 포함시켜 1회만 매칭되게 하세요.",
        );
    }

    // 정확히 1회 매칭 — 직접 splice로 새 content 구성.
    let mut new_content = String::with_capacity(content.len() - search.len() + replace.len());
    new_content.push_str(&content[..start]);
    new_content.push_str(&replace);
    new_content.push_str(&content[start + search.len()..]);

    if let Err(e) = track_pre_write(&abs) {
        return format!("백업 준비 실패: {e}");
    }
    match std::fs::write(&abs, &new_content) {
        Ok(()) => format!(
            "패치 적용 성공: {} (-{} +{} bytes)",
            abs.display(),
            search.len(),
            replace.len()
        ),
        Err(e) => format!("패치 쓰기 실패: {e}"),
    }
}

fn delete_file_tool(args: &serde_json::Value, cwd: &str) -> String {
    let path = args["path"].as_str().unwrap_or("").to_string();
    if path.is_empty() {
        return "오류: path 파라미터 누락".to_string();
    }
    let abs = match validate_safe_path(&path, cwd) {
        Ok(p) => p,
        Err(e) => return format!("오류: {e}"),
    };
    if !abs.exists() {
        return format!("오류: 파일이 존재하지 않습니다 ({})", abs.display());
    }
    if abs.is_dir() {
        return format!("오류: 디렉터리는 삭제 불가 ({})", abs.display());
    }
    if let Err(e) = track_pre_write(&abs) {
        return format!("백업 준비 실패: {e}");
    }
    match std::fs::remove_file(&abs) {
        Ok(()) => format!("삭제 성공: {}", abs.display()),
        Err(e) => format!("삭제 실패: {e}"),
    }
}

// ─── 메인 ReAct 루프 ─────────────────────────────────────────────────────────

#[command]
pub async fn react_agent_run(
    app: AppHandle,
    goal: String,
    cwd: String,
    mode: Option<String>,
    backend: Option<String>,
    model: Option<String>,
    tool_whitelist: Option<Vec<String>>,
    apply_config_whitelist: Option<bool>,
    plan_id: Option<String>,
) -> Result<()> {
    cancel_flag().store(false, Ordering::Relaxed);
    let react_mode = parse_mode(mode);

    // CWD 폴백 — 빈 문자열이면 현재 프로세스 작업 디렉토리 사용
    let effective_cwd = if cwd.is_empty() {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "C:\\".to_string())
    } else {
        cwd.clone()
    };

    // run 시작 직전 백업 dir 초기화. 실패해도 도구는 정상 작동(undo만 불가).
    init_react_backup(&effective_cwd);

    let mode_label = if react_mode == ReactMode::Plan {
        "plan"
    } else {
        "act"
    };
    let forced_backend = backend
        .as_deref()
        .map(|b| b.trim().to_lowercase())
        .filter(|b| !b.is_empty());
    let loaded_config = crate::commands::config::load_config().ok();
    let effective_model = model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            loaded_config
                .as_ref()
                .and_then(|c| c.coding_model.clone().or(c.doc_model.clone()))
        })
        .unwrap_or_else(|| "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw".to_string());
    emit_event(
        &app,
        "status",
        format!("목표: {goal} (mode={mode_label})"),
        None,
        Some(0),
    );
    if let Some(backend) = forced_backend.as_deref() {
        emit_event(
            &app,
            "status",
            format!("backend 강제: {backend}"),
            None,
            Some(0),
        );
    }
    if let Some(pid) = plan_id.as_deref().filter(|s| !s.trim().is_empty()) {
        emit_event(&app, "status", format!("plan_id={pid}"), None, Some(0));
    }

    let review_mode = is_review_goal(&goal);
    let mcp_prompt_enabled = should_expose_mcp_tools_in_prompt(react_mode, review_mode);
    // Phase 121: 활성 MCP 서버의 도구를 동적으로 시스템 프롬프트에 주입(Act + non-review에서만).
    let mcp_tools = if mcp_prompt_enabled {
        let mcp_state: tauri::State<'_, crate::mcp::McpState> = app.state();
        let tools = enumerate_mcp_tools(&mcp_state).await;
        if !tools.is_empty() {
            emit_event(
                &app,
                "status",
                format!("MCP 도구 {}개 로드", tools.len()),
                None,
                Some(0),
            );
        }
        tools
    } else {
        Vec::new()
    };
    // Phase 127: 자연어 goal과 매칭된 사용자 저장 Skill을 시스템 프롬프트에 주입.
    let skills = crate::commands::skills::find_relevant_skills(&goal, 3).await;
    if !skills.is_empty() {
        emit_event(
            &app,
            "status",
            format!("Skill {}개 매칭", skills.len()),
            None,
            Some(0),
        );
    }
    // 사용자 명시 opt-in 토글. 기본 false — 활성화 전에는 ReAct가 화면/입력 제어 불가.
    let desktop_tools_enabled = loaded_config
        .as_ref()
        .and_then(|c| c.react_desktop_tools_enabled)
        .unwrap_or(false);
    let mut conversation = format!(
        "{}\n\n목표: {goal}\n\nCWD: {effective_cwd}",
        build_system_prompt(
            &mcp_tools,
            &skills,
            should_expose_execution_tools_in_prompt(react_mode, review_mode),
            should_expose_write_tools_in_prompt(react_mode, review_mode),
            should_expose_desktop_tools_in_prompt(react_mode, review_mode, desktop_tools_enabled),
            mcp_prompt_enabled,
        )
    );
    if review_mode {
        conversation.push_str("\n\n");
        conversation.push_str(REVIEW_MODE_PROMPT);
        emit_event(
            &app,
            "status",
            "리뷰 모드 — 읽기 전용 분석 도구만 사용",
            None,
            Some(0),
        );
    }
    let scip_tools_enabled = loaded_config
        .as_ref()
        .and_then(|c| c.react_scip_tools_enabled)
        .unwrap_or(false);
    let config_tool_whitelist = loaded_config
        .as_ref()
        .and_then(|c| c.react_tool_whitelist.clone());
    let use_config_whitelist = should_apply_config_whitelist(apply_config_whitelist);
    let effective_whitelist = match tool_whitelist {
        Some(v) => Some(v),
        None if use_config_whitelist => config_tool_whitelist,
        None => None,
    };
    let whitelist_set = normalize_tool_whitelist(effective_whitelist);
    if react_mode == ReactMode::Act {
        if let Some(set) = whitelist_set.as_ref() {
            emit_event(
                &app,
                "status",
                format!("Act whitelist {}개 적용", set.len()),
                None,
                Some(0),
            );
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    // Phase 133: Reflexion 1턴 자기검토. 기본 true(설정 미존재 시).
    let reflexion_enabled = loaded_config
        .as_ref()
        .and_then(|c| c.react_reflexion_enabled)
        .unwrap_or(true);

    let mut ledger = ProgressLedger::new();
    let mut outer_replan_count = 0usize;
    let mut step = 0usize;
    let mut max_steps = MAX_STEPS;
    let mut extra_turn_granted = false;

    // 복잡한 목표는 사전 계획 생성 → 컨텍스트 주입 (LLM 한 번 선행)
    if is_complex_goal(&goal) {
        emit_event(
            &app,
            "status",
            "복잡한 목표 — 작업 계획 생성 중",
            None,
            None,
        );
        if let Some(plan_result) = await_with_cancel(generate_task_plan(
            &app,
            &client,
            &goal,
            forced_backend.as_deref(),
            &effective_model,
        ))
        .await
        {
            if let Ok(plan_resp) = plan_result {
                let steps_list = parse_task_plan(&plan_resp);
                if !steps_list.is_empty() {
                    let plan_str = format_plan(&steps_list);
                    conversation.push_str(&format!(
                        "\n\n[작업 계획 — 이 순서로 실행하세요]\n{plan_str}"
                    ));
                    emit_event(
                        &app,
                        "status",
                        format!("작업 계획 생성됨 ({}단계)", steps_list.len()),
                        None,
                        None,
                    );
                }
            }
        } else {
            emit_event(&app, "status", "취소됨", None, Some(step));
            return Ok(());
        }
    }

    'main: loop {
        while step < max_steps {
            if cancel_flag().load(Ordering::Relaxed) {
                emit_event(&app, "status", "취소됨", None, Some(step));
                return Ok(());
            }

            emit_event(
                &app,
                "status",
                format!("단계 {} / {}", step + 1, max_steps),
                None,
                Some(step + 1),
            );

            // 로컬 전용 — embedded GGUF 우선, 미로드면 xLLM HTTP (127.0.0.1:8080)
            let response = match await_with_cancel(call_ai_with_backend(
                Some(&app),
                &client,
                &effective_model,
                &conversation,
                forced_backend.as_deref(),
            ))
            .await
            {
                None => {
                    emit_event(&app, "status", "취소됨", None, Some(step));
                    return Ok(());
                }
                Some(Ok(r)) => r,
                Some(Err(e)) => {
                    emit_event(&app, "error", format!("LLM 오류: {e}"), None, None);
                    return Err(e);
                }
            };

            // THOUGHT 추출 → emit
            let thought = parse_thought(&response);
            if !thought.is_empty() {
                emit_event(&app, "thought", &thought, None, Some(step + 1));
            }

            // ANSWER 확인 — 완료 직전 reflexion 1회.
            if let Some(answer) = parse_answer(&response) {
                if reflexion_enabled {
                    let reflect_opt = run_reflexion(
                        &app,
                        &client,
                        &conversation,
                        &goal,
                        Some(&answer),
                        forced_backend.as_deref(),
                        &effective_model,
                    )
                    .await;
                    if cancel_flag().load(Ordering::Relaxed) {
                        emit_event(&app, "status", "취소됨", None, Some(step));
                        return Ok(());
                    }
                    if let Some(reflect) = reflect_opt {
                        emit_event(
                            &app,
                            "status",
                            format!("Reflexion: {}", reflect),
                            None,
                            Some(step + 1),
                        );
                        if reflexion_needs_retry(&reflect) && !extra_turn_granted {
                            extra_turn_granted = true;
                            max_steps = MAX_STEPS + 1;
                            conversation.push_str(&format!(
                                "\n\n{response}\n\nREFLECTION: {reflect}\n\n[시스템]: 반성 결과를 반영해 필요하면 추가 도구 실행 후 최종 ANSWER를 다시 출력하세요."
                            ));
                            emit_event(
                                &app,
                                "status",
                                "Reflexion 결과로 추가 1턴 허용",
                                None,
                                Some(step + 1),
                            );
                            step += 1;
                            continue;
                        }
                    }
                }
                emit_event(&app, "answer", &answer, None, Some(step + 1));
                return Ok(());
            }

            // ACTION 파싱 → 도구 실행
            let Some(action) = parse_action(&response) else {
                // 파싱 실패 — 응답 전체를 ANSWER로 취급(반성 1회 후 종료 가능)
                let candidate = response.trim();
                if reflexion_enabled {
                    let reflect_opt = run_reflexion(
                        &app,
                        &client,
                        &conversation,
                        &goal,
                        Some(candidate),
                        forced_backend.as_deref(),
                        &effective_model,
                    )
                    .await;
                    if cancel_flag().load(Ordering::Relaxed) {
                        emit_event(&app, "status", "취소됨", None, Some(step));
                        return Ok(());
                    }
                    if let Some(reflect) = reflect_opt {
                        emit_event(
                            &app,
                            "status",
                            format!("Reflexion: {}", reflect),
                            None,
                            Some(step + 1),
                        );
                        if reflexion_needs_retry(&reflect) && !extra_turn_granted {
                            extra_turn_granted = true;
                            max_steps = MAX_STEPS + 1;
                            conversation.push_str(&format!(
                                "\n\n{response}\n\nREFLECTION: {reflect}\n\n[시스템]: 반성 결과를 반영해 최종 ANSWER를 다시 출력하세요."
                            ));
                            emit_event(
                                &app,
                                "status",
                                "Reflexion 결과로 추가 1턴 허용",
                                None,
                                Some(step + 1),
                            );
                            step += 1;
                            continue;
                        }
                    }
                }
                emit_event(&app, "answer", candidate, None, Some(step + 1));
                return Ok(());
            };

            let action_key = format!("{}:{}", action.tool, action.args);
            let repeat_count = ledger.record(&action_key);

            if repeat_count >= 2 {
                ledger.stuck_total += 1;
                emit_event(
                    &app,
                    "status",
                    format!(
                        "반복 감지 ({}회): {}",
                        ledger.stuck_total,
                        &action_key[..action_key.len().min(60)]
                    ),
                    None,
                    Some(step + 1),
                );

                if ledger.stuck_total >= 3 {
                    if outer_replan_count < 2 {
                        emit_event(
                            &app,
                            "status",
                            "막힘 감지 — 재계획 생성 중",
                            None,
                            Some(step + 1),
                        );
                        if let Some(plan_result) = await_with_cancel(generate_task_plan(
                            &app,
                            &client,
                            &goal,
                            forced_backend.as_deref(),
                            &effective_model,
                        ))
                        .await
                        {
                            if let Ok(plan_resp) = plan_result {
                                let new_steps = parse_task_plan(&plan_resp);
                                if !new_steps.is_empty() {
                                    outer_replan_count += 1;
                                    ledger.stuck_total = 0;
                                    let plan_str = format_plan(&new_steps);
                                    conversation.push_str(&format!(
                                        "\n\n{response}\n\nOBSERVATION: ⚠ 반복 패턴 감지. \
                                         재계획으로 재시도하세요 (outer 재계획 {outer_replan_count}/2):\n{plan_str}"
                                    ));
                                    step += 1;
                                    continue;
                                }
                            }
                        } else {
                            emit_event(&app, "status", "취소됨", None, Some(step));
                            return Ok(());
                        }
                    }
                    // 재계획 실패 또는 횟수 초과 → 강제 최종 답변
                    let force_prompt = format!(
                        "{conversation}\n\n{response}\n\n[시스템]: {}\n즉시 ANSWER를 출력하세요.",
                        ledger.recovery_l2()
                    );
                    match await_with_cancel(call_ai_with_backend(
                        Some(&app),
                        &client,
                        &effective_model,
                        &force_prompt,
                        forced_backend.as_deref(),
                    ))
                    .await
                    {
                        None => emit_event(&app, "status", "취소됨", None, Some(step)),
                        Some(Ok(final_resp)) => {
                            let answer = parse_answer(&final_resp)
                                .unwrap_or_else(|| final_resp.trim().to_string());
                            emit_event(&app, "answer", &answer, None, Some(step + 1));
                        }
                        Some(Err(e)) => emit_event(
                            &app,
                            "error",
                            format!("LLM 오류(강제 답변): {e}"),
                            None,
                            Some(step + 1),
                        ),
                    }
                    return Ok(());
                }

                // L1: 회복 힌트 주입 후 계속 (다른 접근 유도)
                let recovery = ledger.recovery_l1(&action_key);
                conversation.push_str(&format!("\n\n{response}\n\nOBSERVATION: {recovery}"));
                step += 1;
                continue;
            }

            // ACTION 이벤트 emit
            let action_desc = format!("{}({})", action.tool, action.args);
            emit_event(
                &app,
                "action",
                &action_desc,
                Some(&action.tool),
                Some(step + 1),
            );

            // 도구 실행
            let observation = run_tool(
                &app,
                &action.tool,
                &action.args,
                &effective_cwd,
                desktop_tools_enabled,
                review_mode,
                scip_tools_enabled,
                react_mode,
                whitelist_set.as_ref(),
            )
            .await;
            emit_event(&app, "observation", &observation, None, Some(step + 1));
            if cancel_flag().load(Ordering::Relaxed) {
                emit_event(&app, "status", "취소됨", None, Some(step));
                return Ok(());
            }
            ledger.absorb_observation(&action.tool, &observation);

            // 대화 히스토리 업데이트 (최근 6턴만 유지해 컨텍스트 폭발 방지)
            let turn = format!("\n\n{response}\n\nOBSERVATION: {observation}");
            conversation.push_str(&turn);

            // 시스템 프롬프트 + 목표 제외 이전 턴이 6개 초과 시 앞부분 제거
            let turns: Vec<&str> = conversation.split("\n\nTHOUGHT:").collect();
            if turns.len() > 7 {
                let kept = turns[turns.len() - 6..].join("\n\nTHOUGHT:");
                conversation = format!("{}\n\nTHOUGHT:{}", turns[0], kept);
            }
            step += 1;
        }

        // 최대 단계 초과 — reflexion에서 위험 감지되면 딱 1턴 추가 허용.
        if reflexion_enabled && !extra_turn_granted {
            let reflect_opt = run_reflexion(
                &app,
                &client,
                &conversation,
                &goal,
                None,
                forced_backend.as_deref(),
                &effective_model,
            )
            .await;
            if cancel_flag().load(Ordering::Relaxed) {
                emit_event(&app, "status", "취소됨", None, Some(step));
                return Ok(());
            }
            if let Some(reflect) = reflect_opt {
                emit_event(
                    &app,
                    "status",
                    format!("Reflexion: {}", reflect),
                    None,
                    Some(step),
                );
                if reflexion_needs_retry(&reflect) {
                    extra_turn_granted = true;
                    max_steps = MAX_STEPS + 1;
                    conversation.push_str(&format!(
                        "\n\nREFLECTION: {reflect}\n\n[시스템]: 목표 미달/회귀 위험 지적이 있습니다. 한 턴만 더 실행해 개선하세요."
                    ));
                    emit_event(
                        &app,
                        "status",
                        "Reflexion 결과로 추가 1턴 허용",
                        None,
                        Some(step),
                    );
                    continue 'main;
                }
            }
        }

        emit_event(
            &app,
            "answer",
            "최대 단계에 도달했습니다. 현재까지의 정보를 바탕으로 결론을 내립니다.",
            None,
            Some(step),
        );
        return Ok(());
    }
}

#[command]
pub fn react_agent_cancel() {
    cancel_flag().store(true, Ordering::Relaxed);
}

/// 마지막 ReAct run의 모든 쓰기 변경을 일괄 되돌림.
/// 활성 백업이 없으면 Err. 한 번 호출하면 백업이 폐기되므로 재호출 시 noop(Err).
#[command]
pub fn react_agent_undo() -> std::result::Result<UndoReport, String> {
    restore_react_backup()
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    static CANCEL_FLAG_TEST_LOCK: Mutex<()> = Mutex::new(());

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
        assert_eq!(
            parse_answer(text).as_deref(),
            Some("총 5개의 파일이 있습니다.")
        );
    }

    #[test]
    fn parse_answer_없으면_none() {
        let text = "THOUGHT: 계속\nACTION: shell({\"cmd\": \"ls\"})";
        assert!(parse_answer(text).is_none());
    }

    #[test]
    fn reflexion_retry_판정() {
        assert!(reflexion_needs_retry("fail: 목표 미달"));
        assert!(reflexion_needs_retry("risk_high: 회귀 위험 높음"));
        assert!(reflexion_needs_retry("high risk detected"));
        assert!(!reflexion_needs_retry("ok: 문제 없음"));
    }

    #[test]
    fn phase129_plan_mode_차단_도구() {
        assert!(is_plan_blocked_tool(ReactMode::Plan, "shell"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "run_tests"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "write_file"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "apply_patch"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "delete_file"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "mcp"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "screenshot"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "mouse"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "click"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "type"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "key_combo"));
        assert!(is_plan_blocked_tool(ReactMode::Plan, "scroll"));
        assert!(!is_plan_blocked_tool(ReactMode::Plan, "read_file"));
        assert!(!is_plan_blocked_tool(ReactMode::Act, "shell"));
    }

    #[test]
    fn review_mode_차단_도구() {
        assert!(is_review_blocked_tool(true, "shell"));
        assert!(is_review_blocked_tool(true, "run_tests"));
        assert!(is_review_blocked_tool(true, "write_file"));
        assert!(is_review_blocked_tool(true, "apply_patch"));
        assert!(is_review_blocked_tool(true, "delete_file"));
        assert!(is_review_blocked_tool(true, "mcp"));
        assert!(is_review_blocked_tool(true, "screenshot"));
        assert!(is_review_blocked_tool(true, "mouse"));
        assert!(is_review_blocked_tool(true, "click"));
        assert!(is_review_blocked_tool(true, "type"));
        assert!(is_review_blocked_tool(true, "key_combo"));
        assert!(is_review_blocked_tool(true, "scroll"));
        assert!(!is_review_blocked_tool(true, "read_file"));
        assert!(!is_review_blocked_tool(true, "list_dir"));
        assert!(!is_review_blocked_tool(true, "git_diff"));
        assert!(!is_review_blocked_tool(false, "shell"));
    }

    #[test]
    fn review_mode_차단_문구는_권한오류_아님을_명시() {
        let msg = review_mode_block_message("run_tests");
        assert!(msg.contains("리뷰 모드 정책 차단"), "{msg}");
        assert!(msg.contains("권한 오류 아님"), "{msg}");
        assert!(msg.contains("읽기 전용"), "{msg}");
    }

    #[test]
    fn 도구_취소_문구_일관성() {
        assert_eq!(tool_cancel_message("mcp"), "mcp 실행 취소됨");
        assert_eq!(tool_cancel_message("query_graph"), "query_graph 실행 취소됨");
    }

    #[test]
    fn phase129_whitelist_적용() {
        let mut wl = HashSet::new();
        wl.insert("read_file".to_string());
        wl.insert("list_dir".to_string());
        assert!(is_whitelisted_in_act(
            ReactMode::Act,
            "read_file",
            Some(&wl)
        ));
        assert!(!is_whitelisted_in_act(ReactMode::Act, "shell", Some(&wl)));
        assert!(is_whitelisted_in_act(ReactMode::Plan, "shell", Some(&wl)));
        assert!(is_whitelisted_in_act(ReactMode::Act, "shell", None));
    }

    #[test]
    fn phase129_whitelist_정규화() {
        let wl = normalize_tool_whitelist(Some(vec![
            " Read_File ".into(),
            "LIST_DIR".into(),
            "   ".into(),
        ]))
        .unwrap();
        assert!(is_whitelisted_in_act(
            ReactMode::Act,
            "read_file",
            Some(&wl)
        ));
        assert!(is_whitelisted_in_act(
            ReactMode::Act,
            "list_dir",
            Some(&wl)
        ));
        assert!(!is_whitelisted_in_act(ReactMode::Act, "shell", Some(&wl)));
    }

    #[test]
    fn phase129_whitelist_빈목록은_미적용() {
        assert!(normalize_tool_whitelist(None).is_none());
        assert!(normalize_tool_whitelist(Some(vec![])).is_none());
        assert!(normalize_tool_whitelist(Some(vec!["  ".into()])).is_none());
    }

    #[test]
    fn config_whitelist_기본값은_미적용() {
        assert!(!should_apply_config_whitelist(None));
        assert!(!should_apply_config_whitelist(Some(false)));
        assert!(should_apply_config_whitelist(Some(true)));
    }

    #[tokio::test]
    async fn await_with_cancel_이미_취소면_none() {
        let _g = CANCEL_FLAG_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        cancel_flag().store(true, Ordering::Relaxed);
        let out = await_with_cancel(async { 42usize }).await;
        assert!(out.is_none());
        cancel_flag().store(false, Ordering::Relaxed);
    }

    #[tokio::test]
    async fn await_with_cancel_대기중_취소되면_none() {
        use tokio::time::{sleep, Duration, Instant};
        let _g = CANCEL_FLAG_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        cancel_flag().store(false, Ordering::Relaxed);
        tokio::spawn(async {
            sleep(Duration::from_millis(25)).await;
            cancel_flag().store(true, Ordering::Relaxed);
        });

        let started = Instant::now();
        let out = await_with_cancel(async {
            sleep(Duration::from_millis(400)).await;
            "done"
        })
        .await;
        let elapsed = started.elapsed();
        assert!(out.is_none());
        assert!(elapsed < Duration::from_millis(260), "elapsed={elapsed:?}");
        cancel_flag().store(false, Ordering::Relaxed);
    }

    #[tokio::test]
    async fn run_async_tool_with_cancel_대기중_취소되면_취소문구() {
        use tokio::time::{sleep, Duration};
        let _g = CANCEL_FLAG_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        cancel_flag().store(false, Ordering::Relaxed);
        tokio::spawn(async {
            sleep(Duration::from_millis(25)).await;
            cancel_flag().store(true, Ordering::Relaxed);
        });

        let out = run_async_tool_with_cancel(
            async {
                sleep(Duration::from_millis(400)).await;
                "done".to_string()
            },
            "query_graph",
        )
        .await;
        assert!(out.contains("query_graph 실행 취소됨"), "{out}");
        cancel_flag().store(false, Ordering::Relaxed);
    }

    #[test]
    fn review_goal_감지() {
        assert!(is_review_goal("프로젝트 리뷰 해줘"));
        assert!(is_review_goal("코드 리뷰 해줘"));
        assert!(is_review_goal("review this project"));
        assert!(is_review_goal("code review this repo"));
        assert!(!is_review_goal("로그인 버그 고쳐줘"));
        assert!(!is_review_goal("버그 찾아서 고쳐줘"));
        assert!(!is_review_goal("프로젝트 리뷰 후 수정해줘"));
        assert!(!is_review_goal("find bugs and fix them"));
        assert!(!is_review_goal("find bugs then fix"));
        assert!(!is_review_goal("review this repo and patch issues"));
        assert!(!is_review_goal("review this repo and apply fixes"));
        assert!(!is_review_goal("review the repo and resolve issues"));
        assert!(!is_review_goal("안녕"));
    }

    #[test]
    fn mode별_desktop_prompt_노출_정책() {
        assert!(should_expose_desktop_tools_in_prompt(
            ReactMode::Act,
            false,
            true
        ));
        assert!(!should_expose_desktop_tools_in_prompt(
            ReactMode::Act,
            true,
            true
        ));
        assert!(!should_expose_desktop_tools_in_prompt(
            ReactMode::Plan,
            false,
            true
        ));
        assert!(!should_expose_desktop_tools_in_prompt(
            ReactMode::Act,
            false,
            false
        ));
    }

    #[test]
    fn mode별_mcp_prompt_노출_정책() {
        assert!(should_expose_mcp_tools_in_prompt(ReactMode::Act, false));
        assert!(!should_expose_mcp_tools_in_prompt(ReactMode::Act, true));
        assert!(!should_expose_mcp_tools_in_prompt(ReactMode::Plan, false));
    }

    #[test]
    fn mode별_execution_write_prompt_노출_정책() {
        assert!(should_expose_execution_tools_in_prompt(
            ReactMode::Act,
            false
        ));
        assert!(should_expose_write_tools_in_prompt(ReactMode::Act, false));
        assert!(!should_expose_execution_tools_in_prompt(
            ReactMode::Act,
            true
        ));
        assert!(!should_expose_write_tools_in_prompt(ReactMode::Act, true));
        assert!(!should_expose_execution_tools_in_prompt(
            ReactMode::Plan,
            false
        ));
        assert!(!should_expose_write_tools_in_prompt(ReactMode::Plan, false));
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
        let s = build_system_prompt(&[], &[], true, true, true, true);
        assert!(!s.contains("MCP 도구"));
        assert!(!s.contains("관련 Skill"));
        // 라벨에 의존하지 않고 베이스 도구 자체가 들어가는지로 검사 — 향후 라벨 리네임에 강함.
        assert!(s.contains("shell"));
        assert!(s.contains("read_file"));
        assert!(s.contains("precise_callers"));
        assert!(s.contains("precise_definition"));
        assert!(s.contains("scip_status"));
        assert!(s.contains("ANSWER:"));
    }

    #[test]
    fn build_prompt_includes_desktop_tools() {
        let s = build_system_prompt(&[], &[], true, true, true, true);
        assert!(s.contains("데스크톱 제어 도구"));
        assert!(s.contains("- screenshot({})"));
        assert!(s.contains("- mouse({\"x\": 100, \"y\": 200, \"click\": false})"));
        assert!(s.contains("- click({\"x\": 100, \"y\": 200"));
        assert!(s.contains("- type({\"text\": \"입력할 텍스트\", \"enter\": false})"));
        assert!(s.contains("- scroll({\"x\": 100, \"y\": 200"));
        assert!(s.contains("amount\": -120"));
        assert!(s.contains("- key_combo({\"modifier\": \"cmd\", \"key\": \"k\"})"));
        assert!(s.contains("cmd/command/meta/super/win/windows"));
        assert!(s.contains("cmdorctrl(commandorcontrol/controlorcommand/ctrlorcmd/cmd/ctrl)"));
        assert!(s.contains("key: 1글자 또는 enter/return, space, tab, esc/escape, backspace, delete/del, up/down/left/right"));
        assert!(s.contains("pageup(pgup)/pagedown(pgdn)"));
        assert!(s.contains("설정에서 활성화된 경우에만 동작"));
    }

    #[test]
    fn build_prompt_desktop_disabled_hides_tool_specs() {
        let s = build_system_prompt(&[], &[], true, true, false, true);
        assert!(s.contains("현재 비활성화 상태"));
        assert!(s.contains("도구를 호출하지 마세요"));
        assert!(!s.contains("- screenshot({})"));
        assert!(!s.contains("- mouse({\"x\": 100, \"y\": 200, \"click\": false})"));
        assert!(!s.contains("- key_combo({\"modifier\": \"cmd\", \"key\": \"k\"})"));
    }

    #[test]
    fn build_prompt_execution_write_disabled_hides_tool_specs() {
        let s = build_system_prompt(&[], &[], false, false, false, false);
        assert!(s.contains("현재 모드에서는 shell/run_tests"));
        assert!(s.contains("현재 모드에서는 write_file/apply_patch/delete_file"));
        assert!(!s.contains("- shell({\"cmd\""));
        assert!(!s.contains("- run_tests({\"cwd\""));
        assert!(!s.contains("- write_file({\"path\""));
        assert!(!s.contains("- apply_patch({\"path\""));
        assert!(!s.contains("- delete_file({\"path\""));
        assert!(!s.contains("코딩 워크플로우"));
    }

    #[test]
    fn phase142_scip_status_도구_형식_검증() {
        let out = run_scip_status_tool("/tmp");
        assert!(out.starts_with("SCIP 정밀 도구: "));
        assert!(out.contains("index.scip"));
        if out.contains("백엔드 상태:") {
            assert!(out.contains("scip-rust"));
            assert!(out.contains("scip-typescript"));
            assert!(out.contains("scip-go"));
            assert!(out.contains("미설치") || out.contains("설치됨"));
            assert!(out.contains("index.scip 있음") || out.contains("index.scip 없음"));
        }
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
        let s = build_system_prompt(&tools, &[], true, true, true, true);
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

    #[test]
    fn build_prompt_omits_mcp_listing_when_disabled() {
        let tools = vec![McpToolEntry {
            server: "playwright".into(),
            tool: "screenshot".into(),
            description: "브라우저 스크린샷".into(),
        }];
        let s = build_system_prompt(&tools, &[], true, true, true, false);
        assert!(!s.contains("MCP 도구"));
        assert!(!s.contains("playwright/screenshot"));
        assert!(!s.contains("\"server\""));
    }

    // DesktopToolMock은 글로벌 상태라 병렬 테스트에서 서로 consume race가 생길 수 있음.
    // 데스크톱 도구 테스트는 직렬 lock으로 고정.
    static DESKTOP_TEST_LOCK: Mutex<()> = Mutex::new(());

    #[tokio::test]
    async fn desktop_tools_토글_off면_호출_거부() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        for tool in [
            "screenshot",
            "mouse",
            "click",
            "type",
            "key_combo",
            "scroll",
        ] {
            let args = match tool {
                "scroll" => serde_json::json!({"x": 10, "y": 20, "amount": -120}),
                "mouse" => serde_json::json!({"x": 10, "y": 20, "click": true}),
                "click" => serde_json::json!({"x": 10, "y": 20}),
                "type" => serde_json::json!({"text": "hello", "enter": true}),
                "key_combo" => serde_json::json!({"modifier": "cmd", "key": "k"}),
                _ => serde_json::json!({}),
            };
            let out = run_desktop_tool(tool, &args, false).await;
            assert!(
                out.contains("비활성화"),
                "tool={tool} 일 때 비활성 거부 메시지 필요: {out}"
            );
        }
    }

    #[tokio::test]
    async fn desktop_tools_토글_on_호출_성공() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_desktop_tool_mock(DesktopToolMock {
            screenshot: Some(Ok("A".repeat(TOOL_OUTPUT_LIMIT + 30))),
            mouse: Some(Ok(())),
            click: Some(Ok(())),
            typing: Some(Ok(())),
            scroll: Some(Ok(())),
            key_combo: Some(Ok(())),
        });

        let screenshot = run_desktop_tool("screenshot", &serde_json::json!({}), true).await;
        assert!(
            screenshot.contains("생략"),
            "base64 결과는 truncate되어야 함: {screenshot}"
        );
        let mouse = run_desktop_tool(
            "mouse",
            &serde_json::json!({"x": 33, "y": 44, "click": true}),
            true,
        )
        .await;
        assert!(mouse.contains("마우스 이동 성공"), "{mouse}");
        let click = run_desktop_tool("click", &serde_json::json!({"x": 100, "y": 200}), true).await;
        assert!(click.contains("클릭 성공"), "{click}");
        let typing = run_desktop_tool(
            "type",
            &serde_json::json!({"text": "테스트", "enter": true}),
            true,
        )
        .await;
        assert!(typing.contains("입력 성공"), "{typing}");
        assert!(typing.contains("enter=true"), "{typing}");
        let combo = run_desktop_tool(
            "key_combo",
            &serde_json::json!({"modifier": "cmd", "key": "k"}),
            true,
        )
        .await;
        assert!(combo.contains("단축키 성공"), "{combo}");
        let scroll = run_desktop_tool(
            "scroll",
            &serde_json::json!({"x": 100, "y": 120, "amount": -240}),
            true,
        )
        .await;
        assert!(scroll.contains("스크롤 성공"), "{scroll}");

        clear_desktop_tool_mock();
    }

    #[tokio::test]
    async fn desktop_tools_scroll_파라미터_누락시_에러() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let missing_amount =
            run_desktop_tool("scroll", &serde_json::json!({"x": 10, "y": 20}), true).await;
        assert!(
            missing_amount.contains("x, y, amount"),
            "scroll 누락 파라미터 처리 필요: {missing_amount}"
        );

        let missing_xy =
            run_desktop_tool("scroll", &serde_json::json!({"amount": 120}), true).await;
        assert!(
            missing_xy.contains("x, y, amount"),
            "scroll 누락 파라미터 처리 필요: {missing_xy}"
        );
    }

    #[tokio::test]
    async fn desktop_tools_scroll_0은_거부() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let zero = run_desktop_tool(
            "scroll",
            &serde_json::json!({"x": 10, "y": 20, "amount": 0}),
            true,
        )
        .await;
        assert!(
            zero.contains("0일 수 없습니다"),
            "scroll 0 방어 필요: {zero}"
        );
    }

    #[tokio::test]
    async fn desktop_tools_mouse_파라미터_누락시_에러() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let missing_x =
            run_desktop_tool("mouse", &serde_json::json!({"y": 20, "click": true}), true).await;
        assert!(
            missing_x.contains("x, y 좌표"),
            "mouse 누락 파라미터 처리 필요: {missing_x}"
        );

        let missing_y =
            run_desktop_tool("mouse", &serde_json::json!({"x": 10, "click": true}), true).await;
        assert!(
            missing_y.contains("x, y 좌표"),
            "mouse 누락 파라미터 처리 필요: {missing_y}"
        );
    }

    #[tokio::test]
    async fn desktop_tools_mouse_click_기본값_false() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_desktop_tool_mock(DesktopToolMock {
            mouse: Some(Ok(())),
            ..Default::default()
        });

        let out = run_desktop_tool("mouse", &serde_json::json!({"x": 12, "y": 34}), true).await;
        assert!(out.contains("마우스 이동 성공"), "{out}");
        assert!(out.contains("click=false"), "{out}");

        clear_desktop_tool_mock();
    }

    #[tokio::test]
    async fn desktop_tools_click_button_허용값_검증() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let out = run_desktop_tool(
            "click",
            &serde_json::json!({"x": 10, "y": 20, "button": "double"}),
            true,
        )
        .await;
        assert!(
            out.contains("left/right/middle만 허용"),
            "button 검증 오류 메시지 필요: {out}"
        );
    }

    #[tokio::test]
    async fn desktop_tools_click_button_기본값_left() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_desktop_tool_mock(DesktopToolMock {
            click: Some(Ok(())),
            ..Default::default()
        });

        let out = run_desktop_tool("click", &serde_json::json!({"x": 9, "y": 8}), true).await;
        assert!(out.contains("클릭 성공"), "{out}");
        assert!(out.contains("left"), "{out}");

        clear_desktop_tool_mock();
    }

    #[tokio::test]
    async fn desktop_tools_key_combo_파라미터_누락시_에러() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let missing_modifier =
            run_desktop_tool("key_combo", &serde_json::json!({"key": "k"}), true).await;
        assert!(
            missing_modifier.contains("modifier와 key"),
            "key_combo 누락 파라미터 처리 필요: {missing_modifier}"
        );

        let missing_key =
            run_desktop_tool("key_combo", &serde_json::json!({"modifier": "cmd"}), true).await;
        assert!(
            missing_key.contains("modifier와 key"),
            "key_combo 누락 파라미터 처리 필요: {missing_key}"
        );
    }

    #[tokio::test]
    async fn desktop_tools_key_combo_허용되지_않는_modifier_거부() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_desktop_tool_mock(DesktopToolMock {
            key_combo: Some(Err("Unknown modifier: 'hyper'".into())),
            ..Default::default()
        });

        let out = run_desktop_tool(
            "key_combo",
            &serde_json::json!({"modifier": "hyper", "key": "k"}),
            true,
        )
        .await;
        assert!(out.contains("단축키 실패"), "{out}");
        assert!(out.contains("Unknown modifier"), "{out}");

        clear_desktop_tool_mock();
    }

    #[tokio::test]
    async fn desktop_tools_mouse_좌표_범위_검증() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let over_x = run_desktop_tool(
            "mouse",
            &serde_json::json!({"x": i64::from(i32::MAX) + 1, "y": 0, "click": false}),
            true,
        )
        .await;
        assert!(
            over_x.contains("x 좌표 범위를 벗어났습니다"),
            "mouse x 오버플로 방어 필요: {over_x}"
        );

        let over_y = run_desktop_tool(
            "mouse",
            &serde_json::json!({"x": 0, "y": i64::from(i32::MAX) + 1, "click": false}),
            true,
        )
        .await;
        assert!(
            over_y.contains("y 좌표 범위를 벗어났습니다"),
            "mouse y 오버플로 방어 필요: {over_y}"
        );
    }

    #[tokio::test]
    async fn desktop_tools_click_좌표_범위_검증() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let over_x = run_desktop_tool(
            "click",
            &serde_json::json!({"x": i64::from(i32::MAX) + 1, "y": 20, "button": "left"}),
            true,
        )
        .await;
        assert!(
            over_x.contains("x 좌표 범위를 벗어났습니다"),
            "click x 오버플로 방어 필요: {over_x}"
        );

        let over_y = run_desktop_tool(
            "click",
            &serde_json::json!({"x": 10, "y": i64::from(i32::MAX) + 1, "button": "left"}),
            true,
        )
        .await;
        assert!(
            over_y.contains("y 좌표 범위를 벗어났습니다"),
            "click y 오버플로 방어 필요: {over_y}"
        );
    }

    #[tokio::test]
    async fn desktop_tools_scroll_amount_범위_검증() {
        let _g = DESKTOP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let over_amount = run_desktop_tool(
            "scroll",
            &serde_json::json!({"x": 10, "y": 20, "amount": i64::from(i32::MAX) + 1}),
            true,
        )
        .await;
        assert!(
            over_amount.contains("amount 범위를 벗어났습니다"),
            "scroll amount 오버플로 방어 필요: {over_amount}"
        );
    }

    // HealingToolMock도 글로벌 state — 3개 테스트가 mock을 공유해 병렬 실행 시 race.
    // Phase 137-B 테스트 추가로 스케줄링이 변하며 race가 더 자주 표면화됨 → 직렬 lock.
    static HEALING_TEST_LOCK: Mutex<()> = Mutex::new(());

    #[tokio::test]
    async fn query_healing_결과_요약_성공() {
        let _g = HEALING_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_healing_tool_mock(HealingToolMock {
            recall_result: Some(Ok(vec![crate::commands::recall::RecallEntry {
                id: "healing:1".into(),
                source: "healing".into(),
                ts_ms: 1,
                title: "pip install 오류".into(),
                snippet: "Error: ...".into(),
                score: 0.91,
                metadata: serde_json::json!({
                    "decision": "reject",
                    "failure_reason": "pip 설치 대신 ensurepip은 부적절"
                }),
            }])),
            records_result: None,
        });
        let out = run_query_healing_tool(&serde_json::json!({"query": "pip", "limit": 3})).await;
        assert!(out.contains("healing 검색 결과 1건"), "{out}");
        assert!(out.contains("거부 사유"), "{out}");
        clear_healing_tool_mock();
    }

    #[test]
    fn analyze_failure_reasons_top5_요약() {
        let _g = HEALING_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let records = vec![
            crate::commands::healing_dataset::HealingRecord {
                ts_ms: 10,
                model: "m".into(),
                error: "e1".into(),
                analysis: String::new(),
                suggestion: "s1".into(),
                safety_level: "Warning".into(),
                decision: "reject".into(),
                applied_command: None,
                embedding: Vec::new(),
                failure_reason: Some("권한 없는 rm 제안".into()),
            },
            crate::commands::healing_dataset::HealingRecord {
                ts_ms: 11,
                model: "m".into(),
                error: "e2".into(),
                analysis: String::new(),
                suggestion: "s2".into(),
                safety_level: "Warning".into(),
                decision: "reject".into(),
                applied_command: None,
                embedding: Vec::new(),
                failure_reason: Some("권한 없는 rm 제안".into()),
            },
            crate::commands::healing_dataset::HealingRecord {
                ts_ms: 12,
                model: "m".into(),
                error: "e3".into(),
                analysis: String::new(),
                suggestion: "s3".into(),
                safety_level: "Warning".into(),
                decision: "reject".into(),
                applied_command: None,
                embedding: Vec::new(),
                failure_reason: Some("존재하지 않는 패키지 설치".into()),
            },
        ];
        set_healing_tool_mock(HealingToolMock {
            recall_result: None,
            records_result: Some(Ok(records)),
        });
        let out =
            run_analyze_failure_reasons_tool(&serde_json::json!({"since_days": 0, "limit": 5}));
        assert!(out.contains("Top 2"), "{out}");
        assert!(out.contains("2회 — 권한 없는 rm 제안"), "{out}");
        clear_healing_tool_mock();
    }

    #[test]
    fn analyze_failure_reasons_빈_데이터() {
        let _g = HEALING_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_healing_tool_mock(HealingToolMock {
            recall_result: None,
            records_result: Some(Ok(Vec::new())),
        });
        let out = run_analyze_failure_reasons_tool(&serde_json::json!({"since_days": 7}));
        assert!(out.contains("reject 기록이 없습니다"), "{out}");
        clear_healing_tool_mock();
    }

    // ─── Phase 137-B: query_codebase 회귀 가드 ──────────────────────────────
    // CODEBASE_TOOL_MOCK은 글로벌 state라 멀티스레드 테스트에서 mock이 서로 소비됨 →
    // CODEBASE_TEST_LOCK으로 직렬화. 다른 단위 테스트는 mock 안 쓰므로 영향 없음.
    static CODEBASE_TEST_LOCK: Mutex<()> = Mutex::new(());

    #[tokio::test]
    async fn phase137b_query_codebase_도구_등록_및_결과_요약() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // 시스템 프롬프트에 query_codebase 항목이 노출되는지 + LLM이 호출했을 때
        // run_tool match → run_query_codebase_tool로 라우팅되어 결과를 요약 반환하는지.
        let prompt = build_system_prompt(&[], &[], true, true, true, true);
        assert!(
            prompt.contains("query_codebase"),
            "프롬프트에 도구 미등록: {prompt}"
        );

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![
                crate::commands::rag::SearchResult {
                    content: "[src/auth.rs]\nfn verify_token(t: &str) -> bool { ... }".into(),
                    score: 0.92,
                },
                crate::commands::rag::SearchResult {
                    content: "[src/login.rs]\nfn login(user: &str, pw: &str) { ... }".into(),
                    score: 0.81,
                },
            ])),
        });
        let out =
            run_query_codebase_tool(&serde_json::json!({"query": "auth 함수", "limit": 5})).await;
        assert!(out.contains("검색 결과 2건"), "{out}");
        assert!(out.contains("score=0.920"), "{out}");
        assert!(out.contains("verify_token"), "{out}");
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase137b_query_codebase_결과_truncation() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // 도구 결과는 TOOL_OUTPUT_LIMIT(4000자) 초과 시 잘려야 함 — LLM 컨텍스트 보호.
        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![crate::commands::rag::SearchResult {
                content: "[src/big.rs]\n".to_string() + &"x".repeat(TOOL_OUTPUT_LIMIT + 200),
                score: 0.5,
            }])),
        });
        let out = run_query_codebase_tool(&serde_json::json!({"query": "big"})).await;
        assert!(out.contains("생략"), "결과 truncation 미적용: {out}");
        assert!(
            out.len() < TOOL_OUTPUT_LIMIT + 100,
            "truncate 후에도 너무 김: {}",
            out.len()
        );
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase137b_query_codebase_빈_인덱스_안내() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // 인덱스 미생성/비어있는 경우 — 사용자에게 색인 실행을 안내.
        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(Vec::new())),
        });
        let out = run_query_codebase_tool(&serde_json::json!({"query": "anything"})).await;
        assert!(out.contains("0건"), "{out}");
        assert!(out.contains("index_project"), "색인 안내 누락: {out}");
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase137b_query_codebase_query_누락_거부() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let out = run_query_codebase_tool(&serde_json::json!({})).await;
        assert!(out.contains("query 파라미터"), "{out}");
    }

    #[tokio::test]
    async fn phase143_query_graph_도구_심볼요약() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-1");
        let repo = td.path().join("sample.rs");
        std::fs::write(
            &repo,
            r#"
use std::collections::HashMap;

fn auth_guard() {}

fn validate_auth() {
    auth_guard();
}

fn main() {
    validate_auth();
}
"#,
        )
        .unwrap();

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![
                crate::commands::rag::SearchResult {
                    content: "[fn validate_auth | sample.rs]\nfn validate_auth() { auth_guard(); }"
                        .to_string(),
                    score: 0.95,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn auth_guard | sample.rs]\nfn auth_guard() {}".to_string(),
                    score: 0.82,
                },
                crate::commands::rag::SearchResult {
                    content: "[module | sample.rs]\nuse crate::auth::AuthService;".to_string(),
                    score: 0.60,
                },
            ])),
        });

        let out = run_query_graph_tool(
            &serde_json::json!({"query": "auth", "limit": 5, "depth": 3, "symbols": 3}),
            &td.cwd(),
        )
        .await;
        assert!(out.contains("query_graph 결과"), "{out}");
        assert!(out.contains("연결 모듈 컨텍스트"), "{out}");
        assert!(out.contains("sample.rs"), "{out}");
        assert!(out.contains("std::collections::HashMap"), "{out}");
        assert!(out.contains("정의 파일"), "{out}");
        assert!(out.contains("validate_auth"), "{out}");
        assert!(out.contains("관계 요약 대상 심볼"), "{out}");
        assert!(out.contains("모듈 중심 요약"), "{out}");
        assert!(out.contains("검색 심볼 간 호출 관계"), "{out}");
        assert!(out.contains("호출자"), "{out}");
        assert!(out.contains("피호출자"), "{out}");
        assert!(out.contains("영향도"), "{out}");
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase143_query_graph_도구_심볼정의_중복_병합() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-dupfns");

        std::fs::write(&td.path().join("a.rs"), "fn shared()\n{}\nfn caller() {}\n").unwrap();
        std::fs::write(&td.path().join("b.rs"), "fn shared()\n{}\nfn other() {}\n").unwrap();

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![
                crate::commands::rag::SearchResult {
                    content: "[fn shared | a.rs]\nfn shared() {}".to_string(),
                    score: 0.94,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn shared | b.rs]\nfn shared() {}".to_string(),
                    score: 0.93,
                },
            ])),
        });

        let out = run_query_graph_tool(
            &serde_json::json!({"query": "shared", "symbols": 1}),
            &td.cwd(),
        )
        .await;
        assert!(out.contains("정의 파일 2개"), "{out}");
        assert!(out.contains("a.rs"), "{out}");
        assert!(out.contains("b.rs"), "{out}");
        assert_eq!(
            out.matches("      - a.rs").count() + out.matches("      - b.rs").count(),
            2,
            "{out}"
        );
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase143_query_graph_도구_모듈요약_중복_정규화() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-module-summary");
        let repo = td.path().join("service.rs");
        std::fs::write(
            &repo,
            r#"
fn check_auth() {
    verify_auth();
}
fn verify_auth() {}
use crate::db::query;
"#,
        )
        .unwrap();
        std::fs::write(td.path().join("auth.rs"), "fn query() {}\n").unwrap();
        std::fs::write(td.path().join("legacy.rs"), "fn legacy_check() {}\n").unwrap();

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![
                crate::commands::rag::SearchResult {
                    content: "[fn check_auth | ./service.rs]\nfn check_auth() {}".to_string(),
                    score: 0.95,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn check_auth | service.rs]\nfn check_auth() {}".to_string(),
                    score: 0.94,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn verify_auth | service.rs]\nfn verify_auth() {}".to_string(),
                    score: 0.90,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn query | auth.rs]\nfn query() {}".to_string(),
                    score: 0.89,
                },
            ])),
        });

        let out = run_query_graph_tool(
            &serde_json::json!({"query": "auth", "symbols": 3}),
            &td.cwd(),
        )
        .await;
        assert!(out.contains("모듈 중심 요약"), "{out}");
        assert!(out.contains("- service.rs"), "{out}");
        assert!(out.contains("check_auth"), "{out}");
        assert!(out.contains("검색 심볼 간 호출 관계"), "{out}");
        assert!(out.contains("check_auth -> verify_auth"), "{out}");
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase143_query_graph_도구_심볼없음_컨텍스트_포함() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-no-symbol");
        let repo = td.path().join("legacy.rs");
        std::fs::write(
            &repo,
            r#"
import { legacy } from "../core/legacy.rs";

fn legacy_format() {}
"#,
        )
        .unwrap();

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![crate::commands::rag::SearchResult {
                content: "[legacy.rs]\nlegacy format chunk".to_string(),
                score: 0.75,
            }])),
        });

        let out = run_query_graph_tool(&serde_json::json!({"query": "legacy"}), &td.cwd()).await;
        assert!(out.contains("관계 요약 대상 심볼이 없어"), "{out}");
        assert!(out.contains("모듈 중심 요약"), "{out}");
        assert!(out.contains("심볼 미탐지"), "{out}");
        assert!(out.contains("연결 모듈 컨텍스트"), "{out}");
        assert!(out.contains("legacy.rs"), "{out}");
        assert!(out.contains("../core/legacy.rs"), "{out}");
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase143_query_graph_도구_모듈점수_정렬() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-module-score");

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![
                crate::commands::rag::SearchResult {
                    content: "[fn alpha | low.rs]\nfn alpha() {}".to_string(),
                    score: 0.31,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn beta | mid.rs]\nfn beta() {}".to_string(),
                    score: 0.54,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn gamma | low.rs]\nfn gamma() {}".to_string(),
                    score: 0.62,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn delta | top.rs]\nfn delta() {}".to_string(),
                    score: 0.98,
                },
            ])),
        });

        let out = run_query_graph_tool(
            &serde_json::json!({"query": "score", "symbols": 4}),
            &td.cwd(),
        )
        .await;
        assert!(out.contains("모듈 중심 요약"), "{out}");
        let idx_top = out.find("  - top.rs").expect("top.rs");
        let idx_low = out.find("  - low.rs").expect("low.rs");
        let idx_mid = out.find("  - mid.rs").expect("mid.rs");
        assert!(idx_top < idx_mid, "{out}");
        assert!(idx_top < idx_low, "{out}");
        assert!(out.contains("심볼 1개"), "{out}");
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase143_query_graph_모듈연결_요약() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-module-links");
        std::fs::write(
            td.path().join("service.rs"),
            r#"
use crate::db::{query_user, find_user};
fn service_api() {
    query_user();
}
"#,
        )
        .unwrap();
        std::fs::write(
            td.path().join("db.rs"),
            "fn query_user() {}\nfn find_user() {}\n",
        )
        .unwrap();
        std::fs::write(
            td.path().join("api.rs"),
            r#"
use crate::service;
fn main_api() { service_api(); }
"#,
        )
        .unwrap();

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![
                crate::commands::rag::SearchResult {
                    content: "[fn service_api | service.rs]\nfn service_api() {}".to_string(),
                    score: 0.95,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn query_user | db.rs]\nfn query_user() {}".to_string(),
                    score: 0.94,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn main_api | api.rs]\nfn main_api() {}".to_string(),
                    score: 0.93,
                },
            ])),
        });

        let out = run_query_graph_tool(
            &serde_json::json!({"query": "service", "symbols": 3}),
            &td.cwd(),
        )
        .await;
        assert!(out.contains("모듈 연결 요약"), "{out}");
        assert!(out.contains("service.rs -> db.rs"), "{out}");
        assert!(out.contains("api.rs -> service.rs"), "{out}");
        assert!(out.contains("검색 심볼 간 호출 관계"), "{out}");
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase143_query_graph_모듈연결_mermaid_다이어그램() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-module-links-mermaid");
        std::fs::write(
            td.path().join("service.rs"),
            r#"
use crate::db::query_user;
fn service_api() {
    query_user();
}
"#,
        )
        .unwrap();
        std::fs::write(td.path().join("db.rs"), "fn query_user() {}\n").unwrap();

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![
                crate::commands::rag::SearchResult {
                    content: "[fn service_api | service.rs]\nfn service_api() {}".to_string(),
                    score: 0.95,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn query_user | db.rs]\nfn query_user() {}".to_string(),
                    score: 0.90,
                },
            ])),
        });

        let out = run_query_graph_tool(
            &serde_json::json!({"query": "service", "symbols": 2}),
            &td.cwd(),
        )
        .await;
        assert!(out.contains("```mermaid"), "{out}");
        assert!(out.contains("flowchart LR"), "{out}");
        assert!(out.contains("\"service.rs\" --> \"db.rs\""), "{out}");
        clear_codebase_tool_mock();
    }

    #[test]
    fn phase143_query_graph_모듈연결_mermaid_문자이스케이프() {
        let links = vec![(
            (
                r#"src/"quote".rs"#.to_string(),
                r#"src\slash" .rs"#.to_string(),
            ),
            4,
        )];
        let mut file_display_map = HashMap::new();
        file_display_map.insert(
            r#"src/"quote".rs"#.to_string(),
            r#"src/"quote".rs"#.to_string(),
        );
        file_display_map.insert(
            r#"src\slash" .rs"#.to_string(),
            r#"src\slash" .rs"#.to_string(),
        );

        let lines = format_query_graph_mermaid_lines(&links, &file_display_map, 8)
            .expect("연결이 있으면 다이어그램 생성");
        assert!(
            lines.contains(&"  \"src/\\\"quote\\\".rs\" --> \"src\\\\slash\\\" .rs\"".to_string())
        );
        assert!(lines.contains(&"```mermaid".to_string()));
        assert!(lines.contains(&"flowchart LR".to_string()));
        assert!(lines.contains(&"```".to_string()));
    }

    #[tokio::test]
    async fn phase143_query_graph_모듈연결_없음() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-module-links-empty");
        std::fs::write(
            td.path().join("util.rs"),
            r#"
use std::collections::HashMap;
use serde::Deserialize;

fn parse() {
    let _ = HashMap::<String, String>::new();
}
"#,
        )
        .unwrap();

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![crate::commands::rag::SearchResult {
                content: "[module | util.rs]\nmodule chunk".to_string(),
                score: 0.80,
            }])),
        });

        let out = run_query_graph_tool(
            &serde_json::json!({"query": "parse", "symbols": 2}),
            &td.cwd(),
        )
        .await;
        assert!(out.contains("모듈 연결 요약"), "{out}");
        assert!(out.contains("탐지된 모듈 연결 없음"), "{out}");
        clear_codebase_tool_mock();
    }

    #[test]
    fn phase143_query_graph_import_대상해결() {
        let modules = {
            let mut set = std::collections::HashSet::new();
            set.insert("service.rs".to_string());
            set.insert("db.rs".to_string());
            set.insert("src/api.rs".to_string());
            set
        };
        let targets =
            resolve_query_graph_import_target("crate::db::query_user", "service.rs", &modules);
        assert!(targets.contains(&"db.rs".to_string()), "{targets:?}");
        assert!(!targets.contains(&"std.rs".to_string()), "{targets:?}");
    }

    #[test]
    fn phase143_query_graph_import_상대경로_해결() {
        let modules = {
            let mut set = std::collections::HashSet::new();
            set.insert("api.js".to_string());
            set.insert("modules/user.js".to_string());
            set.insert("src/modules/user.js".to_string());
            set
        };
        let targets = resolve_query_graph_import_target("./modules/user.js", "api.js", &modules);
        assert!(
            targets.contains(&"modules/user.js".to_string()),
            "{targets:?}"
        );
    }

    #[tokio::test]
    async fn phase143_query_graph_모듈연결_상대경로_도구결과() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-module-links-relative");
        std::fs::write(
            td.path().join("api.js"),
            r#"
import user from "./modules/user.js";

function api() {
    return user();
}
"#,
        )
        .unwrap();
        std::fs::create_dir_all(td.path().join("modules")).unwrap();
        std::fs::write(
            td.path().join("modules/user.js"),
            "export function user() {\n    return 1;\n}\n",
        )
        .unwrap();

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![
                crate::commands::rag::SearchResult {
                    content: "[fn api | api.js]\nfunction api() {}".to_string(),
                    score: 0.93,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn user | modules/user.js]\nexport function user() {}".to_string(),
                    score: 0.88,
                },
            ])),
        });

        let out = run_query_graph_tool(
            &serde_json::json!({"query": "user", "symbols": 2}),
            &td.cwd(),
        )
        .await;
        assert!(out.contains("모듈 연결 요약"), "{out}");
        assert!(out.contains("api.js -> modules/user.js"), "{out}");
        clear_codebase_tool_mock();
    }

    #[test]
    fn phase143_parse_graph_file_from_chunk_legacy_포맷() {
        let path = parse_graph_file_from_chunk("[legacy.rs]\nlegacy format chunk");
        assert_eq!(path, Some("legacy.rs".to_string()));
    }

    #[test]
    fn phase143_normalize_graph_file_ref_변형_정규화() {
        assert_eq!(normalize_graph_file_ref("./sample.rs"), "sample.rs");
        assert_eq!(
            normalize_graph_file_ref("src/../src/sample.rs"),
            "src/sample.rs"
        );
        assert_eq!(normalize_graph_file_ref("src//./mod.rs"), "src/mod.rs");
        assert_eq!(
            normalize_graph_file_ref("src\\legacy\\main.rs"),
            "src/legacy/main.rs"
        );
    }

    #[test]
    fn phase143_normalize_graph_file_ref_절대경로_및_unc_처리() {
        assert_eq!(
            normalize_graph_file_ref("C:\\projects\\lum\\src\\main.rs"),
            "C:/projects/lum/src/main.rs"
        );
        assert_eq!(
            normalize_graph_file_ref("C:/projects/../projects/lum/src/main.rs"),
            "C:/projects/lum/src/main.rs"
        );
        assert_eq!(
            normalize_graph_file_ref("//server/share/repo/../repo/main.rs"),
            "//server/share/repo/main.rs"
        );
        assert_eq!(
            normalize_graph_file_ref("/abs/path/../repo/main.rs"),
            "/abs/repo/main.rs"
        );
    }

    #[test]
    fn phase143_collect_graph_file_contexts_중복_경로_병합() {
        let td = TempDir::new("query-graph-context-merge");
        let target = td.path().join("sample.rs");
        std::fs::write(
            &target,
            r#"
use std::fmt::Debug;

fn sample() {}
"#,
        )
        .unwrap();

        let file_list = vec![
            "./sample.rs".to_string(),
            "sample.rs".to_string(),
            "src/../".to_string() + target.file_name().unwrap().to_str().unwrap(),
        ];
        let contexts = collect_graph_file_contexts(&file_list, &td.cwd(), 8, 6);
        assert_eq!(contexts.len(), 1);
        assert_eq!(contexts[0].0, "sample.rs");
        assert!(contexts[0].1.contains(&"std::fmt::Debug".to_string()));
    }

    #[tokio::test]
    async fn phase143_query_graph_도구_경로_변형_컨텍스트_중복_제거() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let td = TempDir::new("query-graph-dup-file");
        std::fs::write(&td.path().join("sample.rs"), "fn sample() {}\n").unwrap();

        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![
                crate::commands::rag::SearchResult {
                    content: "[fn sample | ./sample.rs]\nfn sample() {}".to_string(),
                    score: 0.95,
                },
                crate::commands::rag::SearchResult {
                    content: "[fn sample | sample.rs]\nfn sample() {}".to_string(),
                    score: 0.94,
                },
            ])),
        });

        let out = run_query_graph_tool(
            &serde_json::json!({"query": "sample", "symbols": 2}),
            &td.cwd(),
        )
        .await;
        assert!(out.contains("연결 모듈 컨텍스트 1개"), "{out}");
        let mut context_files = Vec::new();
        let mut in_context = false;
        for line in out.lines() {
            if line.starts_with("연결 모듈 컨텍스트") {
                in_context = true;
                continue;
            }
            if in_context {
                if line.starts_with("관계 요약 대상") {
                    break;
                }
                if line.starts_with("  - ") {
                    context_files.push(line.trim().to_string());
                }
            }
        }
        assert_eq!(context_files, vec!["- sample.rs".to_string()]);
        clear_codebase_tool_mock();
    }

    #[test]
    fn phase143_parse_graph_import_rust_use_구조분해() {
        let mut imports = Vec::new();
        let mut seen = std::collections::HashSet::new();
        parse_graph_import_line(
            "rust_use",
            "crate::auth::{login, verify as v};",
            "use crate::auth::{login, verify as v};",
            &mut imports,
            &mut seen,
        );
        assert!(imports.contains(&"crate::auth::login".to_string()));
        assert!(imports.contains(&"crate::auth::verify".to_string()));
        assert!(!imports.contains(&"crate::auth::{login".to_string()));
    }

    #[test]
    fn phase143_parse_graph_import_rust_use_alias() {
        let mut imports = Vec::new();
        let mut seen = std::collections::HashSet::new();
        parse_graph_import_line(
            "rust_use",
            "crate::auth::AuthService as AuthSvc;",
            "use crate::auth::AuthService as AuthSvc;",
            &mut imports,
            &mut seen,
        );
        assert!(imports.contains(&"crate::auth::AuthService".to_string()));
    }

    #[tokio::test]
    async fn phase143_query_graph_도구_심볼없음_폴백() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        set_codebase_tool_mock(CodebaseToolMock {
            search_result: Some(Ok(vec![crate::commands::rag::SearchResult {
                content: "[sample.rs]\nfn old_format_chunk() {}".to_string(),
                score: 0.75,
            }])),
        });
        let out = run_query_graph_tool(&serde_json::json!({"query": "legacy"}), "/tmp").await;
        assert!(out.contains("관계 요약 대상 심볼이 없어"), "{out}");
        assert!(out.contains("스니펫만 반환"), "{out}");
        clear_codebase_tool_mock();
    }

    #[tokio::test]
    async fn phase143_query_graph_도구_query_파라미터_필수() {
        let _g = CODEBASE_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let out = run_query_graph_tool(&serde_json::json!({}), "/tmp").await;
        assert!(
            out.contains("query_graph는 query 파라미터가 필요합니다"),
            "{out}"
        );
    }

    #[test]
    fn phase142_precise_callers_도구_비활성_메시지() {
        let out = run_precise_callers_tool(&serde_json::json!({"symbol": "foo"}), "/tmp", false);
        assert!(out.contains("비활성"), "{out}");
    }

    #[test]
    fn phase142_precise_callers_도구_심볼_필수() {
        let out = run_precise_callers_tool(&serde_json::json!({}), "/tmp", true);
        assert!(out.contains("symbol 파라미터 필요"), "{out}");
    }

    #[test]
    fn phase142_precise_callers_타이틀에_심볼_표시() {
        let out = run_precise_callers_tool(&serde_json::json!({"symbol": "target"}), "/tmp", false);
        assert!(out.contains("`target` 정밀 caller"), "{out}");
    }

    #[test]
    fn phase142_precise_callers_비활성_시_fallback_반환() {
        let out = run_precise_callers_tool(
            &serde_json::json!({"symbol": "validate_safe_path"}),
            "/tmp",
            false,
        );
        assert!(out.contains("정밀 caller 분석은 비활성"));
        assert!(out.contains("validate_safe_path"));
        assert!(out.contains("호출"));
    }

    #[test]
    fn phase142_precise_definition_비활성_시_fallback_반환() {
        let td = TempDir::new("scip-def-disabled");
        let repo = td.path().join("sample.rs");
        let source = "fn helper() {}\nfn target() { helper(); }\n";
        std::fs::write(&repo, source).unwrap();

        let out =
            run_precise_definition_tool(&serde_json::json!({"symbol": "target"}), &td.cwd(), false);
        assert!(out.contains("정밀 definition 분석은 비활성"), "{out}");
        assert!(out.contains("정의 후보"), "{out}");
        assert!(out.contains("target"), "{out}");
    }

    #[test]
    fn phase142_precise_definition_정의_리턴() {
        let td = TempDir::new("scip-def");
        let repo = td.path().join("sample.rs");
        let source = "fn helper() {}\nfn target() { helper(); }\n";
        std::fs::write(&repo, source).unwrap();

        let out =
            run_precise_definition_tool(&serde_json::json!({"symbol": "target"}), &td.cwd(), true);
        assert!(out.contains("정의 후보"), "{out}");
        assert!(out.contains("[SCIP]"), "{out}");
    }

    #[test]
    fn phase139_call_graph_도구_호출자_조회() {
        let td = TempDir::new("call-graph-callers");
        let repo = td.path().join("sample.rs");
        let source = r#"
            fn a() {
                b();
                c();
            }
            fn b() {
                d();
            }
            fn c() {
                b();
            }
            fn d() {}
        "#;
        std::fs::write(&repo, source).unwrap();

        let out = run_find_callers_tool(&serde_json::json!({"symbol": "b"}), &td.cwd());
        assert!(out.contains("`b`의 호출자"), "{out}");
        assert!(out.contains("(sample.rs)"));
        assert!(out.contains("a"));
        assert!(out.contains("c"));
    }

    #[test]
    fn phase139_call_graph_도구_피호출_조회() {
        let td = TempDir::new("call-graph-callees");
        let repo = td.path().join("sample.rs");
        let source = r#"
            fn a() {
                b();
                c();
            }
            fn b() {
                d();
            }
            fn c() {}
            fn d() {}
        "#;
        std::fs::write(&repo, source).unwrap();

        let out = run_find_callees_tool(&serde_json::json!({"symbol": "a"}), &td.cwd());
        assert!(out.contains("`a`이 호출하는 함수"), "{out}");
        assert!(out.contains("b"));
        assert!(out.contains("c"));
        assert!(!out.contains("d (sample.rs)"), "{out}");
    }

    #[test]
    fn phase139_call_graph_도구_영향도분석_depth_제한() {
        let td = TempDir::new("call-graph-dependents");
        let repo = td.path().join("sample.rs");
        let source = r#"
            fn a() {
                b();
            }
            fn b() {
                c();
            }
            fn c() {
                d();
            }
            fn d() {}
        "#;
        std::fs::write(&repo, source).unwrap();

        let out =
            run_trace_dependents_tool(&serde_json::json!({"symbol": "d", "depth": 10}), &td.cwd());
        assert!(out.contains("`d` 변경 영향 범위"), "{out}");
        assert!(out.contains("depth=1"));
        assert!(out.contains("c"));
        assert!(out.contains("b"));
        assert!(out.contains("a"));
        assert!(out.contains("[3개]"));
        assert!(out.contains("동명이인 가능성 있음"));
    }

    // ─── 코드 편집 도구 회귀 가드 ─────────────────────────────────────────────

    /// 테스트 종료 시 자동 정리되는 임시 디렉터리. tempfile crate를 추가하지 않기 위해 직접 구현.
    /// nano + atomic counter로 path 충돌 가능성 0%. 또한 RAII로 BACKUP_TEST_LOCK을 잡아
    /// 모든 fs/도구 테스트가 자동 직렬화 — 멀티스레드 fs race(canonicalize cache, write→read
    /// stale) 회피. 락은 TempDir 생명주기와 동일하게 묶임 → Drop 시 자동 해제.
    static TEMP_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    struct TempDir {
        path: PathBuf,
        _lock: std::sync::MutexGuard<'static, ()>,
    }
    impl TempDir {
        fn new(label: &str) -> Self {
            // poison 회복 — 다른 테스트가 panic해도 락 사용 가능.
            let lock = BACKUP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let nano = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let id = TEMP_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let pid = std::process::id();
            let p = std::env::temp_dir().join(format!("lum_react_{label}_{pid}_{nano}_{id}"));
            std::fs::create_dir_all(&p).unwrap();
            // canonicalize로 통일 — validate_safe_path도 canonicalize하므로 비교 일치 필요.
            let path = std::fs::canonicalize(&p).unwrap();
            Self { path, _lock: lock }
        }
        fn path(&self) -> &Path {
            &self.path
        }
        fn cwd(&self) -> String {
            self.path.to_string_lossy().to_string()
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn validate_safe_path_거부_cwd_외부_절대경로() {
        let td = TempDir::new("safe1");
        // /tmp 또는 C:\ 같이 cwd 밖의 절대경로 — 부모 canonicalize는 성공해도 prefix 검사에서 막혀야 함.
        let outside = if cfg!(windows) {
            "C:\\Windows\\System32\\evil.txt"
        } else {
            "/etc/evil.txt"
        };
        let r = validate_safe_path(outside, &td.cwd());
        assert!(r.is_err(), "cwd 외부 절대경로는 거부되어야 함: {:?}", r);
    }

    #[test]
    fn validate_safe_path_거부_traversal() {
        let td = TempDir::new("safe2");
        // ../../../ 로 cwd 밖으로 나가려는 시도 — canonicalize 후 prefix 검사에서 막혀야 함.
        let r = validate_safe_path("../../../etc/passwd", &td.cwd());
        assert!(r.is_err(), "traversal은 거부되어야 함: {:?}", r);
    }

    #[test]
    fn validate_safe_path_거부_금지_경로() {
        let td = TempDir::new("safe3");
        std::fs::create_dir_all(td.path().join(".git")).unwrap();
        std::fs::create_dir_all(td.path().join("node_modules")).unwrap();
        assert!(validate_safe_path(".git/config", &td.cwd()).is_err());
        assert!(validate_safe_path("node_modules/foo.js", &td.cwd()).is_err());
    }

    #[test]
    fn validate_safe_path_거부_lum_internal() {
        let td = TempDir::new("safe4");
        std::fs::create_dir_all(td.path().join(".lum_squads")).unwrap();
        let r = validate_safe_path(".lum_squads/state.json", &td.cwd());
        assert!(r.is_err(), ".lum_ prefix는 거부: {:?}", r);
    }

    #[test]
    fn validate_safe_path_허용_정상_경로() {
        let td = TempDir::new("safe5");
        let r = validate_safe_path("src/lib.rs", &td.cwd());
        // 부모 디렉터리 미존재면 거부 — mkdir 후 재시도가 정상 흐름.
        assert!(r.is_err(), "부모 디렉터리 없으면 거부");
        std::fs::create_dir_all(td.path().join("src")).unwrap();
        let r = validate_safe_path("src/lib.rs", &td.cwd()).unwrap();
        assert!(r.starts_with(td.path()));
        assert!(r.ends_with("lib.rs"));
    }

    #[test]
    fn track_pre_write_실패_경로_계산_오류() {
        let td = TempDir::new("prewrite1");
        init_react_backup(&td.cwd());
        let outside = if cfg!(windows) {
            PathBuf::from("C:\\Windows\\System32\\temp_for_track_pre_write_test.txt")
        } else {
            PathBuf::from("/tmp/lum_track_pre_write_outside.txt")
        };
        let r = track_pre_write(&outside).expect_err("백업 경로 계산 오류가 발생해야 함");
        assert!(
            r.contains("경로 계산 오류"),
            "오류 메시지로 경로 계산 실패가 드러나야 함: {r}"
        );
        *backup_lock().lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    #[test]
    fn track_pre_write_실패_백업디렉터리_생성오류() {
        let td = TempDir::new("prewrite2");
        let target = td.path().join("source.txt");
        std::fs::write(&target, "before").unwrap();
        let invalid_backup_dir = td.path().join("invalid_backup_dir");
        std::fs::write(&invalid_backup_dir, b"x").unwrap();

        {
            let mut guard = backup_lock().lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(ReactBackup {
                cwd_input: td.cwd(),
                cwd: td.path().to_path_buf(),
                backup_dir: invalid_backup_dir.clone(),
                entries: HashMap::new(),
            });
        }

        let r = track_pre_write(&target).expect_err("백업 디렉터리 생성 단계에서 에러가 나야 함");
        assert!(
            r.contains("백업 디렉터리 생성 실패"),
            "에러 메시지 검증: {r}"
        );

        *backup_lock().lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    #[test]
    fn write_file_백업실패_메시지_전파() {
        let td = TempDir::new("prewrite3");
        let target = td.path().join("a.txt");
        std::fs::write(&target, "before").unwrap();
        let invalid_backup_dir = td.path().join("invalid_backup_dir2");
        std::fs::write(&invalid_backup_dir, b"x").unwrap();

        {
            let mut guard = backup_lock().lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(ReactBackup {
                cwd_input: td.cwd(),
                cwd: td.path().to_path_buf(),
                backup_dir: invalid_backup_dir.clone(),
                entries: HashMap::new(),
            });
        }

        let args = serde_json::json!({"path": "a.txt", "content": "after", "overwrite": true});
        let out = write_file_tool(&args, &td.cwd());
        assert!(out.contains("백업 준비 실패"), "메시지 검증 필요: {out}");
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "before");
        assert!(
            out.contains("백업 디렉터리 생성 실패"),
            "실제 실패 원인을 그대로 노출해야 함: {out}"
        );

        *backup_lock().lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    #[test]
    fn apply_patch_백업실패_메시지_전파() {
        let td = TempDir::new("prewrite4");
        let target = td.path().join("a.rs");
        std::fs::write(&target, "fn x() -> i32 { 1 }").unwrap();
        let invalid_backup_dir = td.path().join("invalid_backup_dir3");
        std::fs::write(&invalid_backup_dir, b"x").unwrap();

        {
            let mut guard = backup_lock().lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(ReactBackup {
                cwd_input: td.cwd(),
                cwd: td.path().to_path_buf(),
                backup_dir: invalid_backup_dir.clone(),
                entries: HashMap::new(),
            });
        }

        let args = serde_json::json!({
            "path": "a.rs",
            "search": "1",
            "replace": "2",
        });
        let out = apply_patch_tool(&args, &td.cwd());
        assert!(out.contains("백업 준비 실패"), "메시지 검증 필요: {out}");
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "fn x() -> i32 { 1 }");
        assert!(
            out.contains("백업 디렉터리 생성 실패"),
            "실제 실패 원인을 그대로 노출해야 함: {out}"
        );

        *backup_lock().lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    #[test]
    fn delete_file_백업실패_메시지_전파() {
        let td = TempDir::new("prewrite5");
        let target = td.path().join("b.txt");
        std::fs::write(&target, "bye").unwrap();
        let invalid_backup_dir = td.path().join("invalid_backup_dir4");
        std::fs::write(&invalid_backup_dir, b"x").unwrap();

        {
            let mut guard = backup_lock().lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(ReactBackup {
                cwd_input: td.cwd(),
                cwd: td.path().to_path_buf(),
                backup_dir: invalid_backup_dir.clone(),
                entries: HashMap::new(),
            });
        }

        let args = serde_json::json!({"path": "b.txt"});
        let out = delete_file_tool(&args, &td.cwd());
        assert!(out.contains("백업 준비 실패"), "메시지 검증 필요: {out}");
        assert!(target.exists(), "삭제는 백업 실패로 차단되어야 함");
        assert!(
            out.contains("백업 디렉터리 생성 실패"),
            "실제 실패 원인을 그대로 노출해야 함: {out}"
        );

        *backup_lock().lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    #[test]
    fn write_file_creates_new_file() {
        let td = TempDir::new("wf1");
        let args = serde_json::json!({"path": "hello.txt", "content": "안녕"});
        let out = write_file_tool(&args, &td.cwd());
        assert!(out.contains("쓰기 성공"), "{out}");
        let read = std::fs::read_to_string(td.path().join("hello.txt")).unwrap();
        assert_eq!(read, "안녕");
    }

    #[test]
    fn write_file_거부_기존_파일_overwrite_false() {
        let td = TempDir::new("wf2");
        std::fs::write(td.path().join("a.txt"), "old").unwrap();
        let args = serde_json::json!({"path": "a.txt", "content": "new"});
        let out = write_file_tool(&args, &td.cwd());
        assert!(
            out.contains("이미 존재") || out.contains("overwrite"),
            "{out}"
        );
        // 파일은 변경되지 않아야 함
        assert_eq!(
            std::fs::read_to_string(td.path().join("a.txt")).unwrap(),
            "old"
        );
    }

    #[test]
    fn write_file_허용_overwrite_true() {
        let td = TempDir::new("wf3");
        std::fs::write(td.path().join("a.txt"), "old").unwrap();
        let args = serde_json::json!({"path": "a.txt", "content": "new", "overwrite": true});
        let out = write_file_tool(&args, &td.cwd());
        assert!(out.contains("쓰기 성공"), "{out}");
        assert_eq!(
            std::fs::read_to_string(td.path().join("a.txt")).unwrap(),
            "new"
        );
    }

    #[test]
    fn apply_patch_정상_1회_매칭() {
        let td = TempDir::new("ap1");
        std::fs::write(
            td.path().join("a.rs"),
            "fn add(a: i32, b: i32) -> i32 { a + b }",
        )
        .unwrap();
        let args = serde_json::json!({
            "path": "a.rs",
            "search": "a + b",
            "replace": "a + b + 1",
        });
        let out = apply_patch_tool(&args, &td.cwd());
        assert!(out.contains("패치 적용 성공"), "{out}");
        assert_eq!(
            std::fs::read_to_string(td.path().join("a.rs")).unwrap(),
            "fn add(a: i32, b: i32) -> i32 { a + b + 1 }"
        );
    }

    #[test]
    fn apply_patch_거부_0건_매칭() {
        let td = TempDir::new("ap2");
        std::fs::write(td.path().join("a.rs"), "fn x() {}").unwrap();
        let args = serde_json::json!({
            "path": "a.rs",
            "search": "존재하지않는문자열",
            "replace": "뭐든",
        });
        let out = apply_patch_tool(&args, &td.cwd());
        assert!(out.contains("찾지 못했습니다"), "{out}");
    }

    #[test]
    fn apply_patch_거부_여러건_매칭() {
        let td = TempDir::new("ap3");
        std::fs::write(td.path().join("a.rs"), "let x = 1;\nlet y = 1;\nlet z = 1;").unwrap();
        let args = serde_json::json!({
            "path": "a.rs",
            "search": "= 1;",
            "replace": "= 2;",
        });
        let out = apply_patch_tool(&args, &td.cwd());
        assert!(out.contains("매칭됩니다"), "{out}");
        // 원본 보존
        assert!(std::fs::read_to_string(td.path().join("a.rs"))
            .unwrap()
            .contains("let x = 1;"));
    }

    #[test]
    fn apply_patch_거부_search_replace_동일() {
        let td = TempDir::new("ap4");
        std::fs::write(td.path().join("a.rs"), "fn x() {}").unwrap();
        let args = serde_json::json!({"path": "a.rs", "search": "x", "replace": "x"});
        let out = apply_patch_tool(&args, &td.cwd());
        assert!(
            out.contains("동일") || out.contains("변경사항 없음"),
            "{out}"
        );
    }

    #[test]
    fn delete_file_정상() {
        let td = TempDir::new("df1");
        std::fs::write(td.path().join("a.txt"), "x").unwrap();
        let args = serde_json::json!({"path": "a.txt"});
        let out = delete_file_tool(&args, &td.cwd());
        assert!(out.contains("삭제 성공"), "{out}");
        assert!(!td.path().join("a.txt").exists());
    }

    #[test]
    fn delete_file_거부_미존재() {
        let td = TempDir::new("df2");
        let args = serde_json::json!({"path": "nope.txt"});
        let out = delete_file_tool(&args, &td.cwd());
        assert!(
            out.contains("존재하지 않") || out.contains("부모 디렉터리"),
            "{out}"
        );
    }

    #[test]
    fn parse_action_handles_apply_patch() {
        let text = r#"THOUGHT: a를 b로 바꾼다
ACTION: apply_patch({"path": "src/a.rs", "search": "fn a", "replace": "fn b"})"#;
        let action = parse_action(text).unwrap();
        assert_eq!(action.tool, "apply_patch");
        assert_eq!(action.args["path"].as_str(), Some("src/a.rs"));
        assert_eq!(action.args["search"].as_str(), Some("fn a"));
        assert_eq!(action.args["replace"].as_str(), Some("fn b"));
    }

    #[test]
    fn parse_action_handles_write_file() {
        let text = r#"THOUGHT: 새 파일 생성
ACTION: write_file({"path": "src/new.rs", "content": "pub fn x() {}", "overwrite": false})"#;
        let action = parse_action(text).unwrap();
        assert_eq!(action.tool, "write_file");
        assert_eq!(action.args["overwrite"].as_bool(), Some(false));
    }

    #[test]
    fn build_prompt_includes_write_tools() {
        let s = build_system_prompt(&[], &[], true, true, true, true);
        assert!(s.contains("write_file"));
        assert!(s.contains("apply_patch"));
        assert!(s.contains("delete_file"));
        assert!(s.contains("screenshot"));
        assert!(s.contains("click"));
        assert!(s.contains("type"));
        assert!(s.contains("scroll"));
        assert!(s.contains("key_combo"));
        // 안전 가드 안내가 시스템 프롬프트에 들어가야 함
        assert!(s.contains(".git") || s.contains("CWD 내부"));
    }

    #[test]
    fn build_prompt_includes_skill_section() {
        let skills = vec![crate::commands::skills::Skill {
            id: "test".into(),
            name: "Git rebase 정리".into(),
            description: "복잡한 rebase 충돌 해결".into(),
            triggers: vec![],
            when_to_use: Some("충돌 나는 rebase 작업".into()),
            quick_reference: None,
            procedure: "1. git status 확인\n2. 충돌 파일 수정\n3. git rebase --continue".into(),
            pitfalls: None,
            verification: None,
            description_embedding: None,
            created_ms: 0,
            last_used_ms: None,
            success_count: 0,
        }];
        let s = build_system_prompt(&[], &skills, true, true, true, true);
        assert!(s.contains("관련 Skill"));
        assert!(s.contains("Git rebase 정리"));
        assert!(s.contains("git rebase --continue"));
    }

    // ─── 실전 시나리오 통합 검증 ──────────────────────────────────────────────
    // LLM 없이 도구 함수를 직접 순차 호출해 코딩 워크플로우를 시뮬레이션.
    // 실제 LLM이 ReAct 루프에서 호출하게 될 패턴을 그대로 재현 — 도구 조합·자가 복구·
    // 안전 가드가 멀티스텝 흐름에서도 의도대로 작동하는지 확인.

    /// 시나리오 1: "새 모듈 + 테스트 파일 생성" — 가장 흔한 코딩 에이전트 작업.
    /// 사용자가 ">> src/math.rs에 add 함수와 테스트 추가"라고 했을 때의 LLM 행동 시뮬레이션.
    #[test]
    fn 시나리오_신규_모듈과_테스트_생성() {
        let td = TempDir::new("scn1");
        std::fs::create_dir_all(td.path().join("src")).unwrap();

        // Step 1: 본 모듈 작성
        let math_src = "pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}\n";
        let r1 = write_file_tool(
            &serde_json::json!({"path": "src/math.rs", "content": math_src}),
            &td.cwd(),
        );
        assert!(r1.contains("쓰기 성공"), "step1: {r1}");

        // Step 2: 테스트 파일 작성
        let test_src = "#[test]\nfn add_basic() {\n    assert_eq!(super::add(2, 3), 5);\n}\n";
        let r2 = write_file_tool(
            &serde_json::json!({"path": "src/math_test.rs", "content": test_src}),
            &td.cwd(),
        );
        assert!(r2.contains("쓰기 성공"), "step2: {r2}");

        // Step 3: read로 둘 다 검증 — LLM이 OBSERVATION으로 받게 될 내용
        let v1 = read_file_tool("src/math.rs", &td.cwd());
        assert!(v1.contains("pub fn add"), "본문 검증 실패: {v1}");
        let v2 = read_file_tool("src/math_test.rs", &td.cwd());
        assert!(v2.contains("add_basic"), "테스트 검증 실패: {v2}");
    }

    /// 시나리오 2: "search 0건 → 컨텍스트 보강 → 1건" 자가 복구 패턴.
    /// LLM이 첫 시도에서 search를 너무 좁게 잡았다가 OBSERVATION 보고 컨텍스트 늘려 재시도.
    #[test]
    fn 시나리오_apply_patch_자가_복구_0건에서_1건() {
        let td = TempDir::new("scn2");
        let initial = "pub fn greet(name: &str) -> String {\n    format!(\"Hello, {}\", name)\n}\n";
        std::fs::write(td.path().join("greet.rs"), initial).unwrap();

        // 1차 시도: 존재하지 않는 문자열 — 실패해야 함
        let fail = apply_patch_tool(
            &serde_json::json!({
                "path": "greet.rs",
                "search": "Hi, {}",
                "replace": "Howdy, {}",
            }),
            &td.cwd(),
        );
        assert!(fail.contains("찾지 못했습니다"), "1차 거부 실패: {fail}");
        // 거부됐으면 파일 변경 없어야 함
        assert_eq!(
            std::fs::read_to_string(td.path().join("greet.rs")).unwrap(),
            initial
        );

        // 2차 시도: 정확한 search — 성공해야 함
        let ok = apply_patch_tool(
            &serde_json::json!({
                "path": "greet.rs",
                "search": "Hello, {}",
                "replace": "안녕, {}",
            }),
            &td.cwd(),
        );
        assert!(ok.contains("패치 적용 성공"), "2차 성공 실패: {ok}");
        let final_content = std::fs::read_to_string(td.path().join("greet.rs")).unwrap();
        assert!(final_content.contains("안녕, {}"));
        assert!(!final_content.contains("Hello, {}"));
    }

    /// 시나리오 3: "search 2건 매칭 → 컨텍스트 확장 → 1건" 모호성 해소.
    /// 가장 까다로운 패턴 — LLM이 매칭 개수 오류를 보고 앞뒤 라인을 더 포함시켜야 함.
    #[test]
    fn 시나리오_apply_patch_모호성_해소() {
        let td = TempDir::new("scn3");
        let initial = "let count = 0;\nlet total = 0;\nlet limit = 100;\n";
        std::fs::write(td.path().join("vars.rs"), initial).unwrap();

        // 1차: "= 0;" 만으로 search → 2건 매칭 거부
        let amb = apply_patch_tool(
            &serde_json::json!({
                "path": "vars.rs",
                "search": "= 0;",
                "replace": "= 1;",
            }),
            &td.cwd(),
        );
        assert!(amb.contains("매칭됩니다"), "모호성 거부 실패: {amb}");
        assert_eq!(
            std::fs::read_to_string(td.path().join("vars.rs")).unwrap(),
            initial
        );

        // 2차: "count = 0;" — 1건만 매칭
        let ok = apply_patch_tool(
            &serde_json::json!({
                "path": "vars.rs",
                "search": "count = 0;",
                "replace": "count = 10;",
            }),
            &td.cwd(),
        );
        assert!(ok.contains("패치 적용 성공"), "1건 매칭 실패: {ok}");
        let final_content = std::fs::read_to_string(td.path().join("vars.rs")).unwrap();
        assert!(final_content.contains("count = 10;"), "count 변경 안 됨");
        assert!(
            final_content.contains("total = 0;"),
            "total은 그대로여야 함"
        );
    }

    /// 시나리오 4: "안전 가드 5종 일괄 검증" — LLM이 환각해도 시스템 파일 안 건드림.
    #[test]
    fn 시나리오_안전_가드_일괄() {
        let td = TempDir::new("scn4");
        std::fs::create_dir_all(td.path().join(".git")).unwrap();
        std::fs::create_dir_all(td.path().join("node_modules")).unwrap();
        std::fs::create_dir_all(td.path().join(".lum_data")).unwrap();

        let attacks = vec![
            // 1) cwd 외부 절대경로
            if cfg!(windows) {
                "C:\\Windows\\evil.txt"
            } else {
                "/etc/evil.txt"
            },
            // 2) traversal
            "../../../escape.txt",
            // 3) .git 침입
            ".git/config",
            // 4) node_modules 침입
            "node_modules/malicious.js",
            // 5) LUM 내부 데이터 침입
            ".lum_data/leak.json",
        ];

        for path in &attacks {
            let r = write_file_tool(
                &serde_json::json!({"path": path, "content": "PWNED"}),
                &td.cwd(),
            );
            assert!(r.contains("오류"), "공격 차단 실패 [{path}]: {r}");
        }

        // 어떤 공격도 cwd 내부에 PWNED 파일을 만들지 못했어야 함
        // (시스템 파일 변경은 OS 권한이 막아주지만, 이 테스트의 핵심은 도구 레이어가 거부하는 것)
        fn search_pwned(p: &Path) -> bool {
            std::fs::read_dir(p)
                .map(|entries| {
                    entries.flatten().any(|e| {
                        let pp = e.path();
                        if pp.is_file() {
                            std::fs::read_to_string(&pp)
                                .map(|c| c.contains("PWNED"))
                                .unwrap_or(false)
                        } else if pp.is_dir() {
                            search_pwned(&pp)
                        } else {
                            false
                        }
                    })
                })
                .unwrap_or(false)
        }
        assert!(
            !search_pwned(td.path()),
            "어떤 공격도 PWNED 흔적을 남겨선 안 됨"
        );
    }

    /// 시나리오 5: "함수 리팩터링 멀티스텝" — write → apply_patch ×2 → delete → 최종 검증.
    /// 임시 파일 정리까지 포함된 본격 리팩터링 워크플로우.
    #[test]
    fn 시나리오_리팩터링_멀티스텝() {
        let td = TempDir::new("scn5");

        // Step 1: 초기 함수 작성
        let initial = "pub fn calc(x: i32) -> i32 {\n    x * 2\n}\n";
        let r1 = write_file_tool(
            &serde_json::json!({"path": "calc.rs", "content": initial}),
            &td.cwd(),
        );
        assert!(r1.contains("쓰기 성공"), "step1: {r1}");

        // Step 2: 시그니처에 인자 추가 (apply_patch)
        let r2 = apply_patch_tool(
            &serde_json::json!({
                "path": "calc.rs",
                "search": "pub fn calc(x: i32) -> i32",
                "replace": "pub fn calc(x: i32, factor: i32) -> i32",
            }),
            &td.cwd(),
        );
        assert!(r2.contains("패치 적용 성공"), "step2: {r2}");

        // Step 3: 본문 변경 (apply_patch)
        let r3 = apply_patch_tool(
            &serde_json::json!({
                "path": "calc.rs",
                "search": "x * 2",
                "replace": "x * factor",
            }),
            &td.cwd(),
        );
        assert!(r3.contains("패치 적용 성공"), "step3: {r3}");

        // Step 4: 임시 메모 파일 생성 후 삭제
        std::fs::write(td.path().join("memo.tmp"), "todo").unwrap();
        let r4 = delete_file_tool(&serde_json::json!({"path": "memo.tmp"}), &td.cwd());
        assert!(r4.contains("삭제 성공"), "step4: {r4}");
        assert!(!td.path().join("memo.tmp").exists());

        // Step 5: 최종 상태 검증
        let final_content = std::fs::read_to_string(td.path().join("calc.rs")).unwrap();
        assert_eq!(
            final_content, "pub fn calc(x: i32, factor: i32) -> i32 {\n    x * factor\n}\n",
            "리팩터링 최종 결과가 기대와 다름:\n{final_content}"
        );
    }

    /// 시나리오 6: "동일 작업 멱등성" — overwrite=true로 같은 내용 여러 번 써도 안전.
    /// LLM이 같은 단계를 중복 실행해도 망가지지 않는지 검증.
    #[test]
    fn 시나리오_overwrite_멱등성() {
        let td = TempDir::new("scn6");
        let content = "version = \"1.0.0\"\n";
        for i in 1..=3 {
            let r = write_file_tool(
                &serde_json::json!({"path": "config.toml", "content": content, "overwrite": true}),
                &td.cwd(),
            );
            assert!(r.contains("쓰기 성공"), "반복 {i} 실패: {r}");
            assert_eq!(
                std::fs::read_to_string(td.path().join("config.toml")).unwrap(),
                content,
            );
        }
    }

    // ─── ReAct 루프 e2e 시뮬레이션 (mock LLM) ─────────────────────────────────
    // 실제 LLM 응답 시퀀스를 미리 스크립팅해서 ReAct 의사결정 흐름을 시뮬레이션.
    // parse_thought → parse_action → 도구 dispatch → OBSERVATION → 다음 응답 흐름을
    // react_agent_run 본체와 동일하게 재현 (AppHandle / call_xllm / mcp 의존만 우회).
    // Tauri/MCP 의존 없이 검증 가능하도록 sync 도구만 dispatch — 충분히 의미 있는 e2e.

    #[derive(Debug, PartialEq)]
    enum SimEvent {
        Thought(String),
        Action(String), // "tool(args)"
        Observation(String),
        Answer(String),
        ForcedAnswerOnRepeat,
    }

    #[derive(Debug)]
    struct SimResult {
        events: Vec<SimEvent>,
        consumed_responses: usize,
        finished: bool,
    }

    impl SimResult {
        fn answer(&self) -> Option<&str> {
            self.events.iter().find_map(|e| match e {
                SimEvent::Answer(s) => Some(s.as_str()),
                _ => None,
            })
        }
        fn observations(&self) -> Vec<&str> {
            self.events
                .iter()
                .filter_map(|e| match e {
                    SimEvent::Observation(s) => Some(s.as_str()),
                    _ => None,
                })
                .collect()
        }
        fn actions(&self) -> Vec<&str> {
            self.events
                .iter()
                .filter_map(|e| match e {
                    SimEvent::Action(s) => Some(s.as_str()),
                    _ => None,
                })
                .collect()
        }
    }

    /// 테스트 전용 도구 dispatch — sync 도구만 (shell/run_tests/git_diff/get_repo_map은 제외).
    /// 시나리오는 read/list/write/patch/delete만으로 충분 — 코딩 에이전트 핵심 흐름.
    fn sim_dispatch(tool: &str, args: &serde_json::Value, cwd: &str) -> String {
        match tool {
            "read_file" => {
                let path = args["path"].as_str().unwrap_or("").to_string();
                read_file_tool(&path, cwd)
            }
            "list_dir" => {
                let path = args["path"].as_str().unwrap_or(cwd).to_string();
                list_dir_tool(&path, cwd)
            }
            "write_file" => write_file_tool(args, cwd),
            "apply_patch" => apply_patch_tool(args, cwd),
            "delete_file" => delete_file_tool(args, cwd),
            other => format!("[테스트 시뮬레이터: 비지원 도구 {other}]"),
        }
    }

    /// react_agent_run 메인 루프와 동일한 의사결정 흐름.
    /// 차이점: LLM 호출은 미리 준비된 응답 시퀀스에서 꺼냄, AppHandle emit 없음, MAX_STEPS 동일.
    fn simulate_react_loop(llm_responses: &[&str], cwd: &str) -> SimResult {
        let mut events = Vec::new();
        let mut recent_actions: Vec<String> = Vec::new();
        let mut consumed = 0;

        for response in llm_responses.iter().take(MAX_STEPS) {
            consumed += 1;

            let thought = parse_thought(response);
            if !thought.is_empty() {
                events.push(SimEvent::Thought(thought));
            }

            if let Some(answer) = parse_answer(response) {
                events.push(SimEvent::Answer(answer));
                return SimResult {
                    events,
                    consumed_responses: consumed,
                    finished: true,
                };
            }

            let Some(action) = parse_action(response) else {
                events.push(SimEvent::Answer(response.trim().to_string()));
                return SimResult {
                    events,
                    consumed_responses: consumed,
                    finished: true,
                };
            };

            let action_key = format!("{}:{}", action.tool, action.args);
            let repeats = recent_actions.iter().filter(|a| *a == &action_key).count();
            if repeats >= 2 {
                events.push(SimEvent::ForcedAnswerOnRepeat);
                return SimResult {
                    events,
                    consumed_responses: consumed,
                    finished: true,
                };
            }
            recent_actions.push(action_key);

            events.push(SimEvent::Action(format!(
                "{}({})",
                action.tool, action.args
            )));
            let observation = sim_dispatch(&action.tool, &action.args, cwd);
            events.push(SimEvent::Observation(observation));
        }

        SimResult {
            events,
            consumed_responses: consumed,
            finished: false,
        }
    }

    /// e2e 시나리오 A: "신규 함수 작성 → 검증 → ANSWER".
    /// LLM이 list_dir로 구조 파악 → write_file로 신규 모듈 작성 → read_file로 검증 → ANSWER.
    /// 가장 흔한 코딩 에이전트 사용 패턴.
    #[test]
    fn e2e_시나리오_a_신규_함수_작성_완주() {
        let td = TempDir::new("e2e_a");

        let llm_script = vec![
            r#"THOUGHT: 먼저 작업 디렉터리 구조를 파악한다
ACTION: list_dir({"path": "."})"#,
            r#"THOUGHT: 디렉터리가 비어있다. 신규 파일 utils.rs를 만든다
ACTION: write_file({"path": "utils.rs", "content": "pub fn add(a: i32, b: i32) -> i32 { a + b }\n"})"#,
            r#"THOUGHT: 파일이 정상 작성됐는지 확인한다
ACTION: read_file({"path": "utils.rs"})"#,
            r#"THOUGHT: 함수가 잘 작성됐다
ANSWER: utils.rs에 add(a, b) 함수를 작성했습니다."#,
        ];

        let r = simulate_react_loop(&llm_script, &td.cwd());

        assert!(r.finished, "ANSWER로 정상 종료해야 함");
        assert_eq!(r.consumed_responses, 4, "4단계 모두 거쳐야 함");
        let actions = r.actions();
        assert_eq!(actions.len(), 3, "도구 호출 3회: {actions:?}");
        // 각 도구가 의도한 순서대로 호출됐는지
        assert!(actions[0].starts_with("list_dir"));
        assert!(actions[1].starts_with("write_file"));
        assert!(actions[2].starts_with("read_file"));
        // 마지막 read_file의 OBSERVATION에 add 함수 본문이 들어있어야 함
        let obs = r.observations();
        assert!(
            obs[2].contains("pub fn add"),
            "read_file observation: {}",
            obs[2]
        );
        // ANSWER 도달
        assert!(r.answer().unwrap().contains("add"));
        // 실제 파일 시스템 확인
        let written = std::fs::read_to_string(td.path().join("utils.rs")).unwrap();
        assert!(written.contains("pub fn add"));
    }

    /// e2e 시나리오 B: "search 0건 OBSERVATION → 컨텍스트 보강 → 1건 매칭 → ANSWER".
    /// 자가 복구의 핵심 — LLM이 도구 오류 메시지를 보고 다음 응답에서 수정해야 함.
    #[test]
    fn e2e_시나리오_b_자가_복구() {
        let td = TempDir::new("e2e_b");
        std::fs::write(
            td.path().join("greet.rs"),
            "pub fn greet(name: &str) -> String {\n    format!(\"Hello, {}\", name)\n}\n",
        )
        .unwrap();

        let llm_script = vec![
            // 1차 시도 — 잘못된 search
            r#"THOUGHT: greet 함수의 인사말을 한국어로 바꾼다
ACTION: apply_patch({"path": "greet.rs", "search": "Hi, {}", "replace": "안녕하세요, {}"})"#,
            // OBSERVATION에서 "찾지 못했습니다"를 읽었다고 가정한 2차 시도
            r#"THOUGHT: search 문자열이 틀렸다. 실제 코드의 "Hello"로 다시 시도
ACTION: apply_patch({"path": "greet.rs", "search": "Hello, {}", "replace": "안녕하세요, {}"})"#,
            r#"THOUGHT: 변경이 적용됐다
ANSWER: greet 함수의 인사말을 한국어로 변경했습니다."#,
        ];

        let r = simulate_react_loop(&llm_script, &td.cwd());

        assert!(r.finished);
        let obs = r.observations();
        // 1차 OBSERVATION은 자가 복구 힌트를 포함해야 함
        assert!(
            obs[0].contains("찾지 못했습니다"),
            "1차 오류 메시지: {}",
            obs[0]
        );
        assert!(obs[0].contains("다시 시도"), "재시도 힌트 누락: {}", obs[0]);
        // 2차 OBSERVATION은 성공
        assert!(obs[1].contains("패치 적용 성공"), "2차 성공: {}", obs[1]);
        // 실제 파일 변경 검증
        let final_content = std::fs::read_to_string(td.path().join("greet.rs")).unwrap();
        assert!(final_content.contains("안녕하세요, {}"));
        assert!(!final_content.contains("Hello, {}"));
    }

    /// e2e 시나리오 C: "동일 액션 3회 → 강제 종료".
    /// LLM이 환각으로 같은 도구 같은 인수를 무한 반복할 때 루프 방지가 작동.
    #[test]
    fn e2e_시나리오_c_동일_액션_반복_차단() {
        let td = TempDir::new("e2e_c");
        std::fs::write(td.path().join("a.rs"), "fn x() {}").unwrap();

        let same = r#"THOUGHT: 다시 시도
ACTION: read_file({"path": "a.rs"})"#;
        let llm_script = vec![same, same, same, same, same];

        let r = simulate_react_loop(&llm_script, &td.cwd());

        // 3번째 호출에서 ForcedAnswerOnRepeat로 종료해야 함 (recent_actions에 2회 누적된 후 3회째)
        assert!(r.finished);
        assert!(
            r.events
                .iter()
                .any(|e| matches!(e, SimEvent::ForcedAnswerOnRepeat)),
            "강제 종료 이벤트 누락: {:?}",
            r.events
        );
        // 최대 3개 응답만 소비 (1·2회 정상, 3회째 차단)
        assert_eq!(r.consumed_responses, 3, "차단 시점이 다름");
    }

    /// e2e 시나리오 D: "리팩터링 멀티스텝 — read → patch → patch → read → ANSWER".
    /// 가장 복잡한 흐름 — 실제 코드베이스 수정 작업의 전형.
    #[test]
    fn e2e_시나리오_d_리팩터링_멀티스텝() {
        let td = TempDir::new("e2e_d");
        std::fs::write(
            td.path().join("calc.rs"),
            "pub fn calc(x: i32) -> i32 {\n    x * 2\n}\n",
        )
        .unwrap();

        let llm_script = vec![
            r#"THOUGHT: 현재 코드 확인
ACTION: read_file({"path": "calc.rs"})"#,
            r#"THOUGHT: 시그니처에 factor 인자를 추가
ACTION: apply_patch({"path": "calc.rs", "search": "pub fn calc(x: i32) -> i32", "replace": "pub fn calc(x: i32, factor: i32) -> i32"})"#,
            r#"THOUGHT: 본문도 factor를 사용하도록 변경
ACTION: apply_patch({"path": "calc.rs", "search": "x * 2", "replace": "x * factor"})"#,
            r#"THOUGHT: 최종 결과 확인
ACTION: read_file({"path": "calc.rs"})"#,
            r#"THOUGHT: 리팩터링이 정상 완료됐다
ANSWER: calc 함수를 factor 파라미터를 받도록 리팩터링했습니다."#,
        ];

        let r = simulate_react_loop(&llm_script, &td.cwd());

        assert!(r.finished);
        assert_eq!(r.consumed_responses, 5);
        let obs = r.observations();
        assert_eq!(obs.len(), 4, "도구 호출 4회: {:?}", obs);
        // 두 번의 패치가 모두 성공
        assert!(obs[1].contains("패치 적용 성공"));
        assert!(obs[2].contains("패치 적용 성공"));
        // 마지막 read_file이 최종 형태 반환
        assert!(obs[3].contains("pub fn calc(x: i32, factor: i32)"));
        assert!(obs[3].contains("x * factor"));
        // 실제 파일도 정확히 일치
        let final_content = std::fs::read_to_string(td.path().join("calc.rs")).unwrap();
        assert_eq!(
            final_content,
            "pub fn calc(x: i32, factor: i32) -> i32 {\n    x * factor\n}\n"
        );
    }

    /// e2e 시나리오 E: "ANSWER 즉시 도달".
    /// LLM이 첫 응답에서 도구 없이 곧장 ANSWER — 단순 질의응답.
    #[test]
    fn e2e_시나리오_e_즉시_답변() {
        let td = TempDir::new("e2e_e");
        let llm_script = vec![
            r#"THOUGHT: 단순 질문이므로 도구 불필요
ANSWER: 2 + 2는 4입니다."#,
        ];
        let r = simulate_react_loop(&llm_script, &td.cwd());
        assert!(r.finished);
        assert_eq!(r.consumed_responses, 1);
        assert!(r.actions().is_empty(), "도구 호출 없어야 함");
        assert_eq!(r.answer(), Some("2 + 2는 4입니다."));
    }

    // ─── 백업/되돌리기 시나리오 ───────────────────────────────────────────────
    // REACT_BACKUP은 글로벌 state라 멀티스레드 테스트에서 충돌 가능.
    // 백업 시나리오 테스트들은 BACKUP_TEST_LOCK으로 직렬화. 다른 단위 테스트는 영향 없음
    // (init 안 하므로 track_pre_write가 noop).

    static BACKUP_TEST_LOCK: Mutex<()> = Mutex::new(());

    /// undo 실패 시 다음 테스트가 영향받지 않게 정리.
    fn cleanup_backup_state() {
        let backup = backup_lock().lock().unwrap().take();
        if let Some(active) = backup {
            let _ = std::fs::remove_dir_all(active.backup_dir);
        }

        if let Ok(cwd) = std::env::current_dir() {
            for dir in react_backup_dir(&cwd) {
                let _ = std::fs::remove_dir_all(dir);
            }
        }
    }

    #[test]
    fn 백업_신규_파일_생성_후_undo로_삭제됨() {
        let td = TempDir::new("bk1");
        init_react_backup(&td.cwd());

        let r = write_file_tool(
            &serde_json::json!({"path": "new.txt", "content": "hi"}),
            &td.cwd(),
        );
        assert!(r.contains("쓰기 성공"));
        assert!(td.path().join("new.txt").exists());

        let report = restore_react_backup().unwrap();
        assert_eq!(report.removed.len(), 1);
        assert!(report.errors.is_empty());
        assert!(
            !td.path().join("new.txt").exists(),
            "신규 파일이 undo로 삭제돼야 함"
        );

        cleanup_backup_state();
    }

    #[test]
    fn 백업_기존_파일_수정_후_undo로_원본_복원() {
        let td = TempDir::new("bk2");
        std::fs::write(td.path().join("a.rs"), "원본 내용").unwrap();
        init_react_backup(&td.cwd());

        let r = write_file_tool(
            &serde_json::json!({"path": "a.rs", "content": "수정된 내용", "overwrite": true}),
            &td.cwd(),
        );
        assert!(r.contains("쓰기 성공"));
        assert_eq!(
            std::fs::read_to_string(td.path().join("a.rs")).unwrap(),
            "수정된 내용"
        );

        let report = restore_react_backup().unwrap();
        assert_eq!(report.restored.len(), 1);
        assert_eq!(
            std::fs::read_to_string(td.path().join("a.rs")).unwrap(),
            "원본 내용",
            "원본으로 복원돼야 함"
        );

        cleanup_backup_state();
    }

    #[test]
    fn 백업_파일_삭제_후_undo로_복원() {
        let td = TempDir::new("bk3");
        std::fs::write(td.path().join("doomed.txt"), "보존되어야 함").unwrap();
        init_react_backup(&td.cwd());

        let r = delete_file_tool(&serde_json::json!({"path": "doomed.txt"}), &td.cwd());
        assert!(r.contains("삭제 성공"));
        assert!(!td.path().join("doomed.txt").exists());

        let report = restore_react_backup().unwrap();
        assert_eq!(report.restored.len(), 1);
        assert_eq!(
            std::fs::read_to_string(td.path().join("doomed.txt")).unwrap(),
            "보존되어야 함",
            "삭제된 파일이 복원돼야 함"
        );

        cleanup_backup_state();
    }

    #[test]
    fn 백업_동일_파일_여러번_수정해도_첫_원본만_보존() {
        let td = TempDir::new("bk4");
        std::fs::write(td.path().join("a.rs"), "v0").unwrap();
        init_react_backup(&td.cwd());

        // v0 → v1 → v2 → v3 (apply_patch 두 번 + write_file 한 번)
        write_file_tool(
            &serde_json::json!({"path": "a.rs", "content": "v1", "overwrite": true}),
            &td.cwd(),
        );
        apply_patch_tool(
            &serde_json::json!({"path": "a.rs", "search": "v1", "replace": "v2"}),
            &td.cwd(),
        );
        apply_patch_tool(
            &serde_json::json!({"path": "a.rs", "search": "v2", "replace": "v3"}),
            &td.cwd(),
        );
        assert_eq!(
            std::fs::read_to_string(td.path().join("a.rs")).unwrap(),
            "v3"
        );

        let report = restore_react_backup().unwrap();
        assert_eq!(report.restored.len(), 1, "한 파일만 추적되어야 함");
        assert_eq!(
            std::fs::read_to_string(td.path().join("a.rs")).unwrap(),
            "v0",
            "여러 번 수정해도 첫 원본 v0로 복원"
        );

        cleanup_backup_state();
    }

    #[test]
    fn 백업_혼합_시나리오_write_patch_delete_모두_원복() {
        let td = TempDir::new("bk5");
        std::fs::write(td.path().join("kept.rs"), "원래값").unwrap();
        std::fs::write(td.path().join("doomed.rs"), "삭제 예정").unwrap();
        init_react_backup(&td.cwd());

        // 1) 신규 파일 생성
        write_file_tool(
            &serde_json::json!({"path": "fresh.rs", "content": "new"}),
            &td.cwd(),
        );
        // 2) 기존 파일 수정
        apply_patch_tool(
            &serde_json::json!({"path": "kept.rs", "search": "원래값", "replace": "수정값"}),
            &td.cwd(),
        );
        // 3) 기존 파일 삭제
        delete_file_tool(&serde_json::json!({"path": "doomed.rs"}), &td.cwd());

        // 변경 적용 확인
        assert!(td.path().join("fresh.rs").exists());
        assert_eq!(
            std::fs::read_to_string(td.path().join("kept.rs")).unwrap(),
            "수정값"
        );
        assert!(!td.path().join("doomed.rs").exists());

        // undo
        let report = restore_react_backup().unwrap();
        assert_eq!(report.removed.len(), 1, "fresh.rs만 삭제 (Created)");
        assert_eq!(
            report.restored.len(),
            2,
            "kept.rs + doomed.rs 복원 (Original)"
        );
        assert!(report.errors.is_empty());

        // 최종 상태 — 모두 원래대로
        assert!(!td.path().join("fresh.rs").exists());
        assert_eq!(
            std::fs::read_to_string(td.path().join("kept.rs")).unwrap(),
            "원래값"
        );
        assert_eq!(
            std::fs::read_to_string(td.path().join("doomed.rs")).unwrap(),
            "삭제 예정"
        );

        cleanup_backup_state();
    }

    #[test]
    fn 백업_undo_두번_호출시_두번째는_err() {
        let td = TempDir::new("bk6");
        init_react_backup(&td.cwd());
        write_file_tool(
            &serde_json::json!({"path": "a.txt", "content": "x"}),
            &td.cwd(),
        );

        let r1 = restore_react_backup();
        assert!(r1.is_ok(), "첫 undo 성공");

        let r2 = restore_react_backup();
        assert!(r2.is_err(), "두 번째 undo는 활성 백업 없으므로 실패");
        assert!(r2.unwrap_err().contains("활성 ReAct 백업 없음"));

        cleanup_backup_state();
    }

    #[test]
    fn 백업_미활성_상태에서_도구는_정상_작동_undo만_err() {
        // init_react_backup 호출 안 함 — 단위 테스트 격리 보장 검증. TempDir이 락 자동 잡음.
        let td = TempDir::new("bk7");
        cleanup_backup_state();
        let r = write_file_tool(
            &serde_json::json!({"path": "a.txt", "content": "x"}),
            &td.cwd(),
        );
        assert!(
            r.contains("쓰기 성공"),
            "백업 미활성이라도 도구는 정상 작동"
        );
        assert!(td.path().join("a.txt").exists());

        let undo = restore_react_backup();
        assert!(undo.is_err(), "백업 미활성이면 undo는 Err");
    }

    #[test]
    fn 백업_list_tracked_changes_미활성이면_빈_벡터() {
        // TempDir 안 만드는 테스트 — 명시적 락. poison 회복 처리.
        let _g = BACKUP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        cleanup_backup_state();
        assert!(list_tracked_changes().is_empty(), "백업 미활성 시 빈 벡터");
    }

    #[test]
    fn 백업_list_tracked_changes_활성_시_변경_파일_포함() {
        let td = TempDir::new("bk8");
        init_react_backup(&td.cwd());
        write_file_tool(
            &serde_json::json!({"path": "a.txt", "content": "1"}),
            &td.cwd(),
        );
        write_file_tool(
            &serde_json::json!({"path": "b.txt", "content": "2"}),
            &td.cwd(),
        );
        let changes = list_tracked_changes();
        assert_eq!(changes.len(), 2);
        assert!(changes.iter().any(|p| p.ends_with("a.txt")));
        assert!(changes.iter().any(|p| p.ends_with("b.txt")));
        cleanup_backup_state();
    }

    // ─── 위험도 분류 + 변경 사항 조회 ─────────────────────────────────────────

    #[test]
    fn 위험도_high_빌드_매니페스트() {
        for name in &[
            "Cargo.toml",
            "package.json",
            "tsconfig.json",
            "tauri.conf.json",
            "vite.config.ts",
            "vitest.config.ts",
            "playwright.config.ts",
            "tailwind.config.js",
            "build.rs",
            "Dockerfile",
            "Makefile",
        ] {
            assert_eq!(
                classify_change_risk(name),
                ChangeRisk::High,
                "{} 는 High여야 함",
                name
            );
        }
    }

    #[test]
    fn 위험도_high_env_파일() {
        assert_eq!(classify_change_risk(".env"), ChangeRisk::High);
        assert_eq!(classify_change_risk(".env.local"), ChangeRisk::High);
        assert_eq!(classify_change_risk(".env.production"), ChangeRisk::High);
        assert_eq!(classify_change_risk("src/.env"), ChangeRisk::High);
    }

    #[test]
    fn 위험도_high_빌드_ci_디렉터리() {
        assert_eq!(classify_change_risk("scripts/build.sh"), ChangeRisk::High);
        assert_eq!(
            classify_change_risk(".github/workflows/ci.yml"),
            ChangeRisk::High
        );
        assert_eq!(classify_change_risk("ci/deploy.sh"), ChangeRisk::High);
    }

    #[test]
    fn 위험도_low_테스트_파일() {
        for path in &[
            "tests/integration.rs",
            "test/foo.rs",
            "src/utils.test.ts",
            "src/utils.spec.tsx",
            "src/components/Button.test.tsx",
            "src/utils_test.rs",
            "internal/db_test.go",
            "tests/e2e/login.spec.ts",
            "e2e/scenario.ts",
            "src/__tests__/helpers.ts",
            "tests/test_db.py",
        ] {
            assert_eq!(
                classify_change_risk(path),
                ChangeRisk::Low,
                "{} 는 Low여야 함",
                path
            );
        }
    }

    #[test]
    fn 위험도_medium_일반_소스() {
        for path in &[
            "src/lib.rs",
            "src/main.rs",
            "src/components/Button.tsx",
            "src/hooks/useFoo.ts",
            "src-tauri/src/commands/ai.rs",
            "README.md",
        ] {
            assert_eq!(
                classify_change_risk(path),
                ChangeRisk::Medium,
                "{} 는 Medium이어야 함",
                path
            );
        }
    }

    #[test]
    fn 위험도_windows_백슬래시_정규화() {
        // 입력이 백슬래시여도 슬래시와 동일 분류 — Windows 호환.
        assert_eq!(classify_change_risk("scripts\\build.bat"), ChangeRisk::High);
        assert_eq!(
            classify_change_risk("src\\components\\Button.test.tsx"),
            ChangeRisk::Low
        );
        assert_eq!(classify_change_risk("src\\lib.rs"), ChangeRisk::Medium);
    }

    #[test]
    fn 위험도_대소문자_무관() {
        assert_eq!(classify_change_risk("CARGO.TOML"), ChangeRisk::High);
        assert_eq!(classify_change_risk("Package.JSON"), ChangeRisk::High);
        assert_eq!(classify_change_risk("Tests/Foo.rs"), ChangeRisk::Low);
    }

    #[test]
    fn react_agent_changes_백업_미활성이면_빈_벡터() {
        let _g = BACKUP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        cleanup_backup_state();
        assert!(react_agent_changes().is_empty());
    }

    #[test]
    fn react_agent_changes_created_modified_deleted_분류() {
        let td = TempDir::new("ch1");
        // 사전 파일: 수정 대상 + 삭제 대상.
        std::fs::write(td.path().join("modify.rs"), "원본").unwrap();
        std::fs::write(td.path().join("doomed.rs"), "삭제 예정").unwrap();
        init_react_backup(&td.cwd());

        // 신규 / 수정 / 삭제 한 번씩.
        write_file_tool(
            &serde_json::json!({"path": "fresh.rs", "content": "new"}),
            &td.cwd(),
        );
        apply_patch_tool(
            &serde_json::json!({"path": "modify.rs", "search": "원본", "replace": "수정"}),
            &td.cwd(),
        );
        delete_file_tool(&serde_json::json!({"path": "doomed.rs"}), &td.cwd());

        let changes = react_agent_changes();
        assert_eq!(changes.len(), 3);

        let by_kind = |k: ChangeKind| {
            changes
                .iter()
                .find(|c| c.kind == k)
                .unwrap_or_else(|| panic!("{:?} 분류 없음", k))
        };
        let created = by_kind(ChangeKind::Created);
        assert!(created.rel_path.ends_with("fresh.rs"));
        let modified = by_kind(ChangeKind::Modified);
        assert!(modified.rel_path.ends_with("modify.rs"));
        let deleted = by_kind(ChangeKind::Deleted);
        assert!(deleted.rel_path.ends_with("doomed.rs"));

        // 위험도는 모두 Medium (.rs 일반 소스).
        for c in &changes {
            assert_eq!(c.risk, ChangeRisk::Medium, "{}: {:?}", c.rel_path, c.risk);
        }

        cleanup_backup_state();
    }

    #[test]
    fn react_agent_changes_위험도_혼합() {
        let td = TempDir::new("ch2");
        std::fs::create_dir_all(td.path().join("src")).unwrap();
        std::fs::create_dir_all(td.path().join("tests")).unwrap();
        init_react_backup(&td.cwd());

        // High: Cargo.toml
        write_file_tool(
            &serde_json::json!({"path": "Cargo.toml", "content": "[package]\nname = \"x\""}),
            &td.cwd(),
        );
        // Medium: src/lib.rs
        write_file_tool(
            &serde_json::json!({"path": "src/lib.rs", "content": "pub fn x() {}"}),
            &td.cwd(),
        );
        // Low: tests/it.rs
        write_file_tool(
            &serde_json::json!({"path": "tests/it.rs", "content": "#[test]\nfn t() {}"}),
            &td.cwd(),
        );

        let changes = react_agent_changes();
        assert_eq!(changes.len(), 3);

        let by_path = |suffix: &str| {
            changes
                .iter()
                .find(|c| c.rel_path.ends_with(suffix))
                .unwrap_or_else(|| panic!("{suffix} not found"))
        };
        assert_eq!(by_path("Cargo.toml").risk, ChangeRisk::High);
        assert_eq!(by_path("src/lib.rs").risk, ChangeRisk::Medium);
        assert_eq!(by_path("tests/it.rs").risk, ChangeRisk::Low);

        // rel_path는 슬래시로 정규화돼있어야 — 프론트에서 OS 무관하게 표시.
        for c in &changes {
            assert!(
                !c.rel_path.contains('\\'),
                "rel_path에 백슬래시: {}",
                c.rel_path
            );
        }

        cleanup_backup_state();
    }

    /// e2e 시나리오 F: "MAX_STEPS 초과로 미완료 종료".
    /// LLM이 ANSWER에 도달 못 하고 ACTION만 계속 — 루프 상한이 작동해야 함.
    #[test]
    fn e2e_시나리오_f_max_steps_초과() {
        let td = TempDir::new("e2e_f");
        std::fs::write(td.path().join("a.rs"), "x").unwrap();

        // 매 응답마다 다른 인수로 read_file (반복 차단 회피) — 끝없이 ACTION만
        let mut script = Vec::new();
        let mut owned: Vec<String> = Vec::new();
        for i in 0..MAX_STEPS + 5 {
            owned.push(format!(
                "THOUGHT: 단계 {i}\nACTION: read_file({{\"path\": \"a.rs\", \"hint\": \"{i}\"}})"
            ));
        }
        for s in &owned {
            script.push(s.as_str());
        }

        let r = simulate_react_loop(&script, &td.cwd());
        assert!(!r.finished, "ANSWER 없으므로 미완료 종료");
        assert_eq!(r.consumed_responses, MAX_STEPS, "MAX_STEPS에서 멈춰야 함");
    }

    // ─── Phase 136-B — TaskLedger 헬퍼 회귀 가드 ─────────────────────────────

    #[test]
    fn is_complex_goal_짧은_false() {
        assert!(!is_complex_goal("Fix the login bug"));
        assert!(!is_complex_goal("버그 수정"));
        assert!(!is_complex_goal("add a test for auth"));
    }

    #[test]
    fn is_complex_goal_20단어이상_true() {
        let long = "please refactor the authentication module to use JWT tokens and also add comprehensive unit tests for all edge cases";
        assert!(
            is_complex_goal(long),
            "단어 수 초과: {}",
            long.split_whitespace().count()
        );
    }

    #[test]
    fn is_complex_goal_120자이상_true() {
        let long = "a".repeat(121);
        assert!(is_complex_goal(&long));
    }

    #[test]
    fn is_complex_goal_복수태스크_영어_true() {
        assert!(is_complex_goal("Fix the bug, and also add a test"));
        assert!(is_complex_goal("Refactor auth; update docs"));
    }

    #[test]
    fn is_complex_goal_복수태스크_한국어_true() {
        assert!(is_complex_goal("버그를 고치고 그리고 테스트를 추가하세요"));
        assert!(is_complex_goal(
            "인증 모듈을 리팩터링하세요. 또한 문서도 업데이트하세요"
        ));
    }

    #[test]
    fn parse_task_plan_번호_목록() {
        let resp = "1. 파일 읽기\n2. 버그 분석\n3. 수정 적용\n4. 테스트 실행";
        let steps = parse_task_plan(resp);
        assert_eq!(steps.len(), 4);
        assert_eq!(steps[0], "파일 읽기");
        assert_eq!(steps[3], "테스트 실행");
    }

    #[test]
    fn parse_task_plan_대시_목록() {
        let resp = "- Read the file\n- Fix the bug\n- Run tests";
        let steps = parse_task_plan(resp);
        assert_eq!(steps.len(), 3);
        assert_eq!(steps[0], "Read the file");
    }

    #[test]
    fn parse_task_plan_최대7개_제한() {
        let resp = (1..=10)
            .map(|i| format!("{i}. step {i}"))
            .collect::<Vec<_>>()
            .join("\n");
        let steps = parse_task_plan(&resp);
        assert_eq!(steps.len(), 7, "7개 초과 항목은 잘라야 함");
    }

    #[test]
    fn parse_task_plan_빈_응답() {
        assert!(parse_task_plan("").is_empty());
        assert!(parse_task_plan("   \n\n").is_empty());
    }

    #[test]
    fn parse_task_plan_짧은_항목_무시() {
        let resp = "1. ok\n2. Read the authentication module carefully\n3. hi";
        let steps = parse_task_plan(resp);
        assert_eq!(steps.len(), 1);
        assert!(steps[0].contains("authentication"));
    }

    // ─── Phase 136 — ProgressLedger 회귀 가드 ─────────────────────────────────

    #[test]
    fn progress_ledger_record_횟수_증가() {
        let mut l = ProgressLedger::new();
        assert_eq!(l.record("shell:ls"), 1);
        assert_eq!(l.record("shell:ls"), 2);
        assert_eq!(l.record("shell:ls"), 3);
        assert_eq!(l.record("read_file:a.rs"), 1); // 다른 키는 독립
    }

    #[test]
    fn progress_ledger_absorb_observation_첫_줄만() {
        let mut l = ProgressLedger::new();
        l.absorb_observation("shell", "line1\nline2\nline3");
        assert_eq!(l.key_facts.len(), 1);
        assert!(l.key_facts[0].contains("line1"), "{:?}", l.key_facts[0]);
        assert!(!l.key_facts[0].contains("line2"), "첫 줄만");
    }

    #[test]
    fn progress_ledger_absorb_최대_8개() {
        let mut l = ProgressLedger::new();
        for i in 0..15 {
            l.absorb_observation("tool", &format!("fact {i} result data"));
        }
        assert_eq!(l.key_facts.len(), 8, "최대 8개 제한");
    }

    #[test]
    fn progress_ledger_absorb_짧은_관찰_무시() {
        let mut l = ProgressLedger::new();
        l.absorb_observation("shell", "ok"); // < 5자
        assert!(l.key_facts.is_empty(), "짧은 관찰은 무시");
    }

    #[test]
    fn progress_ledger_recovery_l1_action_키_포함() {
        let mut l = ProgressLedger::new();
        l.record("shell:ls -la");
        l.record("shell:ls -la");
        let msg = l.recovery_l1("shell:ls -la");
        assert!(msg.contains("shell:ls -la"), "{msg}");
    }

    #[test]
    fn progress_ledger_recovery_l2_stuck_total_포함() {
        let mut l = ProgressLedger::new();
        l.stuck_total = 4;
        l.key_facts.push("[shell] error: file not found".into());
        let msg = l.recovery_l2();
        assert!(msg.contains("4"), "stuck_total 반영: {msg}");
        assert!(msg.contains("error: file not found"), "facts 반영: {msg}");
    }

    #[test]
    fn progress_ledger_중복_fact_미추가() {
        let mut l = ProgressLedger::new();
        l.absorb_observation("shell", "identical output line here");
        l.absorb_observation("shell", "identical output line here");
        assert_eq!(l.key_facts.len(), 1, "중복 사실은 한 번만");
    }
}
