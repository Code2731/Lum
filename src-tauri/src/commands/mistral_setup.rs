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
const MISTRAL_RS_MAX_SEQ_LEN: u32 = 4096;
const VALID_ISQ: &[&str] = &["Q4K", "Q5K", "Q6K", "Q8_0"];

static MISTRAL_PROCESS: Mutex<Option<std::process::Child>> = Mutex::new(None);

/// HF repo ID(`org/repo`)를 로컬 폴더명으로 변환 (`org--repo`)
fn safe_model_dirname(repo_id: &str) -> String {
    repo_id.replace('/', "--")
}

/// 모델 로컬 캐시 경로 — `<home>/.lum_mistral_models/<safe>`
fn model_local_path(repo_id: &str) -> std::path::PathBuf {
    crate::platform::home_dir()
        .join(".lum_mistral_models")
        .join(safe_model_dirname(repo_id))
}

/// BF16 모델 필수 파일 모두 있으면 true — config.json + tokenizer.json + safetensors(단일 또는 shard)
fn model_present(path: &std::path::Path) -> bool {
    if !path.join("config.json").exists() || !path.join("tokenizer.json").exists() {
        return false;
    }
    if path.join("model.safetensors").exists() {
        return true;
    }
    if let Ok(rd) = std::fs::read_dir(path) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with("model-") && n.ends_with(".safetensors") {
                return true;
            }
        }
    }
    false
}

/// GGUF 단일 파일이 폴더에 있는지 확인
fn gguf_file_present(path: &std::path::Path, filename: &str) -> bool {
    path.join(filename).exists()
}

/// 폴더가 BF16 모델 또는 GGUF 모델 어느 쪽이든 valid한지 — list 표시용
fn any_model_present(path: &std::path::Path) -> bool {
    if model_present(path) {
        return true;
    }
    if let Ok(rd) = std::fs::read_dir(path) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.ends_with(".gguf") {
                return true;
            }
        }
    }
    false
}

/// huggingface CLI(`hf`) 위치 탐색 — TabbyAPI venv 우선, 없으면 PATH
fn find_hf_cli() -> Option<std::path::PathBuf> {
    let home = crate::platform::home_dir();
    #[cfg(windows)]
    let venv = home
        .join("tabbyAPI")
        .join(".venv")
        .join("Scripts")
        .join("hf.exe");
    #[cfg(not(windows))]
    let venv = home.join("tabbyAPI").join(".venv").join("bin").join("hf");
    if venv.exists() {
        return Some(venv);
    }
    let bin_name = if cfg!(windows) { "hf.exe" } else { "hf" };
    if let Ok(path_var) = std::env::var("PATH") {
        let sep = if cfg!(windows) { ';' } else { ':' };
        for p in path_var.split(sep) {
            let f = std::path::Path::new(p).join(bin_name);
            if f.exists() {
                return Some(f);
            }
        }
    }
    None
}

/// `hf download <repo> [filename] --local-dir <path>` 를 실행하며 stdout/stderr를 mistral_rs_log로 라인 스트리밍.
/// gguf_filename Some이면 해당 파일 한 개만, None이면 전체 repo 다운로드.
async fn run_hf_download_streaming(
    app: &AppHandle,
    hf_cli: &std::path::Path,
    repo_id: &str,
    local_dir: &std::path::Path,
    hf_token: Option<&str>,
    gguf_filename: Option<&str>,
) -> Result<bool> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut cmd = tokio::process::Command::new(hf_cli);
    if let Some(filename) = gguf_filename {
        // hf download <repo> <filename> --local-dir <dir> — 단일 파일만
        cmd.args(["download", repo_id, filename, "--local-dir"])
            .arg(local_dir);
    } else {
        cmd.args(["download", repo_id, "--local-dir"])
            .arg(local_dir);
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(t) = hf_token {
        if !t.is_empty() {
            cmd.env("HF_TOKEN", t);
        }
    }
    no_window_tokio(&mut cmd);
    let mut child = cmd
        .spawn()
        .map_err(|e| LumError::Io(format!("hf 실행 실패: {e}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_out = app.clone();
    let app_err = app.clone();
    let so = tokio::spawn(async move {
        if let Some(s) = stdout {
            let mut lines = BufReader::new(s).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_out.emit("mistral_rs_log", line);
            }
        }
    });
    let se = tokio::spawn(async move {
        if let Some(s) = stderr {
            let mut lines = BufReader::new(s).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_err.emit("mistral_rs_log", line);
            }
        }
    });

    let status = child.wait().await.map_err(|e| LumError::Io(e.to_string()))?;
    let _ = so.await;
    let _ = se.await;
    Ok(status.success())
}

/// 모델이 로컬에 없으면 받고, 있으면 즉시 경로 반환.
/// gguf_filename Some이면 해당 GGUF 파일 1개만 받고 그 존재만 검증.
async fn ensure_model_local(
    app: &AppHandle,
    repo_id_or_path: &str,
    gguf_filename: Option<&str>,
) -> Result<std::path::PathBuf> {
    // ModelManager 설치됨 탭의 [🚀 Heavy 지정]은 m.path(절대 경로)를 mistral_rs_model에 저장.
    // 이미 받아둔 로컬 모델이므로 hf 다운로드를 거치면 안 됨 — 경로 그대로 반환.
    let p = std::path::Path::new(repo_id_or_path);
    if p.is_absolute() {
        if !p.exists() {
            return Err(LumError::AiEngine(format!(
                "지정된 모델 경로가 존재하지 않습니다: {}",
                repo_id_or_path
            )));
        }
        let _ = app.emit(
            "mistral_rs_log",
            format!("✅ 로컬 경로 사용 (다운로드 스킵): {}", p.display()),
        );
        return Ok(p.to_path_buf());
    }

    let local = model_local_path(repo_id_or_path);
    let cached = match gguf_filename {
        Some(f) => gguf_file_present(&local, f),
        None => model_present(&local),
    };
    if cached {
        let _ = app.emit(
            "mistral_rs_log",
            format!("✅ 모델 캐시 사용: {}", local.display()),
        );
        return Ok(local);
    }
    let kind_label = match gguf_filename {
        Some(f) => format!("GGUF {f}"),
        None => "BF16 전체".into(),
    };
    let _ = app.emit(
        "mistral_rs_log",
        format!(
            "📥 모델 다운로드 시작 ({kind_label}): {repo_id_or_path} → {}",
            local.display()
        ),
    );
    let hf_cli = find_hf_cli().ok_or_else(|| {
        LumError::AiEngine(
            "huggingface CLI(hf) 미설치. TabbyAPI 설치 또는 'pip install huggingface_hub' 후 재시도하세요.".into(),
        )
    })?;
    std::fs::create_dir_all(&local).map_err(|e| LumError::Io(e.to_string()))?;
    let cfg = load_config().unwrap_or_default();
    let token = cfg.hf_token.as_deref();
    let ok = run_hf_download_streaming(app, &hf_cli, repo_id_or_path, &local, token, gguf_filename)
        .await?;
    if !ok {
        return Err(LumError::AiEngine(format!(
            "모델 다운로드 실패: {repo_id_or_path}. 위 로그를 확인하세요."
        )));
    }
    let ok2 = match gguf_filename {
        Some(f) => gguf_file_present(&local, f),
        None => model_present(&local),
    };
    if !ok2 {
        return Err(LumError::AiEngine(format!(
            "다운로드 완료됐지만 필수 파일 누락 ({kind_label})"
        )));
    }
    let _ = app.emit("mistral_rs_log", "✅ 모델 다운로드 완료");
    Ok(local)
}

/// ISQ 값 검증 — 알려진 값이 아니면 Q4K로 폴백
fn validate_isq(isq: &str) -> &str {
    if VALID_ISQ.contains(&isq) {
        isq
    } else {
        "Q4K"
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MistralRsStatus {
    pub running: bool,
    pub url: String,
    pub model: Option<String>,
}

/// HF repo를 mistral.rs용 로컬 폴더(`~/.lum_mistral_models/<safe>`)에 다운로드.
/// gguf_filename Some이면 해당 단일 GGUF 파일만 받고, None이면 BF16 전체 다운로드.
/// 이미 받혀있으면 즉시 경로 반환 (skip). 진행 로그는 `mistral_rs_log` 이벤트로 emit.
#[command]
pub async fn download_mistral_model(
    app: AppHandle,
    repo_id: String,
    gguf_filename: Option<String>,
) -> Result<String> {
    let path = ensure_model_local(&app, &repo_id, gguf_filename.as_deref()).await?;
    Ok(path.to_string_lossy().to_string())
}

/// 사용자가 mistral.rs용으로 받은 모델 목록 — `~/.lum_mistral_models/<safe>` 폴더 스캔.
/// safe_name → repo_id 역변환 ("Qwen--Qwen3-8B" → "Qwen/Qwen3-8B").
#[command]
pub async fn list_mistral_models() -> Result<Vec<MistralLocalModel>> {
    let dir = crate::platform::home_dir().join(".lum_mistral_models");
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if !p.is_dir() {
                continue;
            }
            if !any_model_present(&p) {
                continue;
            }
            let safe = p
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            // safe_name 역변환: 첫 "--"만 "/"로. 그 뒤는 그대로 (모델명 안의 - 보존).
            let repo_id = match safe.find("--") {
                Some(idx) => format!("{}/{}", &safe[..idx], &safe[idx + 2..]),
                None => safe.clone(),
            };
            let size_bytes: u64 = std::fs::read_dir(&p)
                .map(|rd2| {
                    rd2.flatten()
                        .filter_map(|e2| e2.metadata().ok().map(|m| m.len()))
                        .sum()
                })
                .unwrap_or(0);
            out.push(MistralLocalModel {
                repo_id,
                path: p.to_string_lossy().to_string(),
                size_mb: size_bytes as f64 / 1024.0 / 1024.0,
            });
        }
    }
    Ok(out)
}

#[derive(Debug, Serialize, Clone)]
pub struct MistralLocalModel {
    pub repo_id: String,
    pub path: String,
    pub size_mb: f64,
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
    let repo_id = config.mistral_rs_model.clone().ok_or_else(|| {
        LumError::AiEngine(
            "Heavy 모델이 지정되지 않았습니다. ModelManager에서 [🚀 Heavy 지정]을 먼저 누르세요."
                .into(),
        )
    })?;
    let isq = config.mistral_rs_isq.as_deref().unwrap_or("Q4K");
    let isq = validate_isq(isq).to_string();
    let max_seq_len = MISTRAL_RS_MAX_SEQ_LEN.to_string();
    let gguf_filename = config.mistral_rs_gguf_file.clone();

    // 1. 로컬 캐시 보장 — 없으면 hf로 다운로드 (panic 우회: hf-hub 0.4.3 Windows 심링크 버그)
    let local_path = ensure_model_local(&app, &repo_id, gguf_filename.as_deref()).await?;
    let local_path_str = local_path.to_string_lossy().to_string();

    let port_str = MISTRAL_RS_PORT.to_string();
    let _ = app.emit(
        "mistral_rs_log",
        match &gguf_filename {
            Some(f) => format!(
                "mistral.rs 시작 (GGUF): {} / {} (포트 {}, max_seq_len {})",
                repo_id, f, port_str, max_seq_len
            ),
            None => format!(
                "mistral.rs 시작 (BF16): {} (포트 {}, ISQ {}, max_seq_len {})",
                repo_id, port_str, isq, max_seq_len
            ),
        },
    );

    let log_path = dirs::home_dir()
        .unwrap_or_default()
        .join("lum_mistral.log");
    let log_file = std::fs::File::create(&log_path).map_err(|e| LumError::Io(e.to_string()))?;
    let log_file2 = log_file.try_clone().map_err(|e| LumError::Io(e.to_string()))?;

    let mut mistral_cmd = std::process::Command::new("mistralrs-server");
    // v0.8 CLI: --port는 글로벌, GGUF/Plain은 서브커맨드별 옵션 분기
    if let Some(filename) = &gguf_filename {
        // GGUF: --quantized-model-id <local_path> --quantized-filename <file>
        mistral_cmd.args([
            "--port",
            &port_str,
            "gguf",
            "--quantized-model-id",
            &local_path_str,
            "--quantized-filename",
            filename,
            "--max-seq-len",
            &max_seq_len,
        ]);
    } else {
        // BF16 + ISQ
        mistral_cmd.args([
            "--port",
            &port_str,
            "--isq",
            &isq,
            "plain",
            "--model-id",
            &local_path_str,
            "--max-seq-len",
            &max_seq_len,
        ]);
    }
    mistral_cmd.stdout(log_file).stderr(log_file2);

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

/// 현재 상태 조회 — HTTP healthcheck (이전 세션이나 외부에서 띄운 mistralrs-server도 정확히 감지).
/// in-process Mutex 기반 try_wait()는 LUM이 직접 spawn한 자식만 보므로 부정확했음.
#[command]
pub async fn check_mistral_rs_status() -> MistralRsStatus {
    let config = load_config().unwrap_or_default();
    let url = config.mistral_rs_url();
    let health_url = format!("{}/v1/models", url);
    let running = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        Ok(c) => c
            .get(&health_url)
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false),
        Err(_) => false,
    };
    MistralRsStatus {
        running,
        url,
        model: config.mistral_rs_model,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_dirname_replaces_slash() {
        assert_eq!(safe_model_dirname("Qwen/Qwen3-8B"), "Qwen--Qwen3-8B");
        assert_eq!(safe_model_dirname("a/b/c"), "a--b--c");
        assert_eq!(safe_model_dirname("local-name"), "local-name");
    }

    #[test]
    fn validate_isq_accepts_known() {
        assert_eq!(validate_isq("Q4K"), "Q4K");
        assert_eq!(validate_isq("Q5K"), "Q5K");
        assert_eq!(validate_isq("Q6K"), "Q6K");
        assert_eq!(validate_isq("Q8_0"), "Q8_0");
    }

    #[test]
    fn validate_isq_falls_back_to_q4k() {
        assert_eq!(validate_isq("INVALID"), "Q4K");
        assert_eq!(validate_isq(""), "Q4K");
        assert_eq!(validate_isq("FP16"), "Q4K");
    }

    #[test]
    fn model_present_requires_config_and_tokenizer() {
        let dir = std::env::temp_dir().join(format!("lum_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(!model_present(&dir), "빈 폴더는 false");
        std::fs::write(dir.join("config.json"), "{}").unwrap();
        assert!(!model_present(&dir), "tokenizer 없으면 false");
        std::fs::write(dir.join("tokenizer.json"), "{}").unwrap();
        assert!(!model_present(&dir), "safetensors 없으면 false");
        std::fs::write(dir.join("model.safetensors"), b"").unwrap();
        assert!(model_present(&dir), "모두 있으면 true");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn model_present_accepts_sharded_safetensors() {
        let dir = std::env::temp_dir().join(format!("lum_test_shard_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("config.json"), "{}").unwrap();
        std::fs::write(dir.join("tokenizer.json"), "{}").unwrap();
        std::fs::write(dir.join("model-00001-of-00005.safetensors"), b"").unwrap();
        assert!(model_present(&dir), "shard 1개라도 있으면 true");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
