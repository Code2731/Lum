use crate::error::{LumError, Result};
use tauri::{command, AppHandle, Emitter};

/// Windows에서 새 콘솔 창 생성 방지 — CREATE_NO_WINDOW (0x08000000)
/// tokio Command와 std Command 모두 적용 가능하도록 분리
#[cfg(windows)]
fn no_window_tokio(cmd: &mut tokio::process::Command) {
    cmd.creation_flags(0x08000000);
}
#[cfg(windows)]
fn no_window_std(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000);
}
#[cfg(not(windows))]
fn no_window_tokio(_cmd: &mut tokio::process::Command) {}
#[cfg(not(windows))]
fn no_window_std(_cmd: &mut std::process::Command) {}

#[derive(serde::Serialize, Clone)]
pub struct TabbyApiStatus {
    pub installed: bool,
    pub running: bool,
    pub port: Option<u16>,
    pub install_dir: Option<String>,
}

/// 기존 config.yml에서 model_dir 값을 추출한다 (YAML 파서 없이 줄 단위 탐색).
fn read_model_dir_from_config(server_dir: &std::path::Path) -> Option<String> {
    let content = std::fs::read_to_string(server_dir.join("config.yml")).ok()?;
    for line in content.lines() {
        if let Some(val) = line.trim().strip_prefix("model_dir:") {
            let val = val.trim();
            if !val.is_empty() && !val.starts_with('#') {
                return Some(val.to_string());
            }
        }
    }
    None
}

/// TabbyAPI config.yml 생성.
///
/// - `model_dir`: 모델 폴더 절대 경로 (LUM config → 기존 config.yml → server_dir/models 순 우선)
/// - `utilization`: 0.50 ~ 0.95 — VRAM 사용 상한 비율
/// - `total_vram_gb`: 감지된 GPU VRAM (없으면 16GB 보수적 가정)
/// - `max_seq_len`: None이면 VRAM 기반 자동 계산
/// - `draft_model`: Phase 84 — Speculative Decoding 드래프트 모델 폴더 이름.
///   `model_dir` 안에 같은 토크나이저의 작은 모델 폴더가 있어야 동작.
fn write_tabby_config(
    server_dir: &std::path::Path,
    port: u16,
    utilization: f32,
    total_vram_gb: Option<f32>,
    max_seq_len: Option<u32>,
    cache_mode: &str,
    model_dir: &str,
    draft_model: Option<&str>,
) -> Result<()> {
    let vram = total_vram_gb.unwrap_or(16.0);
    let util = utilization.clamp(0.50, 0.95);
    let reserve_mb = ((1.0 - util) * vram * 1024.0).round() as u32;
    let seq_len = max_seq_len.unwrap_or_else(|| {
        let usable = vram * util;
        // Q8 기준: 1GB당 ~4K 토큰 (context). 보수적 상한 32K.
        ((usable * 4096.0) as u32).clamp(4096, 32768)
    });

    // draft_model 섹션: Some이고 비어있지 않을 때만 추가. ExLlamaV2가 메인과 같은
    // 토크나이저인지 자체 검증하므로 LUM은 폴더명만 전달.
    let draft_yaml = match draft_model.map(str::trim).filter(|s| !s.is_empty()) {
        Some(name) => format!(
            "\ndraft_model:\n  draft_model_dir: {model_dir}\n  draft_model_name: {name}\n  draft_cache_mode: FP16\n"
        ),
        None => String::new(),
    };

    let yaml = format!(
        "network:\n  host: 127.0.0.1\n  port: {port}\n  disable_auth: true\n\nlogging:\n  log_prompt: false\n  log_generation_params: false\n  log_requests: false\n\nmodel:\n  model_dir: {model_dir}\n  inline_model_loading: false\n  cache_mode: {cache_mode}\n  max_seq_len: {seq_len}\n  gpu_split_auto: true\n  autosplit_reserve: [{reserve_mb}]\n{draft_yaml}\ndeveloper:\n  unsafe_launch: false\n  disable_request_streaming: false\n",
    );

    let config_path = server_dir.join("config.yml");
    std::fs::write(&config_path, yaml)
        .map_err(|e| LumError::Io(format!("config.yml 쓰기 실패: {e}")))?;
    Ok(())
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
    let Some(dir) = server_dir() else {
        return false;
    };
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
        .args([
            "-s",
            "--max-time",
            "1",
            "-o",
            null_dev,
            "-w",
            "%{http_code}",
            &url,
        ])
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
        &[
            "python3.12",
            "python3.11",
            "python3.10",
            "python3",
            "python",
        ]
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
    if cfg!(windows) {
        "python".to_string()
    } else {
        "python3".to_string()
    }
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
pub(crate) fn kill_on_port(port: u16) {
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
                let _ = std::process::Command::new("kill")
                    .args(["-9", pid])
                    .status();
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
            return TabbyApiStatus {
                installed,
                running: true,
                port: Some(port),
                install_dir,
            };
        }
    }
    TabbyApiStatus {
        installed,
        running: false,
        port: None,
        install_dir,
    }
}

#[command]
pub fn get_recommended_port() -> u16 {
    // 이미 서버가 실행 중이면 그 포트 반환 (중복 실행 방지)
    for port in [5000u16, 5001, 5002] {
        if is_server_running_on(port) {
            return port;
        }
    }
    if !is_port_in_use(5000) {
        5000
    } else {
        5001
    }
}

#[command]
pub async fn install_tabbyapi(app: AppHandle) -> Result<String> {
    // Intel Mac 가드 — MLX(aarch64 전용)도 CUDA(NVIDIA 전용)도 불가
    if is_intel_mac() {
        return Err(LumError::AiEngine(
            "Intel Mac은 로컬 AI 서버를 지원하지 않습니다. Apple Silicon Mac 또는 NVIDIA GPU가 있는 Windows/Linux가 필요합니다. 설정에서 Gemini API 키를 입력하면 클라우드 폴백을 사용할 수 있습니다.".into(),
        ));
    }

    let server_dir =
        server_dir().ok_or_else(|| LumError::Io("홈 디렉토리를 찾을 수 없습니다.".into()))?;

    let emit = |msg: &str| {
        let _ = app.emit("tabbyapi_install_progress", msg);
    };

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
                return Err(LumError::Io(
                    "Python venv 생성 실패 — Python 3.10+ 필요".into(),
                ));
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
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(400)
                .collect(),
        ));
    }

    // NVIDIA/기타: TabbyAPI + ExLlamaV2
    if !server_dir.exists() {
        emit("📥 GitHub에서 TabbyAPI 클론 중...");
        let mut git_cmd = tokio::process::Command::new("git");
        git_cmd.args(["clone", "--depth=1", "https://github.com/theroyallab/tabbyAPI.git", server_dir.to_str().unwrap_or("tabbyAPI")]);
        no_window_tokio(&mut git_cmd);
        let status = git_cmd.status().await.map_err(|e| LumError::Io(format!("git 실행 실패: {e}")))?;
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
        let mut venv_cmd = tokio::process::Command::new(&python);
        venv_cmd.args(["-m", "venv", ".venv"]).current_dir(&server_dir);
        no_window_tokio(&mut venv_cmd);
        let _ = venv_cmd.status().await;
    }
    let pip_path = venv_pip(&venv_dir);
    let pip = if pip_path.exists() {
        pip_path.to_string_lossy().into_owned()
    } else {
        python
    };

    // 1단계: 기본 패키지 먼저 (pydantic, fastapi 등) — 빈 venv에서 [cu12] 직접 시도는 실패함
    emit("📦 1/2 기본 패키지 설치 중... (수 분 소요)");
    let mut pip1_cmd = tokio::process::Command::new(&pip);
    pip1_cmd.args(["install", "-e", "."]).current_dir(&server_dir);
    no_window_tokio(&mut pip1_cmd);
    let out1 = pip1_cmd.output().await.map_err(|e| LumError::Io(format!("pip 실행 실패: {e}")))?;

    if !out1.status.success() {
        let stderr = String::from_utf8_lossy(&out1.stderr);
        return Err(LumError::AiEngine(format!(
            "기본 패키지 설치 실패:\n{}",
            stderr.chars().take(600).collect::<String>()
        )));
    }
    emit("✅ 기본 패키지 완료");

    // 2단계: NVIDIA GPU 감지 → pyproject.toml [cu12] extras 사용 (torch 2.9.0 + exllamav2 prebuilt wheels)
    let mut nvcheck = std::process::Command::new("nvidia-smi");
    no_window_std(&mut nvcheck);
    let has_nvidia = nvcheck.output().map(|o| o.status.success()).unwrap_or(false);

    if has_nvidia {
        emit("🟢 NVIDIA GPU 감지 → torch 2.9.0+cu128 + ExLlamaV2/V3 + Flash-Attn 설치 중... (~3GB, 수 분 소요)");
        let extras_path = format!("{}[cu12]", server_dir.to_string_lossy());
        let mut pip2_cmd = tokio::process::Command::new(&pip);
        pip2_cmd.args(["install", "-e", &extras_path]).current_dir(&server_dir);
        no_window_tokio(&mut pip2_cmd);
        let out2 = pip2_cmd.output().await.map_err(|e| LumError::Io(format!("cu12 extras 설치 실패: {e}")))?;

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
pub async fn start_tabbyapi(
    app: tauri::AppHandle,
    port: u16,
    model: Option<String>,
) -> Result<String> {
    if is_intel_mac() {
        return Err(LumError::AiEngine(
            "Intel Mac은 로컬 AI 서버를 지원하지 않습니다. Gemini API 폴백을 사용하세요.".into(),
        ));
    }
    if is_server_running_on(port) {
        return Ok(format!("이미 포트 {port}에서 실행 중입니다."));
    }

    let server_dir = server_dir().ok_or_else(|| {
        LumError::Io("로컬 AI 서버가 설치되지 않았습니다 — 설치 버튼을 누르세요.".into())
    })?;
    let venv_dir = server_dir.join(".venv");
    let venv_python = venv_python(&venv_dir);

    if !venv_python.exists() {
        return Err(LumError::Io(
            "로컬 AI 서버가 설치되지 않았습니다 — 먼저 설치하세요.".into(),
        ));
    }

    if cfg!(target_arch = "aarch64") {
        let model = model
            .as_deref()
            .unwrap_or("mlx-community/Qwen2.5-Coder-7B-Instruct-4bit");
        let mlx_bin = venv_dir.join("bin").join("mlx_lm.server");

        // stderr → 로그 파일로 리다이렉트 (파이프는 tqdm \r로 블로킹되므로 파일)
        // stdout은 버림 (불필요)
        let log_path = server_dir.join("lum_mlx.log");
        let log_file = std::fs::File::create(&log_path)
            .map_err(|e| LumError::Io(format!("MLX 로그 파일 생성 실패: {e}")))?;

        if mlx_bin.exists() {
            tokio::process::Command::new(&mlx_bin)
                .args(["--model", model, "--port", &port.to_string()])
                .env("PATH", homebrew_path())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::from(log_file))
                .spawn()
                .map_err(|e| LumError::Io(format!("MLX-LM 시작 실패: {e}")))?;
        } else {
            tokio::process::Command::new(&venv_python)
                .args([
                    "-m",
                    "mlx_lm.server",
                    "--model",
                    model,
                    "--port",
                    &port.to_string(),
                ])
                .env("PATH", homebrew_path())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::from(log_file))
                .spawn()
                .map_err(|e| LumError::Io(format!("MLX-LM 시작 실패: {e}")))?;
        }

        // 백그라운드: /v1/models 폴링으로 서버 준비 감지 → 프론트 이벤트 emit
        let poll_url = format!("http://127.0.0.1:{}/v1/models", port);
        let log_path_for_poll = log_path.clone();
        tokio::spawn(async move {
            let client = reqwest::Client::new();
            let mut tick: u32 = 0;
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                tick += 1;

                let pct = (tick * 6).min(90);
                let _ = app.emit(
                    "mlx_download_progress",
                    serde_json::json!({ "percent": pct, "done": false }),
                );

                let ok = client
                    .get(&poll_url)
                    .timeout(std::time::Duration::from_secs(2))
                    .send()
                    .await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false);

                if ok {
                    let _ = app.emit(
                        "mlx_download_progress",
                        serde_json::json!({ "percent": 100, "done": true }),
                    );
                    return;
                }

                if tick > 60 {
                    // 3분 타임아웃 — 로그 스니펫 포함해 에러 이벤트
                    let log = std::fs::read_to_string(&log_path_for_poll).unwrap_or_default();
                    let snippet: String = log
                        .lines()
                        .rev()
                        .take(10)
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect::<Vec<_>>()
                        .join("\n");
                    let _ = app.emit("mlx_download_progress", serde_json::json!({
                        "percent": 0, "done": true, "error": format!("모델 로드 타임아웃 (3분)\n{}", snippet)
                    }));
                    return;
                }
            }
        });

        return Ok(format!("MLX-LM 서버 포트 {port} 시작됨"));
    }

    // NVIDIA/기타: TabbyAPI — start.py로 실행 (환경 설정 포함)
    // start_options.json 없으면 생성 (첫 실행 시 인터랙티브 프롬프트 방지)
    let opts_path = server_dir.join("start_options.json");
    if !opts_path.exists() {
        let mut nvcheck2 = std::process::Command::new("nvidia-smi");
        no_window_std(&mut nvcheck2);
        let has_nvidia = nvcheck2.output().map(|o| o.status.success()).unwrap_or(false);
        let gpu_lib = if has_nvidia { "cu12" } else { "" };
        let opts = serde_json::json!({ "gpu_lib": gpu_lib, "first_run_done": true });
        let _ = std::fs::write(&opts_path, opts.to_string());
    }

    // config.yml — 사용자 안전 모드 + VRAM 캡 + 동적 max_seq_len 반영
    {
        use crate::commands::config::load_config;
        use crate::commands::hardware::get_vram_gb;
        let cfg = load_config().unwrap_or_default();
        let utilization = cfg.vram_utilization();
        let total_vram = get_vram_gb();
        let cache_mode = cfg.cache_mode.as_deref().unwrap_or("Q8");
        let max_seq = cfg.max_seq_len;
        // model_dir: LUM config → 기존 config.yml → server_dir/models 절대경로 순으로 결정
        let model_dir = cfg
            .xllm_models_dir
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .or_else(|| read_model_dir_from_config(&server_dir))
            .unwrap_or_else(|| server_dir.join("models").to_string_lossy().into_owned());
        // Phase 84 — draft 모델 폴더 존재 검증. 폴더 없으면 SSD 비활성으로 안전하게 계속 진행
        // (사용자가 모델 다운로드 전에 이름만 입력한 경우 OOM 대신 명확한 안내).
        let draft_model = cfg
            .draft_model
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .filter(|name| {
                let exists = std::path::Path::new(&model_dir).join(name).is_dir();
                if !exists {
                    eprintln!("[lum] draft 모델 폴더 없음 → SSD 비활성: {model_dir}/{name}");
                }
                exists
            });
        if let Err(e) = write_tabby_config(
            &server_dir,
            port,
            utilization,
            total_vram,
            max_seq,
            cache_mode,
            &model_dir,
            draft_model,
        ) {
            eprintln!("[lum] config.yml 쓰기 경고: {e} — 기본 설정으로 진행");
        }
    }

    // stderr → 로그 파일 (에러 진단용)
    let log_path = server_dir.join("lum_tabby.log");
    let log_file = std::fs::File::create(&log_path)
        .map_err(|e| LumError::Io(format!("로그 파일 생성 실패: {e}")))?;

    // start.py: --nowheel(의존성 재설치 skip) --port N
    let script = if server_dir.join("start.py").exists() {
        "start.py"
    } else {
        "main.py"
    };
    let mut tabby_cmd = tokio::process::Command::new(&venv_python);
    tabby_cmd
        .args([script, "--nowheel", "--port", &port.to_string()])
        .current_dir(&server_dir)
        // Rich 라이브러리의 Windows 콘솔 API 사용 방지
        .env("NO_COLOR", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::from(log_file));
    no_window_tokio(&mut tabby_cmd);
    let mut child = tabby_cmd.spawn().map_err(|e| LumError::Io(format!("TabbyAPI 시작 실패: {e}")))?;

    // 3초 후 프로세스가 살아있는지 확인
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    if let Ok(Some(status)) = child.try_wait() {
        let log = std::fs::read_to_string(&log_path).unwrap_or_default();
        let snippet: String = log
            .lines()
            .rev()
            .take(8)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(LumError::AiEngine(format!(
            "TabbyAPI 시작 직후 종료 (exit={status})\n{snippet}"
        )));
    }

    // 서버 health 폴링 + coding_model 자동 로드 (백그라운드)
    let auto_load_app = app.clone();
    tokio::spawn(async move {
        use crate::commands::config::load_config;
        let cfg = match load_config() { Ok(c) => c, Err(_) => return };
        let Some(model_to_load) = cfg.coding_model.as_deref().filter(|s| !s.is_empty()).map(String::from) else {
            let _ = auto_load_app.emit("tabby_status", serde_json::json!({
                "stage": "ready",
                "message": "TabbyAPI 시작됨 — 모델을 ModelManager에서 [사용]하세요"
            }));
            return;
        };
        let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build() {
            Ok(c) => c, Err(_) => return,
        };
        let health_url = format!("http://127.0.0.1:{port}/v1/models");
        for _ in 0..20 {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            let mut req = client.get(&health_url);
            if let Some(k) = &cfg.xllm_api_key { req = req.header("x-api-key", k); }
            if req.send().await.map(|r| r.status().is_success()).unwrap_or(false) { break; }
        }
        let _ = auto_load_app.emit("tabby_status", serde_json::json!({
            "stage": "loading_model", "model": &model_to_load,
            "message": format!("모델 로드 중: {model_to_load}")
        }));
        let load_url = format!("http://127.0.0.1:{port}/v1/model/load");
        let body = serde_json::json!({
            "model_name": model_to_load,
            "cache_mode": cfg.cache_mode.as_deref().unwrap_or("Q8"),
            "max_seq_len": cfg.max_seq_len.unwrap_or(8192),
        });
        let mut req = client.post(&load_url)
            .timeout(std::time::Duration::from_secs(300))
            .json(&body);
        if let Some(k) = &cfg.xllm_api_key { req = req.header("x-api-key", k); }
        if let Some(k) = &cfg.xllm_admin_key { req = req.header("x-admin-key", k); }
        match req.send().await {
            Ok(resp) if resp.status().is_success() => {
                // SSE 끝까지 소비 (응답 닫혀야 다음 요청 가능)
                let _ = resp.text().await;
                let _ = auto_load_app.emit("tabby_status", serde_json::json!({
                    "stage": "ready", "model": &model_to_load,
                    "message": format!("모델 로드 완료: {model_to_load}")
                }));
            }
            Ok(resp) => {
                let s = resp.status();
                let body = resp.text().await.unwrap_or_default();
                let _ = auto_load_app.emit("tabby_status", serde_json::json!({
                    "stage": "error",
                    "message": format!("모델 로드 실패 HTTP {s}: {}", body.chars().take(200).collect::<String>())
                }));
            }
            Err(e) => {
                let _ = auto_load_app.emit("tabby_status", serde_json::json!({
                    "stage": "error",
                    "message": format!("모델 로드 요청 실패: {e}")
                }));
            }
        }
    });

    Ok(format!("TabbyAPI 포트 {port} 시작됨 — 모델 자동 로드 중 (lum_tabby.log)"))
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

/// 실행 중인 xLLM 서버 포트 자동 감지 (5000/5001/5002/8000/8080 순).
/// 감지 실패 시 None.
pub fn detect_running_port() -> Option<u16> {
    for port in [5000u16, 5001, 5002, 8000, 8080] {
        if is_server_running_on(port) {
            return Some(port);
        }
    }
    None
}

/// 모델을 교체하여 서버 재시작.
/// port=0 이면 자동 감지. stop 후 포트 해제 확인(최대 5초)까지 기다린 뒤 start.
#[command]
pub async fn restart_with_model(app: tauri::AppHandle, port: u16, model: String) -> Result<String> {
    // 1. 실제 대상 포트 결정 — port=0 이면 자동 감지
    let target_port = if port == 0 {
        detect_running_port().unwrap_or(5000)
    } else {
        port
    };

    // 2. 기존 서버 종료
    kill_on_port(target_port);

    // 3. 포트가 실제로 해제될 때까지 대기 (최대 5초, 200ms 간격)
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        if !is_port_in_use(target_port) {
            break;
        }
        if std::time::Instant::now() >= deadline {
            return Err(LumError::AiEngine(format!(
                "포트 {target_port} 해제 실패 — 다른 프로세스가 사용 중일 수 있습니다."
            )));
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    // 4. 새 모델로 서버 시작
    start_tabbyapi(app, target_port, Some(model)).await
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn write_tabby_config_쓰기_확인() {
        let tmp = std::env::temp_dir().join("lum_tabby_test");
        fs::create_dir_all(&tmp).unwrap();

        write_tabby_config(&tmp, 5000, 0.80, Some(24.0), Some(16384), "Q8", "/custom/models", None).unwrap();

        let yaml = fs::read_to_string(tmp.join("config.yml")).unwrap();
        assert!(yaml.contains("port: 5000"));
        assert!(yaml.contains("cache_mode: Q8"));
        assert!(yaml.contains("max_seq_len: 16384"));
        assert!(yaml.contains("model_dir: /custom/models"));
        // 24GB × 20% = 4.8GB → 4915 MB reserve (대략 4920 근방)
        assert!(
            yaml.contains("autosplit_reserve: [4915]")
                || yaml.contains("autosplit_reserve: [4916]")
        );
        // draft None일 때 draft_model 섹션 부재
        assert!(!yaml.contains("draft_model:"));

        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn read_model_dir_from_config_기존값_추출() {
        let tmp = std::env::temp_dir().join("lum_tabby_test_readdir");
        fs::create_dir_all(&tmp).unwrap();

        let yaml = "model:\n  model_dir: C:\\Users\\USER\\tabby\\models\n  cache_mode: Q8\n";
        fs::write(tmp.join("config.yml"), yaml).unwrap();
        let dir = read_model_dir_from_config(&tmp);
        assert_eq!(dir.as_deref(), Some("C:\\Users\\USER\\tabby\\models"));

        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn read_model_dir_from_config_없으면_none() {
        let tmp = std::env::temp_dir().join("lum_tabby_test_nodir");
        fs::create_dir_all(&tmp).unwrap();
        // config.yml 없음 → None
        assert!(read_model_dir_from_config(&tmp).is_none());
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn write_tabby_config_vram_cap_clamped() {
        let tmp = std::env::temp_dir().join("lum_tabby_test_clamp");
        fs::create_dir_all(&tmp).unwrap();

        // 0.30(50% 미만)은 0.50으로 clamp → reserve = 10GB × 50% = 5120MB
        write_tabby_config(&tmp, 5001, 0.30, Some(10.0), Some(8192), "Q4", "models", None).unwrap();
        let yaml = fs::read_to_string(tmp.join("config.yml")).unwrap();
        assert!(yaml.contains("autosplit_reserve: [5120]"));

        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn write_tabby_config_auto_max_seq_len() {
        let tmp = std::env::temp_dir().join("lum_tabby_test_auto");
        fs::create_dir_all(&tmp).unwrap();

        // 16GB × 80% = 12.8GB usable → seq_len = 12.8 × 4096 ≈ 52428 → clamp 32768
        write_tabby_config(&tmp, 5002, 0.80, Some(16.0), None, "Q8", "models", None).unwrap();
        let yaml = fs::read_to_string(tmp.join("config.yml")).unwrap();
        assert!(yaml.contains("max_seq_len: 32768"));

        fs::remove_dir_all(&tmp).ok();
    }

    // Phase 84 — draft_model이 Some이면 yaml에 draft_model 섹션이 추가되고
    // None/빈 문자열이면 섹션 부재.
    #[test]
    fn write_tabby_config_draft_model_section() {
        let tmp = std::env::temp_dir().join("lum_tabby_test_draft");
        fs::create_dir_all(&tmp).unwrap();

        write_tabby_config(
            &tmp, 5003, 0.80, Some(10.0), Some(4096), "Q8",
            "/x/models", Some("Qwen2.5-Coder-1.5B-exl2"),
        ).unwrap();
        let yaml = fs::read_to_string(tmp.join("config.yml")).unwrap();
        assert!(yaml.contains("draft_model:"));
        assert!(yaml.contains("draft_model_dir: /x/models"));
        assert!(yaml.contains("draft_model_name: Qwen2.5-Coder-1.5B-exl2"));
        assert!(yaml.contains("draft_cache_mode: FP16"));

        // 빈 문자열은 비활성과 동일
        write_tabby_config(
            &tmp, 5004, 0.80, Some(10.0), Some(4096), "Q8",
            "/x/models", Some("   "),
        ).unwrap();
        let yaml = fs::read_to_string(tmp.join("config.yml")).unwrap();
        assert!(!yaml.contains("draft_model:"));

        fs::remove_dir_all(&tmp).ok();
    }
}
