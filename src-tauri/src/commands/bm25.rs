// 코드 인식 BM25 — tantivy 없는 경량 in-memory 구현.
// snake_case / camelCase / ALL_CAPS / Rust 경로(::) 모두 토크나이즈.
// search_codebase의 dense(cosine) + lexical(BM25) → RRF 융합에 사용.

use std::collections::HashMap;

const K1: f32 = 1.2;
const B: f32 = 0.75;
const MIN_TOKEN_LEN: usize = 2;

/// camelCase/PascalCase → 단어 분리.
/// "parseUrl" → ["parse", "Url"], "JWTSecret" → ["JWT", "Secret"]
fn split_camel_case(s: &str) -> Vec<String> {
    let chars: Vec<char> = s.chars().collect();
    let n = chars.len();
    let mut boundaries = vec![0usize];

    for i in 1..n {
        let lower_to_upper = chars[i - 1].is_lowercase() && chars[i].is_uppercase();
        let upper_seq_end = i >= 2
            && chars[i - 2].is_uppercase()
            && chars[i - 1].is_uppercase()
            && chars[i].is_lowercase();

        if lower_to_upper {
            boundaries.push(i);
        } else if upper_seq_end {
            boundaries.push(i - 1);
        }
    }
    boundaries.push(n);
    boundaries.sort_unstable();
    boundaries.dedup();

    boundaries
        .windows(2)
        .map(|w| chars[w[0]..w[1]].iter().collect::<String>())
        .collect()
}

/// 코드 인식 토크나이저.
/// "std::HashMap::parse_url" → ["std", "hashmap", "parse", "url"]
/// "JWTSecret" → ["jwt", "secret"]
pub fn tokenize_code(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= MIN_TOKEN_LEN)
        .flat_map(|w| {
            split_camel_case(w)
                .into_iter()
                .filter(|p| p.len() >= MIN_TOKEN_LEN)
                .map(|p| p.to_lowercase())
        })
        .collect()
}

pub struct Bm25Index {
    n_docs: usize,
    avg_dl: f32,
    /// token → Vec<(doc_idx, tf)>
    inv: HashMap<String, Vec<(usize, u32)>>,
    doc_lengths: Vec<usize>,
}

impl Bm25Index {
    /// docs의 각 요소가 하나의 청크 content.
    pub fn build<'a>(docs: impl Iterator<Item = &'a str>) -> Self {
        let mut inv: HashMap<String, Vec<(usize, u32)>> = HashMap::new();
        let mut doc_lengths: Vec<usize> = Vec::new();

        for (idx, content) in docs.enumerate() {
            let tokens = tokenize_code(content);
            doc_lengths.push(tokens.len());

            let mut tf_map: HashMap<&str, u32> = HashMap::new();
            for t in &tokens {
                *tf_map.entry(t.as_str()).or_insert(0) += 1;
            }
            for (token, tf) in tf_map {
                inv.entry(token.to_string()).or_default().push((idx, tf));
            }
        }

        let n_docs = doc_lengths.len();
        let total: usize = doc_lengths.iter().sum();
        let avg_dl = if n_docs == 0 { 1.0 } else { total as f32 / n_docs as f32 };

        Self { n_docs, avg_dl, inv, doc_lengths }
    }

    /// BM25 검색 — (doc_idx, score) 내림차순, limit개.
    pub fn search(&self, query: &str, limit: usize) -> Vec<(usize, f32)> {
        if self.n_docs == 0 {
            return vec![];
        }
        let query_tokens = tokenize_code(query);
        if query_tokens.is_empty() {
            return vec![];
        }

        let mut scores = vec![0.0f32; self.n_docs];
        let n = self.n_docs as f32;

        for token in &query_tokens {
            let Some(postings) = self.inv.get(token) else { continue };
            let df = postings.len() as f32;
            // IDF (Robertson 변형, log 기반)
            let idf = ((n - df + 0.5) / (df + 0.5) + 1.0).ln();
            for &(doc_idx, tf) in postings {
                let dl = self.doc_lengths[doc_idx] as f32;
                let tf_norm = (tf as f32 * (K1 + 1.0))
                    / (tf as f32 + K1 * (1.0 - B + B * dl / self.avg_dl));
                scores[doc_idx] += idf * tf_norm;
            }
        }

        let mut ranked: Vec<(usize, f32)> = scores
            .into_iter()
            .enumerate()
            .filter(|(_, s)| *s > 0.0)
            .collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
        ranked.truncate(limit);
        ranked
    }
}

/// Reciprocal Rank Fusion (k=60, OpenSearch 표준).
/// dense + lexical 두 랭킹을 융합 — (doc_idx, rrf_score) 내림차순.
pub fn rrf_fuse(
    dense: &[(usize, f32)],
    lexical: &[(usize, f32)],
) -> Vec<(usize, f32)> {
    let mut scores: HashMap<usize, f32> = HashMap::new();
    for (rank, &(idx, _)) in dense.iter().enumerate() {
        *scores.entry(idx).or_insert(0.0) += 1.0 / (60.0 + rank as f32 + 1.0);
    }
    for (rank, &(idx, _)) in lexical.iter().enumerate() {
        *scores.entry(idx).or_insert(0.0) += 1.0 / (60.0 + rank as f32 + 1.0);
    }
    let mut fused: Vec<(usize, f32)> = scores.into_iter().collect();
    fused.sort_by(|a, b| b.1.total_cmp(&a.1));
    fused
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenize_snake_case() {
        let tokens = tokenize_code("parse_url");
        assert!(tokens.contains(&"parse".to_string()), "{:?}", tokens);
        assert!(tokens.contains(&"url".to_string()), "{:?}", tokens);
    }

    #[test]
    fn tokenize_camel_case() {
        let tokens = tokenize_code("parseUrl");
        assert!(tokens.contains(&"parse".to_string()), "{:?}", tokens);
        assert!(tokens.contains(&"url".to_string()), "{:?}", tokens);
    }

    #[test]
    fn tokenize_all_caps() {
        let tokens = tokenize_code("JWT_SECRET");
        assert!(tokens.contains(&"jwt".to_string()), "{:?}", tokens);
        assert!(tokens.contains(&"secret".to_string()), "{:?}", tokens);
    }

    #[test]
    fn tokenize_rust_path() {
        // HashMap → camelCase 분리 → ["hash", "map"]
        let tokens = tokenize_code("std::collections::HashMap");
        assert!(tokens.contains(&"std".to_string()), "{:?}", tokens);
        assert!(tokens.contains(&"collections".to_string()), "{:?}", tokens);
        assert!(tokens.contains(&"hash".to_string()), "{:?}", tokens);
        assert!(tokens.contains(&"map".to_string()), "{:?}", tokens);
    }

    #[test]
    fn tokenize_pascal_acronym() {
        // "JWTSecret" → jwt + secret
        let tokens = tokenize_code("JWTSecret");
        assert!(tokens.contains(&"jwt".to_string()), "{:?}", tokens);
        assert!(tokens.contains(&"secret".to_string()), "{:?}", tokens);
    }

    #[test]
    fn bm25_exact_identifier_match() {
        let docs = vec![
            "fn parse_url(input: &str) -> Option<Url> { ... }",
            "fn validate_token(tok: &str) -> bool { ... }",
            "struct Config { host: String, port: u16 }",
        ];
        let idx = Bm25Index::build(docs.iter().copied());
        let results = idx.search("parse_url", 3);
        assert!(!results.is_empty(), "결과 없음");
        assert_eq!(results[0].0, 0, "parse_url이 top-1이어야: {:?}", results);
    }

    #[test]
    fn bm25_empty_query() {
        let docs = vec!["fn foo() {}", "fn bar() {}"];
        let idx = Bm25Index::build(docs.iter().copied());
        assert!(idx.search("", 5).is_empty());
        assert!(idx.search("  ", 5).is_empty());
    }

    #[test]
    fn bm25_empty_index() {
        let idx = Bm25Index::build(std::iter::empty());
        assert!(idx.search("anything", 5).is_empty());
    }

    #[test]
    fn rrf_두_랭킹_모두_등장_시_더_높은_점수() {
        // doc 0이 dense top-1, lexical top-1에 모두 등장
        // doc 1은 dense top-2에만 등장
        let dense = vec![(0usize, 0.9f32), (1, 0.8)];
        let lexical = vec![(0usize, 5.0f32)];
        let fused = rrf_fuse(&dense, &lexical);
        assert!(!fused.is_empty());
        assert_eq!(fused[0].0, 0, "두 랭킹에 모두 등장한 doc 0이 top-1: {:?}", fused);
        // doc 0의 RRF score는 doc 1보다 높아야
        let score_0 = fused.iter().find(|(i, _)| *i == 0).map(|(_, s)| *s).unwrap_or(0.0);
        let score_1 = fused.iter().find(|(i, _)| *i == 1).map(|(_, s)| *s).unwrap_or(0.0);
        assert!(score_0 > score_1, "score_0={} <= score_1={}", score_0, score_1);
    }

    #[test]
    fn rrf_빈_랭킹_처리() {
        let fused = rrf_fuse(&[], &[]);
        assert!(fused.is_empty());

        let dense = vec![(0usize, 0.9f32)];
        let fused2 = rrf_fuse(&dense, &[]);
        assert_eq!(fused2[0].0, 0);
    }
}
