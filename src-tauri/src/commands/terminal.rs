use crate::error::{Result, LumError};
use tauri::command;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

pub struct TerminalState {
    pub writers: Arc<Mutex<HashMap<String, String>>>, // PTY 스트림 핸들러 (실제론 스트림 타입)
}

#[command]
pub async fn spawn_pty(
    id: String,
    cwd: String,
    command: String,
) -> Result<String> {
    // PTY 생성 시뮬레이션
    println!("Spawning PTY for block {}: {} in {}", id, command, cwd);
    Ok(format!("PTY {} spawned.", id))
}

#[command]
pub async fn write_to_pty(
    id: String,
    data: String,
) -> Result<()> {
    // PTY 데이터 전송
    println!("Writing to PTY {}: {}", id, data);
    Ok(())
}

#[command]
pub async fn resize_pty(
    id: String,
    rows: u16,
    cols: u16,
) -> Result<()> {
    // PTY 리사이징
    println!("Resizing PTY {} to {}x{}", id, rows, cols);
    Ok(())
}

/// 현재 디렉토리 기준으로 셸 자동 완성 후보를 반환한다.
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
        .take(20) // 최대 20개
        .collect();

    Ok(matches)
}
