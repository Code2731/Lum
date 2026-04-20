use serde::{Deserialize, Serialize};

const BLOCKED_PATTERNS: &[&str] = &[
    "rm -rf /", "mkfs", "> /dev/sda", "dd if=",
    "format c:", "format c /", "del /s /q c:\\", "rd /s /q c:\\",
    "diskpart", "cipher /w:c", "sfc /scannow /offbootdir",
];

const DANGEROUS_PATTERNS: &[&str] = &[
    "rm -rf", "sudo ", "chmod 777", "chown", "curl | bash", "wget | bash",
    "del /f", "rd /s", "reg delete", "reg add", "schtasks /delete", "net user",
    "icacls", "takeown /f",
];

const WARNING_PATTERNS: &[&str] = &[
    "npm install -g", "pip install", "rm ", "mv ",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SecurityLevel {
    Safe,
    Warning,
    Dangerous,
    Blocked,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommandSafetyReport {
    pub level: SecurityLevel,
    pub reason: String,
    pub sensitive_patterns: Vec<String>,
}

#[tauri::command]
pub fn verify_command_safety(command: String) -> CommandSafetyReport {
    let cmd_lower = command.to_lowercase();

    for &p in BLOCKED_PATTERNS {
        if cmd_lower.contains(p) {
            return CommandSafetyReport {
                level: SecurityLevel::Blocked,
                reason: format!("파괴적인 시스템 명령어가 감지되었습니다: {}", p),
                sensitive_patterns: vec![p.to_string()],
            };
        }
    }

    let detected_danger: Vec<String> = DANGEROUS_PATTERNS
        .iter()
        .filter(|&&p| cmd_lower.contains(p))
        .map(|&p| p.to_string())
        .collect();

    if !detected_danger.is_empty() {
        return CommandSafetyReport {
            level: SecurityLevel::Dangerous,
            reason: "시스템 설정을 변경하거나 파일을 삭제할 수 있는 위험한 명령어가 포함되어 있습니다.".to_string(),
            sensitive_patterns: detected_danger,
        };
    }

    let detected_warning: Vec<String> = WARNING_PATTERNS
        .iter()
        .filter(|&&p| cmd_lower.contains(p))
        .map(|&p| p.to_string())
        .collect();

    if !detected_warning.is_empty() {
        return CommandSafetyReport {
            level: SecurityLevel::Warning,
            reason: "외부 패키지 설치나 파일 이동/삭제 명령어가 포함되어 있습니다.".to_string(),
            sensitive_patterns: detected_warning,
        };
    }

    CommandSafetyReport {
        level: SecurityLevel::Safe,
        reason: "안전한 명령어로 판단됩니다.".to_string(),
        sensitive_patterns: vec![],
    }
}
