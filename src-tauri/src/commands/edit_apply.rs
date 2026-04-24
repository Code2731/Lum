// Phase 70 — SEARCH/REPLACE 편집 엔진
//
// AI 출력에서 다음 형식의 블록을 파싱·적용한다:
//
// ```language
// <<<<<<< SEARCH
// old code
// =======
// new code
// >>>>>>> REPLACE
// ```
//
// 적용 전략:
// 1. Exact match (바이트 완전 일치)
// 2. Fuzzy: 앞뒤 공백 정규화 + 라인 단위 비교
// 3. 실패 시 Err

use crate::error::{LumError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::command;

// ─── 데이터 구조 ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EditBlock {
    pub file: String,
    pub search: String,
    pub replace: String,
    /// 블록 순서(0-based) — UI 정렬용
    pub index: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ApplyResult {
    pub file: String,
    pub applied: bool,
    pub reason: Option<String>,
    /// fuzzy match 경우 true
    pub fuzzy: bool,
}

// ─── 파서 ────────────────────────────────────────────────────────────────────

/// AI 출력 텍스트에서 모든 SEARCH/REPLACE 블록을 추출.
///
/// 지원 포맷:
/// - ```` ```lang\n파일경로\n<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE\n``` ````
/// - 파일 경로는 펜스 바로 뒤 첫 줄이거나, 펜스 이전 라인의 백틱 경로 — 둘 다 허용
/// - 펜스 안에 경로가 없으면, 펜스 직전의 단일 행 경로 (`path/to/file`) 사용
pub fn parse_edit_blocks(raw: &str) -> Vec<EditBlock> {
    let mut blocks = Vec::new();
    let lines: Vec<&str> = raw.lines().collect();

    let mut i = 0;
    let mut pending_path: Option<String> = None;
    let mut block_index = 0usize;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();

        // 펜스 직전의 경로 감지 — 단일 백틱 경로 또는 일반 경로 텍스트
        if !trimmed.is_empty() && !trimmed.starts_with("```") {
            if let Some(p) = extract_file_path(trimmed) {
                pending_path = Some(p);
            }
        }

        // 펜스 시작
        if trimmed.starts_with("```") {
            let fence_start = i;
            let mut inner_path = pending_path.take();

            // 펜스 안 첫 줄이 경로면 사용
            if i + 1 < lines.len() {
                let first_inner = lines[i + 1].trim();
                if let Some(p) = extract_file_path(first_inner) {
                    inner_path = Some(p);
                }
            }

            // 블록 내부에서 SEARCH ... REPLACE 패턴 탐색
            let mut j = fence_start + 1;
            while j < lines.len() {
                if lines[j].trim().starts_with("```") {
                    break;
                }
                if lines[j].trim() == "<<<<<<< SEARCH" {
                    // SEARCH 시작 발견
                    let search_start = j + 1;
                    let mut sep = None;
                    let mut end = None;
                    let mut k = search_start;
                    while k < lines.len() {
                        if lines[k].trim() == "=======" {
                            sep = Some(k);
                        } else if lines[k].trim() == ">>>>>>> REPLACE" {
                            end = Some(k);
                            break;
                        }
                        k += 1;
                    }
                    if let (Some(s), Some(e)) = (sep, end) {
                        let search = lines[search_start..s].join("\n");
                        let replace = lines[s + 1..e].join("\n");
                        if let Some(file) = &inner_path {
                            blocks.push(EditBlock {
                                file: file.clone(),
                                search,
                                replace,
                                index: block_index,
                            });
                            block_index += 1;
                        }
                        j = e + 1;
                        continue;
                    }
                }
                j += 1;
            }
            i = j + 1;
            pending_path = None;
            continue;
        }

        i += 1;
    }

    blocks
}

/// 한 줄에서 파일 경로를 추출.
/// 1. 문장 속 백틱 인용 `` `src/foo.rs` `` 형태 우선 매칭
/// 2. 줄 전체가 경로인 경우
fn extract_file_path(s: &str) -> Option<String> {
    let line = s.trim();
    if line.is_empty() {
        return None;
    }

    // 1. 백틱 인용 — 문장 속 `path/to/file` 추출
    if let Some(start) = line.find('`') {
        if let Some(end_rel) = line[start + 1..].find('`') {
            let inner = &line[start + 1..start + 1 + end_rel];
            if looks_like_path(inner) {
                return Some(inner.to_string());
            }
        }
    }

    // 2. 줄 전체가 경로
    if looks_like_path(line) {
        return Some(line.to_string());
    }

    None
}

fn looks_like_path(s: &str) -> bool {
    if s.is_empty() || s.len() >= 300 {
        return false;
    }
    if s.contains(char::is_whitespace) {
        return false;
    }
    // 확장자 또는 경로 구분자
    s.contains('/') || s.contains('.') || s.contains('\\')
}

// ─── 적용기 ──────────────────────────────────────────────────────────────────

/// 파일에 SEARCH → REPLACE 적용. 성공 시 (new_content, fuzzy) 반환.
pub fn apply_to_content(content: &str, search: &str, replace: &str) -> Result<(String, bool)> {
    // 새 파일 생성 케이스 — SEARCH가 비어있으면 파일 전체 REPLACE
    if search.is_empty() {
        return Ok((replace.to_string(), false));
    }

    // 1. Exact match
    if let Some(pos) = content.find(search) {
        let mut new_content = String::with_capacity(content.len() - search.len() + replace.len());
        new_content.push_str(&content[..pos]);
        new_content.push_str(replace);
        new_content.push_str(&content[pos + search.len()..]);
        return Ok((new_content, false));
    }

    // 2. Fuzzy match: 라인 단위 + 앞뒤 공백 무시
    let content_lines: Vec<&str> = content.lines().collect();
    let search_lines: Vec<&str> = search.lines().collect();

    if search_lines.is_empty() {
        return Err(LumError::AiEngine("SEARCH가 비어있음".into()));
    }

    // 각 search 라인을 trim해서 비교
    let search_trimmed: Vec<&str> = search_lines.iter().map(|l| l.trim()).collect();

    for i in 0..=content_lines.len().saturating_sub(search_lines.len()) {
        let matches = (0..search_lines.len())
            .all(|k| content_lines.get(i + k).map(|l| l.trim()) == Some(search_trimmed[k]));
        if matches {
            // 원본 라인 인덴트 보존 — 첫 매칭 라인의 인덴트를 replace에 적용
            let base_indent = leading_whitespace(content_lines[i]);
            let indented_replace = reindent(replace, base_indent);

            let mut new_lines: Vec<String> = Vec::with_capacity(content_lines.len());
            new_lines.extend(content_lines[..i].iter().map(|l| l.to_string()));
            for l in indented_replace.lines() {
                new_lines.push(l.to_string());
            }
            new_lines.extend(
                content_lines[i + search_lines.len()..]
                    .iter()
                    .map(|l| l.to_string()),
            );

            let mut result = new_lines.join("\n");
            // 원본이 개행으로 끝났으면 유지
            if content.ends_with('\n') && !result.ends_with('\n') {
                result.push('\n');
            }
            return Ok((result, true));
        }
    }

    Err(LumError::AiEngine(
        "SEARCH 블록이 파일에서 매칭되지 않음".into(),
    ))
}

fn leading_whitespace(line: &str) -> &str {
    let end = line
        .char_indices()
        .find(|(_, c)| !c.is_whitespace())
        .map(|(i, _)| i)
        .unwrap_or(line.len());
    &line[..end]
}

fn reindent(text: &str, base: &str) -> String {
    // replace의 공통 최소 인덴트를 찾아 base로 치환
    let min_indent = text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| leading_whitespace(l).len())
        .min()
        .unwrap_or(0);

    text.lines()
        .map(|l| {
            if l.len() >= min_indent {
                format!("{}{}", base, &l[min_indent..])
            } else {
                l.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

fn safe_path(cwd: &str, file: &str) -> Result<PathBuf> {
    let base = PathBuf::from(cwd);
    let target = if Path::new(file).is_absolute() {
        PathBuf::from(file)
    } else {
        base.join(file)
    };

    // path traversal 방지: cwd 밖 쓰기 차단.
    // base는 실재해야 정상. target은 새 파일이면 canonicalize 실패 —
    // 이 경우 parent를 canonicalize해서 symlink escape까지 검증한다.
    let canonical_base = base
        .canonicalize()
        .map_err(|e| LumError::Security(format!("cwd 해석 실패 ({}): {}", base.display(), e)))?;
    let canonical_target = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            let parent = target
                .parent()
                .ok_or_else(|| LumError::Security("부모 디렉토리 없음".into()))?;
            let canonical_parent = parent.canonicalize().map_err(|e| {
                LumError::Security(format!("부모 경로 해석 실패 ({}): {}", parent.display(), e))
            })?;
            let file_name = target
                .file_name()
                .ok_or_else(|| LumError::Security("파일명 추출 실패".into()))?;
            canonical_parent.join(file_name)
        }
    };
    if !canonical_target.starts_with(&canonical_base) {
        return Err(LumError::Security(format!(
            "경로가 작업 디렉토리 밖을 가리킴: {}",
            target.display()
        )));
    }
    Ok(canonical_target)
}

/// 단일 블록 적용
#[command]
pub async fn apply_edit_block(
    cwd: String,
    file: String,
    search: String,
    replace: String,
) -> Result<ApplyResult> {
    let target = safe_path(&cwd, &file)?;

    // 새 파일 생성 또는 기존 파일 수정
    let existing = std::fs::read_to_string(&target).unwrap_or_default();
    let (new_content, fuzzy) = apply_to_content(&existing, &search, &replace)?;

    // 부모 디렉토리 자동 생성
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| LumError::Io(format!("디렉토리 생성 실패: {}", e)))?;
    }
    std::fs::write(&target, new_content).map_err(|e| LumError::Io(e.to_string()))?;

    Ok(ApplyResult {
        file,
        applied: true,
        reason: None,
        fuzzy,
    })
}

/// 여러 블록 파싱 (프리뷰용 — 파일 수정 안 함)
#[command]
pub fn parse_edit_blocks_cmd(raw: String) -> Vec<EditBlock> {
    parse_edit_blocks(&raw)
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_단일_블록() {
        let raw = r#"여기 수정:

```rust
src/foo.rs
<<<<<<< SEARCH
let x = 1;
=======
let x = 2;
>>>>>>> REPLACE
```
"#;
        let blocks = parse_edit_blocks(raw);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].file, "src/foo.rs");
        assert_eq!(blocks[0].search, "let x = 1;");
        assert_eq!(blocks[0].replace, "let x = 2;");
    }

    #[test]
    fn parse_펜스_이전에_경로() {
        let raw = r#"파일 `src/bar.ts` 수정:

```typescript
<<<<<<< SEARCH
const y = "hello";
=======
const y = "world";
>>>>>>> REPLACE
```
"#;
        let blocks = parse_edit_blocks(raw);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].file, "src/bar.ts");
        assert_eq!(blocks[0].replace, r#"const y = "world";"#);
    }

    #[test]
    fn parse_여러_블록_순서_유지() {
        let raw = r#"
```rust
src/a.rs
<<<<<<< SEARCH
a1
=======
a2
>>>>>>> REPLACE
```

```rust
src/b.rs
<<<<<<< SEARCH
b1
=======
b2
>>>>>>> REPLACE
```
"#;
        let blocks = parse_edit_blocks(raw);
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].file, "src/a.rs");
        assert_eq!(blocks[0].index, 0);
        assert_eq!(blocks[1].file, "src/b.rs");
        assert_eq!(blocks[1].index, 1);
    }

    #[test]
    fn parse_파일_경로_없으면_무시() {
        let raw = r#"
```
<<<<<<< SEARCH
foo
=======
bar
>>>>>>> REPLACE
```
"#;
        let blocks = parse_edit_blocks(raw);
        assert_eq!(blocks.len(), 0);
    }

    #[test]
    fn apply_exact_match() {
        let content = "fn main() {\n    let x = 1;\n}\n";
        let (new, fuzzy) = apply_to_content(content, "let x = 1;", "let x = 2;").unwrap();
        assert!(!fuzzy);
        assert!(new.contains("let x = 2;"));
        assert!(!new.contains("let x = 1;"));
    }

    #[test]
    fn apply_fuzzy_공백_차이_허용() {
        let content = "fn main() {\n\tlet x = 1;\n}\n";
        // SEARCH에는 공백 인덴트, 실제 파일은 탭
        let (new, fuzzy) = apply_to_content(content, "    let x = 1;", "    let x = 2;").unwrap();
        assert!(fuzzy);
        assert!(new.contains("let x = 2;"));
    }

    #[test]
    fn apply_매칭_실패_시_에러() {
        let content = "fn main() {}\n";
        let result = apply_to_content(content, "let x = 999;", "let x = 0;");
        assert!(result.is_err());
    }

    #[test]
    fn apply_빈_search_는_파일_전체_대체_새_파일_생성_케이스() {
        let (new, fuzzy) = apply_to_content("", "", "fn new() {}\n").unwrap();
        assert!(!fuzzy);
        assert_eq!(new, "fn new() {}\n");
    }

    #[test]
    fn apply_개행으로_끝나는_원본_보존() {
        let content = "a\nb\nc\n";
        let (new, _) = apply_to_content(content, "a\nb\nc", "x\ny\nz").unwrap();
        assert!(new.ends_with("\n"));
    }

    #[test]
    fn leading_whitespace_탭과_스페이스() {
        assert_eq!(leading_whitespace("    let x"), "    ");
        assert_eq!(leading_whitespace("\t\tif"), "\t\t");
        assert_eq!(leading_whitespace("no_indent"), "");
    }

    #[test]
    fn reindent_공통_최소_들여쓰기_기반_재조정() {
        let text = "    line1\n      line2";
        let out = reindent(text, "\t");
        assert_eq!(out, "\tline1\n\t  line2");
    }

    #[test]
    fn extract_file_path_정상_케이스() {
        assert_eq!(extract_file_path("src/foo.rs"), Some("src/foo.rs".into()));
        assert_eq!(extract_file_path("`src/bar.ts`"), Some("src/bar.ts".into()));
        assert_eq!(extract_file_path("   src/a.py   "), Some("src/a.py".into()));
    }

    #[test]
    fn extract_file_path_공백_있으면_None() {
        assert_eq!(extract_file_path("this is not a path"), None);
    }

    #[test]
    fn extract_file_path_확장자_슬래시_없으면_None() {
        assert_eq!(extract_file_path("justaword"), None);
    }
}
