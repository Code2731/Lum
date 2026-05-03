// Phase 132 — Skills 시스템 고도화.
// agentskills.io 스타일 SKILL.md(Frontmatter + 5개 섹션) 호환,
// URL import, 임베딩 기반 매칭(캐시 포함).

use crate::error::{LumError, Result};
use crate::platform;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(not(test))]
use crate::commands::rag::embed_auto;
#[cfg(not(test))]
use crate::memory::cosine_similarity;

#[cfg(not(test))]
const EMBED_SCORE_THRESHOLD: f32 = 0.40;

fn skills_path() -> PathBuf {
    platform::home_dir().join(".lum_skills.json")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Skill {
    /// 안정적 식별자 — 빈 문자열로 save_skill 호출 시 자동 생성.
    pub id: String,
    pub name: String,
    /// YAML frontmatter의 description.
    pub description: String,
    /// 매칭 트리거 키워드.
    #[serde(default)]
    pub triggers: Vec<String>,

    // Phase 132: 표준 SKILL.md 5섹션.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when_to_use: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quick_reference: Option<String>,
    /// 본문 절차 markdown. 레거시 body 필드는 alias로 자동 마이그레이션.
    #[serde(default, alias = "body")]
    pub procedure: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pitfalls: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verification: Option<String>,

    /// 매칭 속도 최적화용 캐시 임베딩(이름/설명/트리거 기반).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description_embedding: Option<Vec<f32>>,

    pub created_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_used_ms: Option<u64>,
    #[serde(default)]
    pub success_count: u32,
}

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
struct SkillStore {
    #[serde(default)]
    skills: Vec<Skill>,
}

/// 매번 디스크 IO를 피하기 위한 in-memory 캐시. write 시 갱신.
static CACHE: Mutex<Option<SkillStore>> = Mutex::new(None);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn lock_cache() -> std::sync::MutexGuard<'static, Option<SkillStore>> {
    CACHE.lock().unwrap_or_else(|p| p.into_inner())
}

fn load_store() -> Result<SkillStore> {
    if let Some(s) = lock_cache().clone() {
        return Ok(s);
    }
    let path = skills_path();
    let store = match std::fs::read_to_string(&path) {
        Ok(content) => {
            let stripped = content.strip_prefix('\u{feff}').unwrap_or(&content);
            serde_json::from_str(stripped).map_err(|e| LumError::Config(e.to_string()))?
        }
        Err(_) => SkillStore::default(),
    };
    *lock_cache() = Some(store.clone());
    Ok(store)
}

fn write_store(store: &SkillStore) -> Result<()> {
    let json = serde_json::to_string_pretty(store).map_err(|e| LumError::Config(e.to_string()))?;
    std::fs::write(skills_path(), json).map_err(|e| LumError::Io(e.to_string()))?;
    *lock_cache() = Some(store.clone());
    Ok(())
}

fn make_id() -> String {
    // ULID 모듈 없으니 ts_ms + 4글자 랜덤. 단조증가 + 충돌 방지.
    let ts = now_ms();
    let rand = format!(
        "{:04x}",
        (ts as u32).wrapping_mul(2654435761) ^ (ts >> 16) as u32 & 0xFFFF
    );
    format!("sk-{:013}-{}", ts, rand)
}

fn normalize_opt_text(v: Option<String>) -> Option<String> {
    let s = v.unwrap_or_default();
    let trimmed = s.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_skill(skill: &mut Skill) {
    skill.name = skill.name.trim().to_string();
    skill.description = skill.description.trim().to_string();
    skill.procedure = skill.procedure.trim().to_string();

    let mut out: Vec<String> = Vec::new();
    for t in &skill.triggers {
        let v = t.trim();
        if v.is_empty() {
            continue;
        }
        if !out.iter().any(|x| x.eq_ignore_ascii_case(v)) {
            out.push(v.to_string());
        }
    }
    skill.triggers = out;

    skill.when_to_use = normalize_opt_text(skill.when_to_use.take());
    skill.quick_reference = normalize_opt_text(skill.quick_reference.take());
    skill.pitfalls = normalize_opt_text(skill.pitfalls.take());
    skill.verification = normalize_opt_text(skill.verification.take());
}

fn embedding_source_text(skill: &Skill) -> String {
    let mut s = String::new();
    s.push_str(skill.name.trim());
    s.push('\n');
    s.push_str(skill.description.trim());
    if !skill.triggers.is_empty() {
        s.push('\n');
        s.push_str(&skill.triggers.join(", "));
    }
    if let Some(w) = &skill.when_to_use {
        s.push('\n');
        s.push_str(w.trim());
    }
    if let Some(q) = &skill.quick_reference {
        s.push('\n');
        s.push_str(q.trim());
    }
    s
}

/// 레거시 토큰 overlap 점수(임베딩 실패 시 fallback).
fn tokenize(text: &str) -> HashSet<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|t| t.chars().count() >= 2)
        .map(String::from)
        .collect()
}

fn skill_score_token(skill: &Skill, goal_tokens: &HashSet<String>) -> usize {
    let mut haystack = HashSet::new();
    haystack.extend(tokenize(&skill.name));
    haystack.extend(tokenize(&skill.description));
    for t in &skill.triggers {
        haystack.extend(tokenize(t));
    }
    goal_tokens.intersection(&haystack).count()
}

fn sort_recent(skills: &mut [Skill]) {
    skills.sort_by(|a, b| {
        let a_ts = a.last_used_ms.unwrap_or(a.created_ms);
        let b_ts = b.last_used_ms.unwrap_or(b.created_ms);
        b_ts.cmp(&a_ts)
    });
}

fn split_frontmatter(raw: &str) -> (Option<String>, String) {
    if !raw.starts_with("---") {
        return (None, raw.to_string());
    }

    let mut segments = raw.split_inclusive('\n');
    let Some(first) = segments.next() else {
        return (None, raw.to_string());
    };
    if first.trim() != "---" {
        return (None, raw.to_string());
    }

    let mut consumed = first.len();
    let mut yaml = String::new();
    for seg in segments {
        consumed += seg.len();
        if seg.trim() == "---" {
            let rest = raw[consumed..].to_string();
            return (Some(yaml), rest);
        }
        yaml.push_str(seg);
    }

    (None, raw.to_string())
}

fn trim_quotes(s: &str) -> String {
    let t = s.trim();
    let single = t.starts_with('\'') && t.ends_with('\'') && t.len() >= 2;
    let double = t.starts_with('"') && t.ends_with('"') && t.len() >= 2;
    if single || double {
        t[1..t.len() - 1].trim().to_string()
    } else {
        t.to_string()
    }
}

fn parse_triggers_inline(v: &str) -> Vec<String> {
    let trimmed = v.trim();
    let inner = if trimmed.starts_with('[') && trimmed.ends_with(']') && trimmed.len() >= 2 {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    };
    inner
        .split(',')
        .map(trim_quotes)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn parse_frontmatter_yaml(yaml: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut triggers: Vec<String> = Vec::new();
    let mut in_trigger_block = false;

    for raw in yaml.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if in_trigger_block {
            if let Some(item) = line.strip_prefix('-') {
                let v = trim_quotes(item);
                if !v.trim().is_empty() {
                    triggers.push(v);
                }
                continue;
            }
            in_trigger_block = false;
        }

        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim().to_lowercase();
            let val = v.trim();
            if key == "triggers" {
                if val.is_empty() {
                    in_trigger_block = true;
                } else {
                    triggers.extend(parse_triggers_inline(val));
                }
                continue;
            }
            map.insert(key, trim_quotes(val));
        }
    }

    if !triggers.is_empty() {
        map.insert("triggers".into(), triggers.join(","));
    }
    map
}

fn section_key(line: &str) -> Option<&'static str> {
    let h = line.trim();
    if !h.starts_with("## ") {
        return None;
    }
    let title = h[3..].trim().to_lowercase();
    match title.as_str() {
        "when to use" => Some("when_to_use"),
        "quick reference" => Some("quick_reference"),
        "procedure" => Some("procedure"),
        "pitfalls" => Some("pitfalls"),
        "verification" => Some("verification"),
        _ => None,
    }
}

fn split_sections(markdown: &str) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    let mut current: Option<String> = None;

    for line in markdown.lines() {
        if let Some(k) = section_key(line) {
            current = Some(k.to_string());
            out.entry(k.to_string()).or_default();
            continue;
        }
        if let Some(k) = &current {
            let buf = out.entry(k.clone()).or_default();
            buf.push_str(line);
            buf.push('\n');
        }
    }

    out.retain(|_, v| !v.trim().is_empty());
    out
}

fn parse_skill_md(raw: &str, source_hint: Option<&str>) -> Skill {
    let (frontmatter, body) = split_frontmatter(raw);
    let fm = frontmatter
        .as_deref()
        .map(parse_frontmatter_yaml)
        .unwrap_or_default();

    let sections = split_sections(&body);
    let mut procedure = sections
        .get("procedure")
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    // 레거시 markdown은 섹션 없이 전체 본문을 절차로 간주.
    if procedure.is_empty() {
        procedure = body.trim().to_string();
    }

    let fallback_name = source_hint
        .and_then(|u| u.rsplit('/').next())
        .map(|f| f.replace(".md", ""))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Imported Skill".to_string());

    let triggers = fm
        .get("triggers")
        .map(|s| {
            s.split(',')
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut skill = Skill {
        id: "".into(),
        name: fm
            .get("name")
            .cloned()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(fallback_name),
        description: fm.get("description").cloned().unwrap_or_default(),
        triggers,
        when_to_use: sections.get("when_to_use").map(|s| s.trim().to_string()),
        quick_reference: sections
            .get("quick_reference")
            .map(|s| s.trim().to_string()),
        procedure,
        pitfalls: sections.get("pitfalls").map(|s| s.trim().to_string()),
        verification: sections.get("verification").map(|s| s.trim().to_string()),
        description_embedding: None,
        created_ms: 0,
        last_used_ms: None,
        success_count: 0,
    };
    normalize_skill(&mut skill);
    skill
}

fn render_skill_for_prompt(skill: &Skill) -> String {
    let mut out = String::new();
    if let Some(v) = &skill.when_to_use {
        out.push_str("## When to Use\n");
        out.push_str(v.trim());
        out.push_str("\n\n");
    }
    if let Some(v) = &skill.quick_reference {
        out.push_str("## Quick Reference\n");
        out.push_str(v.trim());
        out.push_str("\n\n");
    }
    out.push_str("## Procedure\n");
    out.push_str(skill.procedure.trim());
    out.push_str("\n\n");
    if let Some(v) = &skill.pitfalls {
        out.push_str("## Pitfalls\n");
        out.push_str(v.trim());
        out.push_str("\n\n");
    }
    if let Some(v) = &skill.verification {
        out.push_str("## Verification\n");
        out.push_str(v.trim());
        out.push('\n');
    }
    out.trim().to_string()
}

/// ReAct에서 호출. goal 자연어 → 가장 관련도 높은 N개 skill 반환.
/// 1차: 임베딩 cosine, 실패 시 토큰 overlap fallback.
pub async fn find_relevant_skills(goal: &str, limit: usize) -> Vec<Skill> {
    let trimmed = goal.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let store = match load_store() {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    if store.skills.is_empty() {
        return Vec::new();
    }

    // 테스트에선 네트워크 의존 없는 토큰 매칭으로 고정.
    #[cfg(test)]
    {
        return find_relevant_skills_token_only(&store.skills, trimmed, limit);
    }

    #[cfg(not(test))]
    {
        let mut store = store;
        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
        {
            Ok(c) => c,
            Err(_) => return find_relevant_skills_token_only(&store.skills, trimmed, limit),
        };

        let Some(query_emb) = embed_auto(&client, "default", trimmed).await else {
            return find_relevant_skills_token_only(&store.skills, trimmed, limit);
        };

        let mut cache_changed = false;
        let mut scored: Vec<(f32, Skill)> = Vec::new();

        for skill in store.skills.iter_mut() {
            let mut emb = skill.description_embedding.clone().unwrap_or_default();
            if emb.is_empty() {
                if let Some(v) = embed_auto(&client, "default", &embedding_source_text(skill)).await
                {
                    emb = v;
                    skill.description_embedding = Some(emb.clone());
                    cache_changed = true;
                }
            }
            if emb.is_empty() {
                continue;
            }
            let score = cosine_similarity(&query_emb, &emb);
            if score >= EMBED_SCORE_THRESHOLD {
                scored.push((score, skill.clone()));
            }
        }

        if cache_changed {
            let _ = write_store(&store);
        }

        if scored.is_empty() {
            return find_relevant_skills_token_only(&store.skills, trimmed, limit);
        }

        scored.sort_by(|a, b| {
            b.0.total_cmp(&a.0)
                .then_with(|| b.1.success_count.cmp(&a.1.success_count))
        });
        return scored
            .into_iter()
            .take(limit.max(1))
            .map(|(_, s)| s)
            .collect();
    }
}

fn find_relevant_skills_token_only(skills: &[Skill], goal: &str, limit: usize) -> Vec<Skill> {
    let goal_tokens = tokenize(goal);
    if goal_tokens.is_empty() {
        return Vec::new();
    }
    let mut scored: Vec<(usize, Skill)> = skills
        .iter()
        .cloned()
        .map(|s| (skill_score_token(&s, &goal_tokens), s))
        .filter(|(score, _)| *score > 0)
        .collect();
    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.success_count.cmp(&a.1.success_count))
    });
    scored
        .into_iter()
        .take(limit.max(1))
        .map(|(_, s)| s)
        .collect()
}

#[tauri::command]
pub fn skill_list() -> Result<Vec<Skill>> {
    let store = load_store()?;
    let mut skills = store.skills;
    sort_recent(&mut skills);
    Ok(skills)
}

fn save_skill_impl(mut skill: Skill) -> Result<Skill> {
    if skill.name.trim().is_empty() {
        return Err(LumError::Config("skill name 비어있음".into()));
    }
    normalize_skill(&mut skill);
    if skill.procedure.trim().is_empty() {
        return Err(LumError::Config("procedure 비어있음".into()));
    }

    let mut store = load_store()?;
    if skill.id.is_empty() {
        skill.id = make_id();
        skill.created_ms = now_ms();
        skill.description_embedding = None;
        store.skills.push(skill.clone());
    } else {
        let mut replaced = false;
        for s in store.skills.iter_mut() {
            if s.id == skill.id {
                let old_embed_src = embedding_source_text(s);
                let new_embed_src = embedding_source_text(&skill);
                skill.created_ms = s.created_ms;
                skill.success_count = s.success_count;
                skill.last_used_ms = s.last_used_ms;
                skill.description_embedding = if old_embed_src == new_embed_src {
                    s.description_embedding.clone()
                } else {
                    None
                };
                *s = skill.clone();
                replaced = true;
                break;
            }
        }
        if !replaced {
            if skill.created_ms == 0 {
                skill.created_ms = now_ms();
            }
            skill.description_embedding = None;
            store.skills.push(skill.clone());
        }
    }
    write_store(&store)?;
    Ok(skill)
}

/// 새로 만들거나 기존 id로 덮어쓰기. id가 빈 문자열이면 자동 생성.
#[tauri::command]
pub fn skill_save(skill: Skill) -> Result<Skill> {
    save_skill_impl(skill)
}

#[tauri::command]
pub fn skill_delete(id: String) -> Result<usize> {
    let mut store = load_store()?;
    let before = store.skills.len();
    store.skills.retain(|s| s.id != id);
    let removed = before - store.skills.len();
    if removed > 0 {
        write_store(&store)?;
    }
    Ok(removed)
}

/// ReAct 실행 후 호출 가능 — 사용된 skill의 success_count++ + last_used 갱신.
#[tauri::command]
pub fn skill_record_use(id: String) -> Result<()> {
    let mut store = load_store()?;
    let mut hit = false;
    for s in store.skills.iter_mut() {
        if s.id == id {
            s.success_count = s.success_count.saturating_add(1);
            s.last_used_ms = Some(now_ms());
            hit = true;
            break;
        }
    }
    if hit {
        write_store(&store)?;
    }
    Ok(())
}

/// 프론트가 ReAct 시작 전에 미리 매칭된 skill을 보여주거나 디버깅용.
#[tauri::command]
pub async fn skill_search(query: String, limit: Option<usize>) -> Result<Vec<Skill>> {
    Ok(find_relevant_skills(&query, limit.unwrap_or(5)).await)
}

/// Phase 132: agentskills 스타일 SKILL.md URL import.
#[tauri::command]
pub async fn skill_import_url(url: String) -> Result<Skill> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(LumError::Config("url 비어있음".into()));
    }
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err(LumError::Config("http(s) URL만 지원합니다".into()));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let body = client
        .get(trimmed)
        .send()
        .await
        .map_err(|e| LumError::Network(format!("URL fetch 실패: {}", e)))?
        .text()
        .await
        .map_err(|e| LumError::Network(format!("응답 본문 읽기 실패: {}", e)))?;

    let skill = parse_skill_md(&body, Some(trimmed));
    save_skill_impl(skill)
}

/// ReAct 시스템 프롬프트에 넣을 Skill markdown 렌더.
pub fn skill_prompt_markdown(skill: &Skill) -> String {
    render_skill_for_prompt(skill)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenize_basic() {
        let tokens = tokenize("Git rebase 정리");
        assert!(tokens.contains("git"));
        assert!(tokens.contains("rebase"));
        assert!(tokens.contains("정리"));
    }

    #[test]
    fn tokenize_drops_single_char() {
        let tokens = tokenize("a x cat");
        assert!(!tokens.contains("a"));
        assert!(!tokens.contains("x"));
        assert!(tokens.contains("cat"));
    }

    #[test]
    fn parse_skill_md_5섹션_분리() {
        let raw = r#"---
name: K8s Deploy
description: Deploy guide
triggers: [k8s, deploy]
---
## When to Use
배포할 때

## Quick Reference
kubectl apply -f

## Procedure
1. build
2. deploy

## Pitfalls
namespace 누락

## Verification
kubectl get pods
"#;
        let s = parse_skill_md(raw, None);
        assert_eq!(s.name, "K8s Deploy");
        assert_eq!(s.description, "Deploy guide");
        assert_eq!(s.triggers.len(), 2);
        assert_eq!(s.when_to_use.as_deref(), Some("배포할 때"));
        assert!(s.procedure.contains("deploy"));
        assert_eq!(s.verification.as_deref(), Some("kubectl get pods"));
    }

    #[test]
    fn parse_skill_md_레거시_본문은_procedure로() {
        let raw = "1. step one\n2. step two";
        let s = parse_skill_md(raw, Some("https://example.com/SKILL.md"));
        assert!(s.procedure.contains("step one"));
        assert!(!s.name.is_empty());
    }

    #[tokio::test]
    async fn find_relevant_returns_empty_on_no_match() {
        *lock_cache() = Some(SkillStore::default());
        let hits = find_relevant_skills("아무거나", 3).await;
        assert!(hits.is_empty());
        *lock_cache() = None;
    }
}
