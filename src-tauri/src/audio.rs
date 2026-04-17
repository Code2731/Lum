#[tauri::command]
pub async fn start_voice_recording() -> Result<(), String> {
    // 실제 구현: cpal을 사용한 오디오 스트림 시작
    println!("Voice recording started...");
    Ok(())
}

#[tauri::command]
pub async fn stop_voice_recording() -> Result<String, String> {
    // 실제 구현: 오디오 데이터 처리 및 Whisper STT 호출
    println!("Voice recording stopped. Transcribing...");
    // 시뮬레이션 결과 반환
    Ok("최근 프로젝트 변경 사항을 요약해줘".to_string())
}
