use crate::commands::config::load_config;
use crate::error::{LumError, Result};
use crate::platform;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

pub type DownloadCancelMap = Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalModel {
    pub id: String,
    pub size_mb: f64,
    pub path: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DownloadProgress {
    pub repo_id: String,
    pub file: String,
    pub downloaded: u64,
    pub total: u64,
    pub done: bool,
    pub cancelled: bool,
}

#[derive(Debug, Deserialize)]
struct HfFileEntry {
    #[serde(rename = "type")]
    file_type: String,
    path: String,
}

fn models_dir() -> Result<PathBuf> {
    let config = load_config()?;
    let dir = if let Some(d) = config.xllm_models_dir {
        PathBuf::from(d)
    } else {
        platform::default_models_dir()
    };
    Ok(dir)
}

fn dir_size_mb(path: &PathBuf) -> f64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for e in entries.flatten() {
            if let Ok(m) = e.metadata() {
                if m.is_file() {
                    total += m.len();
                }
            }
        }
    }
    total as f64 / 1024.0 / 1024.0
}

#[command]
pub async fn list_local_models() -> Result<Vec<LocalModel>> {
    let dir = models_dir()?;
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut models = vec![];
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let id = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            models.push(LocalModel {
                id,
                size_mb: dir_size_mb(&path),
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    Ok(models)
}

#[derive(Debug, Deserialize)]
pub struct RepoQuery {
    pub repo_id: String,
    pub revision: String,
}

/// HF API HTTP 코드 → ModelManager에 표시할 status 라벨 매핑.
/// 인라인 match로 두면 401/403의 "gated" 의미 구분이 사라지기 쉬움 → 별도 함수로 회귀 가드.
fn classify_repo_http_code(code: u16) -> &'static str {
    match code {
        200 => "alive",
        401 | 403 => "gated", // gated 모델 — HF 토큰 입력하면 받을 수 있음
        404 => "dead",        // 리포지토리/revision 없음
        _ => "error",
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct RepoStatus {
    pub repo_id: String,
    pub revision: String,
    /// "alive" | "gated" | "dead" | "error"
    pub status: String,
    pub http_code: u16,
}

/// HF API에서 repo + revision 살아있는지 일괄 확인 — ModelManager 갱신 버튼용
/// 병렬 5개 배치로 호출, hf_token 있으면 헤더 첨부.
#[command]
pub async fn check_repo_status(repos: Vec<RepoQuery>) -> Result<Vec<RepoStatus>> {
    let token = load_config().ok().and_then(|c| c.hf_token);
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let token_arc = std::sync::Arc::new(token);
    let client_arc = std::sync::Arc::new(client);

    let results: Vec<RepoStatus> = futures_util::stream::iter(repos.into_iter())
        .map(|q| {
            let client = client_arc.clone();
            let token = token_arc.clone();
            async move {
                let url = format!(
                    "https://huggingface.co/api/models/{}/tree/{}",
                    q.repo_id, q.revision
                );
                let mut req = client.get(&url);
                if let Some(ref t) = *token {
                    req = req.header("Authorization", format!("Bearer {}", t));
                }
                let (status, code) = match req.send().await {
                    Ok(resp) => {
                        let code = resp.status().as_u16();
                        (classify_repo_http_code(code).to_string(), code)
                    }
                    Err(_) => ("error".to_string(), 0),
                };
                RepoStatus {
                    repo_id: q.repo_id,
                    revision: q.revision,
                    status,
                    http_code: code,
                }
            }
        })
        .buffer_unordered(5)
        .collect()
        .await;

    Ok(results)
}

#[command]
pub async fn delete_model(model_id: String) -> Result<()> {
    let dir = models_dir()?.join(&model_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)?;
    }
    Ok(())
}

#[command]
pub async fn cancel_download(
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

#[command]
pub async fn download_model(
    app: AppHandle,
    repo_id: String,
    revision: Option<String>,
    hf_token: Option<String>,
    cancel_map: tauri::State<'_, DownloadCancelMap>,
) -> Result<()> {
    let rev = revision.unwrap_or_else(|| "main".to_string());

    let token: Option<String> = hf_token.filter(|t| !t.is_empty()).or_else(|| {
        load_config()
            .ok()
            .and_then(|c| c.hf_token)
            .filter(|t| !t.is_empty())
    });

    // 취소 플래그 등록
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut map = cancel_map.lock().unwrap();
        map.insert(repo_id.clone(), cancel_flag.clone());
    }

    let emit_done = |cancelled: bool| {
        let _ = app.emit(
            "model_download_progress",
            DownloadProgress {
                repo_id: repo_id.clone(),
                file: String::new(),
                downloaded: 0,
                total: 0,
                done: true,
                cancelled,
            },
        );
    };

    let cleanup = |cancel_map: &tauri::State<'_, DownloadCancelMap>| {
        if let Ok(mut map) = cancel_map.lock() {
            map.remove(&repo_id);
        }
    };

    let api_client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;
    let dl_client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let folder_name = repo_id.replace('/', "--");
    let out_dir = models_dir()?.join(&folder_name);
    tokio::fs::create_dir_all(&out_dir)
        .await
        .map_err(|e| LumError::Io(e.to_string()))?;

    let api_url = format!("https://huggingface.co/api/models/{}/tree/{}", repo_id, rev);
    let mut req = api_client.get(&api_url);
    if let Some(ref t) = token {
        req = req.header("Authorization", format!("Bearer {}", t));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| LumError::Network(format!("HuggingFace 연결 실패: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let hint = match status.as_u16() {
            401 | 403 => " — 인증이 필요한 모델입니다. 위의 HuggingFace 토큰 입력란에 토큰을 입력한 후 다시 시도하세요.",
            404 => " — 리포지토리 또는 revision이 존재하지 않습니다.",
            429 => " — 요청 횟수 초과. 잠시 후 다시 시도하세요.",
            _ => "",
        };
        cleanup(&cancel_map);
        return Err(LumError::Network(format!(
            "HuggingFace API {} 오류{}",
            status, hint
        )));
    }

    let files: Vec<HfFileEntry> = resp
        .json()
        .await
        .map_err(|e| LumError::Network(format!("파일 목록 파싱 실패: {}", e)))?;

    let file_entries: Vec<&HfFileEntry> = files.iter().filter(|f| f.file_type == "file").collect();
    if file_entries.is_empty() {
        cleanup(&cancel_map);
        return Err(LumError::Network(format!(
            "'{}/{}' 브랜치에 파일이 없습니다. revision 이름을 확인하세요.",
            repo_id, rev
        )));
    }

    for file_entry in &file_entries {
        if cancel_flag.load(Ordering::Relaxed) {
            let _ = tokio::fs::remove_dir_all(&out_dir).await;
            cleanup(&cancel_map);
            emit_done(true);
            return Ok(());
        }

        let file_name = file_entry
            .path
            .split('/')
            .next_back()
            .unwrap_or(&file_entry.path)
            .to_string();
        let file_url = format!(
            "https://huggingface.co/{}/resolve/{}/{}",
            repo_id, rev, file_entry.path
        );

        let mut dl_req = dl_client.get(&file_url);
        if let Some(ref t) = token {
            dl_req = dl_req.header("Authorization", format!("Bearer {}", t));
        }

        let response = dl_req
            .send()
            .await
            .map_err(|e| LumError::Network(format!("파일 다운로드 실패 ({}): {}", file_name, e)))?;

        if !response.status().is_success() {
            cleanup(&cancel_map);
            return Err(LumError::Network(format!(
                "파일 다운로드 오류 {} ({})",
                response.status(),
                file_name
            )));
        }

        let total = response.content_length().unwrap_or(0);
        let out_path = out_dir.join(&file_name);

        let mut file = tokio::fs::File::create(&out_path)
            .await
            .map_err(|e| LumError::Io(e.to_string()))?;
        let mut downloaded = 0u64;
        let mut last_emit = 0u64;
        let mut stream = response.bytes_stream();
        let mut cancelled = false;

        while let Some(chunk) = stream.next().await {
            if cancel_flag.load(Ordering::Relaxed) {
                cancelled = true;
                break;
            }
            let chunk = chunk.map_err(|e| LumError::Network(e.to_string()))?;
            downloaded += chunk.len() as u64;
            file.write_all(&chunk)
                .await
                .map_err(|e| LumError::Io(e.to_string()))?;

            if downloaded - last_emit >= 512 * 1024 {
                last_emit = downloaded;
                let _ = app.emit(
                    "model_download_progress",
                    DownloadProgress {
                        repo_id: repo_id.clone(),
                        file: file_name.clone(),
                        downloaded,
                        total,
                        done: false,
                        cancelled: false,
                    },
                );
            }
        }

        if cancelled {
            drop(file);
            let _ = tokio::fs::remove_dir_all(&out_dir).await;
            cleanup(&cancel_map);
            emit_done(true);
            return Ok(());
        }

        let _ = app.emit(
            "model_download_progress",
            DownloadProgress {
                repo_id: repo_id.clone(),
                file: file_name.clone(),
                downloaded,
                total,
                done: false,
                cancelled: false,
            },
        );
    }

    cleanup(&cancel_map);
    emit_done(false);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_repo_http_code_alive_200() {
        assert_eq!(classify_repo_http_code(200), "alive");
    }

    #[test]
    fn classify_repo_http_code_gated_401_and_403() {
        // 401/403은 둘 다 gated — HF 토큰 입력하면 받을 수 있는 상태.
        // 만약 둘 중 하나만 분기되면 사용자에게 잘못된 안내 (사라짐 vs 게이트).
        assert_eq!(classify_repo_http_code(401), "gated");
        assert_eq!(classify_repo_http_code(403), "gated");
    }

    #[test]
    fn classify_repo_http_code_dead_404() {
        // 오늘 EXAONE bartowski 라인 6개가 모두 401이 아닌 404였으면 sin gated 안내됐을 것.
        // bartowski는 401(gated)이라 토큰 안내했고, 진짜 404는 가짜 ID 케이스 (사라짐).
        assert_eq!(classify_repo_http_code(404), "dead");
    }

    #[test]
    fn classify_repo_http_code_other_falls_back_to_error() {
        // 5xx, 429 (rate limit), 그 외 모두 "error" — 사용자에게 재시도 권장
        assert_eq!(classify_repo_http_code(500), "error");
        assert_eq!(classify_repo_http_code(503), "error");
        assert_eq!(classify_repo_http_code(429), "error");
        assert_eq!(classify_repo_http_code(0), "error");
    }
}
