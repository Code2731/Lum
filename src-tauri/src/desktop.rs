use base64::{engine::general_purpose, Engine as _};
use enigo::{Coordinate, Enigo, Keyboard, Mouse, Settings};
use screenshots::Screen;
use serde::{Deserialize, Serialize};
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
        return Err(
            "Wayland 환경에서는 데스크톱 자동화가 지원되지 않습니다. XWayland를 사용하세요."
                .to_string(),
        );
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
        image
            .write_to(&mut buffer, screenshots::image::ImageFormat::Png)
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
    enigo
        .move_mouse(action.x, action.y, Coordinate::Abs)
        .map_err(|e| e.to_string())?;
    if action.click {
        enigo
            .button(enigo::Button::Left, enigo::Direction::Click)
            .map_err(|e| e.to_string())?;
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
        enigo
            .key(enigo::Key::Return, enigo::Direction::Click)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn simulate_click(x: i32, y: i32, button: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    check_wayland()?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| e.to_string())?;
    let b = parse_mouse_button(&button)?;
    enigo
        .button(b, enigo::Direction::Click)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn simulate_scroll(x: i32, y: i32, amount: i32) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    check_wayland()?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| e.to_string())?;
    enigo
        .scroll(amount, enigo::Axis::Vertical)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn simulate_key_combo(modifier: String, key: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    check_wayland()?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let m = parse_modifier_key(&modifier)?;
    let k = parse_combo_key(&key)?;

    enigo
        .key(m, enigo::Direction::Press)
        .map_err(|e| e.to_string())?;
    enigo
        .key(k, enigo::Direction::Click)
        .map_err(|e| e.to_string())?;
    enigo
        .key(m, enigo::Direction::Release)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_mouse_button(raw: &str) -> Result<enigo::Button, String> {
    let normalized = raw.trim().to_lowercase();
    match normalized.as_str() {
        "" | "left" => Ok(enigo::Button::Left),
        "right" => Ok(enigo::Button::Right),
        "middle" => Ok(enigo::Button::Middle),
        _ => Err(format!(
            "Unknown mouse button: '{}'. allowed: left/right/middle",
            raw
        )),
    }
}

fn parse_modifier_key(raw: &str) -> Result<enigo::Key, String> {
    let normalized = raw.trim().to_lowercase();
    match normalized.as_str() {
        "cmd" | "command" | "meta" | "super" | "win" | "windows" => Ok(enigo::Key::Meta),
        "ctrl" | "control" => Ok(enigo::Key::Control),
        "alt" | "option" => Ok(enigo::Key::Alt),
        "shift" => Ok(enigo::Key::Shift),
        _ => Err(format!("Unknown modifier: '{}'", raw)),
    }
}

fn parse_combo_key(raw: &str) -> Result<enigo::Key, String> {
    let normalized = raw.trim().to_lowercase();
    if normalized.is_empty() {
        return Err("Key is empty".to_string());
    }
    let named_key = match normalized.as_str() {
        "enter" | "return" => Some(enigo::Key::Return),
        "space" => Some(enigo::Key::Space),
        "tab" => Some(enigo::Key::Tab),
        "esc" | "escape" => Some(enigo::Key::Escape),
        "backspace" => Some(enigo::Key::Backspace),
        "delete" | "del" => Some(enigo::Key::Delete),
        "up" | "arrowup" => Some(enigo::Key::UpArrow),
        "down" | "arrowdown" => Some(enigo::Key::DownArrow),
        "left" | "arrowleft" => Some(enigo::Key::LeftArrow),
        "right" | "arrowright" => Some(enigo::Key::RightArrow),
        "home" => Some(enigo::Key::Home),
        "end" => Some(enigo::Key::End),
        "pageup" | "pgup" => Some(enigo::Key::PageUp),
        "pagedown" | "pgdn" => Some(enigo::Key::PageDown),
        "f1" => Some(enigo::Key::F1),
        "f2" => Some(enigo::Key::F2),
        "f3" => Some(enigo::Key::F3),
        "f4" => Some(enigo::Key::F4),
        "f5" => Some(enigo::Key::F5),
        "f6" => Some(enigo::Key::F6),
        "f7" => Some(enigo::Key::F7),
        "f8" => Some(enigo::Key::F8),
        "f9" => Some(enigo::Key::F9),
        "f10" => Some(enigo::Key::F10),
        "f11" => Some(enigo::Key::F11),
        "f12" => Some(enigo::Key::F12),
        _ => None,
    };
    if let Some(key) = named_key {
        return Ok(key);
    }
    let mut chars = normalized.chars();
    let first = chars.next().ok_or_else(|| "Key is empty".to_string())?;
    if chars.next().is_some() {
        return Err(format!(
            "Unknown key token: '{}'. allowed: 1 char or enter/space/tab/esc/backspace/delete/up/down/left/right/home/end/pageup(pgup)/pagedown(pgdn)/f1~f12",
            raw
        ));
    }
    Ok(enigo::Key::Unicode(first))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_mouse_button_허용값_성공() {
        assert!(parse_mouse_button("left").is_ok());
        assert!(parse_mouse_button("RIGHT").is_ok());
        assert!(parse_mouse_button(" middle ").is_ok());
        assert!(parse_mouse_button("").is_ok());
    }

    #[test]
    fn parse_mouse_button_비허용값_거부() {
        let err = parse_mouse_button("double").unwrap_err();
        assert!(err.contains("allowed: left/right/middle"), "{err}");
    }

    #[test]
    fn parse_modifier_key_허용값_성공() {
        assert!(parse_modifier_key("cmd").is_ok());
        assert!(parse_modifier_key("super").is_ok());
        assert!(parse_modifier_key("windows").is_ok());
        assert!(parse_modifier_key(" CONTROL ").is_ok());
        assert!(parse_modifier_key("option").is_ok());
        assert!(parse_modifier_key("shift").is_ok());
    }

    #[test]
    fn parse_modifier_key_비허용값_거부() {
        let err = parse_modifier_key("hyper").unwrap_err();
        assert!(err.contains("Unknown modifier"), "{err}");
    }

    #[test]
    fn parse_combo_key_허용값_성공() {
        assert!(parse_combo_key("k").is_ok());
        assert!(parse_combo_key(" V ").is_ok());
        assert!(parse_combo_key("enter").is_ok());
        assert!(parse_combo_key("space").is_ok());
        assert!(parse_combo_key("tab").is_ok());
        assert!(parse_combo_key("esc").is_ok());
        assert!(parse_combo_key("up").is_ok());
        assert!(parse_combo_key("arrowleft").is_ok());
        assert!(parse_combo_key("pagedown").is_ok());
        assert!(parse_combo_key("pgup").is_ok());
        assert!(parse_combo_key("pgdn").is_ok());
        assert!(parse_combo_key("f12").is_ok());
    }

    #[test]
    fn parse_combo_key_빈값_거부() {
        let err = parse_combo_key("   ").unwrap_err();
        assert!(err.contains("Key is empty"), "{err}");
    }

    #[test]
    fn parse_combo_key_다문자_토큰_거부() {
        let err = parse_combo_key("superkey").unwrap_err();
        assert!(err.contains("Unknown key token"), "{err}");
        assert!(err.contains("allowed:"), "{err}");
    }
}
