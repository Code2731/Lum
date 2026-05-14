use crate::error::{LumError, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command as StdCommand, Stdio};
use std::time::Duration;
use tokio::process::Command as TokioCommand;
use tokio::time::timeout;

const SCIP_BUILD_TIMEOUT_SECS: u64 = 120;
const SCIP_BUILD_LOG_LIMIT: usize = 2048;

#[derive(Debug, Clone, Serialize)]
pub struct ScipBackend {
    pub language: String,
    pub key: String,
    pub binary: String,
    pub available: bool,
    pub index_path: String,
    pub index_exists: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScipStatus {
    pub enabled: bool,
    pub backends: Vec<ScipBackend>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScipRebuildResult {
    pub language: String,
    pub binary: String,
    pub available: bool,
    pub index_path: String,
    pub requested: bool,
    pub skipped: bool,
    pub success: bool,
    pub timed_out: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScipRebuildSummary {
    pub requested_language: Option<String>,
    pub force: bool,
    pub results: Vec<ScipRebuildResult>,
}

#[derive(Debug, Clone)]
struct BackendEntry {
    language: &'static str,
    binary: &'static str,
    key: &'static str,
}

#[derive(Debug, Clone)]
struct ScipCommandAttempt {
    command: String,
    exit_code: Option<i32>,
    timed_out: bool,
    stdout: String,
    stderr: String,
}

const KNOWN_BACKENDS: &[BackendEntry] = &[
    BackendEntry {
        language: "Rust",
        binary: "scip-rust",
        key: "rust",
    },
    BackendEntry {
        language: "TypeScript",
        binary: "scip-typescript",
        key: "typescript",
    },
    BackendEntry {
        language: "Go",
        binary: "scip-go",
        key: "go",
    },
];

fn scip_root_for_workspace(cwd: &str) -> PathBuf {
    let base = Path::new(cwd);
    let workspace = if base.is_absolute() {
        base.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| Path::new(".").to_path_buf())
            .join(base)
    };
    workspace.join(".lum_scip")
}

fn has_binary(binary: &str) -> bool {
    StdCommand::new(binary)
        .arg("--help")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .is_ok()
}

fn scip_index_path(root: &Path, key: &str) -> PathBuf {
    root.join(key).join("index.scip")
}

fn resolve_cwd(cwd: Option<String>) -> String {
    if let Some(raw) = cwd {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| ".".to_string())
}

fn scip_backend_by_request(request: &str) -> Option<&'static BackendEntry> {
    let request = request.trim().to_ascii_lowercase();
    if request.is_empty() {
        return None;
    }
    KNOWN_BACKENDS.iter().find(|entry| {
        entry.key.eq_ignore_ascii_case(&request)
            || entry.language.to_ascii_lowercase() == request
            || entry.binary.eq_ignore_ascii_case(&request)
    })
}

fn trim_bytes_tail(input: &str, max_bytes: usize) -> String {
    if input.len() <= max_bytes {
        return input.to_string();
    }
    let start = input.len().saturating_sub(max_bytes);
    let boundary = (start..input.len())
        .find(|&idx| input.is_char_boundary(idx))
        .unwrap_or(start);
    format!("…[{}바이트 생략]\\n{}", max_bytes, &input[boundary..])
}

fn build_scip_backend_status(cwd: &str, entry: &BackendEntry) -> ScipBackend {
    let root = scip_root_for_workspace(cwd);
    let _ = std::fs::create_dir_all(&root);
    let index_path = scip_index_path(&root, entry.key);
    let index_exists = index_path
        .metadata()
        .map(|meta| meta.is_file() && meta.len() > 0)
        .unwrap_or(false);
    ScipBackend {
        language: entry.language.to_string(),
        key: entry.key.to_string(),
        binary: entry.binary.to_string(),
        available: has_binary(entry.binary),
        index_path: index_path.to_string_lossy().into_owned(),
        index_exists,
    }
}

fn build_command_candidates(index_path: &Path) -> Vec<Vec<String>> {
    let idx = index_path.to_string_lossy().to_string();
    vec![
        vec![
            "index".to_string(),
            "-p".to_string(),
            ".".to_string(),
            "-o".to_string(),
            idx.clone(),
        ],
        vec![
            "index".to_string(),
            "--project".to_string(),
            ".".to_string(),
            "--output".to_string(),
            idx.clone(),
        ],
        vec!["index".to_string(), "-o".to_string(), idx.clone()],
        vec!["index".to_string(), "--output".to_string(), idx.clone()],
        vec![
            "index".to_string(),
            ".".to_string(),
            "--output".to_string(),
            idx.clone(),
        ],
        vec!["index".to_string(), idx],
    ]
}

async fn try_build_index(binary: &str, args: Vec<String>, cwd: &Path) -> ScipCommandAttempt {
    let command = format!("{} {}", binary, args.join(" "));
    let mut proc = TokioCommand::new(binary);
    proc.args(&args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let child = match proc.spawn() {
        Ok(child) => child,
        Err(err) => {
            return ScipCommandAttempt {
                command,
                exit_code: None,
                timed_out: false,
                stdout: String::new(),
                stderr: format!("spawn 실패: {err}"),
            };
        }
    };

    let output = timeout(
        Duration::from_secs(SCIP_BUILD_TIMEOUT_SECS),
        child.wait_with_output(),
    )
    .await;

    match output {
        Ok(Ok(out)) => ScipCommandAttempt {
            command,
            exit_code: out.status.code(),
            timed_out: false,
            stdout: trim_bytes_tail(&String::from_utf8_lossy(&out.stdout), SCIP_BUILD_LOG_LIMIT),
            stderr: trim_bytes_tail(&String::from_utf8_lossy(&out.stderr), SCIP_BUILD_LOG_LIMIT),
        },
        Ok(Err(err)) => ScipCommandAttempt {
            command,
            exit_code: None,
            timed_out: false,
            stdout: String::new(),
            stderr: format!("wait_with_output 실패: {err}"),
        },
        Err(_) => ScipCommandAttempt {
            command,
            exit_code: None,
            timed_out: true,
            stdout: String::new(),
            stderr: "타임아웃".to_string(),
        },
    }
}

/// 사용자 PATH에서 scip-언어별 백엔드 바이너리 감지 상태를 반환.
pub fn detect_scip_backends(cwd: Option<String>) -> Vec<ScipBackend> {
    let cwd = resolve_cwd(cwd);
    KNOWN_BACKENDS
        .iter()
        .map(|entry| build_scip_backend_status(&cwd, entry))
        .collect()
}

/// 현재 옵션 UI에서 opt-in이 켜진 뒤에도 실제로 실행 가능한 SCIP 백엔드가 있으면 true.
pub fn has_available_scip_backend() -> bool {
    detect_scip_backends(None).into_iter().any(|b| b.available)
}

/// UI/모듈에서 사용할 수 있는 상태 스냅샷.
#[tauri::command]
pub fn scip_status(cwd: Option<String>) -> ScipStatus {
    let configured_enabled = crate::commands::config::load_config()
        .ok()
        .and_then(|cfg| cfg.react_scip_tools_enabled)
        .unwrap_or(false);
    let backends = detect_scip_backends(cwd);
    let available = configured_enabled && backends.iter().any(|b| b.available);
    ScipStatus {
        enabled: available,
        backends,
    }
}

/// 작업공간 기준 SCIP 인덱스를 생성/갱신한다. `force`가 없으면 기존 index.scip이 있을 때는 생략한다.
#[tauri::command]
pub async fn scip_rebuild_index(
    cwd: Option<String>,
    language: Option<String>,
    force: Option<bool>,
) -> Result<ScipRebuildSummary> {
    let cwd = resolve_cwd(cwd);
    let workspace = Path::new(&cwd);
    if !workspace.exists() {
        return Err(LumError::Io(format!(
            "워크스페이스 경로가 존재하지 않습니다: {cwd}"
        )));
    }

    let requested = language.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    let entries: Vec<&'static BackendEntry> = match requested.as_deref() {
        Some(ref language) => {
            let found = scip_backend_by_request(language);
            if found.is_none() {
                return Err(LumError::Config(format!(
                    "지원하지 않는 SCIP 언어입니다: {language}. 지원 언어: rust, typescript, go"
                )));
            }
            vec![found.unwrap()]
        }
        None => KNOWN_BACKENDS.iter().collect(),
    };

    let force = force.unwrap_or(false);
    let mut results = Vec::new();
    for entry in entries {
        let backend = build_scip_backend_status(&cwd, entry);
        let requested_by_key = requested
            .as_ref()
            .and_then(|r| scip_backend_by_request(r))
            .is_some_and(|matched| matched.key == entry.key);

        if !backend.available {
            results.push(ScipRebuildResult {
                language: backend.language,
                binary: backend.binary,
                available: false,
                index_path: backend.index_path,
                requested: requested_by_key,
                skipped: false,
                success: false,
                timed_out: false,
                message: "SCIP 바이너리가 PATH에 없습니다".to_string(),
            });
            continue;
        }

        if backend.index_exists && !force {
            results.push(ScipRebuildResult {
                language: backend.language,
                binary: backend.binary,
                available: true,
                index_path: backend.index_path,
                requested: requested_by_key,
                skipped: true,
                success: true,
                timed_out: false,
                message: "기존 index.scip이 있어 생략".to_string(),
            });
            continue;
        }

        let index_path = Path::new(&backend.index_path);
        if let Some(dir) = index_path.parent() {
            std::fs::create_dir_all(dir)?;
        }

        let candidates = build_command_candidates(index_path);
        let mut last_attempt = ScipCommandAttempt {
            command: String::new(),
            exit_code: None,
            timed_out: false,
            stdout: String::new(),
            stderr: String::new(),
        };
        let mut success = false;

        for candidate in candidates {
            let attempt = try_build_index(&backend.binary, candidate, workspace).await;
            if attempt.timed_out {
                last_attempt = attempt;
                break;
            }
            if attempt.exit_code == Some(0) && index_path.exists() {
                success = true;
                last_attempt = attempt;
                break;
            }
            last_attempt = attempt;
        }

        if success {
            results.push(ScipRebuildResult {
                language: backend.language,
                binary: backend.binary,
                available: true,
                index_path: backend.index_path,
                requested: requested_by_key,
                skipped: false,
                success: true,
                timed_out: false,
                message: format!("SCIP 인덱스 생성 완료 (명령: {}).", last_attempt.command),
            });
            continue;
        }

        let mut message = if last_attempt.timed_out {
            "SCIP 인덱스 생성이 타임아웃으로 중단되었습니다. 수동 실행 필요".to_string()
        } else {
            let code = last_attempt
                .exit_code
                .map(|v| v.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            format!(
                "SCIP 인덱스 생성 실패(코드: {code}, 명령: {})",
                last_attempt.command
            )
        };
        if !last_attempt.stderr.trim().is_empty() {
            message.push_str(&format!(" stderr: {}", last_attempt.stderr.trim()));
        }
        if !last_attempt.stdout.trim().is_empty() {
            message.push_str(&format!(" stdout: {}", last_attempt.stdout.trim()));
        }
        message.push_str(" | 수동 실행: `scip-<언어> index -o .lum_scip/<언어>/index.scip`");

        results.push(ScipRebuildResult {
            language: backend.language,
            binary: backend.binary,
            available: true,
            index_path: backend.index_path,
            requested: requested_by_key,
            skipped: false,
            success: false,
            timed_out: last_attempt.timed_out,
            message,
        });
    }

    Ok(ScipRebuildSummary {
        requested_language: requested,
        force,
        results,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    use std::{env, fs};

    #[test]
    fn detect_scip_backends_항목_개수_확인() {
        let backends = detect_scip_backends(Some(".".to_string()));
        assert_eq!(backends.len(), KNOWN_BACKENDS.len());
    }

    #[test]
    fn detect_scip_backends_키_정보_확인() {
        let backends = detect_scip_backends(Some(".".to_string()));
        let keys: Vec<_> = backends.iter().map(|b| b.key.as_str()).collect();
        assert!(keys.contains(&"rust"));
        assert!(keys.contains(&"typescript"));
        assert!(keys.contains(&"go"));
    }

    #[test]
    fn detect_scip_backends_인덱스_경로_워크스페이스_반영() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("시간 계산")
            .as_nanos();
        let workspace = env::temp_dir().join(format!("lum_scip_test_workspace_{nonce}"));
        fs::create_dir_all(&workspace).unwrap();

        let backends = detect_scip_backends(Some(workspace.to_string_lossy().to_string()));
        assert!(!backends.is_empty(), "백엔드가 탐지되어야 함: {backends:?}");

        for backend in &backends {
            assert!(
                backend.index_path.contains(".lum_scip"),
                "인덱스 경로에 .lum_scip가 포함되어야 함: {}",
                backend.index_path
            );
            assert!(
                backend.index_path.ends_with("index.scip"),
                "SCIP 인덱스 경로는 index.scip로 끝나야 함: {}",
                backend.index_path
            );
        }

        let _ = fs::remove_dir_all(&workspace);
    }

    #[test]
    fn detect_scip_backends_인덱스_존재_탐지() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("시간 계산")
            .as_nanos();
        let workspace = env::temp_dir().join(format!("lum_scip_test_workspace_idx_{nonce}"));
        let workspace = workspace.to_string_lossy().to_string();
        let backends = detect_scip_backends(Some(workspace.clone()));
        let rust_backend = backends
            .iter()
            .find(|b| b.language == "Rust")
            .expect("Rust 백엔드 항목");
        assert!(
            !rust_backend.index_exists,
            "초기 상태에서 index_exists는 false여야 함"
        );

        let rust_index = Path::new(&rust_backend.index_path);
        let rust_dir = rust_index.parent().unwrap();
        fs::create_dir_all(rust_dir).unwrap();
        fs::write(rust_index, b"test index").unwrap();
        let backends_after = detect_scip_backends(Some(workspace.clone()));
        let rust_backend_after = backends_after
            .iter()
            .find(|b| b.language == "Rust")
            .expect("Rust 백엔드 항목");
        assert!(
            rust_backend_after.index_exists,
            "index.scip 생성 시 index_exists는 true여야 함"
        );

        let cleanup_target = Path::new(&workspace);
        let _ = fs::remove_dir_all(cleanup_target);
    }

    #[test]
    fn detect_scip_backends_항목_개수_재확인() {
        let backends = detect_scip_backends(None);
        assert_eq!(backends.len(), KNOWN_BACKENDS.len());
    }

    #[test]
    fn has_available_scip_backend_반환_타입() {
        let available = has_available_scip_backend();
        assert!(matches!(available, true | false));
    }

    #[test]
    fn scip_backend_by_request_지원언어_매칭() {
        let target = scip_backend_by_request("rust").expect("rust 매칭");
        assert_eq!(target.key, "rust");
        let target2 = scip_backend_by_request(" TypeScript ").expect("typescript 매칭");
        assert_eq!(target2.key, "typescript");
    }

    #[test]
    fn scip_backend_by_request_알수없는언어_처리() {
        assert!(scip_backend_by_request("python").is_none());
    }

    #[tokio::test]
    async fn scip_rebuild_index_요청언어_검증() {
        let result = scip_rebuild_index(None, Some("python".to_string()), None).await;
        assert!(result.is_err());
    }
}
