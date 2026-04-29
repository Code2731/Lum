//! Phase 105 — 파일/폴더 피커 커맨드 (tauri-plugin-dialog 기반).
//! GGUF 파일 직접 선택 + 모델 저장 경로 선택.

use tauri_plugin_dialog::{DialogExt, FilePath};

/// `.gguf` 파일 선택 다이얼로그. 선택 시 절대 경로 반환, 취소 시 None.
#[tauri::command]
pub async fn pick_gguf_file(app: tauri::AppHandle) -> Option<String> {
    let path = app
        .dialog()
        .file()
        .add_filter("GGUF 모델", &["gguf"])
        .blocking_pick_file();
    path.and_then(|p| match p {
        FilePath::Path(pb) => Some(pb.to_string_lossy().into_owned()),
        _ => None,
    })
}

/// 모델 저장 폴더 선택 다이얼로그. 선택 시 절대 경로 반환, 취소 시 None.
#[tauri::command]
pub async fn pick_model_dir(app: tauri::AppHandle) -> Option<String> {
    let path = app.dialog().file().blocking_pick_folder();
    path.and_then(|p| match p {
        FilePath::Path(pb) => Some(pb.to_string_lossy().into_owned()),
        _ => None,
    })
}
