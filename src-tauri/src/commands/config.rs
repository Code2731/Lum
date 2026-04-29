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
    /// 추론 서버 URL — Phase 85b 임베디드 mistralrs 전환 후 *폴백 path 전용*.
    /// 임베디드 모델 미로드 시에만 reqwest가 이 URL을 사용. 임베디드만 쓰는 환경에서는 dead.
    pub fn xllm_url(&self) -> String {
        "http://127.0.0.1:8080".to_string()
    }

    /// 호환성용 alias — call site 정리 후 제거 예정.
    pub fn mistral_rs_url(&self) -> String { self.xllm_url() }
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
