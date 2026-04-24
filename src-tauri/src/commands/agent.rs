// Phase 55: Agentic Task Loop — 계획(plan) + 관찰(observe) 커맨드
use crate::commands::ai::call_xllm;
use crate::error::{LumError, Result};
use serde::{Deserialize, Serialize};
use tauri::command;

// ─── 데이터 구조 ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentStep {
    pub id: u32,
    pub cmd: String,
    pub description: String,
    /// "safe" | "caution" | "danger"
    pub risk: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompletedStep {
    pub id: u32,
    pub cmd: String,
    pub output: String,
    pub exit_code: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentDecision {
    /// "continue" | "done" | "failed"
    pub action: String,
    pub message: String,
    pub next_steps: Option<Vec<AgentStep>>,
}

// ─── 헬퍼 함수 ────────────────────────────────────────────────────────────────

// 문자열에서 첫 번째 '[' 부터 마지막 ']' 까지 추출
fn extract_json_array(s: &str) -> String {
    match (s.find('['), s.rfind(']')) {
        (Some(start), Some(end)) if start <= end => s[start..=end].to_string(),
        _ => s.to_string(),
    }
}

// 문자열에서 첫 번째 '{' 부터 마지막 '}' 까지 추출
fn extract_json_object(s: &str) -> String {
    match (s.find('{'), s.rfind('}')) {
        (Some(start), Some(end)) if start <= end => s[start..=end].to_string(),
        _ => s.to_string(),
    }
}

// PTY 출력에서 ANSI 이스케이프 시퀀스 제거 — AI 입력 정제용
pub fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                // CSI 시퀀스: ESC [ ... <알파벳>
                Some('[') => {
                    chars.next();
                    while let Some(&ch) = chars.peek() {
                        chars.next();
                        if ch.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                // OSC 시퀀스: ESC ] ... BEL 또는 백슬래시
                Some(']') => {
                    chars.next();
                    while let Some(&ch) = chars.peek() {
                        chars.next();
                        if ch == '\x07' || ch == '\\' {
                            break;
                        }
                    }
                }
                // 2글자 이스케이프: ESC <한 글자>
                Some(_) => {
                    chars.next();
                }
                None => {}
            }
        } else {
            result.push(c);
        }
    }
    result
}

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

/// agent_plan — 태스크를 셸 커맨드 단계로 분해
///
/// LLM에게 태스크를 전달하고 실행 계획(AgentStep 배열)을 반환한다.
/// 최대 8단계, 각 단계는 단일 셸 커맨드 + risk 레벨.
#[command]
pub async fn agent_plan(task: String, context: String, model: String) -> Result<Vec<AgentStep>> {
    let prompt = format!(
        "당신은 터미널 에이전트입니다. 사용자의 태스크를 실행 가능한 셸 커맨드 단계로 분해하세요.\n\n\
컨텍스트 (repo 구조 포함):\n{context}\n\n\
태스크: {task}\n\n\
규칙:\n\
- 각 단계는 단일 셸 커맨드\n\
- 최대 8단계\n\
- risk: safe(읽기전용·조회) | caution(파일·설정 변경) | danger(삭제·취소불가·권한 변경)\n\
- 아래 JSON 배열만 출력 (마크다운·설명 없이):\n\
[{{\"id\":1,\"cmd\":\"ls -la\",\"description\":\"현재 디렉토리 파일 목록 확인\",\"risk\":\"safe\"}}]"
    );

    // 30초 타임아웃 클라이언트
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let raw = call_xllm(&client, &model, &prompt).await?;

    // JSON 배열 추출 후 파싱
    let json_str = extract_json_array(&raw);
    let steps: Vec<AgentStep> = serde_json::from_str(&json_str).map_err(|e| {
        LumError::AiEngine(format!("agent_plan 응답 파싱 실패: {}. 원본: {}", e, raw))
    })?;

    Ok(steps)
}

/// agent_observe — 완료된 단계를 평가하고 다음 행동 결정
///
/// 최근 5개 완료 단계를 요약해 LLM에 전달하고,
/// "done" | "continue" | "failed" 중 하나와 이유를 반환한다.
/// 파싱 실패 시 graceful fallback으로 "done" 반환 (에러 아님).
#[command]
pub async fn agent_observe(
    task: String,
    completed_steps: Vec<CompletedStep>,
    model: String,
) -> Result<AgentDecision> {
    // 최근 5개 단계만 사용 (컨텍스트 길이 제한)
    let recent: Vec<&CompletedStep> = completed_steps.iter().rev().take(5).collect();

    let steps_summary = recent
        .iter()
        .rev() // 시간 순서 복원
        .map(|s| {
            // ANSI 코드 제거 후 300자 제한
            let clean_output = strip_ansi(&s.output);
            let truncated = if clean_output.len() > 300 {
                format!("{}…", &clean_output[..300])
            } else {
                clean_output
            };
            let exit_str = s
                .exit_code
                .map(|c| c.to_string())
                .unwrap_or_else(|| "알 수 없음".to_string());
            format!(
                "단계 {}: `{}`\n출력: {}\n종료코드: {}",
                s.id, s.cmd, truncated, exit_str
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let prompt = format!(
        "터미널 에이전트입니다. 태스크 진행 상황을 평가하고 다음 행동을 결정하세요.\n\n\
원래 태스크: {task}\n\n\
완료된 단계 (최대 최근 5개):\n\
{steps_summary}\n\n\
다음 중 하나를 JSON으로만 출력:\n\
{{\"action\":\"done\",\"message\":\"완료 이유\",\"next_steps\":null}}\n\
{{\"action\":\"continue\",\"message\":\"계속 이유\",\"next_steps\":[{{\"id\":N,\"cmd\":\"...\",\"description\":\"...\",\"risk\":\"safe\"}}]}}\n\
{{\"action\":\"failed\",\"message\":\"실패 이유\",\"next_steps\":null}}\n\n\
JSON만 출력 (마크다운 없이):"
    );

    // 30초 타임아웃 클라이언트
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let raw = match call_xllm(&client, &model, &prompt).await {
        Ok(r) => r,
        Err(_) => {
            // 네트워크/AI 오류 시 graceful fallback
            return Ok(AgentDecision {
                action: "done".into(),
                message: "분석 불가 — 수동 확인 필요".into(),
                next_steps: None,
            });
        }
    };

    // JSON 오브젝트 추출 후 파싱
    let json_str = extract_json_object(&raw);
    let decision: AgentDecision = match serde_json::from_str(&json_str) {
        Ok(d) => d,
        Err(_) => {
            // 파싱 실패 시 graceful fallback (에러 반환하지 않음)
            AgentDecision {
                action: "done".into(),
                message: "분석 불가 — 수동 확인 필요".into(),
                next_steps: None,
            }
        }
    };

    Ok(decision)
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_json_array_기본_케이스() {
        let s = r#"some text [{"id":1}] more text"#;
        assert_eq!(extract_json_array(s), r#"[{"id":1}]"#);
    }

    #[test]
    fn extract_json_array_배열_없으면_원본_반환() {
        let s = "no brackets here";
        assert_eq!(extract_json_array(s), s);
    }

    #[test]
    fn extract_json_object_기본_케이스() {
        let s = r#"prefix {"action":"done"} suffix"#;
        assert_eq!(extract_json_object(s), r#"{"action":"done"}"#);
    }

    #[test]
    fn extract_json_object_오브젝트_없으면_원본_반환() {
        let s = "no braces here";
        assert_eq!(extract_json_object(s), s);
    }

    #[test]
    fn strip_ansi_csi_시퀀스_제거() {
        let s = "\x1b[32mhello\x1b[0m world";
        assert_eq!(strip_ansi(s), "hello world");
    }

    #[test]
    fn strip_ansi_osc_시퀀스_제거() {
        let s = "\x1b]0;title\x07plain";
        assert_eq!(strip_ansi(s), "plain");
    }

    #[test]
    fn strip_ansi_일반_텍스트_보존() {
        let s = "normal text 123";
        assert_eq!(strip_ansi(s), s);
    }

    #[test]
    fn strip_ansi_빈_문자열() {
        assert_eq!(strip_ansi(""), "");
    }
}
