use crate::platform;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tokio::process::Command as TokioCommand;

#[derive(Debug, Default, Clone)]
struct VoiceState {
    recording: bool,
    started_ms: u64,
}

static VOICE_STATE: OnceLock<Mutex<VoiceState>> = OnceLock::new();

fn voice_state_lock() -> &'static Mutex<VoiceState> {
    VOICE_STATE.get_or_init(|| Mutex::new(VoiceState::default()))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn transcript_file_path() -> PathBuf {
    platform::home_dir()
        .join(".lum_whisper")
        .join("last_transcript.txt")
}

async fn run_shell_capture(cmd: &str) -> Result<String, String> {
    let out = if cfg!(windows) {
        TokioCommand::new("cmd")
            .args(["/C", cmd])
            .output()
            .await
            .map_err(|e| format!("명령 실행 실패: {e}"))?
    } else {
        TokioCommand::new("sh")
            .args(["-c", cmd])
            .output()
            .await
            .map_err(|e| format!("명령 실행 실패: {e}"))?
    };
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("명령이 비정상 종료되었습니다: {cmd}")
        } else {
            format!("명령 실행 오류: {stderr}")
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// 음성 입력 시작.
/// 현재 구현은 상태 머신 + 외부 훅 오케스트레이션:
/// - `LUM_VOICE_START_CMD`가 있으면 실행 (예: 외부 녹음 프로세스 시작)
/// - 내부적으로 recording=true 상태만 관리
#[tauri::command]
pub async fn start_voice_recording() -> Result<(), String> {
    {
        let mut state = voice_state_lock()
            .lock()
            .map_err(|_| "voice state lock poisoned".to_string())?;
        if state.recording {
            return Err("이미 음성 녹음이 진행 중입니다.".to_string());
        }
        state.recording = true;
        state.started_ms = now_ms();
    }

    if let Ok(cmd) = std::env::var("LUM_VOICE_START_CMD") {
        let trimmed = cmd.trim();
        if !trimmed.is_empty() {
            if let Err(e) = run_shell_capture(trimmed).await {
                // 외부 훅 실패면 녹음 상태 롤백.
                let mut state = voice_state_lock()
                    .lock()
                    .map_err(|_| "voice state lock poisoned".to_string())?;
                state.recording = false;
                state.started_ms = 0;
                return Err(format!("음성 시작 훅 실패: {e}"));
            }
        }
    }

    Ok(())
}

/// 음성 입력 중지 + 텍스트 반환.
/// 우선순위:
/// 1) `LUM_VOICE_STOP_CMD` stdout (외부 STT 파이프라인)
/// 2) `~/.lum_whisper/last_transcript.txt` 파일
/// 없으면 명확한 에러 반환.
#[tauri::command]
pub async fn stop_voice_recording() -> Result<String, String> {
    {
        let mut state = voice_state_lock()
            .lock()
            .map_err(|_| "voice state lock poisoned".to_string())?;
        if !state.recording {
            return Err("현재 진행 중인 음성 녹음이 없습니다.".to_string());
        }
        state.recording = false;
        state.started_ms = 0;
    }

    if let Ok(cmd) = std::env::var("LUM_VOICE_STOP_CMD") {
        let trimmed = cmd.trim();
        if !trimmed.is_empty() {
            let out = run_shell_capture(trimmed).await?;
            if !out.is_empty() {
                return Ok(out);
            }
        }
    }

    let path = transcript_file_path();
    if let Ok(text) = std::fs::read_to_string(&path) {
        let trimmed = text.trim().to_string();
        let _ = std::fs::remove_file(&path);
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }

    Err(
        "음성 인식 결과를 찾지 못했습니다. LUM_VOICE_STOP_CMD 또는 ~/.lum_whisper/last_transcript.txt를 설정하세요."
            .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reset_state() {
        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = false;
            s.started_ms = 0;
        }
    }

    #[tokio::test]
    async fn double_start_거부() {
        reset_state();
        std::env::remove_var("LUM_VOICE_START_CMD");
        let r1 = start_voice_recording().await;
        assert!(r1.is_ok());
        let r2 = start_voice_recording().await;
        assert!(r2.is_err());
        reset_state();
    }

    #[tokio::test]
    async fn stop_without_start_거부() {
        reset_state();
        let r = stop_voice_recording().await;
        assert!(r.is_err());
    }
}
