use thiserror::Error;
use serde::{Serialize, SerializeStruct};

#[derive(Error, Debug)]
pub enum LumError {
    #[error("IO Error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Tauri Error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("AI Engine Error: {0}")]
    AiEngine(String),

    #[error("Network Error: {0}")]
    Network(String),

    #[error("Security Violation: {0}")]
    Security(String),

    #[error("Config Error: {0}")]
    Config(String),
}

impl Serialize for LumError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut state = serializer.serialize_struct("LumError", 2)?;
        state.serialize_field("type", &format!("{:?}", self))?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type Result<T> = std::result::Result<T, LumError>;
