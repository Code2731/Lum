// Phase 118 — Persistent Memory Vault.
// 흩어진 3개 로컬 데이터(명령 history / 자동치유 dataset / 일반 memory)를
// 단일 시맨틱 검색 facade로 묶음. "지난 달 docker 빌드 실패 때 뭐 고쳤지?" 가 일급 쿼리.
//
// LUM의 핵심 차별화: 클라우드 제품은 데이터 보관정책상 영구 메모리 못 함.
// LUM은 모든 데이터가 ~/.lum_*.json(l)에 영구 저장 + 사용자가 완전 삭제 통제.

use crate::commands::healing_dataset::{list_healing_dataset, HealingRecord};
use crate::commands::history::{search_history_raw, HistoryEntry};
use crate::commands::rag::embed_auto;
use crate::error::{LumError, Result};
use crate::memory::{cosine_similarity, SemanticMemory};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const SCORE_THRESHOLD: f32 = 0.25;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RecallEntry {
    /// "<source>:<source-key>" — recall_forget 호출 시 분리해 사용.
    pub id: String,
    pub source: String, // "history" | "healing" | "memory"
    pub ts_ms: u64,
    pub title: String,
    pub snippet: String,
    pub score: f32,
    pub metadata: serde_json::Value,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn history_to_entry(h: &HistoryEntry, score: f32) -> RecallEntry {
    RecallEntry {
        id: format!("history:{}", h.id),
        source: "history".into(),
        ts_ms: h.timestamp.saturating_mul(1000),
        title: h.command.lines().next().unwrap_or(&h.command).chars().take(80).collect(),
        snippet: h.command.clone(),
        score,
        metadata: serde_json::json!({
            "cwd": h.cwd,
            "exit_code": h.exit_code,
        }),
    }
}

fn healing_to_entry(h: &HealingRecord, score: f32) -> RecallEntry {
    let title = if !h.suggestion.is_empty() {
        h.suggestion.chars().take(80).collect()
    } else {
        h.error.lines().next().unwrap_or(&h.error).chars().take(80).collect()
    };
    let snippet = format!("Error: {}\nSuggestion: {}", h.error.trim(), h.suggestion.trim());
    RecallEntry {
        id: format!("healing:{}", h.ts_ms),
        source: "healing".into(),
        ts_ms: h.ts_ms,
        title,
        snippet,
        score,
        metadata: serde_json::json!({
            "decision": h.decision,
            "safety_level": h.safety_level,
            "model": h.model,
            "applied_command": h.applied_command,
        }),
    }
}

/// 통합 시맨틱 검색. sources 비어있으면 전부 포함. since/until_ms는 ts_ms 기준 inclusive.
/// healing은 임베딩 미저장 — 검색 시 record마다 embed_auto 호출 (50개 이하 가정).
#[tauri::command]
pub async fn recall_search(
    query: String,
    sources: Option<Vec<String>>,
    since_ms: Option<u64>,
    until_ms: Option<u64>,
    model: String,
    limit: usize,
) -> Result<Vec<RecallEntry>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let allowed: std::collections::HashSet<String> = match sources {
        Some(v) if !v.is_empty() => v.into_iter().collect(),
        _ => ["history", "healing", "memory"].iter().map(|s| s.to_string()).collect(),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let q_emb = embed_auto(&client, &model, trimmed)
        .await
        .ok_or_else(|| LumError::AiEngine("쿼리 임베딩 실패 — Ollama/xLLM 연결을 확인하세요".into()))?;

    let mut hits: Vec<RecallEntry> = Vec::new();
    let in_window = |ts_ms: u64| -> bool {
        since_ms.map(|s| ts_ms >= s).unwrap_or(true) && until_ms.map(|u| ts_ms <= u).unwrap_or(true)
    };

    if allowed.contains("history") {
        let entries = search_history_raw();
        for h in entries.iter() {
            let ts_ms = h.timestamp.saturating_mul(1000);
            if !in_window(ts_ms) || h.embedding.is_empty() {
                continue;
            }
            let score = cosine_similarity(&q_emb, &h.embedding);
            if score > SCORE_THRESHOLD {
                hits.push(history_to_entry(h, score));
            }
        }
    }

    if allowed.contains("memory") {
        let mem = SemanticMemory::load();
        for e in mem.entries.iter() {
            let ts_ms = e.timestamp.saturating_mul(1000);
            if !in_window(ts_ms) || e.embedding.is_empty() {
                continue;
            }
            let score = cosine_similarity(&q_emb, &e.embedding);
            if score > SCORE_THRESHOLD {
                hits.push(RecallEntry {
                    id: format!("memory:{}", e.timestamp),
                    source: "memory".into(),
                    ts_ms,
                    title: e.content.lines().next().unwrap_or(&e.content).chars().take(80).collect(),
                    snippet: e.content.clone(),
                    score,
                    metadata: serde_json::Value::Null,
                });
            }
        }
    }

    if allowed.contains("healing") {
        let records = list_healing_dataset().unwrap_or_default();
        // 새 record는 저장된 embedding 사용(네트워크 0회). 옛 record는 즉석 embed 폴백 —
        // embedder가 한 번 실패하면 이후 폴백 모두 skip해 timeout 누적 회피.
        let mut fallback_failed = false;
        for h in records.iter() {
            if !in_window(h.ts_ms) {
                continue;
            }
            let score = if !h.embedding.is_empty() {
                cosine_similarity(&q_emb, &h.embedding)
            } else if fallback_failed {
                continue;
            } else {
                let text = format!("{} {}", h.error.trim(), h.suggestion.trim());
                if text.trim().is_empty() {
                    continue;
                }
                match embed_auto(&client, &model, &text).await {
                    Some(emb) => cosine_similarity(&q_emb, &emb),
                    None => {
                        fallback_failed = true;
                        continue;
                    }
                }
            };
            if score > SCORE_THRESHOLD {
                hits.push(healing_to_entry(h, score));
            }
        }
    }

    hits.sort_by(|a, b| b.score.total_cmp(&a.score));
    hits.truncate(limit.max(1).min(100));
    Ok(hits)
}

/// "<source>:<key>" 형식 ID들을 받아 각 소스에서 일괄 삭제. 반환: 삭제된 개수.
#[tauri::command]
pub fn recall_forget(ids: Vec<String>) -> Result<usize> {
    let mut removed = 0usize;
    let mut history_keys: Vec<String> = Vec::new();
    let mut healing_keys: Vec<u64> = Vec::new();
    let mut memory_keys: Vec<u64> = Vec::new();

    for id in ids {
        match id.split_once(':') {
            Some(("history", key)) => history_keys.push(key.to_string()),
            Some(("healing", key)) => {
                if let Ok(ts) = key.parse::<u64>() {
                    healing_keys.push(ts);
                }
            }
            Some(("memory", key)) => {
                if let Ok(ts) = key.parse::<u64>() {
                    memory_keys.push(ts);
                }
            }
            _ => continue,
        }
    }

    if !history_keys.is_empty() {
        removed += crate::commands::history::forget_by_ids(&history_keys);
    }
    if !healing_keys.is_empty() {
        removed += crate::commands::healing_dataset::forget_by_ts(&healing_keys)?;
    }
    if !memory_keys.is_empty() {
        removed += crate::memory::forget_by_ts(&memory_keys).map_err(LumError::Io)?;
    }

    Ok(removed)
}

#[derive(Serialize)]
pub struct ForgetBeforeReport {
    pub history: usize,
    pub healing: usize,
    pub memory: usize,
}

/// 지정 시각(ts_ms) 이전 데이터를 모든 소스에서 삭제. GDPR-style "잊혀질 권리".
#[tauri::command]
pub fn recall_forget_before(ts_ms: u64) -> Result<ForgetBeforeReport> {
    let history = crate::commands::history::forget_before(ts_ms / 1000);
    let healing = crate::commands::healing_dataset::forget_before(ts_ms)?;
    let memory = crate::memory::forget_before(ts_ms / 1000).map_err(LumError::Io)?;
    Ok(ForgetBeforeReport { history, healing, memory })
}

/// 각 소스 entry 개수 + 가장 오래된/최근 ts_ms — UI 메타정보용.
#[derive(Serialize)]
pub struct RecallStats {
    pub history: SourceStats,
    pub healing: SourceStats,
    pub memory: SourceStats,
    pub now_ms: u64,
}

#[derive(Serialize, Default)]
pub struct SourceStats {
    pub count: usize,
    pub oldest_ms: u64,
    pub newest_ms: u64,
}

#[tauri::command]
pub async fn recall_stats() -> Result<RecallStats> {
    let history_entries = search_history_raw();
    let history = stats_from_iter(history_entries.iter().map(|e| e.timestamp.saturating_mul(1000)));

    let healing_records = list_healing_dataset().unwrap_or_default();
    let healing = stats_from_iter(healing_records.iter().map(|r| r.ts_ms));

    let mem = SemanticMemory::load();
    let memory = stats_from_iter(mem.entries.iter().map(|e| e.timestamp.saturating_mul(1000)));

    Ok(RecallStats {
        history,
        healing,
        memory,
        now_ms: now_ms(),
    })
}

fn stats_from_iter(iter: impl Iterator<Item = u64>) -> SourceStats {
    let mut count = 0;
    let mut oldest = u64::MAX;
    let mut newest = 0u64;
    for ts in iter {
        count += 1;
        if ts < oldest {
            oldest = ts;
        }
        if ts > newest {
            newest = ts;
        }
    }
    if count == 0 {
        SourceStats::default()
    } else {
        SourceStats { count, oldest_ms: oldest, newest_ms: newest }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stats_empty_returns_zeros() {
        let s = stats_from_iter(std::iter::empty());
        assert_eq!(s.count, 0);
        assert_eq!(s.oldest_ms, 0);
        assert_eq!(s.newest_ms, 0);
    }

    #[test]
    fn stats_finds_min_max() {
        let s = stats_from_iter(vec![100u64, 50, 200, 75].into_iter());
        assert_eq!(s.count, 4);
        assert_eq!(s.oldest_ms, 50);
        assert_eq!(s.newest_ms, 200);
    }

    #[test]
    fn id_split_history_key() {
        let (src, key) = "history:1748391234-12".split_once(':').unwrap();
        assert_eq!(src, "history");
        assert_eq!(key, "1748391234-12");
    }

    #[test]
    fn id_split_healing_ts() {
        let (src, key) = "healing:1748391234567".split_once(':').unwrap();
        assert_eq!(src, "healing");
        assert_eq!(key.parse::<u64>().unwrap(), 1_748_391_234_567);
    }
}
