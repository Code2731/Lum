use serde::{Deserialize, Serialize};

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

/// 명령어의 위험성을 정적 분석합니다.
#[tauri::command]
pub fn verify_command_safety(command: String) -> CommandSafetyReport {
    let cmd_lower = command.to_lowercase();
    
    // 1. 차단된 패턴 (절대 금지) — Unix + Windows 공통
    let blocked_patterns = [
        // Unix 파괴 명령
        "rm -rf /", "mkfs", "> /dev/sda", "dd if=",
        // Windows 파괴 명령
        "format c:", "format c /", "del /s /q c:\\", "rd /s /q c:\\",
        "diskpart", "cipher /w:c", "sfc /scannow /offbootdir",
    ];
    for p in blocked_patterns {
        if cmd_lower.contains(p) {
            return CommandSafetyReport {
                level: SecurityLevel::Blocked,
                reason: format!("파괴적인 시스템 명령어가 감지되었습니다: {}", p),
                sensitive_patterns: vec![p.to_string()],
            };
        }
    }

    // 2. 위험 패턴 (사용자 강한 승인 필요) — Unix + Windows
    let dangerous_patterns = [
        // Unix
        "rm -rf", "sudo ", "chmod 777", "chown", "curl | bash", "wget | bash",
        // Windows
        "del /f", "rd /s", "reg delete", "reg add", "schtasks /delete", "net user",
        "icacls", "takeown /f",
    ];
    let mut detected_danger = Vec::new();
    for p in dangerous_patterns {
        if cmd_lower.contains(p) {
            detected_danger.push(p.to_string());
        }
    }

    if !detected_danger.is_empty() {
        return CommandSafetyReport {
            level: SecurityLevel::Dangerous,
            reason: "시스템 설정을 변경하거나 파일을 삭제할 수 있는 위험한 명령어가 포함되어 있습니다.".to_string(),
            sensitive_patterns: detected_danger,
        };
    }

    // 3. 경고 패턴 (주의 필요)
    let warning_patterns = ["npm install -g", "pip install", "rm ", "mv "];
    let mut detected_warning = Vec::new();
    for p in warning_patterns {
        if cmd_lower.contains(p) {
            detected_warning.push(p.to_string());
        }
    }

    if !detected_warning.is_empty() {
        return CommandSafetyReport {
            level: SecurityLevel::Warning,
            reason: "외부 패키지 설치나 파일 이동/삭제 명령어가 포함되어 있습니다.".to_string(),
            sensitive_patterns: detected_warning,
        };
    }

    // 4. 안전
    CommandSafetyReport {
        level: SecurityLevel::Safe,
        reason: "안전한 명령어로 판단됩니다.".to_string(),
        sensitive_patterns: vec![],
    }
}
