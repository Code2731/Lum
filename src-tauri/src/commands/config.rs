use serde::{Deserialize, Serialize};
use crate::error::{Result, LumError};
use crate::platform;

const CONFIG_FILE: &str = ".lum_config.json";

/// xLLM(TabbyAPI) 기본 주소 — 로컬 실행 기본값
pub const XLLM_DEFAULT_URL: &str = "http://127.0.0.1:5000";

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AppConfig {
    pub theme: Option<String>,
    pub font_size: Option<u32>,
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
