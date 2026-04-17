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
