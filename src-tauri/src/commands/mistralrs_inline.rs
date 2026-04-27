//! Phase 85b — mistralrs를 LUM 프로세스 안에 직접 임베딩.
//!
//! `embedded-ai` feature 활성화 시만 컴파일됨 (CUDA toolchain + MSVC 필요).
//! 별도 mistralrs-server.exe spawn 제거 → 좀비 프로세스 0 + 통신 오버헤드 0.
//! GGUF / BF16 모델을 직접 로드해 단일 추론 또는 streaming 응답 반환.
#![cfg(feature = "embedded-ai")]

use mistralrs::{GgufModelBuilder, Model, TextMessageRole, TextMessages};
use std::sync::Arc;
use tokio::sync::OnceCell;

/// LUM 프로세스에 한 번 로드된 임베디드 추론 엔진.
/// 모델 로드 비용(VRAM 할당 + 가중치 디코딩)이 크므로 OnceCell로 단 1회 로드.
static ENGINE: OnceCell<Arc<Model>> = OnceCell::const_new();

/// GGUF 모델을 로드하고 전역 ENGINE에 보관. 이미 로드돼있으면 즉시 반환.
/// `model_dir`: GGUF 파일이 들어있는 폴더 절대 경로 (예: ~/.lum_mistral_models/<safe>)
/// `gguf_filename`: 폴더 안의 .gguf 파일 이름 (예: "Qwen3-Coder-30B-A3B-Q4_K_M.gguf")
pub async fn ensure_loaded(
    model_dir: &str,
    gguf_filename: &str,
) -> Result<Arc<Model>, String> {
    if let Some(m) = ENGINE.get() {
        return Ok(m.clone());
    }
    let model = GgufModelBuilder::new(model_dir.to_string(), vec![gguf_filename.to_string()])
        .build()
        .await
        .map_err(|e| format!("mistralrs GGUF 로드 실패: {e}"))?;
    let arc = Arc::new(model);
    let _ = ENGINE.set(arc.clone());
    Ok(arc)
}

/// 현재 로드된 엔진 반환. 미로드 상태면 None.
pub fn current_engine() -> Option<Arc<Model>> {
    ENGINE.get().cloned()
}

/// 단일 user 메시지로 chat completion 요청 → 응답 텍스트 반환.
/// 스트리밍 없는 단순 동기 추론용. ai.rs의 streaming path는 별도.
pub async fn infer_once(prompt: &str) -> Result<String, String> {
    let model = current_engine()
        .ok_or_else(|| "엔진 미로드 — 먼저 ensure_loaded 호출 필요".to_string())?;
    let messages = TextMessages::new().add_message(TextMessageRole::User, prompt);
    let resp = model
        .send_chat_request(messages)
        .await
        .map_err(|e| format!("추론 실패: {e}"))?;
    let text = resp
        .choices
        .first()
        .and_then(|c| c.message.content.clone())
        .unwrap_or_default();
    Ok(text)
}
