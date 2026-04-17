use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SecurityStatus {
    Safe,
    Warning,
    Dangerous,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecurityReport {
    pub status: SecurityStatus,
    pub reason: Option<String>,
    pub command: String,
}

#[tauri::command]
pub fn verify_command_safety(command: String) -> SecurityReport {
    let lower_cmd = command.to_lowercase();
    let words: Vec<&str> = lower_cmd.split_whitespace().collect();

    // 1. Dangerous Commands (즉각 차단 권장)
    if lower_cmd.contains("rm -rf") && (lower_cmd.contains("/") || lower_cmd.contains("~") || lower_cmd.contains("$home")) {
        return SecurityReport {
            status: SecurityStatus::Dangerous,
            reason: Some("시스템 루트(/) 또는 홈 디렉토리를 삭제하려는 시도가 감지되었습니다.".to_string()),
            command,
        };
    }

    if lower_cmd.contains("> /dev/sda") || lower_cmd.contains("> /dev/nvme") {
        return SecurityReport {
            status: SecurityStatus::Dangerous,
            reason: Some("디바이스 장치에 직접 쓰기 시도가 감지되었습니다. 데이터가 파괴될 수 있습니다.".to_string()),
            command,
        };
    }

    if words.contains(&"mkfs") || words.contains(&"fdisk") {
        return SecurityReport {
            status: SecurityStatus::Dangerous,
            reason: Some("디스크 포맷 또는 파티션 변경 명령어가 감지되었습니다.".to_string()),
            command,
        };
    }

    // 2. Warning Commands (주의 요망)
    if lower_cmd.contains("sudo ") {
        return SecurityReport {
            status: SecurityStatus::Warning,
            reason: Some("관리자 권한(sudo)을 사용하는 명령어입니다. 실행 전 내용을 반드시 확인하세요.".to_string()),
            command,
        };
    }

    if lower_cmd.contains("chmod -r 777") || lower_cmd.contains("chown -r") {
        return SecurityReport {
            status: SecurityStatus::Warning,
            reason: Some("광범위한 파일 권한 변경은 보안 취약점을 만들 수 있습니다.".to_string()),
            command,
        };
    }

    if lower_cmd.contains("curl") && (lower_cmd.contains("| sh") || lower_cmd.contains("| bash")) {
        return SecurityReport {
            status: SecurityStatus::Warning,
            reason: Some("인터넷에서 스크립트를 다운로드하여 즉시 실행하는 것은 매우 위험할 수 있습니다.".to_string()),
            command,
        };
    }

    // 3. Safe (일반적인 명령어)
    SecurityReport {
        status: SecurityStatus::Safe,
        reason: None,
        command,
    }
}
