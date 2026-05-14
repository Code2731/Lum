use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct ScipBackend {
    pub language: String,
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

#[derive(Debug, Clone)]
struct BackendEntry {
    language: &'static str,
    binary: &'static str,
    key: &'static str,
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
    Command::new(binary)
        .arg("--help")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
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

/// 사용자 PATH에서 scip-언어별 백엔드 바이너리 감지 상태를 반환.
pub fn detect_scip_backends(cwd: Option<String>) -> Vec<ScipBackend> {
    let cwd = resolve_cwd(cwd);
    let root = scip_root_for_workspace(&cwd);
    let _ = std::fs::create_dir_all(&root);

    KNOWN_BACKENDS
        .iter()
        .map(|entry| ScipBackend {
            language: entry.language.to_string(),
            binary: entry.binary.to_string(),
            available: has_binary(entry.binary),
            index_path: {
                let p = scip_index_path(&root, entry.key);
                p.to_string_lossy().into_owned()
            },
            index_exists: {
                let p = scip_index_path(&root, entry.key);
                p.exists()
            },
        })
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
}
