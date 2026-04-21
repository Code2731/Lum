use serde::Serialize;
use std::time::Duration;

const GITHUB_API: &str = "https://api.github.com/repos/Code2731/Lum/releases/latest";

#[derive(Serialize)]
pub struct VersionInfo {
    pub current: String,
    pub latest: String,
    pub has_update: bool,
    pub release_url: String,
    pub release_name: String,
}

#[tauri::command]
pub async fn check_for_update() -> Result<VersionInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("LUM-Terminal")
        .build()
        .map_err(|e| e.to_string())?;

    let resp: serde_json::Value = client
        .get(GITHUB_API)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let tag = resp["tag_name"].as_str().unwrap_or("").trim_start_matches('v');
    let release_url = resp["html_url"].as_str().unwrap_or("").to_string();
    let release_name = resp["name"].as_str().unwrap_or(tag).to_string();

    Ok(VersionInfo {
        has_update: is_newer(tag, &current),
        latest: tag.to_string(),
        current,
        release_url,
        release_name,
    })
}

/// 단순 semver 비교 — major.minor.patch 숫자 비교
fn is_newer(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> (u32, u32, u32) {
        let mut it = s.splitn(3, '.').map(|p| p.parse::<u32>().unwrap_or(0));
        (it.next().unwrap_or(0), it.next().unwrap_or(0), it.next().unwrap_or(0))
    };
    parse(latest) > parse(current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_major_version() {
        assert!(is_newer("2.0.0", "1.9.9"));
        assert!(!is_newer("1.9.9", "2.0.0"));
    }

    #[test]
    fn newer_minor_version() {
        assert!(is_newer("1.1.0", "1.0.9"));
        assert!(!is_newer("1.0.9", "1.1.0"));
    }

    #[test]
    fn newer_patch_version() {
        assert!(is_newer("1.0.1", "1.0.0"));
        assert!(!is_newer("1.0.0", "1.0.1"));
    }

    #[test]
    fn same_version_is_not_newer() {
        assert!(!is_newer("1.0.0", "1.0.0"));
        assert!(!is_newer("2.3.4", "2.3.4"));
    }

    #[test]
    fn malformed_version_treated_as_zero() {
        // "invalid" → (0,0,0), "0.0.1" → (0,0,1): 0.0.1 이 더 큼
        assert!(!is_newer("invalid", "0.0.1"));
        assert!(is_newer("0.0.1", "invalid"));
    }

    #[test]
    fn partial_version_string() {
        // "2.0" → (2,0,0), "1.9.9" → (1,9,9): 2.0 이 더 큼
        assert!(is_newer("2.0", "1.9.9"));
        assert!(!is_newer("1.9.9", "2.0"));
    }
}
