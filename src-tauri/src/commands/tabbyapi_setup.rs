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
    #[cfg(windows)]
    let null_dev = "NUL";
    #[cfg(not(windows))]
    let null_dev = "/dev/null";
    // HTTP 응답을 받으면(401/403/200 무관) 서버 실행 중으로 판단.
    // TabbyAPI는 API key 없으면 401을 반환하므로 200만 체크하면 오탐지됨.
    std::process::Command::new("curl")
        .args(["-s", "--max-time", "1", "-o", null_dev, "-w", "%{http_code}", &url])
        .output()
        .map(|o| {
            let code = String::from_utf8_lossy(&o.stdout).trim().to_string();
            // "000" = 연결 실패, 그 외 (200/401/404 등) = 서버 응답
            !code.is_empty() && code != "000"
        })
        .unwrap_or(false)
}

fn is_port_in_use(port: u16) -> bool {
    std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_err()
}

fn find_python() -> String {
    #[cfg(windows)]
    let check_cmd = "where";
    #[cfg(not(windows))]
    let check_cmd = "which";

    let candidates: &[&str] = if cfg!(windows) {
        &["python", "python3"]
    } else {
        &["python3.12", "python3.11", "python3.10", "python3", "python"]
    };

    for p in candidates {
        if std::process::Command::new(check_cmd)
            .arg(p)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return p.to_string();
        }
    }
    if cfg!(windows) { "python".to_string() } else { "python3".to_string() }
}

fn venv_python(venv_dir: &std::path::Path) -> std::path::PathBuf {
    if cfg!(windows) {
        venv_dir.join("Scripts").join("python.exe")
    } else {
        venv_dir.join("bin").join("python")
    }
}

fn venv_pip(venv_dir: &std::path::Path) -> std::path::PathBuf {
    if cfg!(windows) {
        venv_dir.join("Scripts").join("pip.exe")
    } else {
        venv_dir.join("bin").join("pip")
    }
}

fn homebrew_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    format!("/opt/homebrew/bin:/usr/local/bin:{base}")
}

#[command]
pub fn get_platform_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else if cfg!(target_os = "macos") {
        "intel-mac" // Intel Mac — MLX도 CUDA도 쓸 수 없음
    } else {
        "x86_64"
    }
}

fn is_intel_mac() -> bool {
    cfg!(target_os = "macos") && !cfg!(target_arch = "aarch64")
}

/// 특정 포트에서 listening 중인 프로세스만 정확히 kill (다른 Python 앱 보호)
fn kill_on_port(port: u16) {
    #[cfg(windows)]
    {
        let needle = format!(":{}", port);
        if let Ok(out) = std::process::Command::new("netstat")
            .args(["-ano", "-p", "TCP"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains(&needle) && line.contains("LISTENING") {
                    if let Some(pid) = line.split_whitespace().last() {
                        let _ = std::process::Command::new("taskkill")
                            .args(["/F", "/PID", pid])
                            .status();
                    }
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        // -s TCP:LISTEN: 서버(listening) 프로세스만 — 클라이언트(앱 자신) 제외
        if let Ok(out) = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{}", port), "-s", "TCP:LISTEN"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for pid in text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()) {
                let _ = std::process::Command::new("kill").args(["-9", pid]).status();
            }
        }
    }
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
    // Intel Mac 가드 — MLX(aarch64 전용)도 CUDA(NVIDIA 전용)도 불가
    if is_intel_mac() {
        return Err(LumError::AiEngine(
            "Intel Mac은 로컬 AI 서버를 지원하지 않습니다. Apple Silicon Mac 또는 NVIDIA GPU가 있는 Windows/Linux가 필요합니다. 설정에서 Gemini API 키를 입력하면 클라우드 폴백을 사용할 수 있습니다.".into(),
        ));
    }

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

        let venv_pip = venv_pip(&venv_dir);
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
    let pip_path = venv_pip(&venv_dir);
    let pip = if pip_path.exists() {
        pip_path.to_string_lossy().into_owned()
    } else {
        python
    };

    // 1단계: 기본 패키지 먼저 (pydantic, fastapi 등) — 빈 venv에서 [cu12] 직접 시도는 실패함
    emit("📦 1/2 기본 패키지 설치 중... (수 분 소요)");
    let out1 = tokio::process::Command::new(&pip)
        .args(["install", "-e", "."])
        .current_dir(&server_dir)
        .output()
        .await
        .map_err(|e| LumError::Io(format!("pip 실행 실패: {e}")))?;

    if !out1.status.success() {
        let stderr = String::from_utf8_lossy(&out1.stderr);
        return Err(LumError::AiEngine(format!(
            "기본 패키지 설치 실패:\n{}",
            stderr.chars().take(600).collect::<String>()
        )));
    }
    emit("✅ 기본 패키지 완료");

    // 2단계: NVIDIA GPU 감지 → pyproject.toml [cu12] extras 사용 (torch 2.9.0 + exllamav2 prebuilt wheels)
    let has_nvidia = std::process::Command::new("nvidia-smi")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if has_nvidia {
        emit("🟢 NVIDIA GPU 감지 → torch 2.9.0+cu128 + ExLlamaV2/V3 + Flash-Attn 설치 중... (~3GB, 수 분 소요)");
        let extras_path = format!("{}[cu12]", server_dir.to_string_lossy());
        let out2 = tokio::process::Command::new(&pip)
            .args(["install", "-e", &extras_path])
            .current_dir(&server_dir)
            .output()
            .await
            .map_err(|e| LumError::Io(format!("cu12 extras 설치 실패: {e}")))?;

        if out2.status.success() {
            emit("✅ CUDA 의존성(torch/exllamav2/flash_attn) 설치 완료!");
        } else {
            let stderr = String::from_utf8_lossy(&out2.stderr);
            return Err(LumError::AiEngine(format!(
                "CUDA 의존성 설치 실패:\n{}",
                stderr.chars().take(600).collect::<String>()
            )));
        }
    }

    // start_options.json 생성 → 다음 실행 시 인터랙티브 프롬프트 방지
    let opts_path = server_dir.join("start_options.json");
    let gpu_lib = if has_nvidia { "cu12" } else { "" };
    let opts = serde_json::json!({ "gpu_lib": gpu_lib, "first_run_done": true });
    let _ = std::fs::write(&opts_path, opts.to_string());

    emit("✅ TabbyAPI 설치 완료! XllmPanel에서 '실행' 버튼을 누르세요.");
    Ok("완료".into())
}


#[command]
pub async fn start_tabbyapi(app: tauri::AppHandle, port: u16, model: Option<String>) -> Result<String> {
    if is_intel_mac() {
        return Err(LumError::AiEngine(
            "Intel Mac은 로컬 AI 서버를 지원하지 않습니다. Gemini API 폴백을 사용하세요.".into(),
        ));
    }
    if is_server_running_on(port) {
        return Ok(format!("이미 포트 {port}에서 실행 중입니다."));
    }

    let server_dir = server_dir()
        .ok_or_else(|| LumError::Io("로컬 AI 서버가 설치되지 않았습니다 — 설치 버튼을 누르세요.".into()))?;
    let venv_dir = server_dir.join(".venv");
    let venv_python = venv_python(&venv_dir);

    if !venv_python.exists() {
        return Err(LumError::Io(
            "로컬 AI 서버가 설치되지 않았습니다 — 먼저 설치하세요.".into(),
        ));
    }

    if cfg!(target_arch = "aarch64") {
        let model = model.as_deref().unwrap_or("mlx-community/Qwen2.5-Coder-7B-Instruct-4bit");
        let mlx_bin = venv_dir.join("bin").join("mlx_lm.server");

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

    // NVIDIA/기타: TabbyAPI — start.py로 실행 (환경 설정 포함)
    // start_options.json 없으면 생성 (첫 실행 시 인터랙티브 프롬프트 방지)
    let opts_path = server_dir.join("start_options.json");
    if !opts_path.exists() {
        let has_nvidia = std::process::Command::new("nvidia-smi")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        let gpu_lib = if has_nvidia { "cu12" } else { "" };
        let opts = serde_json::json!({ "gpu_lib": gpu_lib, "first_run_done": true });
        let _ = std::fs::write(&opts_path, opts.to_string());
    }

    // stderr → 로그 파일 (에러 진단용)
    let log_path = server_dir.join("lum_tabby.log");
    let log_file = std::fs::File::create(&log_path)
        .map_err(|e| LumError::Io(format!("로그 파일 생성 실패: {e}")))?;

    // start.py: --nowheel(의존성 재설치 skip) --port N
    let script = if server_dir.join("start.py").exists() { "start.py" } else { "main.py" };
    let mut child = tokio::process::Command::new(&venv_python)
        .args([script, "--nowheel", "--port", &port.to_string()])
        .current_dir(&server_dir)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::from(log_file))
        .spawn()
        .map_err(|e| LumError::Io(format!("TabbyAPI 시작 실패: {e}")))?;

    // 3초 후 프로세스가 살아있는지 확인
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    match child.try_wait() {
        Ok(Some(status)) => {
            // 프로세스가 이미 종료됨 → 로그 읽어서 에러 반환
            let log = std::fs::read_to_string(&log_path).unwrap_or_default();
            let snippet: String = log.lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
            return Err(LumError::AiEngine(format!(
                "TabbyAPI 시작 직후 종료 (exit={status})\n{snippet}"
            )));
        }
        _ => {}
    }

    Ok(format!("TabbyAPI 포트 {port} 시작됨 — 로그: lum_tabby.log"))
}

#[command]
pub fn stop_tabbyapi() -> Result<String> {
    // 후보 포트들에서 listening 중인 TabbyAPI/MLX-LM 프로세스만 정확히 종료
    // (Windows에서 taskkill /IM python.exe는 다른 Python 앱까지 죽이므로 금지)
    let mut killed = 0;
    for port in [5000u16, 5001, 5002, 8000, 8080] {
        if is_server_running_on(port) {
            kill_on_port(port);
            killed += 1;
        }
    }
    if killed == 0 {
        Ok("실행 중인 서버를 찾지 못했습니다.".into())
    } else {
        Ok(format!("서버 중지됨 ({killed}개 포트)"))
    }
}

/// 모델을 교체하여 서버 재시작 — stop 후 포트 해제 확인(최대 5초)까지 기다린 뒤 start
#[command]
pub async fn restart_with_model(app: tauri::AppHandle, port: u16, model: String) -> Result<String> {
    // 1. 기존 서버 종료
    kill_on_port(port);

    // 2. 포트가 실제로 해제될 때까지 대기 (최대 5초, 200ms 간격)
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        if !is_port_in_use(port) { break; }
        if std::time::Instant::now() >= deadline {
            return Err(LumError::AiEngine(format!(
                "포트 {port} 해제 실패 — 다른 프로세스가 사용 중일 수 있습니다."
            )));
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    // 3. 새 모델로 서버 시작 (start_tabbyapi 내부 로직 재사용)
    start_tabbyapi(app, port, Some(model)).await
}
