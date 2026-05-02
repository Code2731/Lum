// Phase 127 — Skills 시스템.
// "한 번 푼 문제는 두 번 풀지 않는다" — 사용자가 작성하거나 ReAct 성공 trace에서 추출한
// markdown procedure를 영속 저장 + 다음 ReAct 실행 시 자연어 매칭으로 자동 주입.
//
// Hermes Agent의 agentskills.io와 결이 같음. LUM의 LoRA(Phase 119)는 weight 단위 학습이라
// 즉시 재사용 안 되는 반면, skill은 prompt-level memo라 즉시 효과.
//
// 저장: ~/.lum_skills.json  → SkillStore { skills: Vec<Skill> }
// 매칭: 단순 키워드 overlap(name + triggers + description). 향후 embedding 폴백.

use crate::error::{LumError, Result};
use crate::platform;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

fn skills_path() -> PathBuf {
    platform::home_dir().join(".lum_skills.json")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Skill {
    /// 안정적 식별자 — 빈 문자열로 save_skill 호출 시 자동 생성.
    pub id: String,
    pub name: String,
    /// 한 줄 요약 — UI 목록 + 키워드 매칭에 사용.
    pub description: String,
    /// 매칭 트리거 키워드. 자연어 goal과 overlap 검사.
    #[serde(default)]
    pub triggers: Vec<String>,
    /// 실제 절차(markdown) — ReAct 시스템 프롬프트에 그대로 주입.
    pub body: String,
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

/// 매번 디스크 IO를 피하기 위한 in-memory 캐시. write 시 무효화.
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
    let rand = format!("{:04x}", (ts as u32).wrapping_mul(2654435761) ^ (ts >> 16) as u32 & 0xFFFF);
    format!("sk-{:013}-{}", ts, rand)
}

/// 자연어 goal과 skill 트리거/이름/설명의 단순 단어 overlap 점수.
/// goal: "X 리팩터링 후 테스트 추가"  →  skill의 단어가 몇 개 일치하는지.
/// 한국어/영어 대충 토큰화 — 공백/구두점 split, 2자 이상만.
fn tokenize(text: &str) -> HashSet<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|t| t.chars().count() >= 2)
        .map(String::from)
        .collect()
}

fn skill_score(skill: &Skill, goal_tokens: &HashSet<String>) -> usize {
    let mut haystack = HashSet::new();
    haystack.extend(tokenize(&skill.name));
    haystack.extend(tokenize(&skill.description));
    for t in &skill.triggers {
        haystack.extend(tokenize(t));
    }
    goal_tokens.intersection(&haystack).count()
}

/// ReAct에서 호출. goal 자연어 → 가장 관련도 높은 N개 skill 반환.
/// score 0인 skill은 절대 반환 안 함(노이즈 방지).
pub fn find_relevant_skills(goal: &str, limit: usize) -> Vec<Skill> {
    let store = match load_store() {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    if store.skills.is_empty() {
        return Vec::new();
    }
    let goal_tokens = tokenize(goal);
    if goal_tokens.is_empty() {
        return Vec::new();
    }
    let mut scored: Vec<(usize, Skill)> = store
        .skills
        .into_iter()
        .map(|s| (skill_score(&s, &goal_tokens), s))
        .filter(|(score, _)| *score > 0)
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.success_count.cmp(&a.1.success_count)));
    scored.into_iter().take(limit.max(1)).map(|(_, s)| s).collect()
}

#[tauri::command]
pub fn skill_list() -> Result<Vec<Skill>> {
    let store = load_store()?;
    let mut skills = store.skills;
    // 최신순 — last_used 우선, 없으면 created.
    skills.sort_by(|a, b| {
        let a_ts = a.last_used_ms.unwrap_or(a.created_ms);
        let b_ts = b.last_used_ms.unwrap_or(b.created_ms);
        b_ts.cmp(&a_ts)
    });
    Ok(skills)
}

/// 새로 만들거나 기존 id로 덮어쓰기. id가 빈 문자열이면 자동 생성.
#[tauri::command]
pub fn skill_save(mut skill: Skill) -> Result<Skill> {
    if skill.name.trim().is_empty() {
        return Err(LumError::Config("skill name 비어있음".into()));
    }
    let mut store = load_store()?;
    if skill.id.is_empty() {
        skill.id = make_id();
        skill.created_ms = now_ms();
        store.skills.push(skill.clone());
    } else {
        let mut replaced = false;
        for s in store.skills.iter_mut() {
            if s.id == skill.id {
                // created_ms·success_count·last_used_ms는 보존 (사용자 편집은 메타데이터 안 건드림).
                skill.created_ms = s.created_ms;
                skill.success_count = s.success_count;
                skill.last_used_ms = s.last_used_ms;
                *s = skill.clone();
                replaced = true;
                break;
            }
        }
        if !replaced {
            // 외부 import 등 새 id를 가지고 들어온 경우 — append.
            if skill.created_ms == 0 {
                skill.created_ms = now_ms();
            }
            store.skills.push(skill.clone());
        }
    }
    write_store(&store)?;
    Ok(skill)
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
pub fn skill_search(query: String, limit: Option<usize>) -> Result<Vec<Skill>> {
    Ok(find_relevant_skills(&query, limit.unwrap_or(5)))
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
        // 1자 토큰 제거 — 노이즈 매칭 방지(stop-word 필터는 아님).
        assert!(!tokens.contains("a"));
        assert!(!tokens.contains("x"));
        assert!(tokens.contains("cat"));
    }

    #[test]
    fn skill_score_intersects() {
        let skill = Skill {
            id: "x".into(),
            name: "Git rebase 정리".into(),
            description: "복잡한 rebase 충돌 해결".into(),
            triggers: vec!["rebase".into(), "충돌".into()],
            body: "...".into(),
            created_ms: 0,
            last_used_ms: None,
            success_count: 0,
        };
        let goal = tokenize("git rebase 충돌 해결해줘");
        assert!(skill_score(&skill, &goal) >= 3);
    }

    #[test]
    fn find_relevant_returns_empty_on_no_match() {
        // 캐시에 빈 store 강제 주입 — 디스크 안 읽도록.
        *lock_cache() = Some(SkillStore::default());
        let hits = find_relevant_skills("아무거나", 3);
        assert!(hits.is_empty());
        // 정리.
        *lock_cache() = None;
    }
}
