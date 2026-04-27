//! Phase 85b — embedded mistralrs Tauri command facade.
//!
//! `embedded-ai` feature 활성화 여부에 무관하게 *동일한 invoke 인터페이스*를 제공.
//! 활성 시 `mistralrs_inline` 진짜 구현 호출, 비활성 시 stub 에러 반환.
//! lib.rs의 invoke_handler가 cfg 분기 없이 항상 같은 entry로 등록 가능.

const DISABLED_MSG: &str =
    "embedded-ai feature 비활성 — scripts/cargo-check-cuda.bat 또는 npm run tauri:dev:cuda";

/// 프론트엔드에서 GGUF 모델 로드 트리거. 첫 호출은 수십 초~분 (VRAM 할당 + 디코딩).
#[tauri::command]
pub async fn embed_load_gguf(
    model_dir: String,
    gguf_file: String,
) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::ensure_loaded(&model_dir, &gguf_file).await?;
        Ok(format!("loaded: {model_dir}/{gguf_file}"))
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = (model_dir, gguf_file);
        Err(DISABLED_MSG.to_string())
    }
}

/// 모델이 메모리에 로드돼있는지 빠르게 확인 (UI 상태 표시용).
#[tauri::command]
pub fn embed_status() -> bool {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::current_engine().is_some()
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        false
    }
}

/// 단일 추론 호출. mistralrs-server.exe HTTP 우회.
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
