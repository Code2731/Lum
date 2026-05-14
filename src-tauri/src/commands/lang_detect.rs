// 소스 언어 감지 + tree-sitter grammar 매핑.
// repo_map.rs(심볼 그래프)와 rag.rs(AST 청킹)가 공유.
// 두 모듈 모두 같은 5개 언어를 지원하므로 enum/detect/grammar는 하나로 통일하되,
// query는 용도가 다르므로(이름만 vs 풀 노드) 각자 모듈에 유지.

use std::path::Path;
use tree_sitter::Language;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub(crate) enum SourceLang {
    Rust,
    TypeScript,
    Tsx,
    JavaScript,
    Python,
}

pub(crate) fn detect_source_lang(path: &Path) -> Option<SourceLang> {
    let ext = path.extension()?.to_str()?;
    Some(match ext {
        "rs" => SourceLang::Rust,
        "ts" => SourceLang::TypeScript,
        "tsx" => SourceLang::Tsx,
        "js" | "mjs" | "cjs" | "jsx" => SourceLang::JavaScript,
        "py" | "pyi" => SourceLang::Python,
        _ => return None,
    })
}

pub(crate) fn language_grammar(l: SourceLang) -> Language {
    match l {
        SourceLang::Rust => tree_sitter_rust::LANGUAGE.into(),
        SourceLang::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        SourceLang::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
        SourceLang::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
        SourceLang::Python => tree_sitter_python::LANGUAGE.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn 확장자_매핑() {
        assert_eq!(
            detect_source_lang(&PathBuf::from("a.rs")),
            Some(SourceLang::Rust)
        );
        assert_eq!(
            detect_source_lang(&PathBuf::from("a.ts")),
            Some(SourceLang::TypeScript)
        );
        assert_eq!(
            detect_source_lang(&PathBuf::from("a.tsx")),
            Some(SourceLang::Tsx)
        );
        assert_eq!(
            detect_source_lang(&PathBuf::from("a.js")),
            Some(SourceLang::JavaScript)
        );
        assert_eq!(
            detect_source_lang(&PathBuf::from("a.mjs")),
            Some(SourceLang::JavaScript)
        );
        assert_eq!(
            detect_source_lang(&PathBuf::from("a.cjs")),
            Some(SourceLang::JavaScript)
        );
        assert_eq!(
            detect_source_lang(&PathBuf::from("a.jsx")),
            Some(SourceLang::JavaScript)
        );
        assert_eq!(
            detect_source_lang(&PathBuf::from("a.py")),
            Some(SourceLang::Python)
        );
        assert_eq!(
            detect_source_lang(&PathBuf::from("a.pyi")),
            Some(SourceLang::Python)
        );
        assert_eq!(detect_source_lang(&PathBuf::from("a.go")), None);
        assert_eq!(detect_source_lang(&PathBuf::from("a.txt")), None);
        assert_eq!(detect_source_lang(&PathBuf::from("README")), None);
    }

    #[test]
    fn grammar_로드_가능() {
        // 단순히 panic 없이 호출되는지 확인 (실제 파싱은 호출처에서).
        let _ = language_grammar(SourceLang::Rust);
        let _ = language_grammar(SourceLang::TypeScript);
        let _ = language_grammar(SourceLang::Tsx);
        let _ = language_grammar(SourceLang::JavaScript);
        let _ = language_grammar(SourceLang::Python);
    }
}
