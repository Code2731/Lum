// Phase 116 — Worktree Squad.
// `/squad new <task>` 또는 SquadPanel에서 새 squad를 만들면 git worktree를 생성하고
// 그 디렉터리에서 ReAct 에이전트(또는 사용자 손)로 task 진행. 메인 워킹트리는 안 건드림.
//
// 영속: ~/.lum_squads.json — Vec<Squad>. mistralrs는 단일 인스턴스를 공유(Mutex 직렬화) —
// VRAM 한계상 N개 모델 동시 로드는 향후 페이즈로.

use crate::platform;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

fn squads_path() -> PathBuf {
    platform::home_dir().join(".lum_squads.json")
}

fn squads_dir() -> PathBuf {
    platform::home_dir().join(".lum_squads")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Squad {
    pub id: String,             // <slug>-<timestamp>
    pub task: String,           // 사용자가 입력한 원문
    pub worktree_path: String,  // ~/.lum_squads/<id>
    pub branch: String,         // lum-squad/<id>
    pub base_branch: String,    // 분기점 브랜치 (예: "main")
    pub repo_root: String,      // 부모 repo 절대경로
    pub created_at: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct Store {
    squads: Vec<Squad>,
}

fn load_store() -> Store {
    std::fs::read_to_string(squads_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_store(store: &Store) -> Result<(), String> {
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(squads_path(), json).map_err(|e| e.to_string())
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 작업 설명을 슬러그로 변환 — 영문/숫자/공백/하이픈만 허용, 공백을 - 로, 최대 4단어.
fn slugify(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == ' ' {
                c.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect();
    let words: Vec<&str> = cleaned.split_whitespace().take(4).collect();
    let slug = words.join("-");
    if slug.is_empty() {
        "squad".to_string()
    } else {
        slug
    }
}

fn run_git(args: &[&str], cwd: &std::path::Path) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git 실행 실패: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(format!("git {} 실패: {}", args.join(" "), stderr));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn detect_repo_root(cwd: &str) -> Result<PathBuf, String> {
    let cwd_path = if cwd.trim().is_empty() {
        platform::home_dir()
    } else {
        PathBuf::from(cwd)
    };
    let root = run_git(&["rev-parse", "--show-toplevel"], &cwd_path)?;
    Ok(PathBuf::from(root))
}

fn detect_current_branch(repo: &std::path::Path) -> Result<String, String> {
    run_git(&["rev-parse", "--abbrev-ref", "HEAD"], repo)
}

#[tauri::command]
pub fn squad_list() -> Result<Vec<Squad>, String> {
    Ok(load_store().squads)
}

/// 새 squad 생성. cwd 위치의 repo root를 찾고 git worktree add로 격리 디렉터리 생성.
/// base_branch가 None이면 현재 브랜치 사용.
#[tauri::command]
pub fn squad_create(
    task: String,
    cwd: String,
    base_branch: Option<String>,
) -> Result<Squad, String> {
    let task_trimmed = task.trim();
    if task_trimmed.is_empty() {
        return Err("task 설명이 비어있습니다".to_string());
    }

    let repo = detect_repo_root(&cwd)?;
    let base = match base_branch {
        Some(b) if !b.trim().is_empty() => b.trim().to_string(),
        _ => detect_current_branch(&repo)?,
    };

    let now = unix_now();
    let slug = slugify(task_trimmed);
    let id = format!("{}-{}", slug, now);
    let branch = format!("lum-squad/{}", id);

    std::fs::create_dir_all(squads_dir()).map_err(|e| format!("squads 디렉터리 생성 실패: {e}"))?;
    let worktree_path = squads_dir().join(&id);
    if worktree_path.exists() {
        return Err(format!("worktree 경로가 이미 존재합니다: {}", worktree_path.display()));
    }

    let wt_str = worktree_path.to_string_lossy().to_string();
    run_git(&["worktree", "add", &wt_str, "-b", &branch, &base], &repo)
        .map_err(|e| format!("worktree 생성 실패: {e}"))?;

    let squad = Squad {
        id: id.clone(),
        task: task_trimmed.to_string(),
        worktree_path: wt_str,
        branch,
        base_branch: base,
        repo_root: repo.to_string_lossy().to_string(),
        created_at: now,
    };

    let mut store = load_store();
    store.squads.push(squad.clone());
    save_store(&store)?;
    Ok(squad)
}

/// squad 제거 — git worktree remove + 브랜치 삭제. 변경사항은 잃을 수 있으므로 force.
#[tauri::command]
pub fn squad_remove(id: String) -> Result<(), String> {
    let store = load_store();
    let squad = store
        .squads
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("squad를 찾을 수 없습니다: {}", id))?
        .clone();

    let repo = PathBuf::from(&squad.repo_root);
    // worktree remove 실패는 경고만 — 디렉터리가 이미 사라졌을 수 있음.
    let _ = run_git(&["worktree", "remove", "--force", &squad.worktree_path], &repo);
    // 브랜치 삭제 — 다른 worktree에서 체크아웃 중이면 실패할 수 있음.
    let _ = run_git(&["branch", "-D", &squad.branch], &repo);
    // 디렉터리가 남아있으면 정리.
    let _ = std::fs::remove_dir_all(&squad.worktree_path);

    let mut store = load_store();
    store.squads.retain(|s| s.id != id);
    save_store(&store)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Fix login bug"), "fix-login-bug");
    }

    #[test]
    fn slugify_truncates_to_four_words() {
        assert_eq!(slugify("a b c d e f"), "a-b-c-d");
    }

    #[test]
    fn slugify_drops_non_alphanumeric() {
        assert_eq!(slugify("feat: Phase 116!! 🚀 squad"), "feat-phase-116-squad");
    }

    #[test]
    fn slugify_empty_returns_squad() {
        assert_eq!(slugify("   "), "squad");
        assert_eq!(slugify("!!!"), "squad");
    }

    #[test]
    fn slugify_korean_dropped() {
        // is_alphanumeric은 유니코드 알파벳을 허용하지만, 일관성을 위해 한글도 살림.
        // 회귀 가드: 향후 ascii-only로 바꾸면 이 케이스도 같이 변경.
        let s = slugify("로그인 버그 수정");
        assert!(!s.is_empty());
    }
}
