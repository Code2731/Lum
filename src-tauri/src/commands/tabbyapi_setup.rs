use crate::error::{LumError, Result};
use tauri::{command, AppHandle, Emitter};

#[derive(serde::Serialize, Clone)]
pub struct TabbyApiStatus {
    pub installed: bool,
    pub running: bool,
    pub port: Option<u16>,
    pub install_dir: Option<String>,
}

// Apple Silicon → ~/.lum_mlx (MLX-LM), 기타 → ~/tabbyAPI (TabbyAPI/ExLlamaV2)
fn server_dir() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| {
        if cfg!(target_arch = "aarch64") {
            h.join(".lum_mlx")
        } else {
            h.join("tabbyAPI")
        }
    })
}

fn is_server_installed() -> bool {
    let Some(dir) = server_dir() else { return false };
    if cfg!(target_arch = "aarch64") {
        dir.join(".venv").join("bin").join("python").exists()
    } else {
        dir.join("main.py").exists() || dir.join("start_tabbyapi.py").exists()
    }
}

fn is_server_running_on(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{}/v1/models", port);
    std::process::Command::new("curl")
        .args(["-s", "--max-time", "1", "-o", "/dev/null", "-w", "%{http_code}", &url])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "200")
        .unwrap_or(false)
}

fn is_port_in_use(port: u16) -> bool {
    std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_err()
}

fn find_python() -> String {
    for p in &["python3.12", "python3.11", "python3.10", "python3", "python"] {
        if std::process::Command::new("which")
            .arg(p)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return p.to_string();
        }
    }
    "python3".to_string()
}

fn homebrew_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    format!("/opt/homebrew/bin:/usr/local/bin:{base}")
}

#[command]
pub fn get_platform_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" }
}

#[command]
pub fn check_tabbyapi_status() -> TabbyApiStatus {
    let installed = is_server_installed();
    let install_dir = server_dir()
        .filter(|d| d.exists())
        .map(|d| d.to_string_lossy().into_owned());

    for port in [5000u16, 5001, 5002, 8000, 8080] {
        if is_server_running_on(port) {
            return TabbyApiStatus { installed, running: true, port: Some(port), install_dir };
        }
    }
    TabbyApiStatus { installed, running: false, port: None, install_dir }
}

#[command]
pub fn get_recommended_port() -> u16 {
    // 이미 서버가 실행 중이면 그 포트 반환 (중복 실행 방지)
    for port in [5000u16, 5001, 5002] {
        if is_server_running_on(port) {
            return port;
        }
    }
    if !is_port_in_use(5000) { 5000 } else { 5001 }
}

#[command]
pub async fn install_tabbyapi(app: AppHandle) -> Result<String> {
    let server_dir = server_dir()
        .ok_or_else(|| LumError::Io("홈 디렉토리를 찾을 수 없습니다.".into()))?;

    let emit = |msg: &str| { let _ = app.emit("tabbyapi_install_progress", msg); };

    if cfg!(target_arch = "aarch64") {
        // Apple Silicon: MLX-LM 설치 (Metal 가속, CUDA 불필요)
        emit("🍎 Apple Silicon 감지 → MLX-LM 설치 중...");

        if !server_dir.exists() {
            std::fs::create_dir_all(&server_dir)
                .map_err(|e| LumError::Io(format!("디렉토리 생성 실패: {e}")))?;
        }

        emit("📦 가상환경 생성 중...");
        let python = find_python();
        let venv_dir = server_dir.join(".venv");
        if !venv_dir.exists() {
            let status = tokio::process::Command::new(&python)
                .args(["-m", "venv", ".venv"])
                .current_dir(&server_dir)
                .env("PATH", homebrew_path())
                .status()
                .await
                .map_err(|e| LumError::Io(format!("venv 생성 실패: {e}")))?;
            if !status.success() {
                return Err(LumError::Io("Python venv 생성 실패 — Python 3.10+ 필요".into()));
            }
        }

        let venv_pip = venv_dir.join("bin").join("pip");
        emit("📦 mlx-lm 설치 중... (Apple Metal 최적화, 수 분 소요)");

        let output = tokio::process::Command::new(&venv_pip)
            .args(["install", "-U", "mlx-lm"])
            .current_dir(&server_dir)
            .env("PATH", homebrew_path())
            .output()
            .await
            .map_err(|e| LumError::Io(format!("pip 실행 실패: {e}")))?;

        if output.status.success() {
            emit("✅ MLX-LM 설치 완료!");
            emit("💡 '실행' 클릭 시 Qwen2.5-Coder-7B 모델을 자동 다운로드합니다 (~4GB).");
            return Ok("완료 (MLX-LM)".into());
        }

        return Err(LumError::AiEngine(
            String::from_utf8_lossy(&output.stderr).chars().take(400).collect(),
        ));
    }

    // NVIDIA/기타: TabbyAPI + ExLlamaV2
    if !server_dir.exists() {
        emit("📥 GitHub에서 TabbyAPI 클론 중...");
        let status = tokio::process::Command::new("git")
            .args([
                "clone",
                "--depth=1",
                "https://github.com/theroyallab/tabbyAPI.git",
                server_dir.to_str().unwrap_or("tabbyAPI"),
            ])
            .status()
            .await
            .map_err(|e| LumError::Io(format!("git 실행 실패: {e}")))?;
        if !status.success() {
            return Err(LumError::AiEngine(
                "git clone 실패 — brew install git 후 재시도".into(),
            ));
        }
        emit("✅ 클론 완료");
    } else {
        emit("📂 ~/tabbyAPI 존재 — pip install 진행");
    }

    emit("📦 가상환경 생성 중...");
    let python = find_python();
    let venv_dir = server_dir.join(".venv");
    if !venv_dir.exists() {
        let _ = tokio::process::Command::new(&python)
            .args(["-m", "venv", ".venv"])
            .current_dir(&server_dir)
            .status()
            .await;
    }
    let venv_pip = venv_dir.join("bin").join("pip");
    let pip = if venv_pip.exists() {
        venv_pip.to_string_lossy().into_owned()
    } else {
        python
    };

    emit("📦 의존성 설치 중... (수 분 소요)");
    let output = tokio::process::Command::new(&pip)
        .args(["install", "-e", ".[cpu]"])
        .current_dir(&server_dir)
        .output()
        .await
        .map_err(|e| LumError::Io(format!("pip 실행 실패: {e}")))?;

    if output.status.success() {
        emit("✅ TabbyAPI 설치 완료!");
        return Ok("완료".into());
    }

    Err(LumError::AiEngine(
        String::from_utf8_lossy(&output.stderr).chars().take(400).collect(),
    ))
}


#[command]
pub async fn start_tabbyapi(app: tauri::AppHandle, port: u16, model: Option<String>) -> Result<String> {
    if is_server_running_on(port) {
        return Ok(format!("이미 포트 {port}에서 실행 중입니다."));
    }

    let server_dir = server_dir()
        .ok_or_else(|| LumError::Io("로컬 AI 서버가 설치되지 않았습니다 — 설치 버튼을 누르세요.".into()))?;
    let venv_python = server_dir.join(".venv").join("bin").join("python");

    if !venv_python.exists() {
        return Err(LumError::Io(
            "로컬 AI 서버가 설치되지 않았습니다 — 먼저 설치하세요.".into(),
        ));
    }

    if cfg!(target_arch = "aarch64") {
        let model = model.as_deref().unwrap_or("mlx-community/Qwen2.5-Coder-7B-Instruct-4bit");
        let mlx_bin = server_dir.join(".venv").join("bin").join("mlx_lm.server");

        // stderr는 버림 — tqdm이 \r로 출력해 파이프 버퍼를 막으므로 절대 piped 금지
        if mlx_bin.exists() {
            tokio::process::Command::new(&mlx_bin)
                .args(["--model", model, "--port", &port.to_string()])
                .env("PATH", homebrew_path())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|e| LumError::Io(format!("MLX-LM 시작 실패: {e}")))?;
        } else {
            tokio::process::Command::new(&venv_python)
                .args(["-m", "mlx_lm.server", "--model", model, "--port", &port.to_string()])
                .env("PATH", homebrew_path())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|e| LumError::Io(format!("MLX-LM 시작 실패: {e}")))?;
        }

        // 백그라운드: /v1/models 폴링으로 서버 준비 감지 → 프론트 이벤트 emit
        let poll_url = format!("http://127.0.0.1:{}/v1/models", port);
        tokio::spawn(async move {
            let client = reqwest::Client::new();
            let mut tick: u32 = 0;
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                tick += 1;

                // 시간 기반 가짜 진행률 (최대 90%까지, 서버 응답 시 100%)
                let pct = (tick * 6).min(90);
                let _ = app.emit("mlx_download_progress",
                    serde_json::json!({ "percent": pct, "done": false }));

                let ok = client.get(&poll_url)
                    .timeout(std::time::Duration::from_secs(2))
                    .send().await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false);

                if ok {
                    let _ = app.emit("mlx_download_progress",
                        serde_json::json!({ "percent": 100, "done": true }));
                    return;
                }

                if tick > 60 { return; } // 3분 타임아웃
            }
        });

        return Ok(format!("MLX-LM 서버 포트 {port} 시작됨"));
    }

    // NVIDIA/기타: TabbyAPI
    let script = if server_dir.join("start_tabbyapi.py").exists() {
        "start_tabbyapi.py"
    } else {
        "main.py"
    };

    tokio::process::Command::new(&venv_python)
        .args([script, "--port", &port.to_string()])
        .current_dir(&server_dir)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| LumError::Io(format!("TabbyAPI 시작 실패: {e}")))?;

    Ok(format!("TabbyAPI 포트 {port} 시작됨"))
}

#[command]
pub fn stop_tabbyapi() -> Result<String> {
    #[cfg(not(windows))]
    {
        let pattern = if cfg!(target_arch = "aarch64") {
            "mlx_lm.server"
        } else {
            "start_tabbyapi|tabby_api"
        };
        let _ = std::process::Command::new("pkill")
            .args(["-f", pattern])
            .status();
    }
    #[cfg(windows)]
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/IM", "python.exe"])
        .status();
    Ok("서버 중지됨".into())
}
