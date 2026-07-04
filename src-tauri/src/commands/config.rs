use crate::error::{LumError, Result};
use crate::platform;
use serde::{Deserialize, Serialize};

const CONFIG_FILE: &str = ".lum_config.json";

/// xLLM(TabbyAPI) 기본 주소 — 로컬 실행 기본값
pub const XLLM_DEFAULT_URL: &str = "http://127.0.0.1:8080";
pub const XLLM_DEFAULT_URLS: [&str; 2] = ["http://127.0.0.1:8080", "http://127.0.0.1:5000"];

fn normalize_xllm_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

#[derive(Debug, Serialize, Deserialize, Default, Clone, PartialEq)]
pub struct AppConfig {
    pub theme: Option<String>,
    pub font_size: Option<u32>,
    pub font_family: Option<String>,
    pub opacity: Option<f64>,
    pub accent_color: Option<String>,
    /// xLLM(TabbyAPI) 서버 주소 (기본값: http://127.0.0.1:8080)
    pub xllm_base_url: Option<String>,
    /// xLLM API 키 — 로컬 사용 시 불필요, 원격 서버 시 설정
    pub xllm_api_key: Option<String>,
    /// Gemini API 키 — 클라우드 폴백용 (선택)
    pub gemini_api_key: Option<String>,
    pub p2p_enabled: Option<bool>,
    /// TabbyAPI Admin 키 (모델 관리 API용)
    pub xllm_admin_key: Option<String>,

    // ── xLLM 실전 최적화 설정 ────────────────────────────────────────────────
    /// ③ KV Cache Quantization 모드: "Q4" | "Q8" | "FP16" (기본 Q8)
    pub cache_mode: Option<String>,
    /// ② 코딩 작업 전용 모델 (예: Qwen2.5-Coder-7B-Instruct-EXL2-4bpw)
    pub coding_model: Option<String>,
    /// ② 문서화/요약 전용 모델 (예: gemma-3-4b-it-EXL2-4bpw)
    pub doc_model: Option<String>,
    /// ① 긴 컨텍스트 감지 임계값 — 초과 시 PD 최적화 모드 전환 (기본 8000 chars)
    pub pd_threshold_chars: Option<u32>,
    /// 모델 로드 시 최대 시퀀스 길이 (기본 8192)
    pub max_seq_len: Option<u32>,

    // ── Phase 37: SSD / EPD ─────────────────────────────────────────────────
    /// ④ SSD 드래프트 모델명 (예: DeepSeek-Coder-1.3B-Instruct-EXL2)
    pub draft_model: Option<String>,
    /// ④ SSD 드래프트 토큰 수 (기본 5) — 클수록 빠르지만 적중률 의존
    pub speculative_n_draft: Option<u32>,
    /// 온보딩 완료 여부 — false면 첫 실행 마법사 표시
    pub onboarding_completed: Option<bool>,
    /// Quick Actions — 즐겨찾기 커맨드 목록
    pub quick_actions: Option<Vec<QuickAction>>,
    /// HuggingFace 액세스 토큰 — EXL2 모델 다운로드용 (한 번만 입력)
    pub hf_token: Option<String>,

    // ── Phase 71: VRAM 안전 모드 ─────────────────────────────────────────────
    /// GPU 메모리 사용 안전 모드 — "safe" (70%) | "balanced" (80%) | "max" (90%)
    pub safety_mode: Option<String>,
    /// VRAM Cap 사용자 오버라이드 — 0.50 ~ 0.95 (None이면 safety_mode의 기본값 사용)
    pub vram_cap_override: Option<f32>,

    // ── Phase 72: 모델 capability 토글 ─────────────────────────────────────
    /// 비전(멀티모달) 입력 활성화 — 모델이 지원할 때만 유효
    pub vision_enabled: Option<bool>,
    /// 추론(CoT) 토큰 UI 표시 — false면 <think>…</think> 블록 숨김
    pub show_reasoning: Option<bool>,

    /// 모델 다운로드 저장 경로 — None이면 기본값 `~/.lum_mistral_models` 사용
    pub model_download_dir: Option<String>,
    /// 마지막으로 로드된 mistral.rs 임베디드 모델 키(복원용)
    /// GGUF: "<model_dir>/<gguf_filename>"
    /// LoRA: "<model_dir>/<gguf_filename>+lora:<lora_adapter>"
    /// BF16 + ISQ: "<model_path>+isq:<isq_type>"
    pub mistral_last_embed_key: Option<String>,

    // ── Ollama 백엔드 (선택) ────────────────────────────────────────────────
    /// Ollama 서버 주소 (기본값: http://localhost:11434)
    pub ollama_base_url: Option<String>,
    /// Ollama에서 사용할 모델명 (예: "llama3.2:3b", "qwen2.5-coder:7b")
    pub ollama_model: Option<String>,

    // ── Phase 120: 자동 LoRA 학습 루프 (Auto-Learn) ───────────────────────
    /// 자동 학습 활성화. opt-in — 기본 false.
    pub auto_lora_enabled: Option<bool>,
    /// 미학습 approve 카운트가 이 값 도달 시 자동 트리거. 기본 25.
    pub auto_lora_threshold: Option<u32>,
    /// 자동 학습 런타임 — "mlx-lm" 또는 "axolotl". 기본 "mlx-lm".
    pub auto_lora_runtime: Option<String>,
    /// 자동 학습 베이스 모델(HF id 또는 로컬 경로).
    pub auto_lora_base_model: Option<String>,
    /// 자동 학습 iters (기본 200).
    pub auto_lora_iters: Option<u32>,
    /// 자동 학습 LoRA rank (기본 8).
    pub auto_lora_rank: Option<u32>,
    /// 자동 학습 learning rate (기본 1e-5).
    pub auto_lora_lr: Option<f32>,
    /// 학습 완료 시 호환되면 즉시 hot-swap. 기본 true (활성화 됐을 때만 의미).
    pub auto_lora_auto_load: Option<bool>,
    /// 자동 학습 timeout(초). 기본 14400 (4시간). 이 시간 초과 시 child kill + Failed.
    pub auto_lora_timeout_secs: Option<u64>,

    // ── Phase 121: 툴바 표시 모드 ─────────────────────────────────────────
    /// 고급 기능 버튼을 툴바에 직접 노출. false면 "더보기" 팝오버에 숨김. 기본 false.
    pub toolbar_show_advanced: Option<bool>,

    // ── Phase 126: UI 환경설정 통합 (localStorage → config) ───────────────
    /// 파일 탐색기 사이드바 가시성. 기본 true (열림).
    pub ui_show_file_explorer: Option<bool>,
    /// 우측 Inspector 패널 가시성. 기본 true (열림).
    pub ui_show_inspector: Option<bool>,
    /// 우측 Inspector 밀도. "cozy" | "compact" (기본 cozy).
    pub ui_inspector_density: Option<String>,
    /// Welcome 힌트를 이미 본 적 있는지. true면 더 이상 표시 안 함. 기본 false.
    pub ui_hints_shown: Option<bool>,
    /// 입력 툴벨트 TIP 노출 여부. 기본 true.
    pub ui_show_input_toolbelt_tip: Option<bool>,
    /// 툴바를 단순 모드로 렌더링할지 여부. 기본 false.
    pub ui_compact_toolbar: Option<bool>,
    /// AI 채팅 패널 폰트 크기(px, 10~24). 기본 14.
    pub ui_ai_chat_font_size: Option<u32>,
    /// 사용자가 클릭한 적 있는 "신규" 기능 ID 목록. 미클릭 항목엔 dot 배지 표시.
    pub ui_seen_advanced_features: Option<Vec<String>>,

    // ── Phase 130-A: ReAct 데스크톱 제어 도구 안전 토글 ────────────────────
    /// true면 ReAct의 screenshot/click/type/key_combo 도구 허용. 기본 false (opt-in).
    pub react_desktop_tools_enabled: Option<bool>,
    /// true면 ReAct의 SCIP 정밀 도구(precise_* 계열) 허용. 기본 false (opt-in).
    pub react_scip_tools_enabled: Option<bool>,
    // ── Phase 133: ReAct Reflexion 1턴 자기검토 토글 ────────────────────────
    /// true면 최종 직전/상한 도달 시 자기검토 1회 수행. 기본 true.
    pub react_reflexion_enabled: Option<bool>,
    // ── Phase 129: ReAct 도구 화이트리스트 ───────────────────────────────────
    /// Act 모드에서 호출자가 config whitelist 적용을 명시했을 때만 사용할 도구 목록.
    /// 기본 실행은 stale 저장값을 무시하고 런타임 전달 whitelist를 우선한다.
    pub react_tool_whitelist: Option<Vec<String>>,
    // ── Phase 131: Recall 벡터 백엔드 프록시 ─────────────────────────────────
    /// Recall 검색 벡터 백엔드 ID. 기본 local-cosine.
    /// 향후 zVec 등 외부 DB 어댑터를 붙일 때 동일 키로 교체 가능.
    pub recall_vector_backend: Option<String>,
}

impl AppConfig {
    /// 현재 VRAM 사용 비율(0.0~1.0) — override 우선, 없으면 safety_mode 기본값, 없으면 0.80
    pub fn vram_utilization(&self) -> f32 {
        if let Some(o) = self.vram_cap_override {
            return o.clamp(0.50, 0.95);
        }
        match self.safety_mode.as_deref() {
            Some("safe") => 0.70,
            Some("max") => 0.90,
            _ => 0.80, // balanced(default)
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Default, Clone, PartialEq)]
pub struct QuickAction {
    pub id: String,
    pub label: String,
    pub command: String,
    /// 1-9 단축키 (선택)
    pub shortcut: Option<u8>,
}

impl AppConfig {
    /// 추론 서버 URL — 임베디드 모델 미로드 시 또는 macOS에서 mlx-lm 외부 서버를 쓸 때 사용.
    /// xllm_base_url config가 있으면 그 값, 없으면 기본 후보(8080/5000)에서 순서대로 사용.
    pub fn xllm_url(&self) -> String {
        self.xllm_url_candidates()
            .into_iter()
            .next()
            .unwrap_or_else(|| XLLM_DEFAULT_URL.to_string())
    }

    /// xLLM 후보 URL 목록. 사용자 override가 있으면 단일 값으로 고정.
    pub fn xllm_url_candidates(&self) -> Vec<String> {
        let mut urls: Vec<String> = self
            .xllm_base_url
            .as_deref()
            .map(normalize_xllm_url)
            .filter(|s| !s.is_empty())
            .into_iter()
            .collect();

        if urls.is_empty() {
            urls.extend(
                XLLM_DEFAULT_URLS
                    .iter()
                    .map(|u| u.to_string())
                    .collect::<Vec<_>>(),
            );
        }

        urls
    }

    /// 호환성용 alias — call site 정리 후 제거 예정.
    pub fn mistral_rs_url(&self) -> String {
        self.xllm_url()
    }

    /// Ollama 서버 URL — None이면 기본값 http://localhost:11434
    pub fn ollama_url(&self) -> String {
        self.ollama_base_url
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "http://localhost:11434".to_string())
    }
}

fn config_path() -> std::path::PathBuf {
    platform::home_dir().join(CONFIG_FILE)
}

pub fn load_config() -> Result<AppConfig> {
    let path = config_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            // Windows의 PowerShell Out-File 등이 박는 UTF-8 BOM 제거 — 없으면 그대로
            let stripped = content.strip_prefix('\u{feff}').unwrap_or(&content);
            match serde_json::from_str(stripped) {
                Ok(cfg) => Ok(cfg),
                Err(err) => {
                    // 설정 파싱 실패 시 앱 전체 동작을 멈추지 않기 위해 기본값으로 복구.
                    // 손상된 파일은 백업해 두고 다음 실행에서 정상 동작하도록 한다.
                    let mut backup = path.with_extension("json.bak");
                    if backup.exists() {
                        let mut i = 1_u32;
                        while backup.exists() {
                            backup = path.with_extension(format!("json.bak.{i}"));
                            i += 1;
                        }
                    }
                    let _ = std::fs::copy(&path, &backup);
                    eprintln!("config parse error: {err} (backup: {})", backup.display());
                    Ok(AppConfig::default())
                }
            }
        }
        Err(_) => Ok(AppConfig::default()),
    }
}

pub fn save_config(config: &AppConfig) -> Result<()> {
    let json = serde_json::to_string_pretty(config).map_err(|e| LumError::Config(e.to_string()))?;
    std::fs::write(config_path(), json).map_err(|e| LumError::Io(e.to_string()))
}

/// 프론트엔드에서 설정 조회
#[tauri::command]
pub fn load_app_config() -> Result<AppConfig> {
    load_config()
}

#[tauri::command]
pub fn check_onboarding_complete() -> Result<bool> {
    let config = load_config()?;
    Ok(config.onboarding_completed.unwrap_or(false))
}

#[tauri::command]
pub fn complete_onboarding() -> Result<()> {
    let mut config = load_config()?;
    config.onboarding_completed = Some(true);
    save_config(&config)
}

/// Phase 71: GPU 안전 모드 저장 (onboarding & 설정 패널)
#[tauri::command]
pub fn save_safety_mode(mode: String) -> Result<()> {
    let valid = matches!(mode.as_str(), "safe" | "balanced" | "max");
    if !valid {
        return Err(LumError::Config(format!("알 수 없는 safety_mode: {mode}")));
    }
    let mut config = load_config()?;
    config.safety_mode = Some(mode);
    // 모드 바뀌면 override 초기화 (명시적 슬라이더 조정 전까지 모드 기본값 적용)
    config.vram_cap_override = None;
    save_config(&config)
}

/// Phase 71: VRAM 상한 오버라이드 슬라이더 (0.50 ~ 0.95)
#[tauri::command]
pub fn save_vram_cap_override(cap: Option<f32>) -> Result<()> {
    let mut config = load_config()?;
    config.vram_cap_override = cap.map(|c| c.clamp(0.50, 0.95));
    save_config(&config)
}

/// 모델 다운로드 저장 경로 변경 — None이면 기본 `~/.lum_mistral_models` 복원
#[tauri::command]
pub fn save_model_download_dir(dir: Option<String>) -> Result<()> {
    let mut config = load_config()?;
    config.model_download_dir = dir;
    save_config(&config)
}

/// Phase 72: 모델 capability 토글 저장 (vision / reasoning)
#[tauri::command]
pub fn save_capability_toggles(
    vision_enabled: Option<bool>,
    show_reasoning: Option<bool>,
) -> Result<()> {
    let mut config = load_config()?;
    config.vision_enabled = vision_enabled;
    config.show_reasoning = show_reasoning;
    save_config(&config)
}

/// xLLM 최적화 설정 저장 (프론트엔드 → 파일)
#[tauri::command]
pub fn save_xllm_settings(
    app: tauri::AppHandle,
    cache_mode: Option<String>,
    coding_model: Option<String>,
    doc_model: Option<String>,
    pd_threshold_chars: Option<u32>,
    max_seq_len: Option<u32>,
    draft_model: Option<String>,
    speculative_n_draft: Option<u32>,
) -> Result<()> {
    use tauri::Emitter;
    let mut config = load_config()?;
    config.cache_mode = cache_mode;
    config.coding_model = coding_model;
    config.doc_model = doc_model;
    config.pd_threshold_chars = pd_threshold_chars;
    config.max_seq_len = max_seq_len;
    config.draft_model = draft_model;
    config.speculative_n_draft = speculative_n_draft;
    save_config(&config)?;
    let _ = app.emit("xllm_settings_saved", ());
    Ok(())
}

/// Quick Actions 저장
#[tauri::command]
pub fn save_quick_actions(actions: Vec<QuickAction>) -> Result<()> {
    let mut config = load_config()?;
    config.quick_actions = Some(actions);
    save_config(&config)
}

/// HuggingFace 토큰 저장 — 빈 문자열이면 삭제
#[tauri::command]
pub fn save_hf_token(token: String) -> Result<()> {
    let mut config = load_config()?;
    config.hf_token = if token.is_empty() { None } else { Some(token) };
    save_config(&config)
}

/// Ollama 서버 URL + 모델 저장
#[tauri::command]
pub fn save_ollama_settings(base_url: Option<String>, model: Option<String>) -> Result<()> {
    let mut config = load_config()?;
    config.ollama_base_url = base_url.filter(|s| !s.is_empty());
    config.ollama_model = model.filter(|s| !s.is_empty());
    save_config(&config)
}

/// Phase 128: xLLM(OpenAI 호환) 서버 URL만 단독 갱신. None/빈 문자열이면 제거(기본값 8080 폴백).
#[tauri::command]
pub fn save_xllm_base_url(base_url: Option<String>) -> Result<()> {
    let mut config = load_config()?;
    config.xllm_base_url = base_url
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty());
    save_config(&config)
}

/// Phase 120: 자동 학습 설정 저장. None인 필드는 그대로 유지(부분 갱신).
#[tauri::command]
pub fn save_auto_lora_settings(
    enabled: Option<bool>,
    threshold: Option<u32>,
    runtime: Option<String>,
    base_model: Option<String>,
    iters: Option<u32>,
    rank: Option<u32>,
    lr: Option<f32>,
    auto_load: Option<bool>,
) -> Result<()> {
    let mut config = load_config()?;
    if enabled.is_some() {
        config.auto_lora_enabled = enabled;
    }
    if let Some(t) = threshold {
        if !(1..=10_000).contains(&t) {
            return Err(LumError::Config("threshold는 1..=10000".into()));
        }
        config.auto_lora_threshold = Some(t);
    }
    if let Some(rt) = runtime {
        if !crate::commands::lora_forge::is_supported_runtime(&rt) {
            return Err(LumError::Config(format!("지원하지 않는 runtime: {rt}")));
        }
        config.auto_lora_runtime = Some(rt);
    }
    if base_model.is_some() {
        config.auto_lora_base_model = base_model.filter(|s| !s.trim().is_empty());
    }
    if let Some(i) = iters {
        if !(1..=10_000).contains(&i) {
            return Err(LumError::Config("iters는 1..=10000".into()));
        }
        config.auto_lora_iters = Some(i);
    }
    if let Some(r) = rank {
        if !(2..=64).contains(&r) {
            return Err(LumError::Config("rank는 2..=64".into()));
        }
        config.auto_lora_rank = Some(r);
    }
    if let Some(l) = lr {
        if !(l.is_finite() && l > 0.0 && l < 1.0) {
            return Err(LumError::Config("lr은 (0,1) 유한값".into()));
        }
        config.auto_lora_lr = Some(l);
    }
    if auto_load.is_some() {
        config.auto_lora_auto_load = auto_load;
    }
    save_config(&config)
}

/// Phase 121: 툴바 고급 모드 토글 영속.
#[tauri::command]
pub fn save_toolbar_show_advanced(show: bool) -> Result<()> {
    let mut config = load_config()?;
    config.toolbar_show_advanced = Some(show);
    save_config(&config)
}

/// Phase 126: 사용자가 "신규" 기능 ID를 클릭하면 dot 배지 제거 — 누적 dedup 저장.
#[tauri::command]
pub fn mark_advanced_feature_seen(feature_id: String) -> Result<()> {
    let id = feature_id.trim();
    if id.is_empty() {
        return Err(LumError::Config("feature_id 비어있음".into()));
    }
    let mut config = load_config()?;
    let mut seen = config.ui_seen_advanced_features.unwrap_or_default();
    if !seen.iter().any(|s| s == id) {
        seen.push(id.to_string());
    }
    config.ui_seen_advanced_features = Some(seen);
    save_config(&config)
}

/// Phase 126: UI 환경설정(파일탐색기/힌트/AI폰트) 부분 갱신. None인 필드는 유지.
#[tauri::command]
pub fn save_ui_preferences(
    show_file_explorer: Option<bool>,
    show_inspector: Option<bool>,
    inspector_density: Option<String>,
    hints_shown: Option<bool>,
    ai_chat_font_size: Option<u32>,
    show_input_toolbelt_tip: Option<bool>,
    ui_compact_toolbar: Option<bool>,
) -> Result<()> {
    let mut config = load_config()?;
    if show_file_explorer.is_some() {
        config.ui_show_file_explorer = show_file_explorer;
    }
    if show_inspector.is_some() {
        config.ui_show_inspector = show_inspector;
    }
    if let Some(density) = inspector_density {
        let normalized = density.trim().to_ascii_lowercase();
        if normalized != "cozy" && normalized != "compact" {
            return Err(LumError::Config(
                "inspector_density는 cozy | compact".into(),
            ));
        }
        config.ui_inspector_density = Some(normalized);
    }
    if hints_shown.is_some() {
        config.ui_hints_shown = hints_shown;
    }
    if show_input_toolbelt_tip.is_some() {
        config.ui_show_input_toolbelt_tip = show_input_toolbelt_tip;
    }
    if ui_compact_toolbar.is_some() {
        config.ui_compact_toolbar = ui_compact_toolbar;
    }
    if let Some(size) = ai_chat_font_size {
        if !(8..=32).contains(&size) {
            return Err(LumError::Config("font_size는 8..=32".into()));
        }
        config.ui_ai_chat_font_size = Some(size);
    }
    save_config(&config)
}

/// Phase 130-A: ReAct 데스크톱 도구 활성화 토글 저장.
#[tauri::command]
pub fn save_react_desktop_tools_enabled(enabled: bool) -> Result<()> {
    let mut config = load_config()?;
    config.react_desktop_tools_enabled = Some(enabled);
    save_config(&config)
}

/// Phase 142: SCIP 정밀 도구 opt-in 토글 저장.
#[tauri::command]
pub fn save_react_scip_tools_enabled(enabled: bool) -> Result<()> {
    let mut config = load_config()?;
    config.react_scip_tools_enabled = Some(enabled);
    save_config(&config)
}

/// Phase 133: ReAct Reflexion(자기검토) 활성화 토글 저장.
#[tauri::command]
pub fn save_react_reflexion_enabled(enabled: bool) -> Result<()> {
    let mut config = load_config()?;
    config.react_reflexion_enabled = Some(enabled);
    save_config(&config)
}

/// Phase 129: ReAct 도구 화이트리스트 저장.
#[tauri::command]
pub fn save_react_tool_whitelist(whitelist: Vec<String>) -> Result<()> {
    let mut config = load_config()?;
    let list: Vec<String> = whitelist
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    config.react_tool_whitelist = if list.is_empty() { None } else { Some(list) };
    save_config(&config)
}

/// Phase 131: Recall 벡터 백엔드 저장 (예: "local-cosine", "zvec")
fn normalize_recall_backend_for_storage(raw: Option<&str>) -> Option<String> {
    match crate::commands::recall_backend::normalize_requested_backend_key(raw).as_deref() {
        // 기본값은 override를 남기지 않는다.
        Some("local-cosine") | None => None,
        Some("zvec") => Some("zvec".into()),
        Some(_) => None,
    }
}

#[tauri::command]
pub fn save_recall_vector_backend(backend: Option<String>) -> Result<()> {
    let mut config = load_config()?;
    config.recall_vector_backend = normalize_recall_backend_for_storage(backend.as_deref());
    save_config(&config)
}

/// 터미널 테마/폰트 설정 저장
#[tauri::command]
pub fn save_terminal_appearance(
    theme: Option<String>,
    font_size: Option<u32>,
    font_family: Option<String>,
    opacity: Option<f64>,
) -> Result<()> {
    let mut config = load_config()?;
    config.theme = theme;
    config.font_size = font_size;
    config.font_family = font_family;
    config.opacity = opacity;
    save_config(&config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    static HOME_ENV_TEST_LOCK: Mutex<()> = Mutex::new(());

    struct HomeEnvGuard {
        old_home: Option<OsString>,
        #[cfg(windows)]
        user_profile: Option<OsString>,
    }

    impl HomeEnvGuard {
        fn set(home: &std::path::Path) -> Self {
            let home = std::ffi::OsString::from(home.to_string_lossy().into_owned());
            let old_home = std::env::var_os("HOME");
            #[cfg(windows)]
            let old_user_profile = std::env::var_os("USERPROFILE");
            std::env::set_var("HOME", &home);
            #[cfg(windows)]
            std::env::set_var("USERPROFILE", &home);
            Self {
                old_home,
                #[cfg(windows)]
                user_profile: old_user_profile,
            }
        }
    }

    impl Drop for HomeEnvGuard {
        fn drop(&mut self) {
            if let Some(home) = self.old_home.take() {
                std::env::set_var("HOME", home);
            } else {
                std::env::remove_var("HOME");
            }
            #[cfg(windows)]
            if let Some(user_profile) = self.user_profile.take() {
                std::env::set_var("USERPROFILE", user_profile);
            } else {
                std::env::remove_var("USERPROFILE");
            }
        }
    }

    fn with_temp_home<F, R>(f: F) -> R
    where
        F: FnOnce() -> R,
    {
        let _lock = HOME_ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let home = std::env::temp_dir().join(format!("lum_config_home_{nanos}"));
        std::fs::create_dir_all(&home).unwrap();

        let _guard = HomeEnvGuard::set(&home);
        let result = f();
        let _ = std::fs::remove_dir_all(&home);
        result
    }

    #[test]
    fn vram_utilization_default_balanced() {
        let cfg = AppConfig::default();
        assert!((cfg.vram_utilization() - 0.80).abs() < 1e-6);
    }

    #[test]
    fn vram_utilization_safety_mode_기본값() {
        let mut cfg = AppConfig::default();
        cfg.safety_mode = Some("safe".into());
        assert!((cfg.vram_utilization() - 0.70).abs() < 1e-6);
        cfg.safety_mode = Some("max".into());
        assert!((cfg.vram_utilization() - 0.90).abs() < 1e-6);
        cfg.safety_mode = Some("balanced".into());
        assert!((cfg.vram_utilization() - 0.80).abs() < 1e-6);
    }

    #[test]
    fn vram_utilization_override_우선() {
        let mut cfg = AppConfig::default();
        cfg.safety_mode = Some("safe".into());
        cfg.vram_cap_override = Some(0.85);
        assert!((cfg.vram_utilization() - 0.85).abs() < 1e-6);
    }

    #[test]
    fn load_config_strips_utf8_bom() {
        // 직접 디스크에 안 쓰고 strip 로직만 검증 — load_config 핵심 부분 시뮬레이션
        let content_with_bom = "\u{feff}{\"theme\":\"Solarized Dark\"}";
        let stripped = content_with_bom
            .strip_prefix('\u{feff}')
            .unwrap_or(content_with_bom);
        let cfg: AppConfig = serde_json::from_str(stripped).expect("BOM 제거 후 파싱 성공해야 함");
        assert_eq!(cfg.theme.as_deref(), Some("Solarized Dark"));
    }

    #[test]
    fn load_config_파싱_실패시_기본값으로_복구하고_백업_저장() {
        with_temp_home(|| {
            let bad = config_path();
            std::fs::write(&bad, "{invalid_json:").unwrap();
            let loaded = load_config().expect("기본값 복구용 로드");

            assert_eq!(loaded, AppConfig::default());

            let mut i = 0_u32;
            let mut found_backup = false;
            while i < 3 {
                let backup = if i == 0 {
                    bad.with_extension("json.bak")
                } else {
                    bad.with_extension(format!("json.bak.{i}"))
                };
                if backup.exists() {
                    found_backup = true;
                    break;
                }
                i += 1;
            }
            assert!(found_backup, "손상된 설정 파일 백업이 생성되어야 함");
        });
    }

    #[test]
    fn load_config_파싱_실패시_기존_백업_넘버_누적을_유지한다() {
        with_temp_home(|| {
            let bad = config_path();
            std::fs::write(&bad, "{invalid_json:").unwrap();

            // 이전 백업이 남아 있어도 충돌 없이 다음 번호로 누적해야 함.
            std::fs::write(bad.with_extension("json.bak"), "old").unwrap();
            std::fs::write(bad.with_extension("json.bak.1"), "old1").unwrap();

            let loaded = load_config().expect("기본값 복구용 로드");
            assert_eq!(loaded, AppConfig::default());

            assert!(bad.with_extension("json.bak").exists());
            assert!(bad.with_extension("json.bak.1").exists());
            assert!(bad.with_extension("json.bak.2").exists());
            assert!(!bad.with_extension("json.bak.3").exists());
        });
    }

    #[test]
    fn vram_utilization_override_clamp() {
        let mut cfg = AppConfig::default();
        cfg.vram_cap_override = Some(0.25); // below 0.50 → clamped to 0.50
        assert!((cfg.vram_utilization() - 0.50).abs() < 1e-6);
        cfg.vram_cap_override = Some(0.99); // above 0.95 → clamped to 0.95
        assert!((cfg.vram_utilization() - 0.95).abs() < 1e-6);
    }

    #[test]
    fn xllm_url_candidates는_기본_우선순위를_반영한다() {
        let cfg = AppConfig::default();
        assert_eq!(
            cfg.xllm_url_candidates(),
            vec![
                XLLM_DEFAULT_URL.to_string(),
                "http://127.0.0.1:5000".to_string()
            ]
        );
        assert_eq!(cfg.xllm_url(), XLLM_DEFAULT_URL.to_string());
    }

    #[test]
    fn xllm_url_candidates는_사용자_설정_단일값만_사용한다() {
        let mut cfg = AppConfig::default();
        cfg.xllm_base_url = Some("https://example.com/xllm/".to_string());
        assert_eq!(
            cfg.xllm_url_candidates(),
            vec!["https://example.com/xllm".to_string()]
        );
        assert_eq!(cfg.xllm_url(), "https://example.com/xllm".to_string());
    }

    #[test]
    fn normalize_recall_backend_for_storage_기본값은_none() {
        assert_eq!(normalize_recall_backend_for_storage(None), None);
        assert_eq!(
            normalize_recall_backend_for_storage(Some("local-cosine")),
            None
        );
        assert_eq!(normalize_recall_backend_for_storage(Some("cosine")), None);
        assert_eq!(normalize_recall_backend_for_storage(Some("custom-db")), None);
    }

    #[test]
    fn normalize_recall_backend_for_storage_zvec는_보존() {
        assert_eq!(
            normalize_recall_backend_for_storage(Some("zvec")).as_deref(),
            Some("zvec")
        );
        assert_eq!(
            normalize_recall_backend_for_storage(Some("z-vec")).as_deref(),
            Some("zvec")
        );
        assert_eq!(
            normalize_recall_backend_for_storage(Some("  Z_VEC  ")).as_deref(),
            Some("zvec")
        );
    }

    #[test]
    fn normalize_recall_backend_for_storage_별칭과_공백을_기본값으로_정규화() {
        assert_eq!(
            normalize_recall_backend_for_storage(Some(" LOCAL_COSINE ")),
            None
        );
        assert_eq!(
            normalize_recall_backend_for_storage(Some(" default ")),
            None
        );
    }
}
