use crate::commands::config::{load_config, AppConfig};
use crate::error::{LumError, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::future::Future;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{command, Emitter};

const XLLM_TOKEN_EVENT: &str = "xllm_token";
const SSE_MAX_LINE_BUF: usize = 64 * 1024;
const STREAM_POLL_TIMEOUT_MS: u64 = 250;
const CONNECT_CANCEL_POLL_MS: u64 = 60;
#[cfg(feature = "embedded-ai")]
const EMBEDDED_READY_TIMEOUT_MS: u64 = 6_000;
#[cfg(feature = "embedded-ai")]
const EMBEDDED_READY_POLL_MS: u64 = 120;

// Phase 115 — Privacy Ledger 이벤트 이름. 프론트 usePrivacyLedger 훅이 구독.
const AI_ROUTE_EVENT: &str = "ai_route_event";
const AI_READY_HINT: &str = "패널에서 모델/URL/API 키를 확인하고 다시 시도하세요.";

/// Phase 115 — 단일 AI 호출의 라우팅 결과. 백엔드명 + 외부 네트워크 여부 + latency.
/// 프론트는 이 이벤트들을 누적해 "100% on-device" 배지/통계를 산출.
#[derive(Debug, Serialize, Clone)]
pub struct AiRouteEvent {
    pub backend: &'static str, // "embedded" | "ollama" | "xllm" | "gemini"
    pub online: bool,          // true = 외부 네트워크로 나감 (LAN 포함 아님)
    pub model: Option<String>,
    pub prompt_chars: usize,
    pub latency_ms: u64,
    pub ts_ms: u64, // unix epoch ms
}

/// loopback(127.x / localhost / ::1)이면 false, 그 외 호스트면 true.
/// MVP — LAN(192.168.x 등)은 "online"으로 분류해 보수적으로 표시.
fn is_remote_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    !(lower.contains("://localhost")
        || lower.contains("://127.")
        || lower.contains("://0.0.0.0")
        || lower.contains("://[::1]"))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn emit_route(
    app: &tauri::AppHandle,
    backend: &'static str,
    online: bool,
    model: Option<String>,
    prompt_chars: usize,
    latency_ms: u64,
) {
    let _ = app.emit(
        AI_ROUTE_EVENT,
        AiRouteEvent {
            backend,
            online,
            model,
            prompt_chars,
            latency_ms,
            ts_ms: now_ms(),
        },
    );
}

fn local_embed_unavailable_message() -> String {
    #[cfg(feature = "embedded-ai")]
    {
        format!("임베디드 mistral.rs 모델이 로드되지 않았습니다. {AI_READY_HINT}")
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        crate::commands::embed::DISABLED_MSG.to_string()
    }
}

#[cfg(feature = "embedded-ai")]
fn local_embed_not_ready_message() -> String {
    if let Some(error) = crate::commands::mistralrs_inline::last_load_error() {
        return format!(
            "임베디드 mistral.rs 모델을 불러오지 못했습니다: {error}. 모델 파일/경로를 확인하고 다시 시도하세요."
        );
    }

    if crate::commands::embed::list_embed_candidates().is_empty() {
        return format!(
            "임베디드 mistral.rs 모델 후보를 찾지 못했습니다. 모델 저장 경로에 GGUF 파일 또는 config.json+safetensors 모델 폴더가 있는지 확인하세요."
        );
    }

    local_embed_unavailable_message()
}

#[cfg(not(feature = "embedded-ai"))]
fn local_embed_not_ready_message() -> String {
    local_embed_unavailable_message()
}

#[cfg(feature = "embedded-ai")]
fn local_embed_still_loading_message() -> String {
    if let Some(error) = crate::commands::mistralrs_inline::last_load_error() {
        return format!(
            "임베디드 mistral.rs 모델 로드가 실패했습니다: {error}. 모델 파일/경로를 확인하고 다시 시도하세요."
        );
    }

    "임베디드 mistral.rs 모델 로드가 아직 끝나지 않았습니다. 큰 모델이면 시간이 더 걸릴 수 있습니다. 로드 로그를 확인한 뒤 다시 시도하세요."
        .to_string()
}

fn backend_not_ready_message(backend_label: &'static str) -> String {
    format!("{backend_label} 백엔드가 미설정/미연결 상태입니다. {AI_READY_HINT}")
}

#[cfg(feature = "embedded-ai")]
fn embedded_loaded_key() -> Option<String> {
    crate::commands::mistralrs_inline::loaded_key()
}
#[cfg(not(feature = "embedded-ai"))]
fn embedded_loaded_key() -> Option<String> {
    None
}

pub type AiStreamCancel = Arc<AtomicBool>;

const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";

#[derive(Debug, Serialize, Deserialize)]
pub struct AIResponse {
    pub command: String,
    pub explanation: String,
    pub r#type: String,
    pub actions: Option<Vec<serde_json::Value>>,
    pub review_report: Option<serde_json::Value>,
    pub visual_data: Option<serde_json::Value>,
    pub dynamic_ui: Option<String>,
}

// ─── xLLM (TabbyAPI / MLX-LM / OpenAI 호환) ────────────────────────────────

/// 서버에서 현재 로드된 첫 번째 모델 ID 조회 (MLX-LM·TabbyAPI 공통)
async fn get_server_model_id(client: &reqwest::Client, base_url: &str) -> String {
    let url = format!("{}/v1/models", base_url);
    let Ok(resp) = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
    else {
        return "default".to_string();
    };
    let Ok(json) = resp.json::<serde_json::Value>().await else {
        return "default".to_string();
    };
    json["data"][0]["id"]
        .as_str()
        .unwrap_or("default")
        .to_string()
}

/// 공통 요청 바디 생성 — PD Disaggregation / SSD / Sparse Attention / KV Cache.
/// images가 있으면 OpenAI vision 포맷으로 content 배열 구성 (data URI).
fn xllm_body(
    config: &AppConfig,
    model: &str,
    prompt: &str,
    stream: bool,
    images: &[String],
) -> serde_json::Value {
    let is_long = prompt.len() > config.pd_threshold_chars.unwrap_or(8000) as usize;

    // ③ KV Cache — 긴 컨텍스트면 Q4 강제
    let cache_mode = if is_long {
        "Q4"
    } else {
        config.cache_mode.as_deref().unwrap_or("Q8")
    };

    // max_tokens = 출력 토큰 수 (전체 컨텍스트 창이 아님!).
    // max_seq_len과 같게 두면 prompt + completion이 컨텍스트를 초과해 TabbyAPI가 abort함.
    // 컨텍스트의 절반(2048~4096) 정도를 출력 한계로 사용.
    let max_tokens = config
        .max_seq_len
        .unwrap_or(4096)
        .saturating_div(2)
        .max(512)
        .min(8192);

    // 이미지 있으면 OpenAI vision 포맷 (content: Array), 없으면 단순 string
    let content = if images.is_empty() {
        serde_json::Value::String(prompt.to_string())
    } else {
        let mut parts = vec![serde_json::json!({ "type": "text", "text": prompt })];
        for url in images {
            parts.push(serde_json::json!({
                "type": "image_url",
                "image_url": { "url": url },
            }));
        }
        serde_json::Value::Array(parts)
    };

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": content }],
        "stream": stream,
        "max_tokens": max_tokens,
        "stop": ["<|im_end|>", "<|endoftext|>", "<|im_start|>"],
    });
    let _ = cache_mode; // 모델 로드 시 설정값 — per-request 파라미터 아님

    // ① PD Disaggregation — 긴 컨텍스트 decode 단계 안정화
    if is_long {
        body["temperature"] = serde_json::Value::from(0.3f32);
        body["top_p"] = serde_json::Value::from(0.85f32);
    }

    // ④ SSD (Speculative Speculative Decoding) — 드래프트 모델 설정 시 활성화
    if let Some(ref draft) = config.draft_model {
        body["draft_model"] = serde_json::Value::String(draft.clone());
        body["speculative_ngram"] = true.into();
        body["speculative_ngram_token_count"] =
            (config.speculative_n_draft.unwrap_or(5) as u64).into();
    }

    body
}

/// 임베디드 GGUF가 이 요청을 처리할 수 있는지 — 로드 상태 + 이미지 미입력.
/// 이미지가 있으면 GGUF 텍스트 모델로 vision 처리 불가 → HTTP 폴백.
/// non-feature 빌드는 `try_embedded_inference*` 스텁이 직접 None을 반환하므로
/// 이 헬퍼 자체를 컴파일 안 함 (dead_code 회피).
#[cfg(feature = "embedded-ai")]
fn embedded_can_serve(images: &[String]) -> bool {
    images.is_empty() && crate::commands::mistralrs_inline::loaded_key().is_some()
}

#[cfg(feature = "embedded-ai")]
fn embedded_engine_busy() -> bool {
    crate::commands::mistralrs_inline::engine_busy()
}

#[cfg(feature = "embedded-ai")]
async fn wait_for_embedded_ready() {
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_millis(EMBEDDED_READY_TIMEOUT_MS);
    while embedded_engine_busy() && std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_millis(EMBEDDED_READY_POLL_MS)).await;
    }
}

/// 임베디드 mistralrs가 로드돼있고 이미지 입력이 없으면 in-process 추론 시도.
/// `Some(result)` = 임베디드 사용 (성공/실패 무관 — 폴백 안 함), `None` = HTTP 폴백 필요.
#[cfg(feature = "embedded-ai")]
async fn try_embedded_inference(prompt: &str, images: &[String]) -> Option<Result<String>> {
    if !images.is_empty() {
        return None;
    }
    if !embedded_can_serve(images) {
        if embedded_engine_busy() {
            wait_for_embedded_ready().await;
            if embedded_can_serve(images) {
                // 로드 완료를 잠깐 기다린 뒤 임베디드로 진행.
                return Some(
                    crate::commands::mistralrs_inline::infer_once(prompt)
                        .await
                        .map_err(|e| LumError::AiEngine(format!("embedded inference failed: {e}"))),
                );
            }
            return Some(Err(LumError::AiEngine(local_embed_still_loading_message())));
        }
        return None;
    }
    Some(
        crate::commands::mistralrs_inline::infer_once(prompt)
            .await
            .map_err(|e| LumError::AiEngine(format!("embedded inference failed: {e}"))),
    )
}

#[cfg(not(feature = "embedded-ai"))]
async fn try_embedded_inference(_prompt: &str, _images: &[String]) -> Option<Result<String>> {
    None
}

#[cfg(feature = "embedded-ai")]
async fn try_embedded_inference_or_restore(
    app: &tauri::AppHandle,
    prompt: &str,
    images: &[String],
) -> Option<Result<String>> {
    if !images.is_empty() {
        return None;
    }
    if let Some(result) = try_embedded_inference(prompt, images).await {
        return Some(result);
    }

    match crate::commands::embed::restore_last_embedded_model(app.clone()).await {
        Ok(true) => Some(
            crate::commands::mistralrs_inline::infer_once(prompt)
                .await
                .map_err(|e| LumError::AiEngine(format!("embedded inference failed: {e}"))),
        ),
        Ok(false) => None,
        Err(e) => Some(Err(LumError::AiEngine(format!(
            "임베디드 mistral.rs 모델 자동 로드 실패: {e}"
        )))),
    }
}

#[cfg(not(feature = "embedded-ai"))]
async fn try_embedded_inference_or_restore(
    _app: &tauri::AppHandle,
    _prompt: &str,
    _images: &[String],
) -> Option<Result<String>> {
    None
}

/// 임베디드 mistralrs가 로드돼있으면 토큰별 스트리밍 추론. `xllm_token` 이벤트로 emit.
/// `cancel`이 true가 되면 stream drop으로 추론 중단.
#[cfg(feature = "embedded-ai")]
async fn try_embedded_inference_stream(
    app: &tauri::AppHandle,
    prompt: &str,
    images: &[String],
    cancel: &Arc<AtomicBool>,
    show_reasoning: bool,
    allow_fallback: bool,
) -> Option<Result<String>> {
    if !images.is_empty() {
        return None;
    }
    if !embedded_can_serve(images) {
        if embedded_engine_busy() {
            wait_for_embedded_ready().await;
            if embedded_can_serve(images) {
                return Some(
                    crate::commands::mistralrs_inline::infer_stream(
                        app,
                        prompt,
                        cancel,
                        show_reasoning,
                        XLLM_TOKEN_EVENT,
                    )
                    .await
                    .map_err(|e| LumError::AiEngine(format!("embedded streaming failed: {e}"))),
                );
            }
            if allow_fallback {
                return None;
            }
            return Some(Err(LumError::AiEngine(local_embed_still_loading_message())));
        }
        match crate::commands::embed::restore_last_embedded_model(app.clone()).await {
            Ok(true) => {}
            Ok(false) => {
                if allow_fallback {
                    return None;
                }
                return Some(Err(LumError::AiEngine(local_embed_not_ready_message())));
            }
            Err(e) => {
                if allow_fallback {
                    let _ = app.emit(
                        "embed_load_progress",
                        format!("⚠️ 임베디드 모델 자동 복원 실패 (fallback): {e}"),
                    );
                    return None;
                }
                return Some(Err(LumError::AiEngine(format!(
                    "임베디드 mistral.rs 모델 자동 로드 실패: {e}"
                ))));
            }
        }
    }
    Some(
        crate::commands::mistralrs_inline::infer_stream(
            app,
            prompt,
            cancel,
            show_reasoning,
            XLLM_TOKEN_EVENT,
        )
        .await
        .map_err(|e| LumError::AiEngine(format!("embedded streaming failed: {e}"))),
    )
}

#[cfg(not(feature = "embedded-ai"))]
async fn try_embedded_inference_stream(
    _app: &tauri::AppHandle,
    _prompt: &str,
    _images: &[String],
    _cancel: &Arc<AtomicBool>,
    _show_reasoning: bool,
    _allow_fallback: bool,
) -> Option<Result<String>> {
    None
}

/// Ollama가 설정돼있으면 단일 응답 — 미설정이면 None (HTTP 폴백 계속 진행).
async fn try_ollama_once(prompt: &str) -> Option<Result<String>> {
    let config = load_config().ok()?;
    let model = config
        .ollama_model
        .as_ref()
        .filter(|s| !s.is_empty())?
        .clone();
    let base_url = config.ollama_url();
    Some(crate::commands::ollama::ollama_once(prompt, &model, &base_url).await)
}

/// Ollama가 설정돼있으면 스트리밍 추론 — 미설정이면 None.
async fn try_ollama_stream(
    app: &tauri::AppHandle,
    prompt: &str,
    cancel: &Arc<AtomicBool>,
) -> Option<Result<String>> {
    let config = load_config().ok()?;
    let model = config
        .ollama_model
        .as_ref()
        .filter(|s| !s.is_empty())?
        .clone();
    let base_url = config.ollama_url();
    Some(crate::commands::ollama::ollama_stream(app, prompt, &model, &base_url, cancel).await)
}

/// 단일 응답 호출. embedded → Ollama → (gemini-* 모델이면 Gemini, 아니면 xLLM HTTP) 순서.
/// ReAct Agent 등 비스트리밍 멀티턴 루프에서 사용.
pub async fn call_ai(
    client: &reqwest::Client,
    model: &str,
    prompt: &str,
    app: Option<&tauri::AppHandle>,
) -> Result<String> {
    let embedded_result = match app {
        Some(app) => try_embedded_inference_or_restore(app, prompt, &[]).await,
        None => try_embedded_inference(prompt, &[]).await,
    };
    if let Some(result) = embedded_result {
        return result;
    }
    if let Some(result) = try_ollama_once(prompt).await {
        return result;
    }
    if model.starts_with("gemini") {
        call_gemini(client, model, prompt, None).await
    } else {
        call_xllm(client, model, prompt).await
    }
}

/// xLLM HTTP 단일 응답 호출. (fallback 없음)
async fn call_xllm_http(client: &reqwest::Client, prompt: &str) -> Result<String> {
    let config = load_config()?;
    let candidate_urls = config.xllm_url_candidates();

    let mut last_network_error: Option<LumError> = None;
    let total = candidate_urls.len();

    for (idx, base_url) in candidate_urls.iter().enumerate() {
        match call_xllm_http_once(client, &config, base_url, prompt).await {
            Ok(v) => return Ok(v),
            Err(err) if is_network_error(&err) && idx + 1 < total => {
                last_network_error = Some(err);
            }
            Err(err) => return Err(err),
        }
    }

    Err(last_network_error.unwrap_or_else(|| {
        LumError::Network(append_candidate_urls_hint(
            "xLLM 서버 연결 실패",
            &candidate_urls,
        ))
    }))
}

fn is_network_error(err: &LumError) -> bool {
    matches!(err, LumError::Network(_))
}

fn append_candidate_urls_hint(message: &str, candidate_urls: &[String]) -> String {
    if candidate_urls.is_empty() {
        return format!("{message}: 사용 가능한 후보 URL이 없습니다");
    }
    let local_candidate_exists = candidate_urls.iter().any(|url| !is_remote_url(url));
    let action_hint = if local_candidate_exists {
        "임베디드 모델 미확인 시 임베디드 패널에서 모델을 먼저 로드하거나 xLLM URL을 확인하세요"
    } else {
        "xLLM 패널에서 URL 후보와 방화벽/네트워크를 확인하세요"
    };
    format!(
        "{message} · 후보 주소: {} · 힌트: {action_hint}",
        candidate_urls.join(", ")
    )
}

fn summarize_xllm_request_error(base_url: &str, action: &str, err: &reqwest::Error) -> String {
    let state = if err.is_connect() {
        "연결 실패 (서버 미실행 가능성)"
    } else if err.is_timeout() {
        "요청 시간 초과"
    } else if err.is_request() {
        "요청 구성 오류"
    } else {
        "요청 처리 실패"
    };

    let detail = err
        .source()
        .and_then(|source| {
            let raw = source.to_string();
            if raw.trim().is_empty() {
                None
            } else {
                Some(raw)
            }
        })
        .filter(|raw| !raw.contains(base_url))
        .map_or_else(
            || state.to_string(),
            |raw| format!("{state}: {raw}"),
        );

    format!(
        "xLLM {action} 요청 실패 ({base_url}) - {detail}. xLLM 패널에서 서버 URL과 API 경로를 확인하세요",
    )
}

async fn call_xllm_http_once(
    client: &reqwest::Client,
    config: &AppConfig,
    base_url: &str,
    prompt: &str,
) -> Result<String> {
    let url = format!("{}/v1/chat/completions", base_url);

    // 서버의 실제 로드된 모델 ID 사용 (MLX-LM·TabbyAPI 공통)
    let actual_model = get_server_model_id(client, &base_url).await;
    let body = xllm_body(&config, &actual_model, prompt, false, &[]);

    let mut req = client.post(&url).json(&body);
    if let Some(key) = config.xllm_api_key.as_ref() {
        req = req.header("x-api-key", key);
    }

    let res_json: serde_json::Value = req
        .send()
        .await
        .map_err(|e| LumError::Network(summarize_xllm_request_error(base_url, "단건", &e)))?
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    let msg = &res_json["choices"][0]["message"];
    // content 우선, 없으면 reasoning/reasoning_content (추론 모델 지원)
    msg["content"]
        .as_str()
        .or_else(|| msg["reasoning"].as_str())
        .or_else(|| msg["reasoning_content"].as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| LumError::AiEngine(format!("xLLM 응답 파싱 실패: {}", res_json)))
}

/// xLLM 단일 응답 호출 (기존 호환). embedded → Ollama → xLLM HTTP.
pub async fn call_xllm(client: &reqwest::Client, _model: &str, prompt: &str) -> Result<String> {
    if let Some(result) = try_embedded_inference(prompt, &[]).await {
        return result;
    }
    if let Some(result) = try_ollama_once(prompt).await {
        return result;
    }
    call_xllm_http(client, prompt).await
}

/// backend 강제 단일 응답 호출.
/// - None: 기존 fallback 순서 유지 (embedded → ollama → gemini/xllm)
/// - Some(local|embedded|ollama|xllm|sglang|gemini|cloud): 해당 백엔드만 시도
pub async fn call_ai_with_backend(
    app: Option<&tauri::AppHandle>,
    client: &reqwest::Client,
    model: &str,
    prompt: &str,
    backend: Option<&str>,
) -> Result<String> {
    let Some(raw) = backend else {
        return call_ai(client, model, prompt, None).await;
    };
    let forced = raw.trim().to_lowercase();
    match forced.as_str() {
        "local" | "embedded" => {
            let embedded_result = match app {
                Some(app) => try_embedded_inference_or_restore(app, prompt, &[]).await,
                None => try_embedded_inference(prompt, &[]).await,
            };
            if let Some(result) = embedded_result {
                return result;
            }
            Err(LumError::AiEngine(local_embed_not_ready_message()))
        }
        "ollama" => {
            if let Some(result) = try_ollama_once(prompt).await {
                return result;
            }
            Err(LumError::AiEngine(backend_not_ready_message("Ollama")))
        }
        "xllm" | "sglang" => call_xllm_http(client, prompt).await,
        "gemini" | "cloud" => {
            if !model.starts_with("gemini") {
                return Err(LumError::Config(
                    "Cloud(Gemini) 백엔드는 gemini-* 모델이 필요합니다. 모델 패널에서 gemini-* 모델을 선택하세요."
                        .to_string(),
                ));
            }
            call_gemini(client, model, prompt, None).await
        }
        _ => Err(LumError::Config(format!(
            "지원하지 않는 backend: {} (local|ollama|xllm|sglang|gemini)",
            forced
        ))),
    }
}

/// OpenAI 호환 SSE 스트리밍 호출 — TabbyAPI · mistral.rs 공용
/// api_key: x-api-key 헤더 (TabbyAPI 전용, mistral.rs는 None)
async fn call_compat_stream(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    prompt: &str,
    images: &[String],
    base_urls: &[String],
    api_key: Option<String>,
    cancel: &Arc<AtomicBool>,
) -> Result<(String, String)> {
    let mut last_network_error: Option<LumError> = None;
    let total = base_urls.len();

    for (idx, base_url) in base_urls.iter().enumerate() {
        match call_compat_stream_one(
            app,
            client,
            prompt,
            images,
            base_url,
            api_key.clone(),
            cancel,
        )
        .await
        {
            Ok(v) => return Ok((v, base_url.clone())),
            Err(err) if is_network_error(&err) && idx + 1 < total => {
                last_network_error = Some(err);
            }
            Err(err) => return Err(err),
        }
    }

    Err(last_network_error.unwrap_or_else(|| {
        LumError::Network(append_candidate_urls_hint(
            "xLLM 서버에 연결할 수 없습니다",
            base_urls,
        ))
    }))
}

async fn call_compat_stream_one(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    prompt: &str,
    images: &[String],
    base_url: &str,
    api_key: Option<String>,
    cancel: &Arc<AtomicBool>,
) -> Result<String> {
    let config = load_config()?;
    let url = format!("{}/v1/chat/completions", base_url);
    let actual_model = get_server_model_id(client, base_url).await;
    let body = xllm_body(&config, &actual_model, prompt, true, images);

    let mut req = client.post(&url).json(&body);
    if let Some(key) = api_key {
        req = req.header("x-api-key", key);
    }

    if cancel.load(Ordering::Relaxed) {
        return Ok(String::new());
    }
    let send_fut = req.send();
    tokio::pin!(send_fut);
    let response = loop {
        tokio::select! {
            result = &mut send_fut => {
                let response = result.map_err(|e| {
                    LumError::Network(summarize_xllm_request_error(base_url, "스트리밍", &e))
                })?;
                break response;
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(CONNECT_CANCEL_POLL_MS)) => {
                if cancel.load(Ordering::Relaxed) {
                    return Ok(String::new());
                }
            }
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LumError::AiEngine(format!(
            "xLLM 서버 오류 HTTP {} ({}): {}",
            status,
            base_url,
            if body.is_empty() {
                "응답 없음".to_string()
            } else {
                body.chars().take(200).collect()
            }
        )));
    }

    let mut byte_stream = response.bytes_stream();
    let mut full_text = String::new();
    let mut line_buf = String::new();

    while !cancel.load(Ordering::Relaxed) {
        let chunk = tokio::time::timeout(
            std::time::Duration::from_millis(STREAM_POLL_TIMEOUT_MS),
            byte_stream.next(),
        )
        .await;
        let bytes = match chunk {
            Ok(Some(Ok(bytes))) => bytes,
            Ok(Some(Err(e))) => return Err(LumError::AiEngine(e.to_string())),
            Ok(None) => break,
            Err(_) => continue,
        };
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        line_buf.push_str(&String::from_utf8_lossy(&bytes));

        if line_buf.len() > SSE_MAX_LINE_BUF {
            return Err(LumError::AiEngine(
                "SSE 응답 버퍼 초과 — 서버 응답이 비정상입니다".to_string(),
            ));
        }

        while let Some(nl) = line_buf.find('\n') {
            let line = line_buf[..nl].trim().to_string();
            line_buf.drain(..nl + 1);

            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    let delta = &json["choices"][0]["delta"];
                    // content가 있으면 그대로 전달
                    if let Some(t) = delta["content"].as_str() {
                        if !t.is_empty() {
                            if cancel.load(Ordering::Relaxed) {
                                break;
                            }
                            full_text.push_str(t);
                            let _ = app.emit(XLLM_TOKEN_EVENT, t.to_string());
                        }
                    }
                    // reasoning/reasoning_content 토큰 — show_reasoning 설정 따라 표시/숨김
                    else if let Some(t) = delta["reasoning"]
                        .as_str()
                        .or_else(|| delta["reasoning_content"].as_str())
                    {
                        if !t.is_empty() {
                            if cancel.load(Ordering::Relaxed) {
                                break;
                            }
                            full_text.push_str(t);
                            if config.show_reasoning.unwrap_or(true) {
                                let _ = app.emit(XLLM_TOKEN_EVENT, t.to_string());
                            }
                        }
                    }
                }
            }
            if cancel.load(Ordering::Relaxed) {
                break;
            }
        }
    }

    Ok(full_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with(f: impl FnOnce(&mut AppConfig)) -> AppConfig {
        let mut c = AppConfig::default();
        f(&mut c);
        c
    }

    #[test]
    fn body_short_context_no_cache_mode_no_temperature() {
        // 회귀 가드 — cache_mode는 모델 로드 시점 옵션. 추론 body에 넣으면 TabbyAPI가
        // "Chat completion aborted"로 거부함. 짧은 컨텍스트엔 temperature도 안 박혀야 함.
        let c = AppConfig::default();
        let body = xllm_body(&c, "model", "hello", false, &[]);
        assert!(
            body["cache_mode"].is_null(),
            "cache_mode가 body에 들어가면 TabbyAPI 거부"
        );
        assert!(body["temperature"].is_null());
        assert_eq!(body["stream"], false);
    }

    #[test]
    fn body_long_context_low_temperature_no_cache_mode() {
        // 긴 컨텍스트엔 PD 모드용 temperature/top_p가 박히지만, cache_mode는 여전히 부재해야 함.
        let c = config_with(|c| c.pd_threshold_chars = Some(5));
        let body = xllm_body(&c, "model", "this is longer than 5", false, &[]);
        assert!(body["cache_mode"].is_null());
        let temp = body["temperature"].as_f64().unwrap();
        assert!((temp - 0.3).abs() < 0.01);
        let top_p = body["top_p"].as_f64().unwrap();
        assert!((top_p - 0.85).abs() < 0.01);
    }

    #[test]
    fn body_ssd_params_injected_when_draft_model_set() {
        let c = config_with(|c| {
            c.draft_model = Some("DeepSeek-1.3B".to_string());
            c.speculative_n_draft = Some(6);
        });
        let body = xllm_body(&c, "model", "prompt", false, &[]);
        assert_eq!(body["draft_model"], "DeepSeek-1.3B");
        assert_eq!(body["speculative_ngram"], true);
        assert_eq!(body["speculative_ngram_token_count"], 6);
    }

    #[test]
    fn body_ssd_default_n_draft_is_5() {
        let c = config_with(|c| c.draft_model = Some("draft".to_string()));
        let body = xllm_body(&c, "model", "prompt", false, &[]);
        assert_eq!(body["speculative_ngram_token_count"], 5);
    }

    #[test]
    fn body_no_ssd_when_draft_model_absent() {
        let c = AppConfig::default();
        let body = xllm_body(&c, "model", "prompt", false, &[]);
        assert!(body["draft_model"].is_null());
        assert!(body["speculative_ngram"].is_null());
    }

    #[test]
    fn body_stream_flag_respected() {
        let c = AppConfig::default();
        assert_eq!(xllm_body(&c, "m", "p", false, &[])["stream"], false);
        assert_eq!(xllm_body(&c, "m", "p", true, &[])["stream"], true);
    }

    #[tokio::test]
    async fn try_embedded_inference_skips_when_images_present() {
        // 이미지 있으면 feature 활성/비활성 무관 항상 None — GGUF 텍스트 모델 처리 불가.
        // 회귀 가드: 라우팅이 실수로 이미지를 임베디드에 보내면 모델이 텍스트만 보고 답해
        // 사용자 요청과 무관한 응답이 나옴.
        let imgs = vec!["data:image/png;base64,xxx".to_string()];
        let r = try_embedded_inference("hello", &imgs).await;
        assert!(
            r.is_none(),
            "이미지 있으면 임베디드 라우팅 스킵 후 HTTP/Gemini 폴백"
        );
    }

    #[cfg(not(feature = "embedded-ai"))]
    #[tokio::test]
    async fn try_embedded_inference_none_without_feature() {
        // 비활성 빌드: 항상 None — embedded-ai 코드는 단 한 줄도 실행되지 않음.
        assert!(try_embedded_inference("hello", &[]).await.is_none());
        let imgs = vec!["img".to_string()];
        assert!(try_embedded_inference("hello", &imgs).await.is_none());
    }

    // Phase 115 — Privacy Ledger 분류 가드.
    // 회귀: loopback 변형은 모두 offline, 외부 호스트는 online.
    #[test]
    fn is_remote_url_classifies_loopback_as_offline() {
        assert!(!is_remote_url("http://localhost:11434"));
        assert!(!is_remote_url("http://127.0.0.1:8080"));
        assert!(!is_remote_url("http://127.5.5.1:1234"));
        assert!(!is_remote_url("http://0.0.0.0:5000"));
        assert!(!is_remote_url("http://[::1]:8080"));
        assert!(!is_remote_url("HTTPS://LOCALHOST:1234")); // 대소문자 무관
    }

    #[test]
    fn is_remote_url_classifies_external_as_online() {
        assert!(is_remote_url("https://api.example.com/v1"));
        assert!(is_remote_url("http://192.168.1.5:11434")); // LAN도 보수적으로 online
        assert!(is_remote_url(
            "https://generativelanguage.googleapis.com/v1beta"
        ));
    }

    #[test]
    fn append_candidate_urls_hint_joins_candidates_for_network_error() {
        let candidates = vec![
            "http://127.0.0.1:8080".to_string(),
            "http://localhost:11434".to_string(),
        ];
        let msg = append_candidate_urls_hint("xLLM 서버에 연결할 수 없습니다", &candidates);
        assert!(msg.contains("http://127.0.0.1:8080"));
        assert!(msg.contains("http://localhost:11434"));
        assert!(msg.contains("xLLM 서버에 연결할 수 없습니다"));
        assert!(msg.contains("임베디드 모델"));
    }

    #[test]
    fn append_candidate_urls_hint_remote_candidates_show_network_hint() {
        let candidates = vec!["https://api.example.com/v1".to_string()];
        let msg = append_candidate_urls_hint("xLLM 서버 연결 실패", &candidates);
        assert!(msg.contains("https://api.example.com/v1"));
        assert!(msg.contains("방화벽/네트워크"));
    }

    #[tokio::test]
    async fn call_ai_with_backend_rejects_unknown_backend() {
        let client = reqwest::Client::builder()
            .build()
            .expect("client should build");
        let err = call_ai_with_backend(None, &client, "", "hello", Some("unsupported"))
            .await
            .expect_err("unknown backend should fail");
        match err {
            LumError::Config(msg) => {
                assert!(msg.contains("지원하지 않는 backend"));
            }
            other => panic!("unexpected error type: {other}"),
        }
    }

    #[test]
    fn list_xllm_models_첫_url_실패하면_다음_후보를_시도한다() {
        let models = list_xllm_models_from_candidate_results(vec![
            Err(LumError::Network("connection refused".into())),
            Ok(serde_json::json!({"data":[{"id":"qwen-coder"}]})),
        ])
        .unwrap();

        assert_eq!(models, vec!["qwen-coder".to_string()]);
    }

    #[tokio::test]
    async fn await_with_cancel_이미_취소된_상태면_즉시_중단() {
        let cancel = Arc::new(AtomicBool::new(true));
        let result = await_with_cancel(async { Ok::<_, LumError>("ok".to_string()) }, &cancel).await;
        match result {
            Err(LumError::AiEngine(msg)) => assert!(msg.contains("취소")),
            other => panic!("unexpected result: {other:?}"),
        }
    }

    #[tokio::test]
    async fn await_with_cancel_대기중_취소되면_중단() {
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_setter = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            cancel_setter.store(true, Ordering::Relaxed);
        });
        let result = await_with_cancel(
            async {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                Ok::<_, LumError>("done".to_string())
            },
            &cancel,
        )
        .await;
        match result {
            Err(LumError::AiEngine(msg)) => assert!(msg.contains("취소")),
            other => panic!("unexpected result: {other:?}"),
        }
    }
}

/// xLLM 서버 상태 확인 — /v1/models 엔드포인트로 핑
#[command]
pub async fn check_xllm_status() -> Result<bool> {
    let config = load_config()?;
    let candidate_urls = config.xllm_url_candidates();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    for base_url in candidate_urls {
        let url = format!("{}/v1/models", base_url);
        if client.get(&url).send().await.is_ok() {
            return Ok(true);
        }
    }

    Ok(false)
}

/// xLLM에서 로드된 모델 목록 조회
#[command]
pub async fn list_xllm_models() -> Result<Vec<String>> {
    let config = load_config()?;
    let candidate_urls = config.xllm_url_candidates();
    let xllm_api_key = config.xllm_api_key;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    list_xllm_models_from_candidates(&client, &candidate_urls, xllm_api_key.as_ref()).await
}

async fn list_xllm_models_from_candidates(
    client: &reqwest::Client,
    candidate_urls: &[String],
    xllm_api_key: Option<&String>,
) -> Result<Vec<String>> {
    let mut last_err: Option<LumError> = None;
    let total = candidate_urls.len();
    for (idx, base_url) in candidate_urls.iter().enumerate() {
        let mut req = client
            .get(format!("{}/v1/models", base_url))
            .timeout(std::time::Duration::from_secs(5));

        if let Some(configured_key) = xllm_api_key {
            req = req.header("x-api-key", configured_key);
        }

        let response = match req.send().await {
            Ok(response) => response,
            Err(e) if idx + 1 < total => {
                last_err = Some(LumError::Network(summarize_xllm_request_error(
                    base_url,
                    "모델 조회",
                    &e,
                )));
                continue;
            }
            Err(e) => return Err(LumError::Network(e.to_string())),
        };

        let res_json: Result<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| LumError::AiEngine(e.to_string()));

        if let Ok(res_json) = res_json {
            return Ok(parse_xllm_models_json(&res_json));
        }

        last_err = Some(LumError::AiEngine(format!(
            "xLLM 모델 조회 응답 파싱 실패 ({base_url})"
        )));
    }

    Err(last_err.unwrap_or_else(|| {
        LumError::Network("xLLM 모델 조회 실패: 사용 가능한 URL 후보가 없습니다".into())
    }))
}

fn parse_xllm_models_json(res_json: &serde_json::Value) -> Vec<String> {
    res_json["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
fn list_xllm_models_from_candidate_results(
    results: Vec<Result<serde_json::Value>>,
) -> Result<Vec<String>> {
    let mut last_err: Option<LumError> = None;

    for result in results {
        match result {
            Ok(res_json) => return Ok(parse_xllm_models_json(&res_json)),
            Err(err) => last_err = Some(err),
        }
    }

    Err(last_err.unwrap_or_else(|| {
        LumError::Network("xLLM 모델 조회 실패: 사용 가능한 URL 후보가 없습니다".into())
    }))
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

fn build_gemini_body(prompt: &str, image_base64: Option<&str>) -> serde_json::Value {
    let mut parts: Vec<serde_json::Value> = Vec::new();

    // 공식 문서 기준: 이미지를 텍스트보다 먼저 배치
    if let Some(img) = image_base64 {
        parts.push(serde_json::json!({
            "inline_data": { "mime_type": "image/png", "data": img }
        }));
    }
    parts.push(serde_json::json!({ "text": prompt }));

    serde_json::json!({ "contents": [{ "parts": parts }] })
}

fn extract_gemini_text(res: &serde_json::Value) -> Result<String> {
    if let Some(err) = res.get("error") {
        return Err(LumError::AiEngine(
            err["message"]
                .as_str()
                .unwrap_or("Unknown Gemini error")
                .to_string(),
        ));
    }
    res["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| LumError::AiEngine(format!("Unexpected Gemini response: {}", res)))
}

async fn await_with_cancel<T, F>(future: F, cancel: &Arc<AtomicBool>) -> Result<T>
where
    F: Future<Output = Result<T>>,
{
    if cancel.load(Ordering::Relaxed) {
        return Err(LumError::AiEngine("요청이 취소되었습니다.".to_string()));
    }
    let mut future = std::pin::pin!(future);
    loop {
        tokio::select! {
            res = &mut future => return res,
            _ = tokio::time::sleep(std::time::Duration::from_millis(CONNECT_CANCEL_POLL_MS)) => {
                if cancel.load(Ordering::Relaxed) {
                    return Err(LumError::AiEngine("요청이 취소되었습니다.".to_string()));
                }
            }
        }
    }
}

async fn call_gemini(
    client: &reqwest::Client,
    model: &str,
    prompt: &str,
    image_base64: Option<&str>,
) -> Result<String> {
    let config = load_config()?;
    let api_key = config.gemini_api_key.ok_or_else(|| {
        LumError::Config("Gemini API Key가 없습니다. 설정에서 입력해 주세요.".to_string())
    })?;

    let url = format!("{}/{}:generateContent", GEMINI_BASE_URL, model);
    let body = build_gemini_body(prompt, image_base64);

    let res_json: serde_json::Value = client
        .post(&url)
        .header("x-goog-api-key", &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| LumError::Network(e.to_string()))?
        .json()
        .await
        .map_err(|e| LumError::AiEngine(e.to_string()))?;

    extract_gemini_text(&res_json)
}

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

/// AI 커맨드 생성.
/// - gemini-* 모델 → Gemini Cloud API (API 키 필요)
/// - 그 외 → xLLM 로컬 서버 (API 키 불필요)
#[command]
pub async fn generate_ai_command(
    app: tauri::AppHandle,
    prompt: String,
    model: String,
    context: String,
    image_data: Option<String>,
) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let full_prompt = format!("Context: {}\nRequest: {}", context, prompt);

    if model.starts_with("gemini") {
        call_gemini(&client, &model, &full_prompt, image_data.as_deref()).await
    } else {
        call_ai(&client, &model, &full_prompt, Some(&app)).await
    }
}

/// ⑥ EPD 스트리밍 AI 커맨드 — 첫 토큰을 즉시 `xllm_token` 이벤트로 전달
/// Gemini 모델은 SSE를 지원하지 않으므로 비스트리밍 폴백
#[command]
pub async fn stream_ai_command(
    app: tauri::AppHandle,
    prompt: String,
    model: String,
    context: String,
    images: Option<Vec<String>>,
    // engine: 명시적 엔진 — "heavy" = mistral.rs 강제, "fast"/None = TabbyAPI
    engine: Option<String>,
    // backend: 명시적 백엔드 강제 — local|ollama|xllm|sglang|gemini
    backend: Option<String>,
    // active_file: 현재 편집 파일 경로 — 지정 시 파일 내용 + RAG 스니펫 자동 주입
    active_file: Option<String>,
    cancel_flag: tauri::State<'_, AiStreamCancel>,
) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    // prompt에 남아있는 `!!` 접두사 제거 (Heavy 라우팅 신호로만 사용)
    let cleaned_prompt = prompt.trim_start_matches("!!").trim_start().to_string();

    // active_file 있으면 파일 내용 + RAG 스니펫 주입
    let rag_ctx = if let Some(ref file) = active_file {
        crate::commands::rag::rag_context_for_file(file.clone(), cleaned_prompt.clone(), Some(5))
            .await
            .unwrap_or_default()
    } else {
        String::new()
    };

    let full_prompt = if rag_ctx.is_empty() {
        format!("Context: {}\nRequest: {}", context, cleaned_prompt)
    } else {
        format!(
            "Context: {}\n\n{}\nRequest: {}",
            context, rag_ctx, cleaned_prompt
        )
    };
    let imgs = images.unwrap_or_default();

    // Phase 115 — Privacy Ledger 계측: prompt 크기(byte) + 시작 시각 기록 후 분기별 emit.
    // chars().count()는 RAG 주입된 10~100KB 프롬프트에서 O(n) — 분석용 통계엔 byte len으로 충분.
    let prompt_chars = full_prompt.len();
    let started = std::time::Instant::now();

    let config = load_config()?;
    let forced_backend = backend.as_deref().map(|b| b.trim().to_lowercase());
    let forced_engine = engine.as_deref().map(|e| e.trim().to_lowercase());
    let force_local_engine = matches!(
        forced_engine.as_deref(),
        Some("heavy") | Some("local") | Some("embedded")
    );

    if let Some(forced) = forced_backend.as_deref() {
        match forced {
            "local" | "embedded" => {
                let show_reasoning = config.show_reasoning.unwrap_or(true);
                if let Some(result) = try_embedded_inference_stream(
                    &app,
                    &full_prompt,
                    &imgs,
                    &cancel_flag,
                    show_reasoning,
                    false,
                )
                .await
                {
                    if result.is_ok() {
                        emit_route(
                            &app,
                            "embedded",
                            false,
                            embedded_loaded_key(),
                            prompt_chars,
                            started.elapsed().as_millis() as u64,
                        );
                    }
                    return result;
                }
                return Err(LumError::AiEngine(local_embed_not_ready_message()));
            }
            "ollama" => {
                if let Some(result) = try_ollama_stream(&app, &full_prompt, &cancel_flag).await {
                    if result.is_ok() {
                        let ollama_url = config.ollama_url();
                        emit_route(
                            &app,
                            "ollama",
                            is_remote_url(&ollama_url),
                            config.ollama_model.clone(),
                            prompt_chars,
                            started.elapsed().as_millis() as u64,
                        );
                    }
                    return result;
                }
                return Err(LumError::AiEngine(backend_not_ready_message("Ollama")));
            }
            "xllm" | "sglang" => {
                let xllm_urls = config.xllm_url_candidates();
                let result = call_compat_stream(
                    &app,
                    &client,
                    &full_prompt,
                    &imgs,
                    &xllm_urls,
                    config.xllm_api_key.clone(),
                    &cancel_flag,
                )
                .await;
                if let Ok((_text, xllm_url)) = result {
                    emit_route(
                        &app,
                        "xllm",
                        is_remote_url(&xllm_url),
                        None,
                        prompt_chars,
                        started.elapsed().as_millis() as u64,
                    );
                    return Ok(_text);
                }
                return match result {
                    Ok((text, _)) => Ok(text),
                    Err(err) if is_network_error(&err) => {
                        let xllm_urls = config.xllm_url_candidates();
                        Err(LumError::Network(format!(
                            "{err} · 후보 주소: {}",
                            xllm_urls.join(", "),
                        )))
                    }
                    Err(err) => Err(err),
                };
            }
            "gemini" | "cloud" => {
                if !model.starts_with("gemini") {
                    return Err(LumError::Config(
                        "Cloud(Gemini) 백엔드는 gemini-* 모델이 필요합니다. 모델 패널에서 gemini-* 모델을 선택하세요."
                            .to_string(),
                    ));
                }
                let single_image = imgs.first().map(|s| s.as_str());
                let result = await_with_cancel(
                    call_gemini(&client, &model, &full_prompt, single_image),
                    &cancel_flag,
                )
                .await?;
                emit_route(
                    &app,
                    "gemini",
                    true,
                    Some(model.clone()),
                    prompt_chars,
                    started.elapsed().as_millis() as u64,
                );
                let _ = app.emit(XLLM_TOKEN_EVENT, result.clone());
                return Ok(result);
            }
            _ => {
                return Err(LumError::Config(format!(
                    "지원하지 않는 backend: {} (local|ollama|xllm|sglang|gemini)",
                    forced
                )));
            }
        }
    }

    if model.starts_with("gemini") && !force_local_engine {
        let single_image = imgs.first().map(|s| s.as_str());
        let result = await_with_cancel(
            call_gemini(&client, &model, &full_prompt, single_image),
            &cancel_flag,
        )
        .await?;
        emit_route(
            &app,
            "gemini",
            true,
            Some(model.clone()),
            prompt_chars,
            started.elapsed().as_millis() as u64,
        );
        let _ = app.emit(XLLM_TOKEN_EVENT, result.clone());
        Ok(result)
    } else {
        if force_local_engine {
            let show_reasoning = config.show_reasoning.unwrap_or(true);
            if let Some(result) = try_embedded_inference_stream(
                &app,
                &full_prompt,
                &imgs,
                &cancel_flag,
                show_reasoning,
                false,
            )
            .await
            {
                if result.is_ok() {
                    emit_route(
                        &app,
                        "embedded",
                        false,
                        embedded_loaded_key(),
                        prompt_chars,
                        started.elapsed().as_millis() as u64,
                    );
                }
                return result;
            }
            return Err(LumError::AiEngine(local_embed_not_ready_message()));
        }
        // 임베디드 GGUF 로드돼있으면 토큰별 스트리밍 — HTTP 우회.
        let show_reasoning = config.show_reasoning.unwrap_or(true);
        if let Some(result) = try_embedded_inference_stream(
            &app,
            &full_prompt,
            &imgs,
            &cancel_flag,
            show_reasoning,
            true,
        )
        .await
        {
            if result.is_ok() {
                emit_route(
                    &app,
                    "embedded",
                    false,
                    embedded_loaded_key(),
                    prompt_chars,
                    started.elapsed().as_millis() as u64,
                );
            }
            return result;
        }
        // Ollama 설정돼있으면 NDJSON 스트리밍 — xLLM 우회.
        if let Some(result) = try_ollama_stream(&app, &full_prompt, &cancel_flag).await {
            if result.is_ok() {
                let ollama_url = config.ollama_url();
                emit_route(
                    &app,
                    "ollama",
                    is_remote_url(&ollama_url),
                    config.ollama_model.clone(),
                    prompt_chars,
                    started.elapsed().as_millis() as u64,
                );
            }
            return result;
        }
        let xllm_urls = config.xllm_url_candidates();
        let result = call_compat_stream(
            &app,
            &client,
            &full_prompt,
            &imgs,
            &xllm_urls,
            config.xllm_api_key.clone(),
            &cancel_flag,
        )
        .await;
        if let Ok((_text, xllm_url)) = result {
            emit_route(
                &app,
                "xllm",
                is_remote_url(&xllm_url),
                None,
                prompt_chars,
                started.elapsed().as_millis() as u64,
            );
            return Ok(_text);
        }
        return match result {
            Ok((text, _)) => Ok(text),
            Err(err) if is_network_error(&err) => {
                let xllm_urls = config.xllm_url_candidates();
                Err(LumError::Network(format!(
                    "{err} · 후보 주소: {}",
                    xllm_urls.join(", "),
                )))
            }
            Err(err) => Err(err),
        };
    }
}

#[command]
pub fn cancel_ai_stream(cancel_flag: tauri::State<'_, AiStreamCancel>) {
    cancel_flag.store(true, Ordering::Relaxed);
}

#[command]
pub fn reset_ai_stream(cancel_flag: tauri::State<'_, AiStreamCancel>) {
    cancel_flag.store(false, Ordering::Relaxed);
}

/// 에러 분석
#[command]
pub async fn analyze_error(
    app: tauri::AppHandle,
    command: String,
    stderr: String,
    model: String,
    context: String,
) -> Result<String> {
    let prompt = format!(
        "Command '{}' failed with error:\n{}\nContext: {}\n\
         Analyze and suggest a fix. Respond with JSON: \
         {{\"analysis\": \"...\", \"suggestion\": \"fixed command\"}}",
        command, stderr, context
    );
    generate_ai_command(app, prompt, model, context, None).await
}

/// 시각적 목표 달성 검증 (Gemini 멀티모달 전용)
#[command]
pub async fn verify_vision_goal(
    goal: String,
    screenshot_base64: String,
    model: String,
    iteration: u32,
) -> Result<serde_json::Value> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    if !model.starts_with("gemini") {
        return Ok(serde_json::json!({
            "achieved": false,
            "reason": "시각적 목표 검증은 Gemini 모델에서만 지원됩니다. 설정에서 gemini 모델을 선택하세요.",
            "nextActions": []
        }));
    }

    let prompt = format!(
        "You are a visual AI agent verifying OS automation goals.\n\
         Goal: {}\nIteration: {}/10\n\
         Look at the screenshot and determine if the goal was achieved.\n\
         Respond ONLY with JSON (no markdown):\n\
         {{\"achieved\": false, \"reason\": \"...\", \"nextActions\": [\
         {{\"type\": \"mouse_move\", \"x\": 0, \"y\": 0, \"click\": true}}, \
         {{\"type\": \"type_text\", \"text\": \"\", \"enter\": false}}, \
         {{\"type\": \"scroll\", \"x\": 0, \"y\": 0, \"amount\": 3}}, \
         {{\"type\": \"key_combo\", \"modifier\": \"cmd\", \"key\": \"v\"}}, \
         {{\"type\": \"click\", \"x\": 0, \"y\": 0, \"button\": \"left\"}}\
         ]}}",
        goal, iteration
    );

    let raw = call_gemini(&client, &model, &prompt, Some(&screenshot_base64)).await?;

    let json_str = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    serde_json::from_str(json_str)
        .map_err(|e| LumError::AiEngine(format!("응답 JSON 파싱 실패: {}. 원본: {}", e, raw)))
}

/// 커맨드 설명 — ? prefix 입력 시 AI가 역할·옵션·주의사항을 한국어로 설명
#[command]
pub async fn explain_command(command: String, model: String) -> Result<String> {
    let config = load_config()?;
    let prompt = format!(
        "다음 터미널 커맨드를 초보자도 이해할 수 있도록 한국어로 설명하세요.\n\
형식:\n\
- 첫 줄: 한 줄 요약\n\
- 주요 옵션/인수 설명 (있을 경우)\n\
- 주의사항 (있을 경우)\n\
마크다운 없이 일반 텍스트로만 출력하세요.\n\n\
커맨드: {}",
        command
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();
    if !model.is_empty() && (config.xllm_base_url.is_some() || config.coding_model.is_some()) {
        match call_xllm(&client, &model, &prompt).await {
            Ok(r) => return Ok(r.trim().to_string()),
            Err(_) => {}
        }
    }
    // Gemini 폴백
    if let Some(key) = &config.gemini_api_key {
        if !key.is_empty() {
            match call_gemini(&client, &model, &prompt, None).await {
                Ok(r) => return Ok(r.trim().to_string()),
                Err(_) => {}
            }
        }
    }
    Err(LumError::AiEngine(
        "AI 엔진을 사용할 수 없습니다. xLLM 또는 Gemini API 키를 설정하세요.".into(),
    ))
}
