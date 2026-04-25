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

    let _ = app.emit("mistral_rs_log", "mistral.rs 설치 시작 (CUDA 빌드)...");

    // 2. CUDA 빌드 시도 — stdout/stderr 캡처해서 실패 시 원인 노출
    let mut cuda_cmd = tokio::process::Command::new("cargo");
    cuda_cmd.args(["install", "mistralrs-server", "--features", "cuda"]);
    no_window_tokio(&mut cuda_cmd);
    let cuda_out = cuda_cmd.output().await.map_err(|e| LumError::Io(e.to_string()))?;

    if cuda_out.status.success() {
        let _ = app.emit("mistral_rs_log", "mistral.rs CUDA 빌드 완료");
        return Ok("CUDA 빌드 설치 완료".into());
    }

    let cuda_err = String::from_utf8_lossy(&cuda_out.stderr);
    let _ = app.emit("mistral_rs_log", format!("CUDA 빌드 실패 — CPU 빌드로 재시도: {}", cuda_err.lines().last().unwrap_or("")));

    // 3. CPU 빌드 폴백
    let mut cpu_cmd = tokio::process::Command::new("cargo");
    cpu_cmd.args(["install", "mistralrs-server"]);
    no_window_tokio(&mut cpu_cmd);
    let cpu_out = cpu_cmd.output().await.map_err(|e| LumError::Io(e.to_string()))?;

    if cpu_out.status.success() {
        let _ = app.emit("mistral_rs_log", "mistral.rs CPU 빌드 완료");
        return Ok("CPU 빌드 설치 완료 (CUDA 가속 미사용)".into());
    }

    let cpu_err = String::from_utf8_lossy(&cpu_out.stderr);
    // 마지막 5줄만 — cargo 에러는 보통 후반부에 핵심 메시지가 있음
    let cpu_tail: String = cpu_err.lines().rev().take(5).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
    Err(LumError::AiEngine(format!(
        "CUDA·CPU 빌드 모두 실패. cargo 출력 (말미):\n{}",
        cpu_tail
    )))
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
    no_window_std(&mut mistral_cmd);
    let child = mistral_cmd.spawn().map_err(|e| LumError::Io(e.to_string()))?;

    *MISTRAL_PROCESS.lock().unwrap() = Some(child);

    // 최대 15초 대기 — 공유 client 재사용
    for _ in 0..15 {
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        if client.get(&health_url).send().await.is_ok() {
            let _ = app.emit("mistral_rs_log", "mistral.rs 서버 준비 완료");
            return Ok(base_url);
        }
    }

    Err(LumError::AiEngine("mistral.rs 시작 타임아웃 (15초)".into()))
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
