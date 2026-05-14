use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct ScipBackend {
    pub language: String,
    pub binary: String,
    pub available: bool,
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
}

const KNOWN_BACKENDS: &[BackendEntry] = &[
    BackendEntry {
        language: "Rust",
        binary: "scip-rust",
    },
    BackendEntry {
        language: "TypeScript",
        binary: "scip-typescript",
    },
    BackendEntry {
        language: "Go",
        binary: "scip-go",
    },
];

fn has_binary(binary: &str) -> bool {
    Command::new(binary)
        .arg("--help")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .is_ok()
}

/// 사용자 PATH에서 scip-언어별 백엔드 바이너리 감지 상태를 반환.
pub fn detect_scip_backends() -> Vec<ScipBackend> {
    KNOWN_BACKENDS
        .iter()
        .map(|entry| ScipBackend {
            language: entry.language.to_string(),
            binary: entry.binary.to_string(),
            available: has_binary(entry.binary),
        })
        .collect()
}

/// 현재 옵션 UI에서 opt-in이 켜진 뒤에도 실제로 실행 가능한 SCIP 백엔드가 있으면 true.
pub fn has_available_scip_backend() -> bool {
    detect_scip_backends().into_iter().any(|b| b.available)
}

/// UI/모듈에서 사용할 수 있는 상태 스냅샷.
#[tauri::command]
pub fn scip_status() -> ScipStatus {
    let configured_enabled = crate::commands::config::load_config()
        .ok()
        .and_then(|cfg| cfg.react_scip_tools_enabled)
        .unwrap_or(false);
    let backends = detect_scip_backends();
    let available = configured_enabled && backends.iter().any(|b| b.available);
    ScipStatus {
        enabled: available,
        backends,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_scip_backends_항목_개수_확인() {
        let backends = detect_scip_backends();
        assert_eq!(backends.len(), KNOWN_BACKENDS.len());
    }

    #[test]
    fn has_available_scip_backend_반환_타입() {
        let available = has_available_scip_backend();
        assert!(matches!(available, true | false));
    }
}
