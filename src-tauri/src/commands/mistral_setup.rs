use crate::commands::config::load_config;
use crate::commands::tabbyapi_setup::kill_on_port;
use crate::error::{LumError, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter};

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
    let _ = app.emit("mistral_rs_log", "mistral.rs 설치 시작 (CUDA 빌드)...");

    let status = tokio::process::Command::new("cargo")
        .args(["install", "mistralrs-server", "--features", "cuda"])
        .status()
        .await
        .map_err(|e| LumError::Io(e.to_string()))?;

    if !status.success() {
        let _ = app.emit("mistral_rs_log", "CUDA 빌드 실패 — CPU 빌드로 재시도...");
        let fallback = tokio::process::Command::new("cargo")
            .args(["install", "mistralrs-server"])
            .status()
            .await
            .map_err(|e| LumError::Io(e.to_string()))?;
        if !fallback.success() {
            return Err(LumError::AiEngine("mistral.rs 설치 실패".into()));
        }
    }

    let _ = app.emit("mistral_rs_log", "mistral.rs 설치 완료");
    Ok("설치 완료".into())
}

/// mistral.rs 서버 시작
#[command]
pub async fn start_mistral_rs(app: AppHandle) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let health_url = format!("http://127.0.0.1:{}/v1/models", MISTRAL_RS_PORT);
    if client.get(&health_url).send().await.is_ok() {
        return Ok("이미 실행 중".into());
    }

    let config = load_config()?;
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

    let child = std::process::Command::new("mistralrs-server")
        .args([
            "--port",
            &MISTRAL_RS_PORT.to_string(),
            "plain",
            "--model-id",
            &model,
            "--isq",
            "Q4K",
        ])
        .stdout(log_file)
        .stderr(log_file2)
        .spawn()
        .map_err(|e| LumError::Io(e.to_string()))?;

    *MISTRAL_PROCESS.lock().unwrap() = Some(child);

    // 최대 15초 대기 — 공유 client 재사용
    for _ in 0..15 {
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        if client.get(&health_url).send().await.is_ok() {
            let _ = app.emit("mistral_rs_log", "mistral.rs 서버 준비 완료");
            return Ok(format!("http://127.0.0.1:{}", MISTRAL_RS_PORT));
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

/// 현재 상태 조회 — 프로세스 핸들 존재 여부로 실행 중 판단
#[command]
pub fn check_mistral_rs_status() -> MistralRsStatus {
    let config = load_config().unwrap_or_default();
    let running = MISTRAL_PROCESS
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false);
    MistralRsStatus {
        running,
        url: format!("http://127.0.0.1:{}", MISTRAL_RS_PORT),
        model: config.mistral_rs_model,
    }
}
