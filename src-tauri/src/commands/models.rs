use tauri::{command, AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;
use crate::error::{Result, LumError};
use crate::commands::config::load_config;
use crate::platform;
use std::path::PathBuf;

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

#[command]
pub async fn delete_model(model_id: String) -> Result<()> {
    let dir = models_dir()?.join(&model_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)?;
    }
    Ok(())
}

#[command]
pub async fn download_model(
    app: AppHandle,
    repo_id: String,
    revision: Option<String>,
    hf_token: Option<String>,
) -> Result<()> {
    let rev = revision.unwrap_or_else(|| "main".to_string());
    let client = reqwest::Client::new();

    // HuggingFace 저장소 구조를 유지하면서 폴더 이름 생성 (예: author--model-name)
    let folder_name = repo_id.replace('/', "--");
    let out_dir = models_dir()?.join(&folder_name);
    tokio::fs::create_dir_all(&out_dir)
        .await
        .map_err(|e| LumError::Io(e.to_string()))?;

    // HuggingFace API로 파일 목록 조회
    let api_url = format!(
        "https://huggingface.co/api/models/{}/tree/{}",
        repo_id, rev
    );
    let mut req = client.get(&api_url);
    if let Some(token) = &hf_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?;
    let files: Vec<HfFileEntry> = resp
        .json()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?;

    for file_entry in files.iter().filter(|f| f.file_type == "file") {
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

        let mut dl_req = client.get(&file_url);
        if let Some(token) = &hf_token {
            dl_req = dl_req.header("Authorization", format!("Bearer {}", token));
        }

        let response = dl_req
            .send()
            .await
            .map_err(|e| LumError::Network(e.to_string()))?;
        let total = response.content_length().unwrap_or(0);
        let out_path = out_dir.join(&file_name);

        let mut file = tokio::fs::File::create(&out_path)
            .await
            .map_err(|e| LumError::Io(e.to_string()))?;
        let mut downloaded = 0u64;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| LumError::Network(e.to_string()))?;
            downloaded += chunk.len() as u64;
            file.write_all(&chunk)
                .await
                .map_err(|e| LumError::Io(e.to_string()))?;

            // 256KB마다 이벤트 전송 (너무 자주 emit하면 UI 부담)
            if downloaded % (256 * 1024) < chunk.len() as u64 {
                let _ = app.emit(
                    "model_download_progress",
                    DownloadProgress {
                        repo_id: repo_id.clone(),
                        file: file_name.clone(),
                        downloaded,
                        total,
                        done: false,
                    },
                );
            }
        }

        // 파일 완료 이벤트
        let _ = app.emit(
            "model_download_progress",
            DownloadProgress {
                repo_id: repo_id.clone(),
                file: file_name.clone(),
                downloaded,
                total,
                done: false,
            },
        );
    }

    // 전체 완료 이벤트
    let _ = app.emit(
        "model_download_progress",
        DownloadProgress {
            repo_id: repo_id.clone(),
            file: String::new(),
            downloaded: 0,
            total: 0,
            done: true,
        },
    );

    Ok(())
}
