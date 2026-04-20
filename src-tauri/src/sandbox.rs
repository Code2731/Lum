use serde::{Deserialize, Serialize};
use std::collections::HashSet;

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
    
    // 1. 차단된 패턴 (절대 금지)
    let blocked_patterns = ["rm -rf /", "mkfs", "> /dev/sda", "dd if="];
    for p in blocked_patterns {
        if cmd_lower.contains(p) {
            return CommandSafetyReport {
                level: SecurityLevel::Blocked,
                reason: format!("파괴적인 시스템 명령어가 감지되었습니다: {}", p),
                sensitive_patterns: vec![p.to_string()],
            };
        }
    }

    // 2. 위험 패턴 (사용자 강한 승인 필요)
    let dangerous_patterns = ["rm -rf", "sudo ", "chmod 777", "chown", "curl | bash", "wget | bash"];
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
