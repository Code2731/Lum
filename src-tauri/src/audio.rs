use crate::platform;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;
use tokio::process::Command as TokioCommand;
use tokio::time::{Duration, timeout};

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

const VOICE_ERR_PREFIX: &str = "LUM_VOICE_ERROR";

fn voice_error(code: &str, message: impl AsRef<str>) -> String {
    format!("{VOICE_ERR_PREFIX}::{code}::{}", message.as_ref())
}

const DEFAULT_VOICE_START_CMD_TIMEOUT_MS: u64 = 8_000;
const DEFAULT_VOICE_STOP_CMD_TIMEOUT_MS: u64 = 12_000;
const TRANSCRIPT_STALE_TOLERANCE_MS: u64 = 1_000;

fn parse_voice_timeout_ms(env_key: &str, default_ms: u64) -> u64 {
    std::env::var(env_key)
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default_ms)
}

fn transcript_file_path() -> PathBuf {
    platform::home_dir()
        .join(".lum_whisper")
        .join("last_transcript.txt")
}

/// 전사 파일을 읽고, 유효한 텍스트면 반환 후 파일 삭제.
/// 빈 텍스트면 None.
fn read_transcript_file(path: &Path, min_modified_ms: u64) -> Option<String> {
    let Some(text) = std::fs::read_to_string(path)
        .ok()
        .map(|raw| raw.trim().to_string())
    else {
        return None;
    };

    let is_fresh = if min_modified_ms == 0 {
        true
    } else {
        if let Ok(meta) = std::fs::metadata(path) {
            if let Ok(modified) = meta.modified() {
                if let Ok(modified_ms) = modified
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                {
                    let min_modified_ms =
                        min_modified_ms.saturating_sub(TRANSCRIPT_STALE_TOLERANCE_MS);
                    modified_ms >= min_modified_ms
                } else {
                    true
                }
            } else {
                true
            }
        } else {
            true
        }
    };

    let _ = std::fs::remove_file(path);
    if text.is_empty() || !is_fresh {
        None
    } else {
        Some(text)
    }
}

async fn run_shell_capture(cmd: &str, timeout_ms: u64) -> Result<String, String> {
    let command = if cfg!(windows) {
        TokioCommand::new("cmd").args(["/C", cmd]).output()
    } else {
        TokioCommand::new("sh").args(["-c", cmd]).output()
    };

    let out = if timeout_ms == 0 {
        command
            .await
            .map_err(|e| voice_error("COMMAND_EXEC_FAILED", format!("명령 실행 실패: {e}")))?
    } else {
        timeout(Duration::from_millis(timeout_ms), command)
            .await
            .map_err(|_| {
                voice_error(
                    "COMMAND_TIMEOUT",
                    format!("명령 실행이 시간 제한을 초과했습니다 ({timeout_ms}ms): {cmd}"),
                )
            })?
            .map_err(|e| voice_error("COMMAND_EXEC_FAILED", format!("명령 실행 실패: {e}")))?
    };
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            voice_error(
                "COMMAND_EXIT_NON_ZERO",
                format!("명령이 비정상 종료되었습니다: {cmd}"),
            )
        } else {
            voice_error("COMMAND_STDERR", format!("명령 실행 오류: {stderr}"))
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// 음성 입력 시작.
/// 현재 구현은 상태 머신 + 외부 훅 오케스트레이션:
/// - `LUM_VOICE_START_CMD`가 있으면 실행 (예: 외부 녹음 프로세스 시작)
/// - 내부적으로 recording=true 상태만 관리
async fn start_voice_recording_inner() -> Result<(), String> {
    {
        let mut state = voice_state_lock()
            .lock()
            .map_err(|_| voice_error("STATE_LOCK_POISONED", "voice state lock poisoned"))?;
        if state.recording {
            return Err(voice_error(
                "ALREADY_RECORDING",
                "이미 음성 녹음이 진행 중입니다.",
            ));
        }
        state.recording = true;
        state.started_ms = now_ms();
    }

    // 이전 세션의 잔여 전사 파일을 남기면 잘못된 텍스트가 재사용될 수 있어 정리.
    let _ = std::fs::remove_file(transcript_file_path());

    if let Ok(cmd) = std::env::var("LUM_VOICE_START_CMD") {
        let trimmed = cmd.trim();
        if !trimmed.is_empty() {
            let timeout_ms = parse_voice_timeout_ms(
                "LUM_VOICE_START_CMD_TIMEOUT_MS",
                DEFAULT_VOICE_START_CMD_TIMEOUT_MS,
            );
            if let Err(e) = run_shell_capture(trimmed, timeout_ms).await {
                // 외부 훅 실패면 녹음 상태 롤백.
                let mut state = voice_state_lock()
                    .lock()
                    .map_err(|_| voice_error("STATE_LOCK_POISONED", "voice state lock poisoned"))?;
                state.recording = false;
                state.started_ms = 0;
                return Err(voice_error(
                    "START_HOOK_FAILED",
                    format!("음성 시작 훅 실패: {e}"),
                ));
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn start_voice_recording(app: tauri::AppHandle) -> Result<(), String> {
    match start_voice_recording_inner().await {
        Ok(()) => {
            let _ = app.emit("voice_recording_state", true);
            Ok(())
        }
        Err(e) => {
            // 이미 녹음 중인 경우 등에도 프론트 상태를 정확히 동기화한다.
            if let Ok(on) = voice_recording_status() {
                let _ = app.emit("voice_recording_state", on);
            }
            Err(e)
        }
    }
}

/// 현재 녹음 진행 상태 조회.
#[tauri::command]
pub fn voice_recording_status() -> Result<bool, String> {
    let state = voice_state_lock()
        .lock()
        .map_err(|_| voice_error("STATE_LOCK_POISONED", "voice state lock poisoned"))?;
    Ok(state.recording)
}

/// 음성 입력 중지 + 텍스트 반환.
/// 우선순위:
/// 1) `LUM_VOICE_STOP_CMD` stdout (외부 STT 파이프라인)
/// 2) `~/.lum_whisper/last_transcript.txt` 파일
/// 없으면 명확한 에러 반환.
async fn stop_voice_recording_inner() -> Result<String, String> {
    let started_ms = {
        let mut state = voice_state_lock()
            .lock()
            .map_err(|_| voice_error("STATE_LOCK_POISONED", "voice state lock poisoned"))?;
        if !state.recording {
            return Err(voice_error(
                "NOT_RECORDING",
                "현재 진행 중인 음성 녹음이 없습니다.",
            ));
        }
        let started_ms = state.started_ms;
        state.recording = false;
        state.started_ms = 0;
        started_ms
    };

    if let Ok(cmd) = std::env::var("LUM_VOICE_STOP_CMD") {
        let trimmed = cmd.trim();
        if !trimmed.is_empty() {
            let out = run_shell_capture(
                trimmed,
                parse_voice_timeout_ms(
                    "LUM_VOICE_STOP_CMD_TIMEOUT_MS",
                    DEFAULT_VOICE_STOP_CMD_TIMEOUT_MS,
                ),
            )
            .await;
            match out {
                Ok(out) if !out.is_empty() => return Ok(out),
                Ok(_) => {}
                Err(err) => {
                    let path = transcript_file_path();
                    if let Some(t) = read_transcript_file(&path, started_ms) {
                        return Ok(t);
                    }
                    return Err(err);
                }
            }
        }
    }

    let path = transcript_file_path();
    if let Some(t) = read_transcript_file(&path, started_ms) {
        return Ok(t);
    }

    Err(voice_error(
        "TRANSCRIPT_NOT_FOUND",
        "음성 인식 결과를 찾지 못했습니다. LUM_VOICE_STOP_CMD 또는 ~/.lum_whisper/last_transcript.txt를 설정하세요.",
    ))
}

/// 음성 입력 중지 + 텍스트 반환 + 전사 이벤트 emit.
#[tauri::command]
pub async fn stop_voice_recording(app: tauri::AppHandle) -> Result<String, String> {
    let result = stop_voice_recording_inner().await;
    // 실패 케이스에서도 녹음 종료 상태를 전파해 UI를 일관되게 유지한다.
    let _ = app.emit("voice_recording_state", false);
    if let Ok(text) = &result {
        let _ = app.emit("voice_transcript", text.clone());
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // voice_state + 환경변수(LUM_VOICE_*)는 글로벌 — 병렬 시 race.
    // 모든 audio 테스트를 직렬화.
    static AUDIO_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn reset_state() {
        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = false;
            s.started_ms = 0;
        }
    }

    #[tokio::test]
    async fn double_start_거부() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::remove_var("LUM_VOICE_START_CMD");
        let r1 = start_voice_recording_inner().await;
        assert!(r1.is_ok());
        let r2 = start_voice_recording_inner().await;
        assert!(
            r2.unwrap_err()
                .contains("LUM_VOICE_ERROR::ALREADY_RECORDING::"),
            "already recording 에러 코드가 포함되어야 함"
        );
        reset_state();
    }

    #[tokio::test]
    async fn stop_without_start_거부() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        let r = stop_voice_recording_inner().await;
        assert!(
            r.unwrap_err().contains("LUM_VOICE_ERROR::NOT_RECORDING::"),
            "not recording 에러 코드가 포함되어야 함"
        );
    }

    #[test]
    fn voice_recording_status_상태_반영() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        assert_eq!(voice_recording_status().ok(), Some(false));
        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = true;
        }
        assert_eq!(voice_recording_status().ok(), Some(true));
        reset_state();
    }

    #[test]
    fn read_transcript_file_정상_반환_후_삭제() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let base = std::env::temp_dir().join(format!(
            "lum_voice_test_{}_{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&base).unwrap();
        let f = base.join("last_transcript.txt");
        std::fs::write(&f, "  git status  ").unwrap();
        let out = read_transcript_file(&f, 0);
        assert_eq!(out.as_deref(), Some("git status"));
        assert!(!f.exists(), "읽은 뒤 파일이 삭제되어야 함");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[tokio::test]
    async fn stale_transcript_파일은_시작시각_이전이면_무시() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::set_var("LUM_VOICE_STOP_CMD", "exit 0");

        let tmp_home = std::env::temp_dir().join(format!(
            "lum_voice_home_{}_{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&tmp_home).unwrap();
        let old_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &tmp_home);

        let path = transcript_file_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&path, "  stale transcript  ").unwrap();
        if let Ok(mut state) = voice_state_lock().lock() {
            state.recording = true;
            state.started_ms = now_ms().saturating_add(5_000);
        }

        let result = stop_voice_recording_inner().await;
        assert!(
            result
                .unwrap_err()
                .contains("LUM_VOICE_ERROR::TRANSCRIPT_NOT_FOUND::"),
            "시작시각 이후 파일만 fallback해야 합니다."
        );

        assert!(!path.exists(), "폴백 판정 후 파일은 삭제되어야 합니다.");
        std::env::remove_var("LUM_VOICE_STOP_CMD");
        if let Some(home) = old_home {
            std::env::set_var("HOME", home);
        } else {
            std::env::remove_var("HOME");
        }
        reset_state();
    }

    #[test]
    fn parse_voice_timeout_ms_기본값_및_잘못된_값_보완() {
        std::env::remove_var("LUM_VOICE_START_CMD_TIMEOUT_MS");
        assert_eq!(
            parse_voice_timeout_ms("LUM_VOICE_START_CMD_TIMEOUT_MS", 9_000),
            9_000
        );

        std::env::set_var("LUM_VOICE_START_CMD_TIMEOUT_MS", "abc");
        assert_eq!(
            parse_voice_timeout_ms("LUM_VOICE_START_CMD_TIMEOUT_MS", 9_000),
            9_000
        );

        std::env::set_var("LUM_VOICE_START_CMD_TIMEOUT_MS", "15000");
        assert_eq!(
            parse_voice_timeout_ms("LUM_VOICE_START_CMD_TIMEOUT_MS", 9_000),
            15_000
        );

        std::env::set_var("LUM_VOICE_START_CMD_TIMEOUT_MS", "0");
        assert_eq!(
            parse_voice_timeout_ms("LUM_VOICE_START_CMD_TIMEOUT_MS", 9_000),
            9_000
        );
        std::env::remove_var("LUM_VOICE_START_CMD_TIMEOUT_MS");
    }

    #[tokio::test]
    async fn start_hook_실패_시_상태_복구() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::set_var("LUM_VOICE_START_CMD", "exit 1");

        let result = start_voice_recording_inner().await;
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .contains("LUM_VOICE_ERROR::START_HOOK_FAILED::")
        );
        assert_eq!(voice_recording_status().ok(), Some(false));

        std::env::remove_var("LUM_VOICE_START_CMD");
        reset_state();
    }

    #[tokio::test]
    async fn stop_cmd_빈출력_시_파일_폴백() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::set_var("LUM_VOICE_STOP_CMD", "exit 0");

        let tmp_home = std::env::temp_dir().join(format!(
            "lum_voice_home_{}_{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&tmp_home).unwrap();
        let old_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &tmp_home);

        let path = transcript_file_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&path, "  git status  ").unwrap();

        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = true;
        }
        let result = stop_voice_recording_inner().await;
        assert_eq!(result.ok(), Some("git status".to_string()));
        assert!(!path.exists(), "폴백 파일은 읽은 뒤 삭제되어야 합니다.");

        std::env::remove_var("LUM_VOICE_STOP_CMD");
        if let Some(home) = old_home {
            std::env::set_var("HOME", home);
        } else {
            std::env::remove_var("HOME");
        }
        reset_state();
    }

    #[tokio::test]
    async fn stop_cmd_실패해도_파일_폴백_가능() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::set_var("LUM_VOICE_STOP_CMD", "exit 1");

        let tmp_home = std::env::temp_dir().join(format!(
            "lum_voice_home_{}_{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&tmp_home).unwrap();
        let old_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &tmp_home);

        let path = transcript_file_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&path, "  fallback on error  ").unwrap();

        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = true;
        }
        let result = stop_voice_recording_inner().await;
        assert_eq!(result.ok(), Some("fallback on error".to_string()));
        assert!(!path.exists(), "폴백 파일은 읽은 뒤 삭제되어야 합니다.");

        std::env::remove_var("LUM_VOICE_STOP_CMD");
        if let Some(home) = old_home {
            std::env::set_var("HOME", home);
        } else {
            std::env::remove_var("HOME");
        }
        reset_state();
    }

    #[tokio::test]
    async fn stop_transcript_missing_코드_반환() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::remove_var("LUM_VOICE_STOP_CMD");
        let path = transcript_file_path();
        let _ = std::fs::remove_file(path);
        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = true;
        }
        let r = stop_voice_recording_inner().await;
        assert!(
            r.unwrap_err()
                .contains("LUM_VOICE_ERROR::TRANSCRIPT_NOT_FOUND::"),
            "transcript missing 에러 코드가 포함되어야 함"
        );
    }
}
