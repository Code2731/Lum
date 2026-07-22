use crate::platform;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Emitter;
use tokio::process::Command as TokioCommand;
use tokio::time::{timeout, Duration};

#[derive(Debug, Default, Clone)]
struct VoiceState {
    recording: bool,
    started_ms: u64,
    stopping: bool,
    session_id: u64,
}

static VOICE_STATE: OnceLock<Mutex<VoiceState>> = OnceLock::new();

/// CPAL의 macOS Stream은 Send가 아니다. 별도 스레드가 Stream을 소유하고,
/// Tauri 명령은 안전한 채널로 시작/종료만 요청한다.
struct CapturedVoiceSamples {
    samples: Arc<Mutex<Vec<f32>>>,
    sample_rate: u32,
}

struct NativeVoiceCaptureController {
    stop_tx: std::sync::mpsc::Sender<std::sync::mpsc::Sender<Result<CapturedVoiceSamples, String>>>,
}

static NATIVE_VOICE_CAPTURE: OnceLock<Mutex<Option<NativeVoiceCaptureController>>> =
    OnceLock::new();

fn native_voice_capture_lock() -> &'static Mutex<Option<NativeVoiceCaptureController>> {
    NATIVE_VOICE_CAPTURE.get_or_init(|| Mutex::new(None))
}

fn voice_state_lock() -> &'static Mutex<VoiceState> {
    VOICE_STATE.get_or_init(|| Mutex::new(VoiceState::default()))
}

fn set_voice_state(recording: bool, started_ms: u64) -> Result<(), String> {
    let mut state = voice_state_lock()
        .lock()
        .map_err(|_| voice_error("STATE_LOCK_POISONED", "voice state lock poisoned"))?;
    state.recording = recording;
    state.started_ms = started_ms;
    state.stopping = false;
    Ok(())
}

fn finish_stop(recording: bool, started_ms: u64) -> Result<(), String> {
    let mut state = voice_state_lock()
        .lock()
        .map_err(|_| voice_error("STATE_LOCK_POISONED", "voice state lock poisoned"))?;
    state.recording = recording;
    state.started_ms = started_ms;
    state.stopping = false;
    Ok(())
}

fn mark_recording_started() -> Result<u64, String> {
    let mut state = voice_state_lock()
        .lock()
        .map_err(|_| voice_error("STATE_LOCK_POISONED", "voice state lock poisoned"))?;
    if state.stopping {
        return Err(voice_error(
            "TRANSITION_IN_PROGRESS",
            "이전 음성 녹음 종료 처리 중입니다. 잠시 후 다시 시도하세요.",
        ));
    }
    if state.recording {
        return Err(voice_error(
            "ALREADY_RECORDING",
            "이미 음성 녹음이 진행 중입니다.",
        ));
    }
    let started_ms = now_ms();
    state.session_id = state.session_id.saturating_add(1);
    state.recording = true;
    state.started_ms = started_ms;
    Ok(started_ms)
}

fn mark_recording_stopped() -> Result<u64, String> {
    let mut state = voice_state_lock()
        .lock()
        .map_err(|_| voice_error("STATE_LOCK_POISONED", "voice state lock poisoned"))?;
    if state.stopping {
        return Err(voice_error(
            "TRANSITION_IN_PROGRESS",
            "이전 음성 녹음 종료 처리 중입니다. 잠시 후 다시 시도하세요.",
        ));
    }
    if !state.recording {
        return Err(voice_error(
            "NOT_RECORDING",
            "현재 진행 중인 음성 녹음이 없습니다.",
        ));
    }
    let started_ms = state.started_ms;
    state.recording = false;
    state.started_ms = 0;
    state.stopping = true;
    Ok(started_ms)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn voice_state_snapshot() -> Result<VoiceState, String> {
    voice_state_lock()
        .lock()
        .map(|state| state.clone())
        .map_err(|_| voice_error("STATE_LOCK_POISONED", "voice state lock poisoned"))
}

const VOICE_ERR_PREFIX: &str = "LUM_VOICE_ERROR";

fn voice_error(code: &str, message: impl AsRef<str>) -> String {
    format!("{VOICE_ERR_PREFIX}::{code}::{}", message.as_ref())
}

const DEFAULT_VOICE_START_CMD_TIMEOUT_MS: u64 = 8_000;
const DEFAULT_VOICE_STOP_CMD_TIMEOUT_MS: u64 = 12_000;
const DEFAULT_VOICE_TRANSCRIPT_WAIT_MS: u64 = 2_000;
const TRANSCRIPT_STALE_TOLERANCE_MS: u64 = 1_000;

fn parse_voice_timeout_ms(env_key: &str, default_ms: u64) -> u64 {
    std::env::var(env_key)
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default_ms)
}

fn voice_transcript_wait_ms() -> u64 {
    parse_voice_timeout_ms(
        "LUM_VOICE_TRANSCRIPT_WAIT_MS",
        DEFAULT_VOICE_TRANSCRIPT_WAIT_MS,
    )
}

fn transcript_file_path() -> PathBuf {
    platform::home_dir()
        .join(".lum_whisper")
        .join("last_transcript.txt")
}

fn voice_recordings_dir() -> PathBuf {
    platform::home_dir().join(".lum_whisper").join("recordings")
}

fn default_whisper_model_path() -> PathBuf {
    platform::home_dir()
        .join(".lum_whisper")
        .join("models")
        .join("ggml-base.bin")
}

fn default_whisper_cli_path() -> PathBuf {
    let name = if cfg!(windows) {
        "whisper-cli.exe"
    } else {
        "whisper-cli"
    };
    platform::home_dir().join(".lum_whisper").join(name)
}

const DEFAULT_NATIVE_MAX_SECONDS: u32 = 10 * 60;

fn native_max_samples(sample_rate: u32) -> usize {
    let seconds = std::env::var("LUM_VOICE_NATIVE_MAX_SECONDS")
        .ok()
        .and_then(|raw| raw.trim().parse::<u32>().ok())
        .filter(|seconds| *seconds > 0)
        .unwrap_or(DEFAULT_NATIVE_MAX_SECONDS);
    sample_rate
        .saturating_mul(seconds)
        .try_into()
        .unwrap_or(usize::MAX)
}

fn append_native_samples(target: &Arc<Mutex<Vec<f32>>>, data: &[f32], channels: usize, cap: usize) {
    if channels == 0 {
        return;
    }
    let Ok(mut samples) = target.lock() else {
        return;
    };
    if samples.len() >= cap {
        return;
    }
    for frame in data.chunks(channels) {
        let mixed = frame.iter().copied().sum::<f32>() / frame.len() as f32;
        samples.push(mixed.clamp(-1.0, 1.0));
        if samples.len() >= cap {
            break;
        }
    }
}

fn create_native_input_stream() -> Result<(cpal::Stream, Arc<Mutex<Vec<f32>>>, u32), String> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or_else(|| {
        voice_error(
            "INPUT_DEVICE_UNAVAILABLE",
            "사용 가능한 기본 마이크를 찾지 못했습니다.",
        )
    })?;
    let supported = device.default_input_config().map_err(|e| {
        voice_error(
            "INPUT_CONFIG_UNAVAILABLE",
            format!("마이크 설정을 읽지 못했습니다: {e}"),
        )
    })?;
    let sample_format = supported.sample_format();
    let config: StreamConfig = supported.into();
    let channels = config.channels as usize;
    let sample_rate = config.sample_rate.0;
    let samples = Arc::new(Mutex::new(Vec::new()));
    let cap = native_max_samples(sample_rate);
    let err_fn = |err| eprintln!("LUM native voice input stream error: {err}");

    let stream = match sample_format {
        SampleFormat::F32 => {
            let target = Arc::clone(&samples);
            device.build_input_stream(
                &config,
                move |data: &[f32], _| {
                    append_native_samples(&target, data, channels, cap);
                },
                err_fn,
                None,
            )
        }
        SampleFormat::I16 => {
            let target = Arc::clone(&samples);
            device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    let converted: Vec<f32> =
                        data.iter().map(|v| *v as f32 / i16::MAX as f32).collect();
                    append_native_samples(&target, &converted, channels, cap);
                },
                err_fn,
                None,
            )
        }
        SampleFormat::U16 => {
            let target = Arc::clone(&samples);
            device.build_input_stream(
                &config,
                move |data: &[u16], _| {
                    let converted: Vec<f32> = data
                        .iter()
                        .map(|v| (*v as f32 - 32768.0) / 32768.0)
                        .collect();
                    append_native_samples(&target, &converted, channels, cap);
                },
                err_fn,
                None,
            )
        }
        format => {
            return Err(voice_error(
                "INPUT_FORMAT_UNSUPPORTED",
                format!("지원하지 않는 마이크 샘플 형식입니다: {format:?}"),
            ))
        }
    }
    .map_err(|e| {
        voice_error(
            "INPUT_STREAM_CREATE_FAILED",
            format!("마이크 스트림을 열지 못했습니다: {e}"),
        )
    })?;

    Ok((stream, samples, sample_rate))
}

fn start_native_voice_capture() -> Result<(), String> {
    let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel(1);
    let (stop_tx, stop_rx) =
        std::sync::mpsc::channel::<std::sync::mpsc::Sender<Result<CapturedVoiceSamples, String>>>();
    std::thread::Builder::new()
        .name("lum-native-voice".into())
        .spawn(move || {
            let (stream, samples, sample_rate) = match create_native_input_stream() {
                Ok(capture) => capture,
                Err(err) => {
                    let _ = ready_tx.send(Err(err));
                    return;
                }
            };
            if let Err(err) = stream.play() {
                let _ = ready_tx.send(Err(voice_error(
                    "INPUT_STREAM_START_FAILED",
                    format!("마이크를 시작하지 못했습니다: {err}"),
                )));
                return;
            }
            let _ = ready_tx.send(Ok(()));
            if let Ok(reply_tx) = stop_rx.recv() {
                // stream은 이 스레드에서 drop되어 CoreAudio 캡처가 즉시 멈춘다.
                drop(stream);
                let _ = reply_tx.send(Ok(CapturedVoiceSamples {
                    samples,
                    sample_rate,
                }));
            }
        })
        .map_err(|e| {
            voice_error(
                "INPUT_THREAD_CREATE_FAILED",
                format!("마이크 스레드를 시작하지 못했습니다: {e}"),
            )
        })?;

    ready_rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| voice_error("INPUT_START_TIMEOUT", "마이크 시작 시간이 초과되었습니다."))??;
    let mut slot = native_voice_capture_lock()
        .lock()
        .map_err(|_| voice_error("STATE_LOCK_POISONED", "native voice capture lock poisoned"))?;
    *slot = Some(NativeVoiceCaptureController { stop_tx });
    Ok(())
}

fn take_native_voice_capture() -> Result<Option<CapturedVoiceSamples>, String> {
    let controller = native_voice_capture_lock()
        .lock()
        .map_err(|_| voice_error("STATE_LOCK_POISONED", "native voice capture lock poisoned"))
        .map(|mut slot| slot.take())?;
    let Some(controller) = controller else {
        return Ok(None);
    };
    let (reply_tx, reply_rx) = std::sync::mpsc::channel();
    controller.stop_tx.send(reply_tx).map_err(|_| {
        voice_error(
            "INPUT_THREAD_STOP_FAILED",
            "마이크 캡처 스레드가 이미 종료되었습니다.",
        )
    })?;
    reply_rx
        .recv_timeout(Duration::from_secs(3))
        .map_err(|_| {
            voice_error(
                "INPUT_STOP_TIMEOUT",
                "마이크 캡처 종료 시간이 초과되었습니다.",
            )
        })?
        .map(Some)
}

fn write_native_wav(capture: CapturedVoiceSamples) -> Result<PathBuf, String> {
    let samples = capture
        .samples
        .lock()
        .map_err(|_| voice_error("STATE_LOCK_POISONED", "native voice samples lock poisoned"))?
        .clone();
    if samples.is_empty() {
        return Err(voice_error(
            "NO_AUDIO_CAPTURED",
            "마이크에서 음성을 받지 못했습니다. 권한과 입력 장치를 확인하세요.",
        ));
    }
    let dir = voice_recordings_dir();
    std::fs::create_dir_all(&dir).map_err(|e| {
        voice_error(
            "RECORDING_DIR_CREATE_FAILED",
            format!("음성 녹음 폴더 생성 실패: {e}"),
        )
    })?;
    let path = dir.join(format!("voice-{}.wav", now_ms()));
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: capture.sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(&path, spec)
        .map_err(|e| voice_error("WAV_WRITE_FAILED", format!("음성 WAV 파일 생성 실패: {e}")))?;
    for sample in samples {
        writer
            .write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .map_err(|e| voice_error("WAV_WRITE_FAILED", format!("음성 WAV 쓰기 실패: {e}")))?;
    }
    writer
        .finalize()
        .map_err(|e| voice_error("WAV_WRITE_FAILED", format!("음성 WAV 마무리 실패: {e}")))?;
    Ok(path)
}

async fn transcribe_native_wav(wav: &Path) -> Result<String, String> {
    // 모델/CLI 검증 실패도 포함해 녹음 원본은 항상 정리한다.
    let result = transcribe_native_wav_inner(wav).await;
    let _ = std::fs::remove_file(wav);
    result
}

async fn transcribe_native_wav_inner(wav: &Path) -> Result<String, String> {
    let model = std::env::var("LUM_WHISPER_MODEL")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_whisper_model_path());
    if !model.is_file() {
        return Err(voice_error("WHISPER_MODEL_NOT_FOUND", format!("Whisper 모델을 찾지 못했습니다: {}. ggml-base.bin을 배치하거나 LUM_WHISPER_MODEL을 설정하세요.", model.display())));
    }
    let output_base = wav.with_extension("");
    let output_txt = output_base.with_extension("txt");
    let cli = default_whisper_cli_path();
    let output = if let Ok(template) = std::env::var("LUM_WHISPER_CPP_CMD") {
        if !template.contains("{audio}") || !template.contains("{model}") {
            return Err(voice_error(
                "WHISPER_COMMAND_INVALID",
                "LUM_WHISPER_CPP_CMD에는 {audio}와 {model} 자리표시자가 모두 필요합니다.",
            ));
        }
        run_shell_capture(
            &template
                .replace("{audio}", &wav.display().to_string())
                .replace("{model}", &model.display().to_string()),
            parse_voice_timeout_ms("LUM_WHISPER_CPP_TIMEOUT_MS", 90_000),
        )
        .await?
    } else {
        if !cli.is_file() {
            return Err(voice_error("WHISPER_CLI_NOT_FOUND", format!("whisper-cli를 찾지 못했습니다: {}. 설치하거나 LUM_WHISPER_CPP_CMD를 설정하세요.", cli.display())));
        }
        let out = timeout(
            Duration::from_millis(parse_voice_timeout_ms("LUM_WHISPER_CPP_TIMEOUT_MS", 90_000)),
            TokioCommand::new(&cli)
                .args([
                    "-m",
                    model.to_string_lossy().as_ref(),
                    "-f",
                    wav.to_string_lossy().as_ref(),
                    "-otxt",
                    "-of",
                    output_base.to_string_lossy().as_ref(),
                ])
                .output(),
        )
        .await
        .map_err(|_| {
            voice_error(
                "WHISPER_TIMEOUT",
                "Whisper 전사가 시간 제한을 초과했습니다.",
            )
        })?
        .map_err(|e| voice_error("WHISPER_EXEC_FAILED", format!("whisper-cli 실행 실패: {e}")))?;
        if !out.status.success() {
            return Err(voice_error(
                "WHISPER_FAILED",
                String::from_utf8_lossy(&out.stderr).trim(),
            ));
        }
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };
    let text = std::fs::read_to_string(&output_txt)
        .ok()
        .unwrap_or(output)
        .trim()
        .to_string();
    let _ = std::fs::remove_file(&output_txt);
    if text.is_empty() {
        Err(voice_error(
            "EMPTY_TRANSCRIPT",
            "Whisper가 비어 있는 전사 결과를 반환했습니다.",
        ))
    } else {
        Ok(text)
    }
}

fn default_voice_hook_script_path(kind: &str) -> PathBuf {
    let ext = if cfg!(windows) { "cmd" } else { "sh" };
    platform::home_dir()
        .join(".lum_whisper")
        .join(format!("{kind}.{ext}"))
}

#[derive(Debug, Clone)]
enum VoiceHook {
    Shell(String),
    Script(PathBuf),
}

#[derive(Debug, Clone, Serialize)]
pub struct VoiceHookDiagnostics {
    recording: bool,
    transcript_path: String,
    transcript_exists: bool,
    transcript_modified_ms: Option<u64>,
    transcript_preview: Option<String>,
    start_hook_kind: String,
    start_hook_configured: bool,
    start_hook_target: String,
    start_hook_runnable: bool,
    start_hook_runtime_label: String,
    stop_hook_kind: String,
    stop_hook_configured: bool,
    stop_hook_target: String,
    stop_hook_runnable: bool,
    stop_hook_runtime_label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct VoiceHookTemplateCreateResult {
    created: Vec<String>,
    skipped: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VoiceTranscriptClearResult {
    removed: bool,
    path: String,
}

const START_TEMPLATE_SH: &str = include_str!("../../scripts/voice-hooks/start.example.sh");
const STOP_TEMPLATE_SH: &str = include_str!("../../scripts/voice-hooks/stop.example.sh");
const START_TEMPLATE_CMD: &str = include_str!("../../scripts/voice-hooks/start.example.cmd");
const STOP_TEMPLATE_CMD: &str = include_str!("../../scripts/voice-hooks/stop.example.cmd");

fn resolve_voice_hook(env_key: &str, kind: &str) -> Option<VoiceHook> {
    if let Ok(cmd) = std::env::var(env_key) {
        let trimmed = cmd.trim();
        if !trimmed.is_empty() {
            return Some(VoiceHook::Shell(trimmed.to_string()));
        }
    }
    let script = default_voice_hook_script_path(kind);
    if script.is_file() {
        Some(VoiceHook::Script(script))
    } else {
        None
    }
}

fn voice_hook_descriptor(env_key: &str, kind: &str) -> (String, bool, String) {
    match resolve_voice_hook(env_key, kind) {
        Some(VoiceHook::Shell(cmd)) => ("env".into(), true, cmd),
        Some(VoiceHook::Script(path)) => ("script".into(), true, path.display().to_string()),
        None => (
            "missing".into(),
            false,
            default_voice_hook_script_path(kind).display().to_string(),
        ),
    }
}

fn voice_hook_runtime_status(env_key: &str, kind: &str) -> (bool, String) {
    match resolve_voice_hook(env_key, kind) {
        Some(VoiceHook::Shell(_)) => (true, "env 명령".into()),
        Some(VoiceHook::Script(path)) => {
            if cfg!(windows) {
                (true, "파일 준비됨".into())
            } else {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let runnable = std::fs::metadata(&path)
                        .ok()
                        .map(|meta| meta.permissions().mode() & 0o111 != 0)
                        .unwrap_or(false);
                    (
                        runnable,
                        if runnable {
                            "실행 가능".into()
                        } else {
                            "실행 권한 없음".into()
                        },
                    )
                }
                #[cfg(not(unix))]
                {
                    (true, "파일 준비됨".into())
                }
            }
        }
        None => (false, "파일 없음".into()),
    }
}

fn voice_hook_template(kind: &str) -> &'static str {
    match (cfg!(windows), kind) {
        (true, "start") => START_TEMPLATE_CMD,
        (true, "stop") => STOP_TEMPLATE_CMD,
        (false, "start") => START_TEMPLATE_SH,
        (false, "stop") => STOP_TEMPLATE_SH,
        _ => "",
    }
}

/// 전사 파일을 읽고, 유효한 텍스트면 반환 후 파일 삭제.
/// 빈 텍스트면 None(파일 유지 — 외부 STT의 지연 쓰기 허용).
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

    if !is_fresh {
        let _ = std::fs::remove_file(path);
        None
    } else if text.is_empty() {
        // 빈 파일은 즉시 삭제하지 않는다.
        // 일부 STT 파이프라인은 파일을 먼저 만들고 나중에 내용을 채운다.
        None
    } else {
        let _ = std::fs::remove_file(path);
        Some(text)
    }
}

/// 전사 파일을 읽되 삭제하지 않는다.
/// 외부 STT가 중간 결과를 같은 파일에 갱신하는 경우 live preview에 사용한다.
fn read_partial_transcript_file(path: &Path, min_modified_ms: u64) -> Option<String> {
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

    if !is_fresh || text.is_empty() {
        return None;
    }

    Some(text)
}

/// 전사 파일이 외부 프로세스에서 늦게 생성될 수 있어 짧게 폴링 대기.
async fn wait_transcript_file(path: &Path, min_modified_ms: u64, wait_ms: u64) -> Option<String> {
    if let Some(text) = read_transcript_file(path, min_modified_ms) {
        return Some(text);
    }
    if wait_ms == 0 {
        return None;
    }

    let deadline = std::time::Instant::now() + Duration::from_millis(wait_ms);
    let poll = Duration::from_millis(100);
    loop {
        tokio::time::sleep(poll).await;
        if let Some(text) = read_transcript_file(path, min_modified_ms) {
            return Some(text);
        }
        if std::time::Instant::now() >= deadline {
            return None;
        }
    }
}

fn spawn_partial_transcript_watcher(app: tauri::AppHandle, session_id: u64, min_modified_ms: u64) {
    tauri::async_runtime::spawn(async move {
        let path = transcript_file_path();
        let poll = Duration::from_millis(250);
        let mut last_emitted = String::new();

        loop {
            tokio::time::sleep(poll).await;

            let snapshot = match voice_state_snapshot() {
                Ok(snapshot) => snapshot,
                Err(_) => break,
            };

            if snapshot.session_id != session_id {
                break;
            }
            if !snapshot.recording && !snapshot.stopping {
                break;
            }

            if let Some(text) = read_partial_transcript_file(&path, min_modified_ms) {
                if text != last_emitted {
                    last_emitted = text.clone();
                    let _ = app.emit("voice_transcript_partial", text);
                }
            }
        }
    });
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

async fn run_script_capture(path: &Path, timeout_ms: u64) -> Result<String, String> {
    let command = if cfg!(windows) {
        TokioCommand::new("cmd").arg("/C").arg(path).output()
    } else {
        TokioCommand::new("sh").arg(path).output()
    };

    let out = if timeout_ms == 0 {
        command
            .await
            .map_err(|e| voice_error("COMMAND_EXEC_FAILED", format!("스크립트 실행 실패: {e}")))?
    } else {
        timeout(Duration::from_millis(timeout_ms), command)
            .await
            .map_err(|_| {
                voice_error(
                    "COMMAND_TIMEOUT",
                    format!(
                        "스크립트 실행이 시간 제한을 초과했습니다 ({timeout_ms}ms): {}",
                        path.display()
                    ),
                )
            })?
            .map_err(|e| voice_error("COMMAND_EXEC_FAILED", format!("스크립트 실행 실패: {e}")))?
    };
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            voice_error(
                "COMMAND_EXIT_NON_ZERO",
                format!("스크립트가 비정상 종료되었습니다: {}", path.display()),
            )
        } else {
            voice_error("COMMAND_STDERR", format!("스크립트 실행 오류: {stderr}"))
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

async fn run_voice_hook_capture(hook: &VoiceHook, timeout_ms: u64) -> Result<String, String> {
    match hook {
        VoiceHook::Shell(cmd) => run_shell_capture(cmd, timeout_ms).await,
        VoiceHook::Script(path) => run_script_capture(path, timeout_ms).await,
    }
}

/// 음성 입력 시작.
/// 외부 시작 훅이 있으면 기존 훅 오케스트레이션을 사용하고,
/// 없으면 기본 마이크를 CPAL로 캡처한다.
/// - `LUM_VOICE_START_CMD`가 있으면 실행 (예: 외부 녹음 프로세스 시작)
/// - 미설정 시 `~/.lum_whisper/start.(sh|cmd)`가 있으면 자동 실행
/// - 둘 다 없으면 앱 내 캡처 후 `whisper.cpp`로 전사한다.
async fn start_voice_recording_inner() -> Result<(), String> {
    let started_ms = mark_recording_started()?;

    // 이전 세션의 잔여 전사 파일을 남기면 잘못된 텍스트가 재사용될 수 있어 정리.
    let _ = std::fs::remove_file(transcript_file_path());

    if let Some(hook) = resolve_voice_hook("LUM_VOICE_START_CMD", "start") {
        let timeout_ms = parse_voice_timeout_ms(
            "LUM_VOICE_START_CMD_TIMEOUT_MS",
            DEFAULT_VOICE_START_CMD_TIMEOUT_MS,
        );
        if let Err(e) = run_voice_hook_capture(&hook, timeout_ms).await {
            // 외부 훅 실패면 녹음 상태 롤백.
            set_voice_state(false, 0)?;
            return Err(voice_error(
                "START_HOOK_FAILED",
                format!("음성 시작 훅 실패: {e}"),
            ));
        }
    } else if let Err(e) = start_native_voice_capture() {
        // 네이티브 마이크 권한 거부/장치 부재도 기존 상태 머신을 남기지 않는다.
        set_voice_state(false, 0)?;
        return Err(e);
    }

    // started_ms는 실패 롤백/디버깅 추적용으로 내부에서만 사용.
    let _ = started_ms;

    Ok(())
}

#[tauri::command]
pub async fn start_voice_recording(app: tauri::AppHandle) -> Result<(), String> {
    match start_voice_recording_inner().await {
        Ok(()) => {
            let _ = app.emit("voice_recording_state", true);
            if let Ok(state) = voice_state_snapshot() {
                if state.recording {
                    spawn_partial_transcript_watcher(
                        app.clone(),
                        state.session_id,
                        state.started_ms,
                    );
                }
            }
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
    // stop 전환 중(stopping=true)에도 프론트는 녹음 active로 취급해야
    // 마이크 버튼이 중간 상태에서 깜빡이며 잘못된 재시도를 유도하지 않는다.
    Ok(state.recording || state.stopping)
}

#[tauri::command]
pub fn voice_hook_diagnostics() -> Result<VoiceHookDiagnostics, String> {
    let transcript_path = transcript_file_path();
    let transcript_exists = transcript_path.is_file();
    let transcript_modified_ms = std::fs::metadata(&transcript_path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);
    let transcript_preview = std::fs::read_to_string(&transcript_path)
        .ok()
        .map(|raw| raw.split_whitespace().collect::<Vec<_>>().join(" "))
        .map(|trimmed| trimmed.trim().to_string())
        .filter(|text| !text.is_empty());
    let recording = voice_recording_status()?;
    let (start_hook_kind, start_hook_configured, start_hook_target) =
        voice_hook_descriptor("LUM_VOICE_START_CMD", "start");
    let (start_hook_runnable, start_hook_runtime_label) =
        voice_hook_runtime_status("LUM_VOICE_START_CMD", "start");
    let (stop_hook_kind, stop_hook_configured, stop_hook_target) =
        voice_hook_descriptor("LUM_VOICE_STOP_CMD", "stop");
    let (stop_hook_runnable, stop_hook_runtime_label) =
        voice_hook_runtime_status("LUM_VOICE_STOP_CMD", "stop");

    Ok(VoiceHookDiagnostics {
        recording,
        transcript_path: transcript_path.display().to_string(),
        transcript_exists,
        transcript_modified_ms,
        transcript_preview,
        start_hook_kind,
        start_hook_configured,
        start_hook_target,
        start_hook_runnable,
        start_hook_runtime_label,
        stop_hook_kind,
        stop_hook_configured,
        stop_hook_target,
        stop_hook_runnable,
        stop_hook_runtime_label,
    })
}

#[tauri::command]
pub fn create_default_voice_hook_files() -> Result<VoiceHookTemplateCreateResult, String> {
    let mut created = Vec::new();
    let mut skipped = Vec::new();

    for kind in ["start", "stop"] {
        let path = default_voice_hook_script_path(kind);
        if path.exists() {
            skipped.push(path.display().to_string());
            continue;
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                voice_error(
                    "HOOK_TEMPLATE_CREATE_FAILED",
                    format!("음성 훅 디렉터리 생성 실패: {e}"),
                )
            })?;
        }
        std::fs::write(&path, voice_hook_template(kind)).map_err(|e| {
            voice_error(
                "HOOK_TEMPLATE_CREATE_FAILED",
                format!("음성 훅 템플릿 생성 실패: {e}"),
            )
        })?;
        created.push(path.display().to_string());
    }

    Ok(VoiceHookTemplateCreateResult { created, skipped })
}

#[tauri::command]
pub fn clear_voice_transcript_file() -> Result<VoiceTranscriptClearResult, String> {
    let path = transcript_file_path();
    let removed = if path.exists() {
        std::fs::remove_file(&path).map_err(|e| {
            voice_error(
                "TRANSCRIPT_CLEAR_FAILED",
                format!("transcript 파일 삭제 실패: {e}"),
            )
        })?;
        true
    } else {
        false
    };

    Ok(VoiceTranscriptClearResult {
        removed,
        path: path.display().to_string(),
    })
}

/// 음성 입력 중지 + 텍스트 반환.
/// 우선순위:
/// 1) `LUM_VOICE_STOP_CMD` stdout (외부 STT 파이프라인)
/// 2) `~/.lum_whisper/stop.(sh|cmd)` stdout
/// 3) `~/.lum_whisper/last_transcript.txt` 파일
/// 없으면 명확한 에러 반환.
async fn stop_voice_recording_inner() -> Result<String, String> {
    let started_ms = mark_recording_stopped()?;
    // 시작 훅이 없었던 경우에만 슬롯이 채워진다. stream을 여기서 drop해 캡처를 즉시 중단한다.
    if let Some(capture) = take_native_voice_capture()? {
        let wav = match write_native_wav(capture) {
            Ok(wav) => wav,
            Err(err) => {
                finish_stop(false, 0)?;
                return Err(err);
            }
        };
        let transcript = transcribe_native_wav(&wav).await;
        finish_stop(false, 0)?;
        return transcript;
    }

    if let Some(hook) = resolve_voice_hook("LUM_VOICE_STOP_CMD", "stop") {
        let out = run_voice_hook_capture(
            &hook,
            parse_voice_timeout_ms(
                "LUM_VOICE_STOP_CMD_TIMEOUT_MS",
                DEFAULT_VOICE_STOP_CMD_TIMEOUT_MS,
            ),
        )
        .await;
        match out {
            Ok(out) if !out.is_empty() => {
                finish_stop(false, 0)?;
                return Ok(out);
            }
            Ok(_) => {}
            Err(err) => {
                let path = transcript_file_path();
                if let Some(t) =
                    wait_transcript_file(&path, started_ms, voice_transcript_wait_ms()).await
                {
                    finish_stop(false, 0)?;
                    return Ok(t);
                }
                finish_stop(true, started_ms)?;
                return Err(err);
            }
        }
    }

    let path = transcript_file_path();
    if let Some(t) = wait_transcript_file(&path, started_ms, voice_transcript_wait_ms()).await {
        finish_stop(false, 0)?;
        return Ok(t);
    }

    finish_stop(false, 0)?;
    Err(voice_error(
        "TRANSCRIPT_NOT_FOUND",
        "음성 인식 결과를 찾지 못했습니다. LUM_VOICE_STOP_CMD, ~/.lum_whisper/stop.(sh|cmd) 또는 ~/.lum_whisper/last_transcript.txt를 설정하세요.",
    ))
}

/// 음성 입력 중지 + 텍스트 반환 + 전사 이벤트 emit.
#[tauri::command]
pub async fn stop_voice_recording(app: tauri::AppHandle) -> Result<String, String> {
    let result = stop_voice_recording_inner().await;
    // stop 훅 실패 시 rollback될 수 있어 실제 상태를 재조회해 emit.
    let recording_on = voice_recording_status().unwrap_or(false);
    let _ = app.emit("voice_recording_state", recording_on);
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
            s.stopping = false;
        }
        // 실제 마이크를 열었던 테스트가 다음 훅 기반 테스트에 영향을 주지 않게 정리.
        if let Ok(mut capture) = native_voice_capture_lock().lock() {
            *capture = None;
        }
    }

    fn with_temp_home(prefix: &str) -> (PathBuf, Option<String>) {
        let tmp_home = std::env::temp_dir().join(format!(
            "lum_voice_{}_{}_{}",
            prefix,
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&tmp_home).unwrap();
        let old_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &tmp_home);
        (tmp_home, old_home)
    }

    fn restore_home(old_home: Option<String>) {
        if let Some(home) = old_home {
            std::env::set_var("HOME", home);
        } else {
            std::env::remove_var("HOME");
        }
    }

    #[test]
    fn native_capture_wav는_단일채널_16비트로_저장된다() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (_tmp_home, old_home) = with_temp_home("native_wav");
        let capture = CapturedVoiceSamples {
            samples: Arc::new(Mutex::new(vec![-1.0, 0.0, 1.0])),
            sample_rate: 16_000,
        };

        let path = write_native_wav(capture).expect("native wav should be written");
        let reader = hound::WavReader::open(&path).expect("written wav should be readable");
        assert_eq!(reader.spec().channels, 1);
        assert_eq!(reader.spec().sample_rate, 16_000);
        assert_eq!(reader.spec().bits_per_sample, 16);
        assert_eq!(reader.into_samples::<i16>().count(), 3);

        let _ = std::fs::remove_file(path);
        restore_home(old_home);
    }

    #[test]
    fn native_whisper_기본경로는_lum_whisper_아래다() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (_tmp_home, old_home) = with_temp_home("native_paths");
        assert!(default_whisper_cli_path().ends_with(if cfg!(windows) {
            "whisper-cli.exe"
        } else {
            "whisper-cli"
        }));
        assert!(default_whisper_model_path().ends_with("models/ggml-base.bin"));
        restore_home(old_home);
    }

    #[tokio::test]
    async fn native_전사실패에도_녹음_wav는_삭제된다() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (_tmp_home, old_home) = with_temp_home("native_cleanup");
        std::env::remove_var("LUM_WHISPER_MODEL");
        std::env::remove_var("LUM_WHISPER_CPP_CMD");
        let capture = CapturedVoiceSamples {
            samples: Arc::new(Mutex::new(vec![0.1, -0.1])),
            sample_rate: 16_000,
        };
        let wav = write_native_wav(capture).expect("native wav should be written");
        let result = transcribe_native_wav(&wav).await;
        assert!(result
            .unwrap_err()
            .contains("LUM_VOICE_ERROR::WHISPER_MODEL_NOT_FOUND::"));
        assert!(
            !wav.exists(),
            "전사 실패에도 원본 음성 파일은 남기지 않아야 함"
        );
        restore_home(old_home);
    }

    #[tokio::test]
    async fn double_start_거부() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        // 상태 머신만 검증한다. CI/개발 장비의 실제 마이크 권한에는 의존하지 않는다.
        std::env::set_var(
            "LUM_VOICE_START_CMD",
            if cfg!(windows) { "exit /b 0" } else { "true" },
        );
        let r1 = start_voice_recording_inner().await;
        assert!(r1.is_ok());
        let r2 = start_voice_recording_inner().await;
        assert!(
            r2.unwrap_err()
                .contains("LUM_VOICE_ERROR::ALREADY_RECORDING::"),
            "already recording 에러 코드가 포함되어야 함"
        );
        std::env::remove_var("LUM_VOICE_START_CMD");
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
        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = false;
            s.stopping = true;
        }
        assert_eq!(
            voice_recording_status().ok(),
            Some(true),
            "stop 전환 중에는 active로 보여야 함"
        );
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

    #[test]
    fn read_partial_transcript_file_정상_반환_후_파일_유지() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let base = std::env::temp_dir().join(format!(
            "lum_voice_partial_test_{}_{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&base).unwrap();
        let f = base.join("last_transcript.txt");
        std::fs::write(&f, "  중간 전사  ").unwrap();
        let out = read_partial_transcript_file(&f, 0);
        assert_eq!(out.as_deref(), Some("중간 전사"));
        assert!(
            f.exists(),
            "partial preview 읽기 후에는 파일이 유지되어야 함"
        );
        let _ = std::fs::remove_file(&f);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn read_transcript_file_빈파일은_삭제하지_않음() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let base = std::env::temp_dir().join(format!(
            "lum_voice_test_empty_{}_{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir_all(&base).unwrap();
        let f = base.join("last_transcript.txt");
        std::fs::write(&f, "   ").unwrap();
        let out = read_transcript_file(&f, 0);
        assert!(out.is_none(), "빈 텍스트는 transcript로 취급하지 않아야 함");
        assert!(f.exists(), "빈 파일은 지연 쓰기를 위해 유지되어야 함");
        let _ = std::fs::remove_file(&f);
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
        assert!(result
            .unwrap_err()
            .contains("LUM_VOICE_ERROR::START_HOOK_FAILED::"));
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
        assert_eq!(
            voice_recording_status().ok(),
            Some(false),
            "stop 훅이 없고 transcript도 없으면 녹음 종료 상태를 유지"
        );
    }

    #[test]
    fn resolve_voice_hook_env_우선() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("LUM_VOICE_START_CMD", "echo from_env");
        let hook = resolve_voice_hook("LUM_VOICE_START_CMD", "start");
        match hook {
            Some(VoiceHook::Shell(cmd)) => assert_eq!(cmd, "echo from_env"),
            _ => panic!("env hook should be selected first"),
        }
        std::env::remove_var("LUM_VOICE_START_CMD");
    }

    #[test]
    fn resolve_voice_hook_기본_script_탐지() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::remove_var("LUM_VOICE_START_CMD");
        let (_tmp_home, old_home) = with_temp_home("hook_script_detect");

        let script_path = default_voice_hook_script_path("start");
        if let Some(parent) = script_path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&script_path, "echo start_ok").unwrap();

        let hook = resolve_voice_hook("LUM_VOICE_START_CMD", "start");
        match hook {
            Some(VoiceHook::Script(path)) => assert_eq!(path, script_path),
            _ => panic!("default script hook should be detected"),
        }

        let _ = std::fs::remove_file(script_path);
        restore_home(old_home);
    }

    #[tokio::test]
    async fn stop_default_script_출력_반환() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::remove_var("LUM_VOICE_STOP_CMD");
        let (_tmp_home, old_home) = with_temp_home("stop_default_script");

        let script_path = default_voice_hook_script_path("stop");
        if let Some(parent) = script_path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&script_path, "echo scripted transcript").unwrap();

        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = true;
            s.started_ms = now_ms();
        }

        let result = stop_voice_recording_inner().await;
        assert_eq!(result.ok(), Some("scripted transcript".to_string()));

        let _ = std::fs::remove_file(script_path);
        restore_home(old_home);
        reset_state();
    }

    #[tokio::test]
    async fn stop_hook_실패_및_폴백없음이면_녹음상태_복구() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::set_var("LUM_VOICE_STOP_CMD", "exit 1");

        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = true;
            s.started_ms = now_ms();
        }
        let result = stop_voice_recording_inner().await;
        assert!(result.is_err());
        assert_eq!(
            voice_recording_status().ok(),
            Some(true),
            "stop 훅 실패+폴백없음이면 사용자가 재시도할 수 있게 recording=true로 복구"
        );

        std::env::remove_var("LUM_VOICE_STOP_CMD");
        reset_state();
    }

    #[tokio::test]
    async fn stop_hook_성공_하지만_transcript_없으면_녹음종료_유지() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::set_var("LUM_VOICE_STOP_CMD", "exit 0");

        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = true;
            s.started_ms = now_ms();
        }
        let result = stop_voice_recording_inner().await;
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .contains("LUM_VOICE_ERROR::TRANSCRIPT_NOT_FOUND::"),
            "transcript missing 에러 코드가 포함되어야 함"
        );
        assert_eq!(
            voice_recording_status().ok(),
            Some(false),
            "stop 훅 성공 후 transcript가 없어도 녹음은 종료 상태여야 함"
        );

        std::env::remove_var("LUM_VOICE_STOP_CMD");
        reset_state();
    }

    #[tokio::test]
    async fn stop_지연_전사파일_대기_후_반환() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        std::env::remove_var("LUM_VOICE_STOP_CMD");
        std::env::set_var("LUM_VOICE_TRANSCRIPT_WAIT_MS", "1200");
        let (_tmp_home, old_home) = with_temp_home("delayed_transcript_wait");

        let path = transcript_file_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        let path_for_writer = path.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(150)).await;
            let _ = std::fs::write(path_for_writer, "  delayed transcript ok  ");
        });

        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = true;
            s.started_ms = now_ms();
        }

        let result = stop_voice_recording_inner().await;
        assert_eq!(result.ok(), Some("delayed transcript ok".to_string()));

        std::env::remove_var("LUM_VOICE_TRANSCRIPT_WAIT_MS");
        restore_home(old_home);
        reset_state();
    }

    #[tokio::test]
    async fn stop_전환중_start_요청은_차단() {
        let _g = AUDIO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_state();
        let slow_cmd = if cfg!(windows) {
            "ping -n 2 127.0.0.1 >NUL"
        } else {
            "sleep 1"
        };
        std::env::set_var("LUM_VOICE_STOP_CMD", slow_cmd);

        if let Ok(mut s) = voice_state_lock().lock() {
            s.recording = true;
            s.started_ms = now_ms();
            s.stopping = false;
        }

        let stop_task = tokio::spawn(async { stop_voice_recording_inner().await });
        let mut seen_stopping = false;
        for _ in 0..30 {
            if let Ok(s) = voice_state_lock().lock() {
                if s.stopping {
                    seen_stopping = true;
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        assert!(
            seen_stopping,
            "stop 전환 상태(stopping=true)가 관측되어야 함"
        );

        let start_result = start_voice_recording_inner().await;
        assert!(
            start_result
                .unwrap_err()
                .contains("LUM_VOICE_ERROR::TRANSITION_IN_PROGRESS::"),
            "stop 전환 중 start는 차단되어야 함"
        );

        let _ = stop_task.await;
        std::env::remove_var("LUM_VOICE_STOP_CMD");
        reset_state();
    }
}
