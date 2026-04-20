use serde::{Deserialize, Serialize};
use crate::error::{Result, LumError};

const CONFIG_FILE: &str = ".lum_config.json";

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AppConfig {
    pub theme: Option<String>,
    pub font_size: Option<u32>,
    pub opacity: Option<f64>,
    pub accent_color: Option<String>,
    pub gemini_api_key: Option<String>,
    pub p2p_enabled: Option<bool>,
}

pub fn load_config() -> Result<AppConfig> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let path = format!("{}/{}", home, CONFIG_FILE);

    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).map_err(|e| LumError::Config(e.to_string())),
        Err(_) => Ok(AppConfig::default()),
    }
}
