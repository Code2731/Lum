//! Phase 85b — embedded mistralrs Tauri command facade.
//!
//! `embedded-ai` feature 활성화 여부에 무관하게 *동일한 invoke 인터페이스*를 제공.
//! 활성 시 `mistralrs_inline` 진짜 구현 호출, 비활성 시 stub 에러 반환.
//! lib.rs의 invoke_handler가 cfg 분기 없이 항상 같은 entry로 등록 가능.

use serde::Serialize;

#[derive(Serialize)]
pub struct EmbedCandidate {
    /// 절대 경로 (load 시 model_dir로 사용)
    pub folder: String,
    /// 폴더 이름만 (UI 표시용)
    pub folder_label: String,
    /// 그 폴더 안의 .gguf 파일 목록 (정렬됨)
    pub gguf_files: Vec<String>,
}

/// `~/.lum_mistral_models/` 안의 모델 폴더 + GGUF 파일 후보 목록 반환.
/// embedded-ai feature 무관하게 항상 동작 — 후보 스캔은 cfg 가드 없음.
#[tauri::command]
pub fn list_embed_candidates() -> Vec<EmbedCandidate> {
    let Some(home) = dirs::home_dir() else { return vec![]; };
    let root = home.join(".lum_mistral_models");
    let Ok(entries) = std::fs::read_dir(&root) else { return vec![]; };

    let mut out = Vec::<EmbedCandidate>::new();
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if !ft.is_dir() { continue }
        let folder = entry.path();
        let label = entry.file_name().to_string_lossy().into_owned();

        let mut ggufs: Vec<String> = std::fs::read_dir(&folder)
            .ok()
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                if p.is_file() && p.extension().is_some_and(|x| x.eq_ignore_ascii_case("gguf")) {
                    p.file_name().map(|n| n.to_string_lossy().into_owned())
                } else { None }
            })
            .collect();
        ggufs.sort();

        if !ggufs.is_empty() {
            out.push(EmbedCandidate {
                folder: folder.to_string_lossy().into_owned(),
                folder_label: label,
                gguf_files: ggufs,
            });
        }
    }
    out.sort_by(|a, b| a.folder_label.cmp(&b.folder_label));
    out
}

const DISABLED_MSG: &str =
    "embedded-ai feature 비활성 — scripts/cargo-check-cuda.bat 또는 npm run tauri:dev:cuda";

/// GGUF 모델 로드. 이미 같은 파일이면 스킵, 다른 모델이면 VRAM 해제 후 핫스왑.
#[tauri::command]
pub async fn embed_load_gguf(
    app: tauri::AppHandle,
    model_dir: String,
    gguf_file: String,
) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::load_model(&app, &model_dir, &gguf_file).await
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = (app, model_dir, gguf_file);
        Err(DISABLED_MSG.to_string())
    }
}

/// 로드된 모델을 Drop해 VRAM을 해제. 헤더/툴바 즉시 갱신용 이벤트도 emit.
#[tauri::command]
pub async fn embed_unload(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(feature = "embedded-ai")]
    {
        use tauri::Emitter;
        crate::commands::mistralrs_inline::unload_model().await;
        let _ = app.emit("embed_load_progress", "🗑 모델 언로드");
        Ok(())
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = app;
        Err(DISABLED_MSG.to_string())
    }
}

/// 모델 로드 여부 (UI 상태 표시용).
#[tauri::command]
pub fn embed_status() -> bool {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::loaded_key().is_some()
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        false
    }
}

/// 현재 로드된 모델 키 반환 — UI에서 로드된 모델 이름 표시용.
#[tauri::command]
pub fn embed_loaded_info() -> Option<String> {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::loaded_key()
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        None
    }
}

/// 단일 추론 호출 (블로킹 — 풀 응답 받아서 반환).
#[tauri::command]
pub async fn embed_infer(prompt: String) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::infer_once(&prompt).await
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = prompt;
        Err(DISABLED_MSG.to_string())
    }
}

/// 토큰별 스트리밍 추론 — `embed_token` 이벤트로 토큰 emit, 풀 응답을 반환값으로.
/// XllmPanel 디버그 패널 전용 (main AI 흐름의 `xllm_token`과 cross-talk 방지).
/// `cancel_ai_stream`을 호출하면 추론 중단.
#[tauri::command]
pub async fn embed_infer_stream(
    app: tauri::AppHandle,
    prompt: String,
    cancel_flag: tauri::State<'_, crate::commands::ai::AiStreamCancel>,
) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        use std::sync::atomic::Ordering;
        cancel_flag.store(false, Ordering::Relaxed);
        crate::commands::mistralrs_inline::infer_stream(
            &app,
            &prompt,
            &cancel_flag,
            true,
            "embed_token",
        )
        .await
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = (app, prompt, cancel_flag);
        Err(DISABLED_MSG.to_string())
    }
}
