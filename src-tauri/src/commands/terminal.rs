use crate::error::{LumError, Result};
use crate::platform;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

/// zsh: ZDOTDIR 방식으로 훅 주입 — stdin echo 없이 셸 시작 시 자동 로드
#[cfg(not(windows))]
fn setup_zsh_zdotdir() -> Option<String> {
    let zdotdir = std::env::temp_dir().join("lum_zdotdir");
    std::fs::create_dir_all(&zdotdir).ok()?;

    let home = dirs::home_dir()?;

    // .zshenv 포워딩 (비대화형 포함 항상 소싱)
    let real_zshenv = home.join(".zshenv");
    if real_zshenv.exists() {
        let _ = std::fs::write(
            zdotdir.join(".zshenv"),
            format!("[[ -f \"{p}\" ]] && source \"{p}\"\n", p = real_zshenv.display()),
        );
    }

    // .zprofile 포워딩 (로그인 셸)
    let real_zprofile = home.join(".zprofile");
    if real_zprofile.exists() {
        let _ = std::fs::write(
            zdotdir.join(".zprofile"),
            format!("[[ -f \"{p}\" ]] && source \"{p}\"\n", p = real_zprofile.display()),
        );
    }

    // .zshrc — OSC 133 훅 먼저 등록 후 실제 .zshrc 소싱
    let real_zshrc = home.join(".zshrc");
    let zshrc = format!(
        "autoload -Uz add-zsh-hook 2>/dev/null\n\
         _lum_precmd(){{ printf '\\033]133;D;%d\\007' \"$?\" }}\n\
         _lum_preexec(){{ printf '\\033]133;C;%s\\007' \"$1\" }}\n\
         add-zsh-hook precmd _lum_precmd\n\
         add-zsh-hook preexec _lum_preexec\n\
         [[ -f \"{p}\" ]] && source \"{p}\"\n",
        p = real_zshrc.display()
    );
    std::fs::write(zdotdir.join(".zshrc"), zshrc).ok()?;

    Some(zdotdir.to_string_lossy().into_owned())
}

/// bash: 임시 init 파일로 훅 주입 후 실제 .bashrc 소싱
#[cfg(not(windows))]
fn setup_bash_initfile() -> Option<String> {
    let init_path = std::env::temp_dir().join("lum_bash_init.sh");
    let home = dirs::home_dir()?;
    let real_bashrc = home.join(".bashrc");
    let content = format!(
        "_lum_precmd(){{ local e=$?; printf '\\033]133;D;%d\\007' \"$e\"; }}\n\
         PROMPT_COMMAND=\"_lum_precmd${{PROMPT_COMMAND:+; $PROMPT_COMMAND}}\"\n\
         trap 'printf \"\\033]133;C;$BASH_COMMAND\\007\"' DEBUG\n\
         [[ -f \"{p}\" ]] && source \"{p}\"\n",
        p = real_bashrc.display()
    );
    std::fs::write(&init_path, content).ok()?;
    Some(init_path.to_string_lossy().into_owned())
}

/// PowerShell OSC 133 훅 (Windows — spawn_pty에서 stdin 주입)
#[cfg(windows)]
const POWERSHELL_INIT: &str = concat!(
    "function global:prompt {",
    " $e=$LASTEXITCODE;",
    " [Console]::Write(\"`e]133;D;$e`a\");",
    " $p=(Get-Location).Path;",
    " [Console]::Write(\"`e]7;file://$env:COMPUTERNAME/$($p.Replace('\\','/'))`a\");",
    " [Console]::Write(\"`e]133;A`a\");",
    " \"PS $p> \"",
    " }\r\n"
);
use std::collections::{HashMap, HashSet};
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
    /// spawn_pty 동시 호출로 같은 ID에 PTY가 두 개 생기는 TOCTOU 방지
    pub spawning: Arc<Mutex<HashSet<String>>>,
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
    // TOCTOU 방지: ptys 맵과 spawning 셋을 동시에 확인 — 락 사이 경쟁 없음
    {
        let ptys = state.ptys.lock().map_err(|_| LumError::Io("lock 오류".into()))?;
        let mut spawning = state.spawning.lock().map_err(|_| LumError::Io("lock 오류".into()))?;
        if ptys.contains_key(&id) || spawning.contains(&id) {
            return Ok(());
        }
        spawning.insert(id.clone());
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

    let shell_name = std::path::Path::new(&shell)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    // bash --init-file 사용 시 별도 CommandBuilder 필요
    #[cfg(not(windows))]
    let mut cmd = if shell_name == "bash" {
        if let Some(init_file) = setup_bash_initfile() {
            let mut c = CommandBuilder::new(&shell);
            c.arg("--init-file");
            c.arg(init_file);
            c
        } else {
            CommandBuilder::new(&shell)
        }
    } else {
        CommandBuilder::new(&shell)
    };
    #[cfg(windows)]
    let mut cmd = CommandBuilder::new(&shell);

    cmd.cwd(&work_dir);
    // Unix: TERM + 셸별 훅 환경변수 설정
    #[cfg(not(windows))]
    {
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if shell_name == "zsh" {
            if let Some(zdotdir) = setup_zsh_zdotdir() {
                cmd.env("ZDOTDIR", zdotdir);
            }
        }
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

    // Windows PowerShell: OSC 133 prompt hook을 stdin으로 주입
    #[cfg(windows)]
    {
        let sn = shell_name.to_lowercase();
        let sn_stem = sn.strip_suffix(".exe").unwrap_or(&sn);
        if sn_stem == "pwsh" || sn_stem == "powershell" {
            let _ = write_tx.send(POWERSHELL_INIT.as_bytes().to_vec());
        }
    }

    // ── 채널 핸들 저장 + spawning 제거 (원자적) ──────────────────
    {
        let mut ptys = state.ptys.lock().map_err(|_| LumError::Io("lock 오류".into()))?;
        let mut spawning = state.spawning.lock().map_err(|_| LumError::Io("lock 오류".into()))?;
        ptys.insert(id.clone(), PtyHandle { write_tx, resize_tx });
        spawning.remove(&id);
    }

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

/// SSH 원격 세션 — 시스템 ssh 바이너리를 PTY로 실행 (write_to_pty/resize_pty/close_pty 공유)
#[command]
pub async fn spawn_ssh_pty(
    app: AppHandle,
    state: State<'_, TerminalState>,
    id: String,
    host: String,
    port: u16,
    username: String,
    key_path: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<()> {
    {
        let ptys = state.ptys.lock().map_err(|_| LumError::Io("lock 오류".into()))?;
        if ptys.contains_key(&id) {
            return Ok(());
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| LumError::Io(format!("PTY 생성 실패: {}", e)))?;

    let mut cmd = CommandBuilder::new("ssh");
    cmd.arg(format!("{}@{}", username, host));
    cmd.arg("-p");
    cmd.arg(port.to_string());
    if let Some(ref key) = key_path {
        cmd.arg("-i");
        cmd.arg(key);
    }
    // 연결 타임아웃 10초
    cmd.arg("-o"); cmd.arg("ConnectTimeout=10");
    cmd.arg("-o"); cmd.arg("ServerAliveInterval=30");

    #[cfg(not(windows))]
    {
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
    }

    let _child = pair.slave
        .spawn_command(cmd)
        .map_err(|e| LumError::Io(format!("SSH 실행 실패: {}", e)))?;

    let mut writer = pair.master.take_writer()
        .map_err(|e| LumError::Io(e.to_string()))?;
    let mut reader = pair.master.try_clone_reader()
        .map_err(|e| LumError::Io(e.to_string()))?;

    let (write_tx, write_rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(64);
    let (resize_tx, resize_rx) = std::sync::mpsc::sync_channel::<(u16, u16)>(8);

    std::thread::spawn(move || {
        for data in write_rx {
            if writer.write_all(&data).is_err() { break; }
        }
    });

    let master = pair.master;
    std::thread::spawn(move || {
        for (r, c) in resize_rx {
            let _ = master.resize(PtySize { rows: r, cols: c, pixel_width: 0, pixel_height: 0 });
        }
    });

    let app_r = app.clone();
    let id_r = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_r.emit("pty_data", PtyData { id: id_r.clone(), data });
                }
            }
        }
        let _ = app_r.emit("pty_exit", id_r);
    });

    let mut ptys = state.ptys.lock().map_err(|_| LumError::Io("lock 오류".into()))?;
    ptys.insert(id, PtyHandle { write_tx, resize_tx });
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
