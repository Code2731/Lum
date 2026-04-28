//! Phase 85b — mistralrs를 LUM 프로세스 안에 직접 임베딩.
//! Phase 88 — OnceCell → Mutex<Option<LoadedState>> 교체로 모델 핫스왑 지원.
//!
//! `embedded-ai` feature 활성화 시만 컴파일됨 (CUDA toolchain + MSVC 필요).
#![cfg(feature = "embedded-ai")]

use mistralrs::{GgufModelBuilder, Model, ResponseOk, TextMessageRole, TextMessages};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

struct LoadedState {
    model: Arc<Model>,
    /// `"<model_dir>/<gguf_filename>"` — 동일 모델 재로드 스킵 판단용
    key: String,
}

static ENGINE: OnceLock<Mutex<Option<LoadedState>>> = OnceLock::new();

fn engine_mutex() -> &'static Mutex<Option<LoadedState>> {
    ENGINE.get_or_init(|| Mutex::new(None))
}

/// GGUF 모델을 로드. 이미 같은 모델이 올라와 있으면 스킵.
/// 다른 모델이 로드돼있으면 VRAM을 해제한 뒤 새 모델 로드 (핫스왑).
/// 로드 진행 상황을 `embed_load_progress` 이벤트로 emit (UI 진행 표시용).
pub async fn load_model(app: &AppHandle, model_dir: &str, gguf_filename: &str) -> Result<String, String> {
    let key = format!("{model_dir}/{gguf_filename}");
    let mut guard = engine_mutex().lock().await;
    if guard.as_ref().is_some_and(|s| s.key == key) {
        return Ok(format!("이미 로드됨: {gguf_filename}"));
    }
    *guard = None;
    let _ = app.emit("embed_load_progress", format!("🔄 {gguf_filename} GGUF 파싱 + 레이어 로드 중..."));
    let model = GgufModelBuilder::new(model_dir.to_string(), vec![gguf_filename.to_string()])
        .build()
        .await
        .map_err(|e| {
            let _ = app.emit("embed_load_progress", format!("❌ 로드 실패: {e}"));
            format!("mistralrs GGUF 로드 실패: {e}")
        })?;
    *guard = Some(LoadedState { model: Arc::new(model), key: key.clone() });
    let _ = app.emit("embed_load_progress", format!("✅ {gguf_filename} 로드 완료"));
    Ok(format!("로드 완료: {gguf_filename}"))
}

/// 로드된 모델을 Drop해 VRAM을 해제.
pub async fn unload_model() {
    *engine_mutex().lock().await = None;
}

/// 현재 로드된 모델 키 반환 (`"<dir>/<file>"`). 미로드면 None.
/// try_lock 실패(로딩 중) 시에도 None 반환 — UI 폴링용.
pub fn loaded_key() -> Option<String> {
    engine_mutex()
        .try_lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.key.clone()))
}

/// 현재 로드된 모델의 Arc 클론. 락은 함수 종료 시 즉시 해제 — 긴 추론 중
/// `loaded_key()` UI 폴링 차단 방지. 미로드면 명확한 한국어 에러.
async fn current_model() -> Result<Arc<Model>, String> {
    engine_mutex()
        .lock()
        .await
        .as_ref()
        .map(|s| s.model.clone())
        .ok_or_else(|| "엔진 미로드 — 먼저 로드 필요".to_string())
}

/// 단일 user 메시지로 chat completion 요청 → 응답 텍스트 반환.
pub async fn infer_once(prompt: &str) -> Result<String, String> {
    let model = current_model().await?;
    let messages = TextMessages::new().add_message(TextMessageRole::User, prompt);
    let resp = model
        .send_chat_request(messages)
        .await
        .map_err(|e| format!("추론 실패: {e}"))?;
    Ok(resp
        .choices
        .first()
        .and_then(|c| c.message.content.clone())
        .unwrap_or_default())
}

/// 토큰별 스트리밍 추론. delta.content와 delta.reasoning_content를 즉시 emit.
/// `event_name`으로 구분 — main AI 흐름은 "xllm_token" (HTTP path와 통일),
/// 디버그 패널은 "embed_token" 등 별도 이벤트 사용해 cross-talk 방지.
/// `cancel`이 true가 되면 stream을 drop해 추론 중단.
pub async fn infer_stream(
    app: &AppHandle,
    prompt: &str,
    cancel: &Arc<AtomicBool>,
    show_reasoning: bool,
    event_name: &str,
) -> Result<String, String> {
    let model = current_model().await?;
    let messages = TextMessages::new().add_message(TextMessageRole::User, prompt);
    let mut stream = model
        .stream_chat_request(messages)
        .await
        .map_err(|e| format!("스트림 시작 실패: {e}"))?;
    let mut full = String::new();
    while let Some(resp) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            // stream을 drop하면 mistralrs receiver가 닫혀 추론 중단
            break;
        }
        match resp.as_result() {
            Ok(ResponseOk::Chunk(chunk)) => {
                let Some(choice) = chunk.choices.first() else { continue; };
                if let Some(content) = &choice.delta.content {
                    if !content.is_empty() {
                        full.push_str(content);
                        let _ = app.emit(event_name, content.clone());
                    }
                }
                if show_reasoning {
                    if let Some(reasoning) = &choice.delta.reasoning_content {
                        if !reasoning.is_empty() {
                            full.push_str(reasoning);
                            let _ = app.emit(event_name, reasoning.clone());
                        }
                    }
                }
                if choice.finish_reason.is_some() {
                    break;
                }
            }
            Ok(ResponseOk::Done(_)) => break,
            Ok(_) => {}
            Err(e) => return Err(format!("스트림 에러: {e}")),
        }
    }
    Ok(full)
}

// Tauri command 노출은 commands::embed 모듈의 facade에서. 여기는 순수 라이브러리.
