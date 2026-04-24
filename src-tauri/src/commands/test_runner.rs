// Phase 73 — Test Feedback Loop
//
// 프로젝트 타입을 자동 감지해 적절한 테스트 커맨드를 실행하고,
// stdout/stderr/exit_code/duration을 캡처해서 AI 피드백 재주입용으로 반환.

use crate::error::{LumError, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{Duration, Instant};
use tauri::command;
use tokio::process::Command as TokioCommand;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestCommand {
    /// 실행할 커맨드 (shell 단위)
    pub command: String,
    /// 감지된 프로젝트 타입 (node|rust|python|go|unknown)
    pub project_type: String,
    /// 감지 근거 파일명 (package.json 등)
    pub detected_via: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestResult {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub passed: bool,
    /// true면 타임아웃으로 강제 종료됨
    pub timed_out: bool,
}

// ─── 감지 ────────────────────────────────────────────────────────────────────

/// 프로젝트 테스트 커맨드 감지. 우선순위: 가장 구체적인 설정 파일이 있는 걸로.
pub fn detect_test_command(cwd: &Path) -> Option<TestCommand> {
    // Node.js (package.json)
    let pkg_json = cwd.join("package.json");
    if pkg_json.exists() {
        let content = std::fs::read_to_string(&pkg_json).ok()?;
        let pkg: serde_json::Value = serde_json::from_str(&content).ok()?;
        let has_test = pkg["scripts"]["test"].is_string();
        if has_test {
            // package manager 자동 감지 — lockfile 기반
            let cmd = if cwd.join("pnpm-lock.yaml").exists() {
                "pnpm test"
            } else if cwd.join("yarn.lock").exists() {
                "yarn test"
            } else if cwd.join("bun.lockb").exists() {
                "bun test"
            } else {
                "npm test"
            };
            return Some(TestCommand {
                command: cmd.to_string(),
                project_type: "node".into(),
                detected_via: "package.json".into(),
            });
        }
    }

    // Rust (Cargo.toml)
    if cwd.join("Cargo.toml").exists() {
        return Some(TestCommand {
            command: "cargo test".into(),
            project_type: "rust".into(),
            detected_via: "Cargo.toml".into(),
        });
    }

    // Python — pyproject.toml 우선, setup.py / pytest.ini 폴백
    if cwd.join("pyproject.toml").exists()
        || cwd.join("pytest.ini").exists()
        || cwd.join("setup.py").exists()
    {
        // venv/virtualenv 활성화된 pytest가 있으면 그걸 쓰되, 그냥 pytest로도 시도
        let cmd = if cwd.join(".venv/bin/pytest").exists() {
            ".venv/bin/pytest"
        } else if cwd.join("venv/bin/pytest").exists() {
            "venv/bin/pytest"
        } else {
            "pytest"
        };
        let via = if cwd.join("pyproject.toml").exists() {
            "pyproject.toml"
        } else if cwd.join("pytest.ini").exists() {
            "pytest.ini"
        } else {
            "setup.py"
        };
        return Some(TestCommand {
            command: cmd.to_string(),
            project_type: "python".into(),
            detected_via: via.into(),
        });
    }

    // Go (go.mod)
    if cwd.join("go.mod").exists() {
        return Some(TestCommand {
            command: "go test ./...".into(),
            project_type: "go".into(),
            detected_via: "go.mod".into(),
        });
    }

    None
}

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

#[command]
pub fn detect_project_tests(cwd: String) -> Option<TestCommand> {
    let path = Path::new(&cwd);
    if !path.exists() {
        return None;
    }
    detect_test_command(path)
}

/// 테스트 실행. timeout_secs 기본 120초, max 900초(15분).
#[command]
pub async fn run_tests(
    cwd: String,
    command: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<TestResult> {
    let path = Path::new(&cwd);
    if !path.exists() {
        return Err(LumError::Io(format!("경로 없음: {}", cwd)));
    }

    let cmd_str = match command {
        Some(c) if !c.trim().is_empty() => c,
        _ => {
            detect_test_command(path)
                .ok_or_else(|| LumError::AiEngine("프로젝트 테스트 커맨드 감지 실패".into()))?
                .command
        }
    };

    let timeout = Duration::from_secs(timeout_secs.unwrap_or(120).min(900));
    let start = Instant::now();

    // shell로 실행 — 파이프·리다이렉트 등 지원
    #[cfg(windows)]
    let mut proc = TokioCommand::new("cmd");
    #[cfg(windows)]
    proc.args(["/C", &cmd_str]);

    #[cfg(not(windows))]
    let mut proc = TokioCommand::new("sh");
    #[cfg(not(windows))]
    proc.args(["-c", &cmd_str]);

    proc.current_dir(path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let child = proc
        .spawn()
        .map_err(|e| LumError::Io(format!("테스트 실행 spawn 실패: {}", e)))?;

    // 타임아웃 감시하면서 결과 수집
    let result = tokio::time::timeout(timeout, child.wait_with_output()).await;

    let (output, timed_out) = match result {
        Ok(Ok(out)) => (out, false),
        Ok(Err(e)) => {
            return Err(LumError::Io(format!("테스트 실행 대기 실패: {}", e)));
        }
        Err(_) => {
            // 타임아웃 — kill_on_drop이 프로세스를 정리. 빈 결과 반환
            return Ok(TestResult {
                command: cmd_str,
                stdout: String::new(),
                stderr: format!("⏱ 타임아웃 ({}초 초과)", timeout.as_secs()),
                exit_code: None,
                duration_ms: timeout.as_millis() as u64,
                passed: false,
                timed_out: true,
            });
        }
    };

    let duration_ms = start.elapsed().as_millis() as u64;
    let exit_code = output.status.code();
    let passed = output.status.success();

    // 출력 길이 제한 — AI 컨텍스트 보호 (tail 위주로 최근 8KB)
    let stdout = truncate_tail(&String::from_utf8_lossy(&output.stdout), 8192);
    let stderr = truncate_tail(&String::from_utf8_lossy(&output.stderr), 8192);

    Ok(TestResult {
        command: cmd_str,
        stdout,
        stderr,
        exit_code,
        duration_ms,
        passed,
        timed_out,
    })
}

fn truncate_tail(s: &str, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s.to_string();
    }
    let start = s.len() - max_bytes;
    // UTF-8 경계로 조정
    let boundary = (start..s.len())
        .find(|&i| s.is_char_boundary(i))
        .unwrap_or(s.len());
    format!("…[{}바이트 생략]\n{}", start, &s[boundary..])
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_dir(name: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("lum_test_{}", name));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn detect_node_npm() {
        let d = tmp_dir("node_npm");
        fs::write(d.join("package.json"), r#"{"scripts":{"test":"vitest"}}"#).unwrap();
        let cmd = detect_test_command(&d).unwrap();
        assert_eq!(cmd.command, "npm test");
        assert_eq!(cmd.project_type, "node");
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn detect_node_pnpm_via_lockfile() {
        let d = tmp_dir("node_pnpm");
        fs::write(d.join("package.json"), r#"{"scripts":{"test":"vitest"}}"#).unwrap();
        fs::write(d.join("pnpm-lock.yaml"), "lockfileVersion: 6.0").unwrap();
        let cmd = detect_test_command(&d).unwrap();
        assert_eq!(cmd.command, "pnpm test");
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn detect_rust() {
        let d = tmp_dir("rust_proj");
        fs::write(d.join("Cargo.toml"), "[package]\nname = \"x\"\n").unwrap();
        let cmd = detect_test_command(&d).unwrap();
        assert_eq!(cmd.command, "cargo test");
        assert_eq!(cmd.project_type, "rust");
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn detect_python_pyproject() {
        let d = tmp_dir("py_proj");
        fs::write(d.join("pyproject.toml"), "[project]\nname = \"x\"").unwrap();
        let cmd = detect_test_command(&d).unwrap();
        assert_eq!(cmd.command, "pytest");
        assert_eq!(cmd.project_type, "python");
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn detect_go() {
        let d = tmp_dir("go_proj");
        fs::write(d.join("go.mod"), "module example.com/x\n").unwrap();
        let cmd = detect_test_command(&d).unwrap();
        assert_eq!(cmd.command, "go test ./...");
        assert_eq!(cmd.project_type, "go");
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn detect_none_when_no_manifest() {
        let d = tmp_dir("empty");
        assert!(detect_test_command(&d).is_none());
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn detect_node_priority_over_rust_if_both() {
        // package.json이 있는 Rust repo (흔함: node 프론트 + rust 백엔드)
        // 현재 로직: node 먼저. Tauri 같은 혼합 프로젝트에선 node 테스트가 기본.
        let d = tmp_dir("mixed");
        fs::write(d.join("package.json"), r#"{"scripts":{"test":"vitest"}}"#).unwrap();
        fs::write(d.join("Cargo.toml"), "[package]\nname = \"x\"").unwrap();
        let cmd = detect_test_command(&d).unwrap();
        assert_eq!(cmd.project_type, "node");
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn truncate_tail_short_string_unchanged() {
        assert_eq!(truncate_tail("hello", 100), "hello");
    }

    #[test]
    fn truncate_tail_long_string_preserves_end() {
        let s = "x".repeat(10000);
        let t = truncate_tail(&s, 100);
        assert!(t.ends_with("xxx"));
        assert!(t.contains("바이트 생략"));
        assert!(t.len() < 200);
    }
}
