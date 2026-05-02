use crate::error::{LumError, Result};
use crate::platform;
use serde::{Deserialize, Serialize};

const CONFIG_FILE: &str = ".lum_config.json";

/// xLLM(TabbyAPI) 기본 주소 — 로컬 실행 기본값
pub const XLLM_DEFAULT_URL: &str = "http://127.0.0.1:5000";

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AppConfig {
    pub theme: Option<String>,
    pub font_size: Option<u32>,
    pub font_family: Option<String>,
    pub opacity: Option<f64>,
    pub accent_color: Option<String>,
    /// xLLM(TabbyAPI) 서버 주소 (기본값: http://127.0.0.1:5000)
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
    /// Welcome 힌트를 이미 본 적 있는지. true면 더 이상 표시 안 함. 기본 false.
    pub ui_hints_shown: Option<bool>,
    /// AI 채팅 패널 폰트 크기(px, 10~24). 기본 14.
    pub ui_ai_chat_font_size: Option<u32>,
    /// 사용자가 클릭한 적 있는 "신규" 기능 ID 목록. 미클릭 항목엔 dot 배지 표시.
    pub ui_seen_advanced_features: Option<Vec<String>>,
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

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct QuickAction {
    pub id: String,
    pub label: String,
    pub command: String,
    /// 1-9 단축키 (선택)
    pub shortcut: Option<u8>,
}

impl AppConfig {
    /// 추론 서버 URL — 임베디드 모델 미로드 시 또는 macOS에서 mlx-lm 외부 서버를 쓸 때 사용.
    /// xllm_base_url config가 있으면 그 값, 없으면 기본 127.0.0.1:8080 (mlx-lm/TabbyAPI 관행 포트).
    pub fn xllm_url(&self) -> String {
        self.xllm_base_url
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.trim_end_matches('/').to_string())
            .unwrap_or_else(|| "http://127.0.0.1:8080".to_string())
    }

    /// 호환성용 alias — call site 정리 후 제거 예정.
    pub fn mistral_rs_url(&self) -> String { self.xllm_url() }

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
    match std::fs::read_to_string(config_path()) {
        Ok(content) => {
            // Windows의 PowerShell Out-File 등이 박는 UTF-8 BOM 제거 — 없으면 그대로
            let stripped = content.strip_prefix('\u{feff}').unwrap_or(&content);
            serde_json::from_str(stripped).map_err(|e| LumError::Config(e.to_string()))
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
    hints_shown: Option<bool>,
    ai_chat_font_size: Option<u32>,
) -> Result<()> {
    let mut config = load_config()?;
    if show_file_explorer.is_some() {
        config.ui_show_file_explorer = show_file_explorer;
    }
    if hints_shown.is_some() {
        config.ui_hints_shown = hints_shown;
    }
    if let Some(size) = ai_chat_font_size {
        if !(8..=32).contains(&size) {
            return Err(LumError::Config("font_size는 8..=32".into()));
        }
        config.ui_ai_chat_font_size = Some(size);
    }
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
        let cfg: AppConfig =
            serde_json::from_str(stripped).expect("BOM 제거 후 파싱 성공해야 함");
        assert_eq!(cfg.theme.as_deref(), Some("Solarized Dark"));
    }

    #[test]
    fn vram_utilization_override_clamp() {
        let mut cfg = AppConfig::default();
        cfg.vram_cap_override = Some(0.25); // below 0.50 → clamped to 0.50
        assert!((cfg.vram_utilization() - 0.50).abs() < 1e-6);
        cfg.vram_cap_override = Some(0.99); // above 0.95 → clamped to 0.95
        assert!((cfg.vram_utilization() - 0.95).abs() < 1e-6);
    }
}
