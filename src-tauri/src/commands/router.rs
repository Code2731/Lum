use crate::commands::config::AppConfig;

#[derive(Debug, Clone, PartialEq)]
pub enum Engine {
    TabbyApi,
    MistralRs,
}

/// 입력 텍스트와 설정을 보고 어느 엔진으로 라우팅할지 결정한다.
/// - "!!" 접두사 → MistralRs (Heavy Track)
/// - mistral_rs_enabled = false → 항상 TabbyApi
/// - 나머지 → TabbyApi (Fast Track)
pub fn route_engine(input: &str, config: &AppConfig) -> Engine {
    if !config.mistral_rs_enabled.unwrap_or(false) {
        return Engine::TabbyApi;
    }
    if input.trim_start().starts_with("!!") {
        return Engine::MistralRs;
    }
    Engine::TabbyApi
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(enabled: bool) -> AppConfig {
        AppConfig {
            mistral_rs_enabled: Some(enabled),
            ..Default::default()
        }
    }

    #[test]
    fn disabled_always_tabby() {
        assert_eq!(route_engine("!! 뭔가 무거운 작업", &cfg(false)), Engine::TabbyApi);
    }

    #[test]
    fn bang_bang_routes_to_mistral() {
        assert_eq!(route_engine("!! 번역해줘", &cfg(true)), Engine::MistralRs);
    }

    #[test]
    fn normal_input_routes_to_tabby() {
        assert_eq!(route_engine("git status 설명해줘", &cfg(true)), Engine::TabbyApi);
    }

    #[test]
    fn bang_bang_with_leading_space() {
        assert_eq!(route_engine("  !! 문서 분석", &cfg(true)), Engine::MistralRs);
    }

    #[test]
    fn empty_input_routes_to_tabby() {
        assert_eq!(route_engine("", &cfg(true)), Engine::TabbyApi);
    }
}
