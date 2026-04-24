use std::path::{Path, PathBuf};

const MAX_CTX_CHARS: usize = 40_000;
const FILE_CHUNK: usize = 8_000;
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    ".next",
    "dist",
    "build",
    "__pycache__",
    ".venv",
    "vendor",
    ".cache",
    "coverage",
];
const TEXT_EXTS: &[&str] = &[
    "rs",
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "py",
    "go",
    "toml",
    "json",
    "md",
    "txt",
    "yaml",
    "yml",
    "sh",
    "css",
    "scss",
    "html",
    "sql",
    "c",
    "cpp",
    "h",
    "java",
    "rb",
    "swift",
    "kt",
    "env",
    "gitignore",
    "dockerfile",
];

/// 파일 하나를 buf에 추가
fn append_file(path: &Path, buf: &mut String, total: &mut usize) {
    if *total >= MAX_CTX_CHARS {
        return;
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !TEXT_EXTS.contains(&ext.as_str()) && !ext.is_empty() {
        return;
    }
    let Ok(content) = std::fs::read_to_string(path) else {
        return;
    };
    let header = format!("\n### {}\n```{}\n", path.display(), ext);
    let footer = "\n```\n";
    let available = MAX_CTX_CHARS.saturating_sub(*total + header.len() + footer.len());
    let snippet: String = content.chars().take(available.min(FILE_CHUNK)).collect();
    let truncated = snippet.chars().count() < content.chars().count();
    buf.push_str(&header);
    buf.push_str(&snippet);
    if truncated {
        buf.push_str("\n... (truncated)");
    }
    buf.push_str(footer);
    *total += header.len() + snippet.len() + footer.len();
}

/// 디렉토리를 재귀 탐색하며 buf에 추가
fn append_dir(dir: &Path, buf: &mut String, total: &mut usize) {
    if *total >= MAX_CTX_CHARS {
        return;
    }
    let name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if SKIP_DIRS.contains(&name) {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries
        .flatten()
        .filter(|e| {
            !e.file_name()
                .to_str()
                .map(|s| s.starts_with('.'))
                .unwrap_or(false)
        })
        .collect();
    entries.sort_by_key(|e| (e.path().is_dir(), e.file_name()));
    for entry in entries {
        if *total >= MAX_CTX_CHARS {
            break;
        }
        let p = entry.path();
        if p.is_dir() {
            append_dir(&p, buf, total);
        } else {
            append_file(&p, buf, total);
        }
    }
}

// ── Git 컨텍스트 ─────────────────────────────────────────────────

fn run_git(cwd: &str, args: &[&str]) -> String {
    std::process::Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map(|o| {
            if o.status.success() {
                String::from_utf8_lossy(&o.stdout).trim().to_string()
            } else {
                String::new()
            }
        })
        .unwrap_or_default()
}

/// git status / diff --stat / log 를 합쳐 AI 컨텍스트 문자열로 반환.
#[tauri::command]
pub fn get_git_context(cwd: String) -> String {
    let mut parts: Vec<String> = Vec::new();

    let status = run_git(&cwd, &["status", "--short", "--branch"]);
    if !status.is_empty() {
        parts.push(format!("$ git status\n{status}"));
    }

    let staged = run_git(&cwd, &["diff", "--cached", "--stat"]);
    if !staged.is_empty() {
        parts.push(format!("$ git diff --cached --stat\n{staged}"));
    }

    let unstaged = run_git(&cwd, &["diff", "--stat"]);
    if !unstaged.is_empty() {
        parts.push(format!("$ git diff --stat\n{unstaged}"));
    }

    let log = run_git(&cwd, &["log", "--oneline", "-7"]);
    if !log.is_empty() {
        parts.push(format!("$ git log --oneline -7\n{log}"));
    }

    parts.join("\n\n")
}

/// staged diff (없으면 unstaged diff) 반환. 커밋 메시지 생성용. 최대 8 KB.
#[tauri::command]
pub fn get_staged_diff(cwd: String) -> String {
    let diff = run_git(&cwd, &["diff", "--cached"]);
    let raw = if diff.is_empty() {
        run_git(&cwd, &["diff"])
    } else {
        diff
    };
    raw.chars().take(8_000).collect()
}

// ── 파일 읽기 ────────────────────────────────────────────────────

/// 경로(파일 or 디렉토리)를 읽어 AI 컨텍스트 문자열로 반환.
/// path가 상대 경로이면 cwd 기준으로 해석.
#[tauri::command]
pub fn read_path_for_context(path: String, cwd: Option<String>) -> Result<String, String> {
    // Windows 절대 경로 감지: "C:\..." 또는 "H:/..." — 드라이브 레터 + 콜론
    let is_win_abs = path.len() >= 3
        && path.chars().nth(1) == Some(':')
        && matches!(path.chars().nth(2), Some('\\') | Some('/'));

    let resolved: PathBuf = if path.starts_with("~/") {
        dirs::home_dir()
            .map(|h| h.join(&path[2..]))
            .ok_or_else(|| "홈 디렉토리를 찾을 수 없음".to_string())?
    } else if path.starts_with('/') || is_win_abs {
        PathBuf::from(&path)
    } else {
        PathBuf::from(cwd.as_deref().unwrap_or(".")).join(&path)
    };

    if !resolved.exists() {
        return Err(format!("경로를 찾을 수 없습니다: {}", resolved.display()));
    }

    let mut buf = String::new();
    let mut total = 0usize;

    if resolved.is_file() {
        append_file(&resolved, &mut buf, &mut total);
    } else {
        buf.push_str(&format!("## 디렉토리: {}\n", resolved.display()));
        total += buf.len();
        append_dir(&resolved, &mut buf, &mut total);
    }

    if buf.trim().is_empty() {
        buf = format!(
            "{} — 읽을 수 있는 텍스트 파일이 없습니다.",
            resolved.display()
        );
    }

    Ok(buf)
}

#[tauri::command]
pub fn get_project_context(cwd: String) -> String {
    if cwd.is_empty() {
        return String::new();
    }
    let dir = Path::new(&cwd);
    let mut parts: Vec<String> = Vec::new();

    if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
        parts.push(format!("cwd: {name}"));
    }

    // 파일 읽기 시도로 프로젝트 타입 감지 — exists() 사전 체크 없이 I/O 결과로 판단
    if let Some(ctx) = read_node_context(dir) {
        parts.push(ctx);
    } else if let Some(ctx) = read_cargo_context(dir) {
        parts.push(ctx);
    } else if dir.join("go.mod").exists() {
        parts.push("Go project".to_string());
    } else if dir.join("pyproject.toml").exists() || dir.join("setup.py").exists() {
        parts.push("Python project".to_string());
    } else if dir.join("pom.xml").exists() || dir.join("build.gradle").exists() {
        parts.push("Java project".to_string());
    }

    if dir.join(".git").exists() {
        parts.push("git repo".to_string());
    }

    parts.join(", ")
}

fn read_node_context(dir: &Path) -> Option<String> {
    let content = std::fs::read_to_string(dir.join("package.json")).ok()?;
    let json = serde_json::from_str::<serde_json::Value>(&content).ok()?;
    let name = json["name"].as_str().unwrap_or("");
    let scripts: Vec<&str> = json["scripts"]
        .as_object()
        .map(|s| s.keys().map(|k| k.as_str()).take(6).collect())
        .unwrap_or_default();
    Some(if scripts.is_empty() {
        format!("Node.js project \"{name}\"")
    } else {
        format!(
            "Node.js project \"{name}\" (scripts: {})",
            scripts.join(", ")
        )
    })
}

// ── 파일 탐색기용 디렉토리 리스팅 ───────────────────────────────

#[derive(serde::Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

/// 지정 경로의 하위 항목 목록 반환 (파일 탐색기용).
/// 디렉토리 우선, 이름순 정렬. 숨김 파일/폴더(dot) 제외.
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let resolved: PathBuf = if path.is_empty() || path == "~" {
        dirs::home_dir().ok_or_else(|| "홈 디렉토리 없음".to_string())?
    } else if path.starts_with("~/") {
        dirs::home_dir()
            .map(|h| h.join(&path[2..]))
            .ok_or_else(|| "홈 디렉토리 없음".to_string())?
    } else {
        PathBuf::from(&path)
    };

    if !resolved.exists() {
        return Err(format!("경로 없음: {}", resolved.display()));
    }
    if !resolved.is_dir() {
        return Err(format!("디렉토리 아님: {}", resolved.display()));
    }

    let mut entries: Vec<DirEntry> = std::fs::read_dir(&resolved)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            let meta = e.metadata().ok()?;
            Some(DirEntry {
                name,
                path: e.path().to_string_lossy().into_owned(),
                is_dir: meta.is_dir(),
                size: if meta.is_file() { meta.len() } else { 0 },
            })
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// 상위 디렉토리 경로 반환 (파일 탐색기 "위로" 버튼용)
#[tauri::command]
pub fn parent_directory(path: String) -> Option<String> {
    PathBuf::from(&path)
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
}

fn read_cargo_context(dir: &Path) -> Option<String> {
    let content = std::fs::read_to_string(dir.join("Cargo.toml")).ok()?;
    let name = content
        .lines()
        .find(|l| l.trim_start().starts_with("name"))
        .and_then(|l| l.split('"').nth(1))
        .unwrap_or("unknown");
    Some(format!("Rust project \"{name}\""))
}
