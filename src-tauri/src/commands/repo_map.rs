// Phase 70 — Repo Map (tree-sitter + PageRank)
//
// 프로젝트의 각 소스 파일을 AST 파싱해 정의(definition)와 참조(reference)를
// 추출하고, symbol → file 그래프를 만들어 PageRank로 중요도를 산정한다.
// 토큰 예산 내에서 가장 중요한 심볼만 요약해 AI 컨텍스트로 주입할 수 있게 한다.
//
// 지원 언어: Rust, TypeScript/TSX, JavaScript, Python (2026년 기준 가장 흔한 4종)

use crate::commands::lang_detect::{detect_source_lang, language_grammar, SourceLang};
use crate::error::Result;
use ignore::WalkBuilder;
use petgraph::graph::{DiGraph, NodeIndex};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::command;
use tree_sitter::{Node, Parser, Query, QueryCursor};

// 언어 감지/grammar는 lang_detect 공용 모듈로 통합 (Phase 137-A 사후 정리).
// Lang 별칭은 기존 호출자 호환을 위해 유지.
type Lang = SourceLang;

fn detect_lang(path: &Path) -> Option<Lang> {
    detect_source_lang(path)
}

fn lang_grammar(l: Lang) -> tree_sitter::Language {
    language_grammar(l)
}

/// 언어별 정의 쿼리 — (def 이름 노드, def 종류 이름)
fn definition_query(l: Lang) -> &'static str {
    match l {
        Lang::Rust => {
            r#"
            (function_item name: (identifier) @def.fn)
            (struct_item name: (type_identifier) @def.struct)
            (enum_item name: (type_identifier) @def.enum)
            (trait_item name: (type_identifier) @def.trait)
            (impl_item type: (type_identifier) @def.impl)
            (mod_item name: (identifier) @def.mod)
            (const_item name: (identifier) @def.const)
            (static_item name: (identifier) @def.static)
            (type_item name: (type_identifier) @def.type)
            "#
        }
        Lang::TypeScript | Lang::Tsx => {
            r#"
            (function_declaration name: (identifier) @def.fn)
            (class_declaration name: (type_identifier) @def.class)
            (interface_declaration name: (type_identifier) @def.interface)
            (type_alias_declaration name: (type_identifier) @def.type)
            (method_definition name: (property_identifier) @def.method)
            (enum_declaration name: (identifier) @def.enum)
            (variable_declarator name: (identifier) @def.var)
            "#
        }
        Lang::JavaScript => {
            r#"
            (function_declaration name: (identifier) @def.fn)
            (class_declaration name: (identifier) @def.class)
            (method_definition name: (property_identifier) @def.method)
            (variable_declarator name: (identifier) @def.var)
            "#
        }
        Lang::Python => {
            r#"
            (function_definition name: (identifier) @def.fn)
            (class_definition name: (identifier) @def.class)
            "#
        }
    }
}

/// 참조(호출/식별자) 쿼리 — 간단히 모든 identifier를 참조로 간주
fn reference_query(l: Lang) -> &'static str {
    match l {
        Lang::Rust => {
            r#"
            (call_expression function: (identifier) @ref)
            (call_expression function: (scoped_identifier name: (identifier) @ref))
            (call_expression function: (field_expression field: (field_identifier) @ref))
            (type_identifier) @ref.type
            "#
        }
        Lang::TypeScript | Lang::Tsx | Lang::JavaScript => {
            r#"
            (call_expression function: (identifier) @ref)
            (call_expression function: (member_expression property: (property_identifier) @ref))
            (new_expression constructor: (identifier) @ref)
            (type_identifier) @ref.type
            "#
        }
        Lang::Python => {
            r#"
            (call function: (identifier) @ref)
            (call function: (attribute attribute: (identifier) @ref))
            "#
        }
    }
}

// ─── 데이터 구조 ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct Symbol {
    name: String,
    kind: String, // "fn" | "class" | ...
    file: PathBuf,
    line: usize,
}

// ─── 파싱 ────────────────────────────────────────────────────────────────────

fn parse_file(path: &Path, lang: Lang) -> Option<(Vec<Symbol>, Vec<String>)> {
    let source = std::fs::read_to_string(path).ok()?;
    // 대용량/미니파이 파일 제외
    if source.len() > 500_000 {
        return None;
    }

    let mut parser = Parser::new();
    parser.set_language(&lang_grammar(lang)).ok()?;
    let tree = parser.parse(&source, None)?;
    let root = tree.root_node();

    // 정의 추출
    let def_query_str = definition_query(lang);
    let def_q = Query::new(&lang_grammar(lang), def_query_str).ok()?;
    let mut cursor = QueryCursor::new();
    let source_bytes = source.as_bytes();

    let mut defs: Vec<Symbol> = Vec::new();
    let capture_names = def_q.capture_names().to_vec();
    for mat in cursor.matches(&def_q, root, source_bytes) {
        for cap in mat.captures {
            let name = node_text(cap.node, source_bytes);
            if name.is_empty() {
                continue;
            }
            let cap_name = capture_names[cap.index as usize];
            let kind = cap_name
                .strip_prefix("def.")
                .unwrap_or(cap_name)
                .to_string();
            defs.push(Symbol {
                name: name.to_string(),
                kind,
                file: path.to_path_buf(),
                line: cap.node.start_position().row + 1,
            });
        }
    }

    // 참조 추출
    let ref_query_str = reference_query(lang);
    let ref_q = Query::new(&lang_grammar(lang), ref_query_str).ok()?;
    let mut rcursor = QueryCursor::new();
    let mut refs: Vec<String> = Vec::new();
    for mat in rcursor.matches(&ref_q, root, source_bytes) {
        for cap in mat.captures {
            let name = node_text(cap.node, source_bytes);
            if !name.is_empty() && name.len() < 100 {
                refs.push(name.to_string());
            }
        }
    }

    Some((defs, refs))
}

fn node_text<'a>(node: Node<'a>, source: &'a [u8]) -> &'a str {
    node.utf8_text(source).unwrap_or("")
}

// ─── PageRank ────────────────────────────────────────────────────────────────

/// symbol-graph 기반 PageRank.
/// 노드 = 파일, 엣지 = file A가 file B에 정의된 symbol을 참조하면 A → B.
fn build_graph_and_rank(
    defs_by_file: &HashMap<PathBuf, Vec<Symbol>>,
    refs_by_file: &HashMap<PathBuf, Vec<String>>,
) -> HashMap<PathBuf, f64> {
    // symbol name → defining file
    let mut symbol_to_file: HashMap<String, PathBuf> = HashMap::new();
    for (file, defs) in defs_by_file {
        for d in defs {
            // 첫 정의만 기록 (중복 symbol은 무시 — PageRank 노이즈 감소)
            symbol_to_file.entry(d.name.clone()).or_insert(file.clone());
        }
    }

    // 그래프 빌드
    let mut graph: DiGraph<PathBuf, f64> = DiGraph::new();
    let mut file_to_node: HashMap<PathBuf, NodeIndex> = HashMap::new();
    for file in defs_by_file.keys() {
        let idx = graph.add_node(file.clone());
        file_to_node.insert(file.clone(), idx);
    }

    for (from_file, refs) in refs_by_file {
        let Some(&from_idx) = file_to_node.get(from_file) else {
            continue;
        };
        for r in refs {
            if let Some(to_file) = symbol_to_file.get(r) {
                if to_file == from_file {
                    continue; // 자기 참조 제외
                }
                if let Some(&to_idx) = file_to_node.get(to_file) {
                    graph.add_edge(from_idx, to_idx, 1.0);
                }
            }
        }
    }

    // 단순 PageRank (20 iter, damping=0.85)
    let n = graph.node_count();
    if n == 0 {
        return HashMap::new();
    }
    let damping = 0.85;
    let mut rank: Vec<f64> = vec![1.0 / n as f64; n];

    for _ in 0..20 {
        let mut new_rank = vec![(1.0 - damping) / n as f64; n];
        for node in graph.node_indices() {
            let neighbors: Vec<NodeIndex> = graph.neighbors(node).collect();
            if neighbors.is_empty() {
                // dangling node: rank 분산
                let share = damping * rank[node.index()] / n as f64;
                for r in new_rank.iter_mut() {
                    *r += share;
                }
                continue;
            }
            let share = damping * rank[node.index()] / neighbors.len() as f64;
            for &nb in &neighbors {
                new_rank[nb.index()] += share;
            }
        }
        rank = new_rank;
    }

    let mut result = HashMap::new();
    for node in graph.node_indices() {
        let file = graph[node].clone();
        result.insert(file, rank[node.index()]);
    }
    result
}

// ─── 렌더링 ──────────────────────────────────────────────────────────────────

/// 토큰 예산 내에서 상위 심볼을 간결한 텍스트로 렌더링.
/// 형식:
///   src/foo.rs:
///     fn bar (line 42)
///     struct Baz (line 78)
fn render_map(
    defs_by_file: &HashMap<PathBuf, Vec<Symbol>>,
    ranks: &HashMap<PathBuf, f64>,
    root: &Path,
    token_budget: usize,
) -> String {
    // 파일을 rank 내림차순 정렬
    let mut files: Vec<(&PathBuf, &f64)> = ranks.iter().collect();
    files.sort_by(|a, b| b.1.partial_cmp(a.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut out = String::new();
    // 대략 1 token ≈ 4 chars (영문 기준, 코드는 더 짧음) — 보수적 환산
    let char_budget = token_budget * 3;

    for (file, _) in files {
        let rel = file.strip_prefix(root).unwrap_or(file);
        let mut section = format!("{}:\n", rel.display());
        if let Some(defs) = defs_by_file.get(file) {
            // 가장 중요한 kind 우선 — fn/class/struct/trait
            let priority_kinds: [&str; 6] = ["fn", "class", "struct", "trait", "interface", "enum"];
            let mut sorted: Vec<&Symbol> = defs.iter().collect();
            sorted.sort_by_key(|s| {
                priority_kinds
                    .iter()
                    .position(|&k| k == s.kind)
                    .unwrap_or(priority_kinds.len())
            });
            // 파일당 최대 12개 심볼
            for s in sorted.iter().take(12) {
                section.push_str(&format!("  {} {} (line {})\n", s.kind, s.name, s.line));
            }
        }
        if out.len() + section.len() > char_budget {
            break;
        }
        out.push_str(&section);
    }

    out
}

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

/// 프로젝트 루트에서 repo map 생성.
/// token_budget은 대략적인 상한 (문자수 = token * 3으로 환산).
///
/// tree-sitter 파싱과 파일 I/O가 blocking — `spawn_blocking`으로 UI 스레드 보호.
#[command]
pub async fn get_repo_map(cwd: String, token_budget: Option<usize>) -> Result<String> {
    let budget = token_budget.unwrap_or(4096);
    tokio::task::spawn_blocking(move || build_repo_map(&cwd, budget))
        .await
        .map_err(|e| crate::error::LumError::Io(format!("repo_map join 실패: {}", e)))?
}

pub fn build_repo_map(cwd: &str, budget: usize) -> Result<String> {
    let root = PathBuf::from(cwd);

    let mut defs_by_file: HashMap<PathBuf, Vec<Symbol>> = HashMap::new();
    let mut refs_by_file: HashMap<PathBuf, Vec<String>> = HashMap::new();

    let walker = WalkBuilder::new(&root)
        .standard_filters(true)
        .hidden(true)
        .max_depth(Some(10))
        .build();

    let mut file_count = 0usize;
    for entry in walker.flatten() {
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let Some(lang) = detect_lang(entry.path()) else {
            continue;
        };
        if let Some((defs, refs)) = parse_file(entry.path(), lang) {
            if !defs.is_empty() {
                defs_by_file.insert(entry.path().to_path_buf(), defs);
            }
            if !refs.is_empty() {
                refs_by_file.insert(entry.path().to_path_buf(), refs);
            }
        }
        file_count += 1;
        if file_count > 3000 {
            break;
        }
    }

    if defs_by_file.is_empty() {
        return Ok(format!(
            "(repo map: 파싱된 심볼 없음, 파일 {}개 스캔)",
            file_count
        ));
    }

    let ranks = build_graph_and_rank(&defs_by_file, &refs_by_file);
    Ok(render_map(&defs_by_file, &ranks, &root, budget))
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_lang_확장자별() {
        assert_eq!(detect_lang(Path::new("a.rs")), Some(Lang::Rust));
        assert_eq!(detect_lang(Path::new("a.ts")), Some(Lang::TypeScript));
        assert_eq!(detect_lang(Path::new("a.tsx")), Some(Lang::Tsx));
        assert_eq!(detect_lang(Path::new("a.py")), Some(Lang::Python));
        assert_eq!(detect_lang(Path::new("a.js")), Some(Lang::JavaScript));
        assert_eq!(detect_lang(Path::new("a.txt")), None);
    }

    #[test]
    fn parse_rust_파일_정의_추출() {
        let tmp = std::env::temp_dir().join("lum_test_repomap.rs");
        std::fs::write(&tmp, "pub fn foo() {}\npub struct Bar;\npub trait Baz {}\n").unwrap();
        let result = parse_file(&tmp, Lang::Rust);
        let (defs, _refs) = result.unwrap();
        let kinds: Vec<&str> = defs.iter().map(|d| d.kind.as_str()).collect();
        assert!(kinds.contains(&"fn"));
        assert!(kinds.contains(&"struct"));
        assert!(kinds.contains(&"trait"));
        let names: Vec<&str> = defs.iter().map(|d| d.name.as_str()).collect();
        assert!(names.contains(&"foo"));
        assert!(names.contains(&"Bar"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn parse_python_파일_함수_클래스() {
        let tmp = std::env::temp_dir().join("lum_test_repomap.py");
        std::fs::write(&tmp, "def hello():\n    pass\n\nclass World:\n    pass\n").unwrap();
        let result = parse_file(&tmp, Lang::Python);
        let (defs, _) = result.unwrap();
        let names: Vec<&str> = defs.iter().map(|d| d.name.as_str()).collect();
        assert!(names.contains(&"hello"));
        assert!(names.contains(&"World"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn pagerank_참조되는_파일이_더_높은_랭크() {
        use std::path::PathBuf;
        let a: PathBuf = "a.rs".into();
        let b: PathBuf = "b.rs".into();

        let mut defs = HashMap::new();
        defs.insert(
            a.clone(),
            vec![Symbol {
                name: "popular_fn".into(),
                kind: "fn".into(),
                file: a.clone(),
                line: 1,
            }],
        );
        defs.insert(
            b.clone(),
            vec![Symbol {
                name: "other_fn".into(),
                kind: "fn".into(),
                file: b.clone(),
                line: 1,
            }],
        );

        let mut refs = HashMap::new();
        // b에서 a의 popular_fn을 참조
        refs.insert(b.clone(), vec!["popular_fn".into()]);

        let ranks = build_graph_and_rank(&defs, &refs);
        assert!(ranks.get(&a).unwrap() > ranks.get(&b).unwrap());
    }

    #[test]
    fn render_map_파일_섹션_포함() {
        use std::path::PathBuf;
        let root = std::env::temp_dir();
        let file: PathBuf = root.join("foo.rs");
        let mut defs = HashMap::new();
        defs.insert(
            file.clone(),
            vec![Symbol {
                name: "my_fn".into(),
                kind: "fn".into(),
                file: file.clone(),
                line: 10,
            }],
        );
        let mut ranks = HashMap::new();
        ranks.insert(file.clone(), 0.5);

        let output = render_map(&defs, &ranks, &root, 1000);
        assert!(output.contains("foo.rs"));
        assert!(output.contains("my_fn"));
        assert!(output.contains("line 10"));
    }
}
