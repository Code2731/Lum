use crate::commands::config::load_config;
use serde::Serialize;

/// Phase 131 — Recall 벡터 검색 프록시.
/// 현재는 local-cosine만 구현하지만, 인터페이스를 고정해 두면
/// 이후 zVec/외부 DB 백엔드를 런타임 교체로 붙일 수 있다.
pub trait RecallVectorBackend: Send + Sync {
    fn name(&self) -> &'static str;
    fn similarity(&self, query: &[f32], candidate: &[f32]) -> f32;
}

#[derive(Default)]
pub struct LocalCosineBackend;

impl RecallVectorBackend for LocalCosineBackend {
    fn name(&self) -> &'static str {
        "local-cosine"
    }

    fn similarity(&self, query: &[f32], candidate: &[f32]) -> f32 {
        crate::memory::cosine_similarity(query, candidate)
    }
}

fn normalize_backend_name(raw: &str) -> String {
    raw.trim().to_ascii_lowercase().replace('_', "-")
}

/// 사용자 입력 백엔드 키를 지원 키로 정규화.
/// None/빈 문자열은 None, 미지원 값은 안전 기본값(local-cosine)으로 교정.
pub fn normalize_requested_backend_key(raw: Option<&str>) -> Option<String> {
    let Some(raw_name) = raw else {
        return None;
    };
    let name = normalize_backend_name(raw_name);
    if name.is_empty() {
        return None;
    }
    match name.as_str() {
        "local-cosine" | "localcosine" | "cosine" | "default" => Some("local-cosine".into()),
        // zvec 키는 프록시 슬롯으로 유지(현재 엔진은 local-cosine 폴백).
        "zvec" | "z-vec" => Some("zvec".into()),
        _ => Some("local-cosine".into()),
    }
}

/// 설정 파일에서 요청 백엔드 키를 읽어 정규화해서 반환.
pub fn load_requested_backend_key() -> Option<String> {
    let requested_raw = load_config()
        .ok()
        .and_then(|c| c.recall_vector_backend)
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    normalize_requested_backend_key(requested_raw.as_deref())
}

/// 설정값이 비었거나 알 수 없으면 안전한 기본 백엔드(local-cosine)로 폴백.
pub fn resolve_backend(requested: Option<&str>) -> Box<dyn RecallVectorBackend> {
    match normalize_requested_backend_key(requested).as_deref() {
        Some("local-cosine") | Some("zvec") | None => Box::<LocalCosineBackend>::default(),
        Some(_) => Box::<LocalCosineBackend>::default(),
    }
}

#[derive(Serialize)]
pub struct RecallBackendInfo {
    pub requested_raw: Option<String>,
    pub requested: Option<String>,
    pub active: String,
    pub supported: Vec<String>,
    pub requested_adjusted: bool,
    pub active_matches_requested: bool,
}

fn build_backend_info(requested_raw: Option<String>) -> RecallBackendInfo {
    let requested = normalize_requested_backend_key(requested_raw.as_deref());
    let backend = resolve_backend(requested.as_deref());
    let active = backend.name().to_string();
    let requested_adjusted = requested_raw.as_deref() != requested.as_deref();
    let active_matches_requested = requested
        .as_deref()
        .map(|r| r == active.as_str())
        .unwrap_or(true);
    RecallBackendInfo {
        requested_raw,
        requested,
        active,
        // `zvec`는 호환 키로 예약(현재 구현은 local-cosine 폴백).
        supported: vec!["local-cosine".into(), "zvec".into()],
        requested_adjusted,
        active_matches_requested,
    }
}

#[tauri::command]
pub fn recall_backend_info() -> RecallBackendInfo {
    let requested_raw = load_config()
        .ok()
        .and_then(|c| c.recall_vector_backend)
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    build_backend_info(requested_raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_unknown_falls_back_to_local_cosine() {
        let backend = resolve_backend(Some("unknown-backend"));
        assert_eq!(backend.name(), "local-cosine");
    }

    #[test]
    fn resolve_aliases_to_local_cosine() {
        for name in ["cosine", "default", "zvec", "LOCAL_COSINE"] {
            let backend = resolve_backend(Some(name));
            assert_eq!(backend.name(), "local-cosine");
        }
    }

    #[test]
    fn normalize_requested_backend_key_works() {
        assert_eq!(normalize_requested_backend_key(None), None);
        assert_eq!(normalize_requested_backend_key(Some("  ")), None);
        assert_eq!(
            normalize_requested_backend_key(Some("LOCAL_COSINE")).as_deref(),
            Some("local-cosine")
        );
        assert_eq!(
            normalize_requested_backend_key(Some("  local_cosine  ")).as_deref(),
            Some("local-cosine")
        );
        assert_eq!(
            normalize_requested_backend_key(Some("zvec")).as_deref(),
            Some("zvec")
        );
        assert_eq!(
            normalize_requested_backend_key(Some("z-vec")).as_deref(),
            Some("zvec")
        );
        assert_eq!(
            normalize_requested_backend_key(Some("Z_VEC")).as_deref(),
            Some("zvec")
        );
        assert_eq!(
            normalize_requested_backend_key(Some("localcosine")).as_deref(),
            Some("local-cosine")
        );
        assert_eq!(
            normalize_requested_backend_key(Some("  default  ")).as_deref(),
            Some("local-cosine")
        );
        assert_eq!(
            normalize_requested_backend_key(Some("custom-db")).as_deref(),
            Some("local-cosine")
        );
    }

    #[test]
    fn build_backend_info_marks_adjusted_when_raw_is_normalized() {
        let info = build_backend_info(Some("custom-db".into()));
        assert_eq!(info.requested_raw.as_deref(), Some("custom-db"));
        assert_eq!(info.requested.as_deref(), Some("local-cosine"));
        assert!(info.requested_adjusted);
        assert!(info.active_matches_requested);
    }

    #[test]
    fn build_backend_info_marks_active_mismatch_for_zvec_proxy() {
        let info = build_backend_info(Some("zvec".into()));
        assert_eq!(info.requested_raw.as_deref(), Some("zvec"));
        assert_eq!(info.requested.as_deref(), Some("zvec"));
        assert!(!info.requested_adjusted);
        assert!(!info.active_matches_requested);
        assert_eq!(info.active, "local-cosine");
    }

    #[test]
    fn build_backend_info_defaults_when_raw_missing() {
        let info = build_backend_info(None);
        assert_eq!(info.requested_raw, None);
        assert_eq!(info.requested, None);
        assert_eq!(info.active, "local-cosine");
        assert!(!info.requested_adjusted);
        assert!(info.active_matches_requested);
    }

    #[test]
    fn build_backend_info_marks_adjusted_for_localcosine_alias() {
        let info = build_backend_info(Some("localcosine".into()));
        assert_eq!(info.requested_raw.as_deref(), Some("localcosine"));
        assert_eq!(info.requested.as_deref(), Some("local-cosine"));
        assert!(info.requested_adjusted);
        assert!(info.active_matches_requested);
    }
}
