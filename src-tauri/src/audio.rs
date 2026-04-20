#[tauri::command]
pub async fn start_voice_recording() -> Result<(), String> {
    Err("음성 녹음이 아직 구현되지 않았습니다. (cpal + Whisper STT 필요)".to_string())
}

#[tauri::command]
pub async fn stop_voice_recording() -> Result<String, String> {
    Err("음성 녹음이 아직 구현되지 않았습니다. (cpal + Whisper STT 필요)".to_string())
}
