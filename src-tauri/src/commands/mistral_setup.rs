//! 모델 다운로드 + 로컬 스캔. Phase 85b 이후 mistralrs-server.exe spawn은 제거됨
//! (임베디드 mistralrs로 통합) — 이 파일은 *모델 자산 관리*만 담당.

use crate::commands::config::load_config;
use crate::commands::models::DownloadCancelMap;
use crate::error::{LumError, Result};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{command, AppHandle, Emitter};

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

/// HF에서 단일 파일을 스트리밍 다운로드. 5% 단위 진행률 emit, 취소 플래그 폴링.
/// 취소 시 부분 파일 삭제 후 Err 반환.
async fn hf_download_file(
    app: &AppHandle,
    repo_id: &str,
    filename: &str,
    dest: &std::path::Path,
    token: Option<&str>,
    cancel: &Arc<AtomicBool>,
) -> Result<()> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let url = format!("https://huggingface.co/{repo_id}/resolve/main/{filename}");
    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    if let Some(t) = token {
        if !t.is_empty() {
            req = req.bearer_auth(t);
        }
    }
    let resp = req.send().await.map_err(|e| LumError::AiEngine(e.to_string()))?;
    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(LumError::AiEngine(format!(
            "인증 오류 ({status}): HuggingFace 토큰을 설정하세요."
        )));
    }
    if !status.is_success() {
        return Err(LumError::AiEngine(format!(
            "다운로드 실패 HTTP {status}: {url}"
        )));
    }

    let total = resp.content_length();
    let mut downloaded: u64 = 0;
    let mut last_pct: u64 = 0;
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| LumError::Io(e.to_string()))?;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            drop(file);
            let _ = tokio::fs::remove_file(dest).await;
            return Err(LumError::AiEngine("⛔ 다운로드 취소됨".into()));
        }
        let chunk = chunk.map_err(|e| LumError::AiEngine(e.to_string()))?;
        downloaded += chunk.len() as u64;
        file.write_all(&chunk)
            .await
            .map_err(|e| LumError::Io(e.to_string()))?;
        if let Some(t) = total {
            let pct = downloaded * 100 / t;
            if pct >= last_pct + 5 {
                last_pct = pct;
                let dl_gb = downloaded as f64 / 1_073_741_824.0;
                let tot_gb = t as f64 / 1_073_741_824.0;
                let _ = app.emit(
                    "mistral_rs_log",
                    format!("📥 {filename}: {dl_gb:.2}/{tot_gb:.2} GB ({pct}%)"),
                );
            }
        }
    }
    file.flush().await.map_err(|e| LumError::Io(e.to_string()))?;
    Ok(())
}

/// HF API에서 repo 파일 목록 조회 — BF16 전체 다운로드 시 사용.
async fn hf_list_repo_files(repo_id: &str, token: Option<&str>) -> Result<Vec<String>> {
    let url = format!("https://huggingface.co/api/models/{repo_id}");
    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    if let Some(t) = token {
        if !t.is_empty() {
            req = req.bearer_auth(t);
        }
    }
    let resp = req.send().await.map_err(|e| LumError::AiEngine(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(LumError::AiEngine(format!(
            "HF API 오류 {}: {}",
            resp.status(),
            repo_id
        )));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;
    let files = json["siblings"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|s| s["rfilename"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    Ok(files)
}

/// 모델이 로컬에 없으면 받고, 있으면 즉시 경로 반환.
/// gguf_filename Some이면 해당 GGUF 파일 1개만 받고 그 존재만 검증.
async fn ensure_model_local(
    app: &AppHandle,
    repo_id_or_path: &str,
    gguf_filename: Option<&str>,
    cancel: &Arc<AtomicBool>,
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
    std::fs::create_dir_all(&local).map_err(|e| LumError::Io(e.to_string()))?;
    let cfg = load_config().unwrap_or_default();
    let token = cfg.hf_token.clone();
    let token_ref = token.as_deref();

    if let Some(filename) = gguf_filename {
        // GGUF 단일 파일 다운로드
        let dest = local.join(filename);
        hf_download_file(app, repo_id_or_path, filename, &dest, token_ref, cancel).await?;
    } else {
        // BF16 전체 repo: 파일 목록 조회 후 순차 다운로드
        let _ = app.emit("mistral_rs_log", "📋 파일 목록 조회 중...");
        let files = hf_list_repo_files(repo_id_or_path, token_ref).await?;
        let _ = app.emit("mistral_rs_log", format!("📋 파일 {}개 다운로드 시작", files.len()));
        for file in &files {
            let dest = local.join(file);
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| LumError::Io(e.to_string()))?;
            }
            hf_download_file(app, repo_id_or_path, file, &dest, token_ref, cancel).await?;
        }
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
    cancel_map: tauri::State<'_, DownloadCancelMap>,
) -> Result<String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut map = cancel_map.lock().unwrap();
        map.insert(repo_id.clone(), cancel_flag.clone());
    }
    let result = ensure_model_local(&app, &repo_id, gguf_filename.as_deref(), &cancel_flag).await;
    {
        let mut map = cancel_map.lock().unwrap();
        map.remove(&repo_id);
    }
    let path = result?;
    Ok(path.to_string_lossy().to_string())
}

/// 진행 중인 mistral 모델 다운로드를 취소. repo_id로 취소 플래그 설정.
#[command]
pub async fn cancel_mistral_download(
    repo_id: String,
    cancel_map: tauri::State<'_, DownloadCancelMap>,
) -> Result<()> {
    if let Ok(map) = cancel_map.lock() {
        if let Some(flag) = map.get(&repo_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

/// `~/.lum_mistral_models/<safe>` 폴더 통째 삭제. 경로 traversal 방지를 위해
/// `safe_name`이 단일 폴더명(슬래시·.. 미포함)인지 검증 후 그 *디렉터리 한정*으로 제거.
#[command]
pub async fn delete_mistral_model(safe_name: String) -> Result<()> {
    if safe_name.is_empty()
        || safe_name.contains('/')
        || safe_name.contains('\\')
        || safe_name.contains("..")
    {
        return Err(LumError::AiEngine(format!(
            "잘못된 모델 폴더명: {safe_name}"
        )));
    }
    let dir = crate::platform::home_dir()
        .join(".lum_mistral_models")
        .join(&safe_name);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| LumError::Io(e.to_string()))?;
    }
    Ok(())
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
