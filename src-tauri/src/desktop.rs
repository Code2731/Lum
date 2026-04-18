use screenshots::Screen;
use enigo::{Enigo, Mouse, Keyboard, Settings, Direction, Button, Key};
use base64::{Engine as _, engine::general_purpose};
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

/// 스크롤 액션: 지정 좌표에서 amount만큼 스크롤 (양수=아래, 음수=위)
#[derive(Debug, Serialize, Deserialize)]
pub struct ScrollAction {
    pub x: i32,
    pub y: i32,
    pub amount: i32,
}

/// 단축키 액션: modifier(ctrl/cmd/alt/shift) + key 조합
#[derive(Debug, Serialize, Deserialize)]
pub struct KeyComboAction {
    pub modifier: String, // "ctrl", "cmd", "alt", "shift"
    pub key: String,      // "c", "v", "a", "z", "tab", "esc" 등
}

/// 더블클릭/우클릭 액션
#[derive(Debug, Serialize, Deserialize)]
pub struct ClickAction {
    pub x: i32,
    pub y: i32,
    pub button: String,  // "left", "right", "double"
}

#[tauri::command]
pub async fn capture_screen() -> Result<String, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.first().ok_or("No screen found")?;

    let image = screen.capture().map_err(|e| e.to_string())?;

    let mut buffer = Vec::new();
    image.write_to(&mut Cursor::new(&mut buffer), screenshots::image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(general_purpose::STANDARD.encode(buffer))
}

#[tauri::command]
pub async fn simulate_mouse(action: MouseAction) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    enigo.move_mouse(action.x, action.y, enigo::Coordinate::Abs).map_err(|e| e.to_string())?;

    if action.click {
        enigo.button(Button::Left, Direction::Click).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn simulate_keyboard(action: KeyboardAction) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    enigo.text(&action.text).map_err(|e| e.to_string())?;

    if action.enter {
        enigo.key(Key::Return, Direction::Click).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 마우스 스크롤 (세로)
#[tauri::command]
pub async fn simulate_scroll(action: ScrollAction) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    // 지정 좌표로 이동
    enigo.move_mouse(action.x, action.y, enigo::Coordinate::Abs).map_err(|e| e.to_string())?;

    // 스크롤: enigo는 축 단위 스크롤 지원
    enigo.scroll(action.amount, enigo::Axis::Vertical).map_err(|e| e.to_string())?;

    Ok(())
}

/// 단축키 조합 실행 (예: Ctrl+C, Cmd+V)
#[tauri::command]
pub async fn simulate_key_combo(action: KeyComboAction) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    // modifier 키 결정
    let modifier_key = match action.modifier.to_lowercase().as_str() {
        "ctrl" | "control" => Key::Control,
        "cmd" | "command" | "meta" => Key::Meta,
        "alt" | "option" => Key::Alt,
        "shift" => Key::Shift,
        _ => return Err(format!("Unknown modifier: {}", action.modifier)),
    };

    // 대상 키 결정
    let target_key = match action.key.to_lowercase().as_str() {
        "c" => Key::Unicode('c'),
        "v" => Key::Unicode('v'),
        "x" => Key::Unicode('x'),
        "z" => Key::Unicode('z'),
        "a" => Key::Unicode('a'),
        "s" => Key::Unicode('s'),
        "w" => Key::Unicode('w'),
        "q" => Key::Unicode('q'),
        "t" => Key::Unicode('t'),
        "n" => Key::Unicode('n'),
        "tab" => Key::Tab,
        "esc" | "escape" => Key::Escape,
        "return" | "enter" => Key::Return,
        "delete" | "backspace" => Key::Backspace,
        "space" => Key::Space,
        "up" => Key::UpArrow,
        "down" => Key::DownArrow,
        "left" => Key::LeftArrow,
        "right" => Key::RightArrow,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f12" => Key::F12,
        other if other.len() == 1 => Key::Unicode(other.chars().next().unwrap()),
        _ => return Err(format!("Unknown key: {}", action.key)),
    };

    // modifier 누름 → 키 클릭 → modifier 해제
    enigo.key(modifier_key, Direction::Press).map_err(|e| e.to_string())?;
    enigo.key(target_key, Direction::Click).map_err(|e| e.to_string())?;
    enigo.key(modifier_key, Direction::Release).map_err(|e| e.to_string())?;

    Ok(())
}

/// 클릭 액션 (좌클릭/우클릭/더블클릭)
#[tauri::command]
pub async fn simulate_click(action: ClickAction) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    enigo.move_mouse(action.x, action.y, enigo::Coordinate::Abs).map_err(|e| e.to_string())?;

    match action.button.to_lowercase().as_str() {
        "left" => {
            enigo.button(Button::Left, Direction::Click).map_err(|e| e.to_string())?;
        }
        "right" => {
            enigo.button(Button::Right, Direction::Click).map_err(|e| e.to_string())?;
        }
        "double" => {
            enigo.button(Button::Left, Direction::Click).map_err(|e| e.to_string())?;
            // 더블클릭 간격 (50ms)
            std::thread::sleep(std::time::Duration::from_millis(50));
            enigo.button(Button::Left, Direction::Click).map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unknown button type: {}", action.button)),
    }

    Ok(())
}
