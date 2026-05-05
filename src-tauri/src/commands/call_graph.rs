// tree-sitter 기반 호출 그래프.
// 함수 정의 + 내부 call_expression을 언어별 쿼리로 추출해 (caller, callee) 엣지를 수집.
// NOTE: syntax 파서 한계 — 동명이인 함수 미구분. 결과에 항상 disclaimer 포함.

use crate::commands::lang_detect::{detect_source_lang, language_grammar, SourceLang};
use ignore::Walk;
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;
use tree_sitter::{Parser, Query, QueryCursor};

// ─── 언어별 쿼리 ─────────────────────────────────────────────────────────────

/// 함수 정의 노드 (@fn_node) + 이름 (@fn_name) 캡처
fn fn_def_query(l: SourceLang) -> &'static str {
    match l {
        SourceLang::Rust => "(function_item name: (identifier) @fn_name) @fn_node",
        SourceLang::TypeScript | SourceLang::Tsx => {
            r#"(function_declaration name: (identifier) @fn_name) @fn_node
               (method_definition name: (property_identifier) @fn_name) @fn_node"#
        }
        SourceLang::JavaScript => {
            r#"(function_declaration name: (identifier) @fn_name) @fn_node
               (method_definition name: (property_identifier) @fn_name) @fn_node"#
        }
        SourceLang::Python => "(function_definition name: (identifier) @fn_name) @fn_node",
    }
}

/// call_expression에서 피호출 함수명 (@callee) 캡처
fn call_query(l: SourceLang) -> &'static str {
    match l {
        SourceLang::Rust => {
            r#"(call_expression function: (identifier) @callee)
               (call_expression function: (scoped_identifier name: (identifier) @callee))"#
        }
        SourceLang::TypeScript | SourceLang::Tsx | SourceLang::JavaScript => {
            r#"(call_expression function: (identifier) @callee)
               (call_expression function: (member_expression property: (property_identifier) @callee))"#
        }
        SourceLang::Python => {
            r#"(call function: (identifier) @callee)
               (call function: (attribute attribute: (identifier) @callee))"#
        }
    }
}

// ─── 파일 파싱 ────────────────────────────────────────────────────────────────

/// 한 파일에서 함수 정의 목록과 (caller, rel_path, callee) 엣지를 추출.
fn parse_file_for_calls(
    path: &Path,
    lang: SourceLang,
    root: &Path,
) -> Option<(Vec<String>, Vec<(String, String, String)>)> {
    let source = std::fs::read_to_string(path).ok()?;
    if source.len() > 500_000 {
        return None;
    }
    let rel_path = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let bytes = source.as_bytes();
    let grammar = language_grammar(lang);

    let mut parser = Parser::new();
    parser.set_language(&grammar).ok()?;
    let tree = parser.parse(&source, None)?;
    let root_node = tree.root_node();

    // ── 함수 정의 추출 (이름 + 바이트 범위) ──────────────────────────────────
    let def_q = Query::new(&grammar, fn_def_query(lang)).ok()?;
    let def_names = def_q.capture_names().to_vec();
    let fn_name_idx = def_names.iter().position(|n| *n == "fn_name").map(|i| i as u32);
    let fn_node_idx = def_names.iter().position(|n| *n == "fn_node").map(|i| i as u32);

    let mut fn_ranges: Vec<(String, usize, usize)> = Vec::new();
    let mut def_cur = QueryCursor::new();
    for mat in def_cur.matches(&def_q, root_node, bytes) {
        let mut name = String::new();
        let mut nstart = 0usize;
        let mut nend = 0usize;
        for cap in mat.captures {
            if Some(cap.index) == fn_name_idx {
                name = cap.node.utf8_text(bytes).unwrap_or("").to_string();
            } else if Some(cap.index) == fn_node_idx {
                nstart = cap.node.start_byte();
                nend = cap.node.end_byte();
            }
        }
        if !name.is_empty() && nend > nstart {
            fn_ranges.push((name, nstart, nend));
        }
    }

    let defined_fns: Vec<String> = fn_ranges.iter().map(|(n, _, _)| n.clone()).collect();

    // ── call_expression 추출 ─────────────────────────────────────────────────
    let call_q = Query::new(&grammar, call_query(lang)).ok()?;
    let call_cap_names = call_q.capture_names().to_vec();
    let callee_idx = call_cap_names.iter().position(|n| *n == "callee").map(|i| i as u32);

    let mut calls: Vec<(String, usize)> = Vec::new();
    let mut call_cur = QueryCursor::new();
    for mat in call_cur.matches(&call_q, root_node, bytes) {
        for cap in mat.captures {
            if Some(cap.index) == callee_idx {
                let cname = cap.node.utf8_text(bytes).unwrap_or("").to_string();
                if !cname.is_empty() && cname.len() < 100 {
                    calls.push((cname, cap.node.start_byte()));
                }
            }
        }
    }

    // ── 호출을 가장 안쪽 함수에 귀속 ───────────────────────────────────────────
    // 중첩 함수 처리: 여러 범위에 포함될 때 가장 좁은(innermost) 범위 선택.
    let mut edges: Vec<(String, String, String)> = Vec::new();
    for (callee, pos) in calls {
        let innermost = fn_ranges
            .iter()
            .filter(|(_, s, e)| pos >= *s && pos < *e)
            .min_by_key(|(_, s, e)| e - s);
        if let Some((caller, _, _)) = innermost {
            edges.push((caller.clone(), rel_path.clone(), callee));
        }
    }

    Some((defined_fns, edges))
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct CallerInfo {
    pub fn_name: String,
    pub file: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CalleeInfo {
    pub name: String,
    /// 프로젝트 내 정의 파일 목록 (없으면 외부/내장)
    pub defined_in: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DependentNode {
    pub name: String,
    pub file: String,
    pub depth: usize,
}

#[derive(Debug)]
pub struct CallGraph {
    /// 함수명 → 정의 파일 목록 (동명이인 지원)
    pub fn_defs: HashMap<String, Vec<String>>,
    /// (caller_fn, caller_file, callee_fn)
    edges: Vec<(String, String, String)>,
}

impl CallGraph {
    pub fn build(root: &Path) -> Self {
        let mut fn_defs: HashMap<String, Vec<String>> = HashMap::new();
        let mut all_edges: Vec<(String, String, String)> = Vec::new();
        let mut file_count = 0usize;

        for entry in Walk::new(root)
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        {
            let path = entry.path();
            let Some(lang) = detect_source_lang(path) else { continue };

            if let Some((defs, edges)) = parse_file_for_calls(path, lang, root) {
                let rel = path
                    .strip_prefix(root)
                    .unwrap_or(path)
                    .to_string_lossy()
                    .replace('\\', "/");
                for fn_name in defs {
                    fn_defs.entry(fn_name).or_default().push(rel.clone());
                }
                all_edges.extend(edges);
            }

            file_count += 1;
            if file_count >= 3000 {
                break;
            }
        }

        Self { fn_defs, edges: all_edges }
    }

    /// `symbol`을 호출하는 함수 목록 (1-hop callers)
    pub fn find_callers(&self, symbol: &str) -> Vec<CallerInfo> {
        let mut seen: HashSet<(&str, &str)> = HashSet::new();
        self.edges
            .iter()
            .filter(|(_, _, callee)| callee == symbol)
            .filter(|(caller, file, _)| seen.insert((caller.as_str(), file.as_str())))
            .map(|(caller, file, _)| CallerInfo {
                fn_name: caller.clone(),
                file: file.clone(),
            })
            .collect()
    }

    /// `symbol`이 호출하는 함수 목록 (1-hop callees)
    pub fn find_callees(&self, symbol: &str) -> Vec<CalleeInfo> {
        let mut callee_files: HashMap<&str, HashSet<String>> = HashMap::new();
        for (caller, _, callee) in &self.edges {
            if caller == symbol {
                let entry = callee_files.entry(callee.as_str()).or_default();
                if let Some(defs) = self.fn_defs.get(callee.as_str()) {
                    for f in defs {
                        entry.insert(f.clone());
                    }
                }
            }
        }
        let mut result: Vec<CalleeInfo> = callee_files
            .into_iter()
            .map(|(name, files)| {
                let mut v: Vec<String> = files.into_iter().collect();
                v.sort();
                CalleeInfo { name: name.to_string(), defined_in: v }
            })
            .collect();
        result.sort_by(|a, b| a.name.cmp(&b.name));
        result
    }

    /// `symbol` 변경 시 영향받는 함수 BFS (max_depth 홉)
    pub fn trace_dependents(&self, symbol: &str, max_depth: usize) -> Vec<DependentNode> {
        let mut visited: HashSet<(String, String)> = HashSet::new();
        let mut queue: VecDeque<(String, String, usize)> = VecDeque::new();
        let mut result: Vec<DependentNode> = Vec::new();

        for c in self.find_callers(symbol) {
            if visited.insert((c.fn_name.clone(), c.file.clone())) {
                queue.push_back((c.fn_name, c.file, 1));
            }
        }

        while let Some((name, file, depth)) = queue.pop_front() {
            result.push(DependentNode { name: name.clone(), file: file.clone(), depth });
            if depth < max_depth {
                for c in self.find_callers(&name) {
                    if visited.insert((c.fn_name.clone(), c.file.clone())) {
                        queue.push_back((c.fn_name, c.file, depth + 1));
                    }
                }
            }
        }

        result
    }
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_graph(
        edges: &[(&str, &str, &str)],
        defs: &[(&str, &str)],
    ) -> CallGraph {
        let mut fn_defs: HashMap<String, Vec<String>> = HashMap::new();
        for (name, file) in defs {
            fn_defs.entry(name.to_string()).or_default().push(file.to_string());
        }
        let edges = edges
            .iter()
            .map(|(c, f, e)| (c.to_string(), f.to_string(), e.to_string()))
            .collect();
        CallGraph { fn_defs, edges }
    }

    #[test]
    fn find_callers_기본() {
        let g = make_graph(
            &[
                ("alpha", "a.rs", "target_fn"),
                ("beta", "b.rs", "target_fn"),
                ("gamma", "c.rs", "other_fn"),
            ],
            &[("target_fn", "lib.rs")],
        );
        let callers = g.find_callers("target_fn");
        let names: Vec<&str> = callers.iter().map(|c| c.fn_name.as_str()).collect();
        assert!(names.contains(&"alpha"), "{:?}", names);
        assert!(names.contains(&"beta"), "{:?}", names);
        assert!(!names.contains(&"gamma"), "{:?}", names);
    }

    #[test]
    fn find_callers_없으면_빈_벡터() {
        let g = make_graph(&[("a", "f.rs", "b")], &[]);
        assert!(g.find_callers("nonexistent").is_empty());
    }

    #[test]
    fn find_callees_기본() {
        let g = make_graph(
            &[
                ("my_fn", "a.rs", "helper_a"),
                ("my_fn", "a.rs", "helper_b"),
                ("other_fn", "a.rs", "helper_a"),
            ],
            &[("helper_a", "lib.rs"), ("helper_b", "lib.rs")],
        );
        let callees = g.find_callees("my_fn");
        let names: Vec<&str> = callees.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"helper_a"), "{:?}", names);
        assert!(names.contains(&"helper_b"), "{:?}", names);
        assert!(!names.contains(&"other_fn"), "{:?}", names);

        // helper_a의 정의 파일이 포함되어야
        let ha = callees.iter().find(|c| c.name == "helper_a").unwrap();
        assert!(ha.defined_in.contains(&"lib.rs".to_string()), "{:?}", ha);
    }

    #[test]
    fn find_callees_외부함수는_빈_defined_in() {
        let g = make_graph(&[("my_fn", "a.rs", "println")], &[]);
        let callees = g.find_callees("my_fn");
        let println = callees.iter().find(|c| c.name == "println").unwrap();
        assert!(println.defined_in.is_empty(), "외부 함수는 defined_in 빈 벡터");
    }

    #[test]
    fn trace_dependents_bfs_depth() {
        // A ← B ← C ← D
        let g = make_graph(
            &[
                ("B", "f.rs", "A"),
                ("C", "f.rs", "B"),
                ("D", "f.rs", "C"),
                ("E", "f.rs", "X"), // A와 무관
            ],
            &[],
        );
        let deps = g.trace_dependents("A", 3);
        let names: Vec<&str> = deps.iter().map(|d| d.name.as_str()).collect();
        assert!(names.contains(&"B"), "depth=1: {:?}", names);
        assert!(names.contains(&"C"), "depth=2: {:?}", names);
        assert!(names.contains(&"D"), "depth=3: {:?}", names);
        assert!(!names.contains(&"E"), "무관 E 포함 금지: {:?}", names);

        // depth 순서 확인
        let b = deps.iter().find(|d| d.name == "B").unwrap();
        let c = deps.iter().find(|d| d.name == "C").unwrap();
        let d = deps.iter().find(|d| d.name == "D").unwrap();
        assert_eq!(b.depth, 1);
        assert_eq!(c.depth, 2);
        assert_eq!(d.depth, 3);
    }

    #[test]
    fn trace_dependents_max_depth_제한() {
        // A ← B ← C ← D ← E (깊이 4)
        let g = make_graph(
            &[
                ("B", "f.rs", "A"),
                ("C", "f.rs", "B"),
                ("D", "f.rs", "C"),
                ("E", "f.rs", "D"),
            ],
            &[],
        );
        let deps = g.trace_dependents("A", 2);
        let names: Vec<&str> = deps.iter().map(|d| d.name.as_str()).collect();
        assert!(names.contains(&"B"));
        assert!(names.contains(&"C"));
        assert!(!names.contains(&"D"), "depth=3이므로 제외: {:?}", names);
        assert!(!names.contains(&"E"), "depth=4이므로 제외: {:?}", names);
    }

    #[test]
    fn trace_dependents_순환_무한루프_없음() {
        // A ↔ B (상호 호출)
        let g = make_graph(
            &[("A", "f.rs", "B"), ("B", "f.rs", "A")],
            &[],
        );
        // 무한 루프 없이 종료해야
        let deps = g.trace_dependents("A", 10);
        assert!(deps.len() <= 2, "순환 중복 없음: {:?}", deps);
    }

    #[test]
    fn find_callers_동명이인_여러_파일() {
        let g = make_graph(
            &[
                ("impl_a", "a.rs", "target"),
                ("impl_b", "b.rs", "target"),
            ],
            &[("target", "lib.rs"), ("target", "extra.rs")],
        );
        let callers = g.find_callers("target");
        assert_eq!(callers.len(), 2, "두 파일에서 호출: {:?}", callers);
    }
}
