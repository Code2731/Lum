use std::path::PathBuf;
use std::sync::OnceLock;

/// 홈 디렉토리를 못 찾으면 현재 디렉토리로 폴백 (dirs가 None을 반환하는 경우 방어)
pub fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

/// TabbyAPI 기본 모델 경로 ~/tabby/models
pub fn default_models_dir() -> PathBuf {
    home_dir().join("tabby").join("models")
}

/// 기본 셸 — 최초 호출 시 한 번만 결정하고 이후 캐시
pub fn default_shell() -> &'static str {
    static SHELL: OnceLock<String> = OnceLock::new();
    SHELL.get_or_init(|| {
        #[cfg(windows)]
        {
            if which_exists("pwsh") {
                return "pwsh".to_string();
            }
            if which_exists("powershell") {
                return "powershell".to_string();
            }
            "cmd.exe".to_string()
        }
        #[cfg(not(windows))]
        {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
        }
    })
}

#[cfg(windows)]
fn which_exists(name: &str) -> bool {
    std::process::Command::new("where")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
