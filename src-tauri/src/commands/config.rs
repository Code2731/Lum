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
    /// xLLM 모델 저장 디렉토리 (기본값: ~/tabby/models)
    pub xllm_models_dir: Option<String>,
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

    // ── Phase 37: SSD / Sparse Attention / EPD ──────────────────────────────
    /// ④ SSD 드래프트 모델명 (예: DeepSeek-Coder-1.3B-Instruct-EXL2)
    pub draft_model: Option<String>,
    /// ④ SSD 드래프트 토큰 수 (기본 5) — 클수록 빠르지만 적중률 의존
    pub speculative_n_draft: Option<u32>,
    /// ⑤ Dynamic Sparse Attention 활성화
    pub sparse_attention: Option<bool>,
    /// ⑤ Sparse Attention top-k 헤드 수 (기본 64)
    pub sparse_top_k: Option<u32>,
    /// 온보딩 완료 여부 — false면 첫 실행 마법사 표시
    pub onboarding_completed: Option<bool>,
    /// Quick Actions — 즐겨찾기 커맨드 목록
    pub quick_actions: Option<Vec<QuickAction>>,
    /// HuggingFace 액세스 토큰 — EXL2 모델 다운로드용 (한 번만 입력)
    pub hf_token: Option<String>,
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
    /// xLLM 서버 기본 URL 반환 (설정 없으면 로컬 기본값)
    pub fn xllm_url(&self) -> String {
        self.xllm_base_url
            .clone()
            .unwrap_or_else(|| XLLM_DEFAULT_URL.to_string())
    }
}

fn config_path() -> std::path::PathBuf {
    platform::home_dir().join(CONFIG_FILE)
}

pub fn load_config() -> Result<AppConfig> {
    match std::fs::read_to_string(config_path()) {
        Ok(content) => serde_json::from_str(&content).map_err(|e| LumError::Config(e.to_string())),
        Err(_) => Ok(AppConfig::default()),
    }
}

pub fn save_config(config: &AppConfig) -> Result<()> {
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| LumError::Config(e.to_string()))?;
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

/// xLLM 최적화 설정 저장 (프론트엔드 → 파일)
#[tauri::command]
pub fn save_xllm_settings(
    server_url: Option<String>,
    cache_mode: Option<String>,
    coding_model: Option<String>,
    doc_model: Option<String>,
    pd_threshold_chars: Option<u32>,
    max_seq_len: Option<u32>,
    draft_model: Option<String>,
    speculative_n_draft: Option<u32>,
    sparse_attention: Option<bool>,
    sparse_top_k: Option<u32>,
) -> Result<()> {
    let mut config = load_config()?;
    config.xllm_base_url = server_url.filter(|s| !s.is_empty());
    config.cache_mode = cache_mode;
    config.coding_model = coding_model;
    config.doc_model = doc_model;
    config.pd_threshold_chars = pd_threshold_chars;
    config.max_seq_len = max_seq_len;
    config.draft_model = draft_model;
    config.speculative_n_draft = speculative_n_draft;
    config.sparse_attention = sparse_attention;
    config.sparse_top_k = sparse_top_k;
    save_config(&config)
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
