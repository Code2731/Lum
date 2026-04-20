use crate::error::{LumError, Result};
use crate::platform;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

/// zsh/bash 셸 통합 스크립트 — OSC 133 A/C/D 시퀀스를 PTY 출력에 주입
fn shell_integration_script(shell: &str) -> String {
    let name = std::path::Path::new(shell)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    match name {
        "zsh" => concat!(
            " autoload -Uz add-zsh-hook 2>/dev/null;",
            " _lum_precmd(){ printf '\\033]133;D;%d\\007' \"$?\" };",
            " _lum_preexec(){ printf '\\033]133;C;%s\\007' \"$1\" };",
            " add-zsh-hook precmd _lum_precmd;",
            " add-zsh-hook preexec _lum_preexec\n"
        )
        .to_string(),
        "bash" => concat!(
            " _lum_precmd(){ local e=$?; printf '\\033]133;D;%d\\007' \"$e\"; };",
            " PROMPT_COMMAND=\"_lum_precmd${PROMPT_COMMAND:+; $PROMPT_COMMAND}\";",
            " trap 'printf \"\\033]133;C;$BASH_COMMAND\\007\"' DEBUG\n"
        )
        .to_string(),
        _ => String::new(),
    }
}
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter, State};

// 채널 기반 설계: PTY 객체는 전용 스레드에서만 소유 (Send 제약 회피)
pub struct PtyHandle {
    pub write_tx: std::sync::mpsc::SyncSender<Vec<u8>>,
    pub resize_tx: std::sync::mpsc::SyncSender<(u16, u16)>,
}

pub struct TerminalState {
    pub ptys: Arc<Mutex<HashMap<String, PtyHandle>>>,
}

#[derive(serde::Serialize, Clone)]
struct PtyData {
    id: String,
    data: String,
}

#[command]
pub async fn spawn_pty(
    app: AppHandle,
    state: State<'_, TerminalState>,
    id: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<()> {
    // 이미 실행 중인 PTY가 있으면 스킵
    {
        let ptys = state
            .ptys
            .lock()
            .map_err(|_| LumError::Io("lock 오류".into()))?;
        if ptys.contains_key(&id) {
            return Ok(());
        }
    }

    let pty_system = native_pty_system();
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system
        .openpty(size)
        .map_err(|e| LumError::Io(format!("PTY 생성 실패: {}", e)))?;

    // 플랫폼별 기본 셸·홈 디렉토리
    let shell = platform::default_shell();
    let work_dir = if cwd.is_empty() {
        platform::home_dir().to_string_lossy().into_owned()
    } else {
        cwd
    };

    let mut cmd = CommandBuilder::new(shell);
    cmd.cwd(&work_dir);
    // Windows cmd/PowerShell은 TERM 불필요, Unix 계열만 설정
    #[cfg(not(windows))]
    {
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
    }

    let _child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| LumError::Io(format!("셸 실행 실패: {}", e)))?;

    let mut writer = pair
        .master
        .take_writer()
        .map_err(|e| LumError::Io(e.to_string()))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| LumError::Io(e.to_string()))?;

    // 쓰기/리사이즈 채널 (SyncSender: 버퍼 꽉 차면 블록)
    let (write_tx, write_rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(64);
    let (resize_tx, resize_rx) = std::sync::mpsc::sync_channel::<(u16, u16)>(8);

    // ── 쓰기 스레드 ────────────────────────────────────────────
    std::thread::spawn(move || {
        for data in write_rx {
            if writer.write_all(&data).is_err() {
                break;
            }
        }
    });

    // ── 리사이즈 스레드 ────────────────────────────────────────
    let master = pair.master;
    std::thread::spawn(move || {
        for (r, c) in resize_rx {
            let _ = master.resize(PtySize {
                rows: r,
                cols: c,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    });

    // ── 읽기 스레드 (PTY 출력 → Tauri 이벤트) ─────────────────
    let app_r = app.clone();
    let id_r = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_r.emit(
                        "pty_data",
                        PtyData {
                            id: id_r.clone(),
                            data,
                        },
                    );
                }
            }
        }
        // 셸 종료 시 이벤트 발송
        let _ = app_r.emit("pty_exit", id_r);
    });

    // ── 셸 통합 스크립트 주입 (400ms 후 — 셸 초기화 완료 대기) ─
    let init_tx = write_tx.clone();
    let shell_name = shell.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
        let script = shell_integration_script(&shell_name);
        if !script.is_empty() {
            let _ = init_tx.send(script.into_bytes());
        }
    });

    // ── 채널 핸들 저장 ─────────────────────────────────────────
    let mut ptys = state
        .ptys
        .lock()
        .map_err(|_| LumError::Io("lock 오류".into()))?;
    ptys.insert(
        id,
        PtyHandle {
            write_tx,
            resize_tx,
        },
    );

    Ok(())
}

#[command]
pub async fn write_to_pty(state: State<'_, TerminalState>, id: String, data: String) -> Result<()> {
    let ptys = state
        .ptys
        .lock()
        .map_err(|_| LumError::Io("lock 오류".into()))?;
    if let Some(handle) = ptys.get(&id) {
        handle
            .write_tx
            .send(data.into_bytes())
            .map_err(|_| LumError::Io("PTY 쓰기 채널 닫힘".into()))?;
    }
    Ok(())
}

#[command]
pub async fn resize_pty(
    state: State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<()> {
    let ptys = state
        .ptys
        .lock()
        .map_err(|_| LumError::Io("lock 오류".into()))?;
    if let Some(handle) = ptys.get(&id) {
        // 실패해도 무시 (채널이 닫혔을 수 있음)
        let _ = handle.resize_tx.send((rows, cols));
    }
    Ok(())
}

/// PTY 세션 종료 및 채널 핸들 제거
#[command]
pub async fn close_pty(state: State<'_, TerminalState>, id: String) -> Result<()> {
    let mut ptys = state
        .ptys
        .lock()
        .map_err(|_| LumError::Io("lock 오류".into()))?;
    ptys.remove(&id);
    Ok(())
}

/// 현재 디렉토리 기준 셸 자동완성 후보 반환
#[command]
pub fn get_completions(cwd: String, partial: String) -> Result<Vec<String>> {
    let path = std::path::Path::new(&cwd);
    if !path.exists() {
        return Ok(vec![]);
    }

    let entries = std::fs::read_dir(path).map_err(|e| LumError::Io(e.to_string()))?;
    let matches: Vec<String> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if partial.is_empty() || name.starts_with(&partial) {
                Some(name)
            } else {
                None
            }
        })
        .take(20)
        .collect();

    Ok(matches)
}
