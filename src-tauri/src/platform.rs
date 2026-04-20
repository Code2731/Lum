/// 플랫폼별 공통 경로 헬퍼
///
/// HOME/$APPDATA 등 OS별 환경변수 차이를 추상화.
/// Windows: USERPROFILE / APPDATA / LOCALAPPDATA
/// macOS/Linux: HOME
use std::path::PathBuf;

/// 사용자 홈 디렉토리 반환 (모든 플랫폼)
pub fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

/// 앱 데이터 디렉토리 반환
///   Windows : %APPDATA%\Lum
///   macOS   : ~/Library/Application Support/Lum
///   Linux   : ~/.local/share/lum
pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(home_dir)
        .join("Lum")
}

/// 기본 모델 저장 경로 (TabbyAPI 호환)
///   ~/tabby/models  (모든 OS, TabbyAPI 기본값)
pub fn default_models_dir() -> PathBuf {
    home_dir().join("tabby").join("models")
}

/// 기본 셸 결정
///   Windows : PowerShell → cmd.exe 순 폴백
///   macOS/Linux : $SHELL → /bin/sh 폴백
pub fn default_shell() -> String {
    #[cfg(windows)]
    {
        // PowerShell이 있으면 우선 사용
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
}

#[cfg(windows)]
fn which_exists(name: &str) -> bool {
    std::process::Command::new("where")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
