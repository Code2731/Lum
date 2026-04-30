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
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 결정 기록을 JSONL append. 파일이 없으면 생성.
#[tauri::command]
pub fn record_healing_decision(
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
    let rec = HealingRecord {
        ts_ms: now_ms(),
        model,
        error,
        analysis,
        suggestion,
        safety_level,
        decision,
        applied_command,
    };
    let line = serde_json::to_string(&rec).map_err(|e| LumError::Io(e.to_string()))?;
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dataset_path())
        .map_err(|e| LumError::Io(format!("dataset 파일 열기 실패: {e}")))?;
    writeln!(f, "{line}").map_err(|e| LumError::Io(e.to_string()))?;
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
        assert!(back.applied_command.is_none(),
            "reject 케이스는 skip_serializing_if 로 applied_command 필드 자체가 빠져야 함");
    }
}
