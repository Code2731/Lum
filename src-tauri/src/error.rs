use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum LumError {
    #[error("IO Error: {0}")]
    Io(String),

    #[error("Tauri Error: {0}")]
    Tauri(String),

    #[error("AI Engine Error: {0}")]
    AiEngine(String),

    #[error("Network Error: {0}")]
    Network(String),

    #[error("Security Violation: {0}")]
    Security(String),

    #[error("Config Error: {0}")]
    Config(String),
}

// 명시적인 변환 구현 (thiserror와 serde 호환을 위해)
impl From<std::io::Error> for LumError {
    fn from(err: std::io::Error) -> Self {
        LumError::Io(err.to_string())
    }
}

impl From<tauri::Error> for LumError {
    fn from(err: tauri::Error) -> Self {
        LumError::Tauri(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, LumError>;
