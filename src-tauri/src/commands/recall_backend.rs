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

/// 설정값이 비었거나 알 수 없으면 안전한 기본 백엔드(local-cosine)로 폴백.
pub fn resolve_backend(requested: Option<&str>) -> Box<dyn RecallVectorBackend> {
    match requested.map(normalize_backend_name).as_deref() {
        Some("local-cosine") | Some("cosine") | Some("default") | Some("zvec") | None => {
            Box::<LocalCosineBackend>::default()
        }
        Some(_) => Box::<LocalCosineBackend>::default(),
    }
}

#[derive(Serialize)]
pub struct RecallBackendInfo {
    pub requested: Option<String>,
    pub active: String,
    pub supported: Vec<String>,
}

#[tauri::command]
pub fn recall_backend_info() -> RecallBackendInfo {
    let requested = load_config()
        .ok()
        .and_then(|c| c.recall_vector_backend)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let backend = resolve_backend(requested.as_deref());
    RecallBackendInfo {
        requested,
        active: backend.name().to_string(),
        // `zvec`는 호환 키로 예약(현재 구현은 local-cosine 폴백).
        supported: vec!["local-cosine".into(), "zvec".into()],
    }
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
}
