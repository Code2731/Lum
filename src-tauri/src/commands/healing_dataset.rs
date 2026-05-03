// Phase 117 — Auto-Heal 학습 루프 데이터 수집.
// 사용자가 자동치유 제안을 승인/거부할 때마다 ~/.lum_healing_dataset.jsonl에 append.
// 별도 도구(mlx-lm lora, axolotl 등)로 LoRA fine-tune할 수 있도록 export 지원.
// 클라우드 제품은 개인 데이터로 학습 못 함 — LUM의 핵심 해자.

use crate::error::{LumError, Result};
use crate::platform;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

fn dataset_path() -> PathBuf {
    platform::home_dir().join(".lum_healing_dataset.jsonl")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HealingRecord {
    pub ts_ms: u64,
    pub model: String,
    pub error: String,
    pub analysis: String,
    pub suggestion: String,
    pub safety_level: String, // "Safe" | "Warning" | "Dangerous" | "Blocked"
    pub decision: String,     // "approve" | "reject"
    /// approve 시 실제 PTY로 보낸 명령 (사용자가 편집했을 수 있음). reject면 None.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub applied_command: Option<String>,
    /// Phase 118 — recall.rs cosine 검색용. record 시점 1회 embed_auto.
    /// 빈 벡터면 embed 실패(Ollama 부재 등) — recall이 옛 데이터 폴백 경로로 처리.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub embedding: Vec<f32>,
    /// Phase 122 — reject 시 LLM에 "왜 잘못된 제안인지" 1줄 분석을 즉석 호출해 저장.
    /// approve이거나 분석 호출 실패 시 None. 향후 DPO/preference 데이터셋 export에 활용.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<String>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Phase 122 — reject 시 호출. AI에 "왜 잘못된 제안인지" 한 줄 분석을 요청.
/// best-effort: 8초 안에 의미있는 응답이 안 오면 None. 80자 cap으로 컨텍스트 보호.
async fn analyze_failure_reason(model: &str, error: &str, suggestion: &str) -> Option<String> {
    let error_t = trim_for_prompt(error, 600);
    let suggestion_t = trim_for_prompt(suggestion, 200);
    if error_t.is_empty() || suggestion_t.is_empty() {
        return None;
    }
    let prompt = format!(
        "다음 자동치유 제안이 왜 부적절한지 한 줄(최대 60자)로만 답하세요. 분석 외 다른 텍스트 출력 금지.\n\n에러:\n{error_t}\n\n잘못된 제안:\n{suggestion_t}\n\n이유:"
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(8),
        crate::commands::ai::call_xllm(&client, model, &prompt),
    )
    .await
    .ok()?
    .ok()?;
    let trimmed = result.trim();
    if trimmed.is_empty() {
        return None;
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() > 80 {
        let head: String = chars.iter().take(80).collect();
        Some(format!("{head}…"))
    } else {
        Some(trimmed.to_string())
    }
}

fn trim_for_prompt(s: &str, max_chars: usize) -> String {
    let chars: Vec<char> = s.trim().chars().collect();
    if chars.len() <= max_chars {
        chars.into_iter().collect()
    } else {
        let head: String = chars.iter().take(max_chars).collect();
        format!("{head}…")
    }
}

/// 결정 기록을 JSONL append. 파일이 없으면 생성. record 시점에 embedding 계산해
/// 저장 — 이후 recall_search가 순수 cosine으로 검색 가능 (네트워크 0회).
/// Phase 120: approve 시 자동 학습 루프 트리거(fire-and-forget).
#[tauri::command]
pub async fn record_healing_decision(
    app: tauri::AppHandle,
    model: String,
    error: String,
    analysis: String,
    suggestion: String,
    safety_level: String,
    decision: String,
    applied_command: Option<String>,
) -> Result<()> {
    if decision != "approve" && decision != "reject" {
        return Err(LumError::Io(format!(
            "decision은 approve|reject만 허용 — 받은 값: {decision}"
        )));
    }

    // Phase 118 embedding + Phase 122 reject reason을 병렬로 호출(둘 다 네트워크 호출이라
    // 직렬 실행 시 wall time 두 배). 둘 다 best-effort — 실패해도 record는 저장.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok();
    let embed_text = format!("{} {}", error.trim(), suggestion.trim());

    let embedding_fut = async {
        match client.as_ref() {
            Some(c) if !embed_text.trim().is_empty() => {
                crate::commands::rag::embed_auto(c, &model, &embed_text)
                    .await
                    .unwrap_or_default()
            }
            _ => Vec::new(),
        }
    };
    let reason_fut = async {
        if decision == "reject" {
            analyze_failure_reason(&model, error.trim(), suggestion.trim()).await
        } else {
            None
        }
    };
    let (embedding, failure_reason) = tokio::join!(embedding_fut, reason_fut);

    let rec = HealingRecord {
        ts_ms: now_ms(),
        model,
        error,
        analysis,
        suggestion,
        safety_level,
        decision: decision.clone(),
        applied_command,
        embedding,
        failure_reason,
    };
    let line = serde_json::to_string(&rec).map_err(|e| LumError::Io(e.to_string()))?;
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dataset_path())
        .map_err(|e| LumError::Io(format!("dataset 파일 열기 실패: {e}")))?;
    writeln!(f, "{line}").map_err(|e| LumError::Io(e.to_string()))?;

    // Phase 120: approve 시 자동 학습 루프 트리거. fire-and-forget — 호출자 영향 없음.
    if decision == "approve" {
        tokio::spawn(async move {
            crate::commands::lora_forge::maybe_auto_train(app).await;
        });
    }
    Ok(())
}

#[tauri::command]
pub fn list_healing_dataset() -> Result<Vec<HealingRecord>> {
    let content = match std::fs::read_to_string(dataset_path()) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(LumError::Io(format!("dataset 읽기 실패: {e}"))),
    };
    let mut out = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // 손상된 줄은 스킵 (전체 실패 막기).
        if let Ok(rec) = serde_json::from_str::<HealingRecord>(trimmed) {
            out.push(rec);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn clear_healing_dataset() -> Result<()> {
    match std::fs::remove_file(dataset_path()) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(LumError::Io(e.to_string())),
    }
}

/// Phase 118 — 단순 한 번에 read+rewrite. JSONL append-only 파일을 부분 삭제하려면
/// 어차피 전체를 읽어 필터링 후 다시 써야 함.
fn rewrite_records(records: &[HealingRecord]) -> Result<()> {
    use std::io::BufWriter;
    let f = std::fs::File::create(dataset_path())
        .map_err(|e| LumError::Io(format!("dataset 재기록 실패: {e}")))?;
    let mut w = BufWriter::new(f);
    for rec in records {
        let line = serde_json::to_string(rec).map_err(|e| LumError::Io(e.to_string()))?;
        writeln!(w, "{line}").map_err(|e| LumError::Io(e.to_string()))?;
    }
    Ok(())
}

/// 지정 ts_ms들과 일치하는 record 삭제. 반환: 실제 삭제된 개수.
pub fn forget_by_ts(ts_targets: &[u64]) -> Result<usize> {
    let records = list_healing_dataset()?;
    let before = records.len();
    let target_set: std::collections::HashSet<u64> = ts_targets.iter().copied().collect();
    let kept: Vec<HealingRecord> = records
        .into_iter()
        .filter(|r| !target_set.contains(&r.ts_ms))
        .collect();
    let removed = before - kept.len();
    rewrite_records(&kept)?;
    Ok(removed)
}

/// 지정 ts_ms 이전 record 삭제.
pub fn forget_before(ts_ms: u64) -> Result<usize> {
    let records = list_healing_dataset()?;
    let before = records.len();
    let kept: Vec<HealingRecord> = records.into_iter().filter(|r| r.ts_ms >= ts_ms).collect();
    let removed = before - kept.len();
    rewrite_records(&kept)?;
    Ok(removed)
}

const CHATML_SYSTEM: &str = "당신은 터미널 자동 치유 어시스턴트입니다. 주어진 에러에 대해 안전한 수정 명령을 한 줄로 제안하고, 그 이유를 간단히 설명하세요.";

/// 단일 record를 ChatML messages 배열로 변환. approve만 학습용으로 적합.
fn record_to_chatml(rec: &HealingRecord) -> serde_json::Value {
    let user = format!("Error:\n{}", rec.error.trim());
    let assistant = if rec.analysis.trim().is_empty() {
        rec.suggestion.clone()
    } else {
        format!("{}\n\n{}", rec.suggestion.trim(), rec.analysis.trim())
    };
    serde_json::json!({
        "messages": [
            { "role": "system", "content": CHATML_SYSTEM },
            { "role": "user", "content": user },
            { "role": "assistant", "content": assistant }
        ]
    })
}

fn default_export_path(format: &str) -> PathBuf {
    let filename = match format {
        "chatml" => ".lum_healing_export.chatml.jsonl",
        _ => ".lum_healing_export.jsonl",
    };
    platform::home_dir().join(filename)
}

/// dataset을 학습 가능한 형식으로 변환해 별도 파일에 저장.
/// format: "jsonl" = 원본 record 그대로, "chatml" = approve만 ChatML 메시지 배열.
/// output_path가 None이면 ~/.lum_healing_export.{chatml.jsonl|jsonl}.
/// 반환값: (작성된 라인 수, 출력 경로)
#[tauri::command]
pub fn export_healing_dataset(
    format: String,
    output_path: Option<String>,
) -> Result<(usize, String)> {
    let records = list_healing_dataset()?;
    let mut buf = String::new();
    let mut count = 0usize;

    match format.as_str() {
        "jsonl" => {
            for rec in &records {
                let line = serde_json::to_string(rec).map_err(|e| LumError::Io(e.to_string()))?;
                buf.push_str(&line);
                buf.push('\n');
                count += 1;
            }
        }
        "chatml" => {
            for rec in records.iter().filter(|r| r.decision == "approve") {
                let v = record_to_chatml(rec);
                let line = serde_json::to_string(&v).map_err(|e| LumError::Io(e.to_string()))?;
                buf.push_str(&line);
                buf.push('\n');
                count += 1;
            }
        }
        other => {
            return Err(LumError::Io(format!(
                "지원하지 않는 format: {other} (jsonl | chatml)"
            )))
        }
    }

    let path = output_path
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_export_path(&format));
    std::fs::write(&path, buf).map_err(|e| LumError::Io(format!("export 쓰기 실패: {e}")))?;
    Ok((count, path.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(decision: &str) -> HealingRecord {
        HealingRecord {
            ts_ms: 1_700_000_000_000,
            model: "Qwen2.5-Coder-7B".into(),
            error: "command not found: pip".into(),
            analysis: "pip가 설치되어있지 않거나 PATH에 없습니다.".into(),
            suggestion: "python3 -m ensurepip --upgrade".into(),
            safety_level: "Safe".into(),
            decision: decision.into(),
            applied_command: if decision == "approve" {
                Some("python3 -m ensurepip --upgrade".into())
            } else {
                None
            },
            embedding: Vec::new(),
            failure_reason: None,
        }
    }

    #[test]
    fn chatml_includes_system_user_assistant() {
        let v = record_to_chatml(&sample("approve"));
        let msgs = v["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), 3);
        assert_eq!(msgs[0]["role"], "system");
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(msgs[2]["role"], "assistant");
        assert!(msgs[1]["content"].as_str().unwrap().contains("pip"));
        assert!(msgs[2]["content"].as_str().unwrap().contains("ensurepip"));
    }

    #[test]
    fn chatml_assistant_falls_back_to_suggestion_when_no_analysis() {
        let mut rec = sample("approve");
        rec.analysis = String::new();
        let v = record_to_chatml(&rec);
        let assistant = v["messages"][2]["content"].as_str().unwrap();
        assert_eq!(assistant.trim(), "python3 -m ensurepip --upgrade");
    }

    #[test]
    fn record_serializes_round_trip() {
        let rec = sample("reject");
        let s = serde_json::to_string(&rec).unwrap();
        let back: HealingRecord = serde_json::from_str(&s).unwrap();
        assert_eq!(back.decision, "reject");
        assert!(
            back.applied_command.is_none(),
            "reject 케이스는 skip_serializing_if 로 applied_command 필드 자체가 빠져야 함"
        );
        assert!(
            back.failure_reason.is_none(),
            "failure_reason도 None이면 skip_serializing_if로 직렬화에서 제외"
        );
    }

    #[test]
    fn record_failure_reason_round_trip() {
        let mut rec = sample("reject");
        rec.failure_reason = Some("pip 대신 ensurepip은 패키지 설치가 아니라 부트스트랩".into());
        let s = serde_json::to_string(&rec).unwrap();
        assert!(s.contains("failure_reason"));
        let back: HealingRecord = serde_json::from_str(&s).unwrap();
        assert_eq!(
            back.failure_reason.as_deref(),
            Some("pip 대신 ensurepip은 패키지 설치가 아니라 부트스트랩")
        );
    }

    #[test]
    fn old_record_without_failure_reason_deserializes() {
        // Phase 122 이전에 기록된 jsonl 라인 — failure_reason 필드 없음.
        let old_json = r#"{"ts_ms":1700000000000,"model":"x","error":"e","analysis":"a","suggestion":"s","safety_level":"Safe","decision":"reject"}"#;
        let rec: HealingRecord = serde_json::from_str(old_json).expect("backward-compat 실패");
        assert!(rec.failure_reason.is_none());
    }

    #[test]
    fn trim_for_prompt_short_string_unchanged() {
        assert_eq!(trim_for_prompt("hello", 100), "hello");
    }

    #[test]
    fn trim_for_prompt_long_string_truncated_with_ellipsis() {
        let long = "a".repeat(200);
        let out = trim_for_prompt(&long, 50);
        assert!(out.ends_with('…'));
        assert_eq!(out.chars().count(), 51); // 50 + …
    }

    #[test]
    fn trim_for_prompt_korean_chars_safe() {
        // is_char_boundary 위반 없이 한글 char 기준으로 자름.
        let s = "에러가 발생했습니다 ".repeat(20);
        let out = trim_for_prompt(&s, 30);
        assert_eq!(out.chars().count(), 31); // 30 + …
    }
}
