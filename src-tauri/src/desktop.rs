use screenshots::Screen;
use enigo::{Enigo, Mouse, Keyboard, Settings, Coordinate};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use std::io::Cursor;

#[derive(Debug, Serialize, Deserialize)]
pub struct MouseAction {
    pub x: i32,
    pub y: i32,
    pub click: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyboardAction {
    pub text: String,
    pub enter: bool,
}

#[cfg(target_os = "linux")]
fn check_wayland() -> Result<(), String> {
    if std::env::var("WAYLAND_DISPLAY").is_ok() {
        return Err("Wayland 환경에서는 데스크톱 자동화가 지원되지 않습니다. XWayland를 사용하세요.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn capture_screen() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    check_wayland()?;
    let screens = Screen::all().map_err(|e| e.to_string())?;
    if let Some(screen) = screens.first() {
        let image = screen.capture().map_err(|e| e.to_string())?;
        // RgbaImage의 가공
        let mut buffer = Cursor::new(Vec::new());
        image.write_to(&mut buffer, screenshots::image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Ok(general_purpose::STANDARD.encode(buffer.into_inner()))
    } else {
        Err("No screen found".to_string())
    }
}

#[tauri::command]
pub fn simulate_mouse(action: MouseAction) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    check_wayland()?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.move_mouse(action.x, action.y, Coordinate::Abs).map_err(|e| e.to_string())?;
    if action.click {
        enigo.button(enigo::Button::Left, enigo::Direction::Click).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn simulate_keyboard(action: KeyboardAction) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    check_wayland()?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.text(&action.text).map_err(|e| e.to_string())?;
    if action.enter {
        enigo.key(enigo::Key::Return, enigo::Direction::Click).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn simulate_click(x: i32, y: i32, button: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    check_wayland()?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())?;
    let b = match button.as_str() {
        "right" => enigo::Button::Right,
        "middle" => enigo::Button::Middle,
        _ => enigo::Button::Left,
    };
    enigo.button(b, enigo::Direction::Click).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn simulate_scroll(x: i32, y: i32, amount: i32) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    check_wayland()?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())?;
    enigo.scroll(amount, enigo::Axis::Vertical).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn simulate_key_combo(modifier: String, key: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    check_wayland()?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let m = match modifier.to_lowercase().as_str() {
        "cmd" | "command" | "meta" => enigo::Key::Meta,
        "ctrl" | "control" => enigo::Key::Control,
        "alt" | "option" => enigo::Key::Alt,
        "shift" => enigo::Key::Shift,
        _ => return Err(format!("Unknown modifier: '{}'", modifier)),
    };
    
    let k = match key.to_lowercase().as_str() {
        "v" => enigo::Key::Unicode('v'),
        "c" => enigo::Key::Unicode('c'),
        "a" => enigo::Key::Unicode('a'),
        _ => enigo::Key::Unicode(key.chars().next().unwrap_or(' ')),
    };

    enigo.key(m, enigo::Direction::Press).map_err(|e| e.to_string())?;
    enigo.key(k, enigo::Direction::Click).map_err(|e| e.to_string())?;
    enigo.key(m, enigo::Direction::Release).map_err(|e| e.to_string())?;
    Ok(())
}
