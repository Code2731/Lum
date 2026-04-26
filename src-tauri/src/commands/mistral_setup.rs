use crate::commands::config::load_config;
use crate::commands::tabbyapi_setup::kill_on_port;
use crate::error::{LumError, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter};

#[cfg(windows)]
fn no_window_std(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000);
}
#[cfg(not(windows))]
fn no_window_std(_cmd: &mut std::process::Command) {}

#[cfg(windows)]
fn no_window_tokio(cmd: &mut tokio::process::Command) { cmd.creation_flags(0x08000000); }
#[cfg(not(windows))]
fn no_window_tokio(_cmd: &mut tokio::process::Command) {}

const MISTRAL_RS_PORT: u16 = 8080;

static MISTRAL_PROCESS: Mutex<Option<std::process::Child>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MistralRsStatus {
    pub running: bool,
    pub url: String,
    pub model: Option<String>,
}

/// mistral.rs 바이너리 설치 (cargo install mistralrs-server)
#[command]
pub async fn install_mistral_rs(app: AppHandle) -> Result<String> {
    // 1. cargo 존재 확인 — Rust 툴체인 없으면 명확한 메시지
    let cargo_check = tokio::process::Command::new("cargo")
        .arg("--version")
        .output()
        .await;
    if cargo_check.is_err() || !cargo_check.as_ref().map(|o| o.status.success()).unwrap_or(false) {
        return Err(LumError::AiEngine(
            "Rust 툴체인(cargo) 미설치. https://rustup.rs 에서 rustup-init.exe를 받아 설치 후 재시도하세요.".into()
        ));
    }

    const GIT_REPO: &str = "https://github.com/EricLBuehler/mistral.rs.git";
    let _ = app.emit("mistral_rs_log", "mistral.rs 설치 시작 (GitHub · CUDA 빌드)...");
    let _ = app.emit("mistral_rs_log", "⏳ 첫 설치는 5~15분 걸립니다. cargo 출력을 실시간 표시합니다.");

    // 1차: CUDA 빌드 — --force로 기존 바이너리 강제 재빌드
    if run_cargo_install_streaming(&app, &["install", "--force", "--git", GIT_REPO, "mistralrs-server", "--features", "cuda"]).await? {
        let _ = app.emit("mistral_rs_log", "✅ CUDA 빌드 완료");
        return Ok("CUDA 빌드 설치 완료".into());
    }
    let _ = app.emit("mistral_rs_log", "❌ CUDA 빌드 실패 — CPU 빌드로 재시도...");

    // 2차: CPU 빌드 폴백
    if run_cargo_install_streaming(&app, &["install", "--force", "--git", GIT_REPO, "mistralrs-server"]).await? {
        let _ = app.emit("mistral_rs_log", "✅ CPU 빌드 완료 (CUDA 가속 미사용)");
        return Ok("CPU 빌드 설치 완료 (CUDA 가속 미사용)".into());
    }

    Err(LumError::AiEngine(
        "CUDA·CPU 빌드 모두 실패. 'mistral.rs 설치 로그' 패널에서 cargo 출력을 확인하세요.".into()
    ))
}

/// cargo install을 실행하며 stdout/stderr를 한 줄씩 'mistral_rs_log' 이벤트로 emit.
/// 빌드 중에도 사용자가 진행 상황을 볼 수 있게 함. exit code success 여부 반환.
async fn run_cargo_install_streaming(app: &AppHandle, args: &[&str]) -> Result<bool> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use std::process::Stdio;

    let mut cmd = tokio::process::Command::new("cargo");
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    no_window_tokio(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| LumError::Io(e.to_string()))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_out = app.clone();
    let app_err = app.clone();

    let stdout_task = tokio::spawn(async move {
        if let Some(s) = stdout {
            let mut lines = BufReader::new(s).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_out.emit("mistral_rs_log", line);
            }
        }
    });
    let stderr_task = tokio::spawn(async move {
        if let Some(s) = stderr {
            let mut lines = BufReader::new(s).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                // cargo는 진행률을 stderr로 보냄 — 그대로 표시
                let _ = app_err.emit("mistral_rs_log", line);
            }
        }
    });

    let status = child.wait().await.map_err(|e| LumError::Io(e.to_string()))?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;
    Ok(status.success())
}

/// mistral.rs 서버 시작
#[command]
pub async fn start_mistral_rs(app: AppHandle) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let config = load_config()?;
    let base_url = config.mistral_rs_url();
    let health_url = format!("{}/v1/models", base_url);
    if client.get(&health_url).send().await.is_ok() {
        return Ok("이미 실행 중".into());
    }
    let model = config
        .mistral_rs_model
        .clone()
        .unwrap_or_else(|| "microsoft/Phi-3.5-mini-instruct".into());

    let _ = app.emit(
        "mistral_rs_log",
        format!("mistral.rs 시작: {} (포트 {})", model, MISTRAL_RS_PORT),
    );

    let log_path = dirs::home_dir()
        .unwrap_or_default()
        .join("lum_mistral.log");
    let log_file = std::fs::File::create(&log_path).map_err(|e| LumError::Io(e.to_string()))?;
    let log_file2 = log_file.try_clone().map_err(|e| LumError::Io(e.to_string()))?;

    let mut mistral_cmd = std::process::Command::new("mistralrs-server");
    mistral_cmd
        .args(["--port", &MISTRAL_RS_PORT.to_string(), "plain", "--model-id", &model, "--isq", "Q4K"])
        .stdout(log_file)
        .stderr(log_file2);

    // CUDA Toolkit DLL 검색 경로 명시 추가 — Windows에서 cudart64_12.dll 등을 찾기 위함
    #[cfg(windows)]
    {
        let cuda_bin = "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.6\\bin";
        if std::path::Path::new(cuda_bin).exists() {
            let cur_path = std::env::var("PATH").unwrap_or_default();
            mistral_cmd.env("PATH", format!("{};{}", cuda_bin, cur_path));
        }
    }

    no_window_std(&mut mistral_cmd);
    let child = mistral_cmd.spawn().map_err(|e| LumError::Io(e.to_string()))?;

    *MISTRAL_PROCESS.lock().unwrap() = Some(child);

    // 모델 로드는 첫 실행 시 다운로드 + 가중치 로드로 길게 걸림
    // 5분(300초) 폴링 — 1초 간격으로 health 확인, 진행 상황 emit
    let max_attempts = 300u32;
    for i in 0..max_attempts {
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        if client.get(&health_url).send().await.is_ok() {
            let _ = app.emit("mistral_rs_log", "✅ mistral.rs 서버 준비 완료");
            return Ok(base_url);
        }
        // 30초마다 진행 상황 알림
        if i > 0 && i % 30 == 0 {
            let _ = app.emit(
                "mistral_rs_log",
                format!("⏳ {}초 경과 — 모델 로드 중 (lum_mistral.log 확인)...", i)
            );
        }
        // 자식 프로세스가 죽었는지 확인
        if let Ok(mut guard) = MISTRAL_PROCESS.lock() {
            if let Some(child) = guard.as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    let log_tail = std::fs::read_to_string(&log_path)
                        .ok()
                        .map(|s| s.lines().rev().take(15).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n"))
                        .unwrap_or_default();
                    return Err(LumError::AiEngine(format!(
                        "mistral.rs 프로세스 종료 (exit={}). 로그 말미:\n{}",
                        status, log_tail
                    )));
                }
            }
        }
    }

    Err(LumError::AiEngine(format!("mistral.rs 시작 타임아웃 ({}초). lum_mistral.log를 확인하세요.", max_attempts)))
}

/// mistral.rs 서버 종료
#[command]
pub fn stop_mistral_rs() -> Result<String> {
    if let Ok(mut guard) = MISTRAL_PROCESS.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
    kill_on_port(MISTRAL_RS_PORT);
    Ok("mistral.rs 종료됨".into())
}

/// 현재 상태 조회 — try_wait()으로 프로세스 생존 여부 확인
#[command]
pub fn check_mistral_rs_status() -> MistralRsStatus {
    let config = load_config().unwrap_or_default();
    let url = config.mistral_rs_url();
    let running = MISTRAL_PROCESS
        .lock()
        .map(|mut g| {
            if let Some(child) = g.as_mut() {
                // exit status가 있으면 이미 종료됨
                child.try_wait().ok().flatten().is_none()
            } else {
                false
            }
        })
        .unwrap_or(false);
    MistralRsStatus {
        running,
        url,
        model: config.mistral_rs_model,
    }
}
