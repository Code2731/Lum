//! 모델 다운로드 + 로컬 스캔. Phase 85b 이후 mistralrs-server.exe spawn은 제거됨
//! (임베디드 mistralrs로 통합) — 이 파일은 *모델 자산 관리*만 담당.

use crate::commands::config::load_config;
use crate::error::{LumError, Result};
use serde::Serialize;
use tauri::{command, AppHandle, Emitter};

#[cfg(windows)]
fn no_window_tokio(cmd: &mut tokio::process::Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000);
}
#[cfg(not(windows))]
fn no_window_tokio(_cmd: &mut tokio::process::Command) {}

/// HF repo ID(`org/repo`)를 로컬 폴더명으로 변환 (`org--repo`)
fn safe_model_dirname(repo_id: &str) -> String {
    repo_id.replace('/', "--")
}

/// safe_name(`org--repo`)에서 repo_id(`org/repo`)로 역변환.
/// 첫 "--"만 "/"로 — 모델명 안의 -- 패턴은 보존.
fn repo_id_from_safe(safe: &str) -> String {
    match safe.find("--") {
        Some(idx) => format!("{}/{}", &safe[..idx], &safe[idx + 2..]),
        None => safe.to_string(),
    }
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
            let repo_id = repo_id_from_safe(&safe);
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
