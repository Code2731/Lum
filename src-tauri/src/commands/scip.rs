use crate::error::{LumError, Result};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::{Command as StdCommand, Stdio};
use std::time::Duration;
use tokio::process::Command as TokioCommand;
use tokio::time::timeout;

const SCIP_BUILD_TIMEOUT_SECS: u64 = 120;
const SCIP_BUILD_LOG_LIMIT: usize = 2048;
const SCIP_QUERY_OUTPUT_LIMIT: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct ScipSymbolLocation {
    pub symbol: String,
    pub file: String,
    pub line: Option<u64>,
    pub column: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ScipQueryResult {
    pub definitions: Vec<ScipSymbolLocation>,
    pub callers: Vec<ScipSymbolLocation>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScipBackend {
    pub language: String,
    pub key: String,
    pub binary: String,
    pub available: bool,
    pub index_path: String,
    pub index_exists: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScipStatus {
    pub enabled: bool,
    pub backends: Vec<ScipBackend>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScipRebuildResult {
    pub language: String,
    pub binary: String,
    pub available: bool,
    pub index_path: String,
    pub requested: bool,
    pub skipped: bool,
    pub success: bool,
    pub timed_out: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScipRebuildSummary {
    pub requested_language: Option<String>,
    pub force: bool,
    pub results: Vec<ScipRebuildResult>,
}

#[derive(Debug, Clone)]
struct BackendEntry {
    language: &'static str,
    binary: &'static str,
    key: &'static str,
}

#[derive(Debug, Clone)]
struct ScipCommandAttempt {
    command: String,
    exit_code: Option<i32>,
    timed_out: bool,
    stdout: String,
    stderr: String,
}

const KNOWN_BACKENDS: &[BackendEntry] = &[
    BackendEntry {
        language: "Rust",
        binary: "scip-rust",
        key: "rust",
    },
    BackendEntry {
        language: "TypeScript",
        binary: "scip-typescript",
        key: "typescript",
    },
    BackendEntry {
        language: "Go",
        binary: "scip-go",
        key: "go",
    },
];

fn scip_root_for_workspace(cwd: &str) -> PathBuf {
    let base = Path::new(cwd);
    let workspace = if base.is_absolute() {
        base.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| Path::new(".").to_path_buf())
            .join(base)
    };
    workspace.join(".lum_scip")
}

fn has_binary(binary: &str) -> bool {
    StdCommand::new(binary)
        .arg("--help")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .is_ok()
}

fn scip_index_path(root: &Path, key: &str) -> PathBuf {
    root.join(key).join("index.scip")
}

fn resolve_cwd(cwd: Option<String>) -> String {
    if let Some(raw) = cwd {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| ".".to_string())
}

fn scip_backend_by_request(request: &str) -> Option<&'static BackendEntry> {
    let request = request.trim().to_ascii_lowercase();
    if request.is_empty() {
        return None;
    }
    KNOWN_BACKENDS.iter().find(|entry| {
        entry.key.eq_ignore_ascii_case(&request)
            || entry.language.to_ascii_lowercase() == request
            || entry.binary.eq_ignore_ascii_case(&request)
    })
}

fn parse_scalar_string_field(obj: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = obj.get(*key) {
            if let Some(text) = value.as_str() {
                return Some(text.trim().to_string());
            }
            if let Some(text) = value.as_i64() {
                return Some(text.to_string());
            }
        }
    }
    None
}

fn parse_u64_field(obj: &Value, keys: &[&str]) -> Option<u64> {
    for key in keys {
        if let Some(value) = obj.get(*key) {
            if let Some(num) = value.as_u64() {
                return Some(num);
            }
            if let Some(num) = value.as_i64() {
                if num >= 0 {
                    return Some(num as u64);
                }
            }
            if let Some(text) = value.as_str() {
                if let Ok(num) = text.parse::<u64>() {
                    return Some(num);
                }
            }
        }
    }
    None
}

fn symbol_token_match(query: &str, symbol_text: &str) -> bool {
    let q = query.trim();
    if q.is_empty() {
        return false;
    }
    if symbol_text == q {
        return true;
    }
    let symbol = symbol_text.trim();
    let q_lower = q.to_ascii_lowercase();
    let symbol_lower = symbol.to_ascii_lowercase();
    if symbol_lower.contains(&q_lower) {
        return true;
    }
    let tail = symbol
        .split(['#', '/', '.', ':', '<', '>', '(', ')'].as_ref())
        .last()
        .unwrap_or(symbol)
        .trim();
    let tail_lower = tail.to_ascii_lowercase();
    if tail_lower == q_lower || tail_lower.starts_with(&(format!("{q_lower}("))) {
        return true;
    }
    false
}

fn parse_position_field(value: &Value) -> Option<ScipRange> {
    if let Some(start_line) = parse_u64_field(
        value,
        &[
            "start_line",
            "startLine",
            "startline",
            "start.line",
            "line",
            "lineNumber",
            "line_number",
        ],
    ) {
        return Some(ScipRange {
            start_line,
            start_col: parse_u64_field(
                value,
                &[
                    "start_char",
                    "startChar",
                    "start_character",
                    "startCharacter",
                    "start.character",
                    "character",
                ],
            ),
            end_line: parse_u64_field(
                value,
                &[
                    "end_line",
                    "endLine",
                    "endline",
                    "end.line",
                    "end.character",
                    "line",
                ],
            )
            .unwrap_or(start_line),
            end_col: parse_u64_field(
                value,
                &[
                    "end_char",
                    "endChar",
                    "end_character",
                    "endCharacter",
                    "end.character",
                ],
            ),
        });
    }

    let obj = value.as_object()?;
    let start = obj
        .get("start")
        .or_else(|| obj.get("start_position"))?
        .as_object()?;
    let end = obj
        .get("end")
        .or_else(|| obj.get("end_position"))?
        .as_object()?;

    Some(ScipRange {
        start_line: parse_u64_field(
            &Value::Object(start.clone()),
            &["line", "lineNumber", "line_number", "row"],
        )?,
        start_col: parse_u64_field(
            &Value::Object(start.clone()),
            &[
                "character",
                "characterNumber",
                "character_number",
                "column",
                "col",
            ],
        ),
        end_line: parse_u64_field(
            &Value::Object(end.clone()),
            &["line", "lineNumber", "line_number", "row"],
        )
        .unwrap_or_default(),
        end_col: parse_u64_field(
            &Value::Object(end.clone()),
            &[
                "character",
                "characterNumber",
                "character_number",
                "column",
                "col",
            ],
        ),
    })
}

#[derive(Debug, Clone)]
struct ScipRange {
    start_line: u64,
    start_col: Option<u64>,
    end_line: u64,
    end_col: Option<u64>,
}

fn contains_range(outer: &ScipRange, inner: &ScipRange) -> bool {
    if outer.start_line > inner.start_line || outer.end_line < inner.end_line {
        return false;
    }
    if outer.start_line == inner.start_line {
        if let (Some(outer_col), Some(inner_col)) = (outer.start_col, inner.start_col) {
            if outer_col > inner_col {
                return false;
            }
        }
    }
    if outer.end_line == inner.end_line {
        if let (Some(outer_col), Some(inner_col)) = (outer.end_col, inner.end_col) {
            if outer_col < inner_col {
                return false;
            }
        }
    }
    true
}

fn parse_scip_print_json(binary: &str, index_path: &Path) -> Option<Vec<Value>> {
    let index_path = index_path.to_string_lossy().to_string();
    let candidates = vec![
        vec!["print", "--from", &index_path, "--json"],
        vec!["print", "--from", &index_path],
        vec!["print", &index_path, "--json"],
        vec!["print", &index_path],
    ];

    for args in candidates {
        let output = StdCommand::new(binary).args(&args).output();
        if let Ok(out) = output {
            if !out.status.success() {
                continue;
            }
            let text = String::from_utf8_lossy(&out.stdout);
            if text.len() > SCIP_QUERY_OUTPUT_LIMIT {
                continue;
            }
            if args.contains(&"--json") {
                if let Ok(value) = serde_json::from_str::<Value>(&text) {
                    if let Some(documents) = value.get("documents").and_then(|v| v.as_array()) {
                        return Some(documents.to_vec());
                    }
                    if let Some(arr) = value.as_array() {
                        return Some(arr.to_vec());
                    }
                }
            } else if let Ok(value) = serde_json::from_str::<Value>(&text) {
                if let Some(documents) = value.get("documents").and_then(|v| v.as_array()) {
                    return Some(documents.to_vec());
                }
            } else {
                // scip가 --json 미지원인 드문 환경 대비: 텍스트를 line별 JSON으로 파싱.
                let mut records = Vec::new();
                for line in text.lines() {
                    if let Ok(v) = serde_json::from_str::<Value>(line) {
                        if let Some(documents) = v.get("documents").and_then(|d| d.as_array()) {
                            records.extend_from_slice(documents);
                        }
                    }
                }
                if !records.is_empty() {
                    return Some(records);
                }
            }
        }
    }
    None
}

#[derive(Debug, Clone)]
struct ScipSymbolCandidate {
    symbol: String,
    file: String,
    range: Option<ScipRange>,
    kind: Option<String>,
}

fn parse_definition_roles(value: &Value) -> bool {
    match value {
        Value::String(s) => {
            let role_text = s.to_ascii_lowercase();
            role_text.contains("definition")
                || role_text.contains("def")
                || role_text.contains("declare")
                || role_text.contains("declaration")
                || role_text == "bit:1"
        }
        Value::Number(n) => n
            .as_u64()
            .is_some_and(|num| num == 1 || num == 2 || (num & 1) == 1),
        Value::Array(items) => items.iter().any(parse_definition_roles),
        Value::Object(map) => {
            let Some(role_value) = map
                .get("symbolRoles")
                .or_else(|| map.get("symbolRole"))
                .or_else(|| map.get("role"))
                .or_else(|| map.get("roles"))
            else {
                return false;
            };
            parse_definition_roles(role_value)
        }
        Value::Bool(b) => *b,
        _ => false,
    }
}

fn is_function_kind(kind: &str) -> bool {
    let kind = kind.to_ascii_lowercase();
    kind.contains("function") || kind.contains("method") || kind.contains("constructor")
}

fn parse_file_path(doc: &Value) -> String {
    let raw = parse_scalar_string_field(
        doc,
        &[
            "relative_path",
            "relativePath",
            "path",
            "file",
            "uri",
            "file_path",
            "filePath",
            "document",
        ],
    )
    .unwrap_or_else(|| "[unknown]".to_string());
    if let Some(stripped) = raw.strip_prefix("file://") {
        stripped.to_string()
    } else {
        raw
    }
}

fn read_symbols_from_documents(documents: &[Value]) -> Vec<ScipSymbolCandidate> {
    let mut symbols = Vec::new();
    for doc in documents {
        let file = parse_file_path(doc);
        if let Some(items) = doc.get("symbols").and_then(|v| v.as_array()) {
            for item in items {
                let symbol = parse_scalar_string_field(
                    item,
                    &["symbol", "symbol_name", "symbolName", "name"],
                )
                .unwrap_or_default();
                if symbol.is_empty() {
                    continue;
                }
                let range = parse_position_field(
                    item.get("range")
                        .or_else(|| item.get("location"))
                        .unwrap_or(item),
                );
                symbols.push(ScipSymbolCandidate {
                    symbol,
                    file: file.clone(),
                    range,
                    kind: parse_scalar_string_field(item, &["kind", "symbolKind", "symbol_kind"]),
                });
            }
        } else if let Some(occurrences) = doc.get("occurrences").and_then(|v| v.as_array()) {
            for occ in occurrences {
                let symbol = parse_scalar_string_field(occ, &["symbol"]).unwrap_or_default();
                if symbol.is_empty() {
                    continue;
                }
                let range = parse_position_field(
                    occ.get("range")
                        .or_else(|| occ.get("position"))
                        .unwrap_or(occ),
                );
                symbols.push(ScipSymbolCandidate {
                    symbol,
                    file: file.clone(),
                    range,
                    kind: Some("occurrence".to_string()),
                });
            }
        }
    }
    symbols
}

fn select_function_context(
    file_symbols: &[ScipSymbolCandidate],
    query_file: &str,
    range: Option<&ScipRange>,
) -> Option<ScipSymbolCandidate> {
    let mut candidates = Vec::new();
    for candidate in file_symbols {
        if candidate.file != query_file {
            continue;
        }
        if let Some(kind) = candidate.kind.as_deref() {
            if !is_function_kind(kind) {
                continue;
            }
        } else {
            continue;
        }
        if let (Some(inner), Some(outer)) = (range, candidate.range.as_ref()) {
            if contains_range(outer, inner) {
                candidates.push(candidate.clone());
            }
        }
    }

    if candidates.is_empty() {
        return None;
    }
    candidates.sort_by(|a, b| {
        let alen = a
            .range
            .as_ref()
            .map(|r| r.end_line.saturating_sub(r.start_line))
            .unwrap_or(u64::MAX);
        let blen = b
            .range
            .as_ref()
            .map(|r| r.end_line.saturating_sub(r.start_line))
            .unwrap_or(u64::MAX);
        alen.cmp(&blen).then(a.symbol.cmp(&b.symbol))
    });
    candidates.into_iter().next()
}

fn dedupe_locations(mut input: Vec<ScipSymbolLocation>) -> Vec<ScipSymbolLocation> {
    let mut seen = HashSet::new();
    input.sort_by(|a, b| {
        a.file
            .cmp(&b.file)
            .then(a.symbol.cmp(&b.symbol))
            .then(a.line.cmp(&b.line))
    });
    let mut out = Vec::new();
    for item in input {
        let key = format!(
            "{}|{}|{:?}|{:?}",
            item.file,
            item.symbol,
            item.line.unwrap_or(0),
            item.column.unwrap_or(0)
        );
        if seen.insert(key) {
            out.push(item);
        }
    }
    out
}

pub fn query_scip_symbol_definitions(cwd: &str, query: &str) -> Vec<ScipSymbolLocation> {
    let q = query.trim();
    if q.is_empty() {
        return Vec::new();
    }
    let backends = detect_scip_backends(Some(cwd.to_string()));
    for backend in backends {
        if !backend.available || !backend.index_exists {
            continue;
        }

        let index_path = PathBuf::from(&backend.index_path);
        let Some(documents) = parse_scip_print_json(&backend.binary, &index_path) else {
            continue;
        };
        let mut matched = query_scip_symbol_definitions_from_documents(q, &documents);
        if matched.is_empty() {
            continue;
        }
        matched.sort_by(|a, b| a.file.cmp(&b.file).then(a.symbol.cmp(&b.symbol)));
        return matched;
    }
    Vec::new()
}

fn query_scip_symbol_definitions_from_documents(
    query: &str,
    documents: &[Value],
) -> Vec<ScipSymbolLocation> {
    let q = query.trim();
    if q.is_empty() {
        return Vec::new();
    }
    let symbols = read_symbols_from_documents(documents);
    let matched: Vec<ScipSymbolLocation> = symbols
        .into_iter()
        .filter(|item| symbol_token_match(q, &item.symbol))
        .map(|item| ScipSymbolLocation {
            symbol: item.symbol,
            file: item.file,
            line: item.range.as_ref().map(|r| r.start_line),
            column: item.range.and_then(|r| r.start_col),
        })
        .collect();
    let mut matched = dedupe_locations(matched);
    if matched.is_empty() {
        return Vec::new();
    }
    matched.sort_by(|a, b| a.file.cmp(&b.file).then(a.symbol.cmp(&b.symbol)));
    matched
}

pub fn query_scip_callers(cwd: &str, query: &str) -> Vec<ScipSymbolLocation> {
    let q = query.trim();
    if q.is_empty() {
        return Vec::new();
    }
    let q = q.to_ascii_lowercase();
    let backends = detect_scip_backends(Some(cwd.to_string()));
    for backend in backends {
        if !backend.available || !backend.index_exists {
            continue;
        }
        let index_path = PathBuf::from(&backend.index_path);
        let documents = parse_scip_print_json(&backend.binary, &index_path);
        let Some(documents) = documents else {
            continue;
        };

        let mut out = query_scip_callers_from_documents(&q, &documents);
        if out.is_empty() {
            continue;
        }
        out.sort_by(|a, b| a.file.cmp(&b.file).then(a.symbol.cmp(&b.symbol)));
        return out;
    }
    Vec::new()
}

fn query_scip_callers_from_documents(query: &str, documents: &[Value]) -> Vec<ScipSymbolLocation> {
    let q = query.trim();
    if q.is_empty() {
        return Vec::new();
    }
    let q = q.to_ascii_lowercase();

    let mut file_symbols: Vec<ScipSymbolCandidate> = Vec::new();
    let mut occurrences = Vec::new();
    let mut symbol_defs = HashSet::new();
    for doc in documents {
        let file = parse_file_path(doc);
        if let Some(items) = doc.get("symbols").and_then(|v| v.as_array()) {
            for item in items {
                let symbol = parse_scalar_string_field(
                    item,
                    &["symbol", "symbol_name", "symbolName", "name"],
                )
                .unwrap_or_default();
                if symbol.is_empty() {
                    continue;
                }
                let range = parse_position_field(
                    item.get("range")
                        .or_else(|| item.get("location"))
                        .unwrap_or(item),
                );
                let kind = parse_scalar_string_field(item, &["kind", "symbolKind", "symbol_kind"]);
                if symbol_token_match(&q, &symbol) {
                    symbol_defs.insert(symbol.clone());
                }
                if is_function_kind(kind.as_deref().unwrap_or("")) {
                    file_symbols.push(ScipSymbolCandidate {
                        symbol,
                        file: file.clone(),
                        range,
                        kind,
                    });
                }
            }
        }
        if let Some(items) = doc.get("occurrences").and_then(|v| v.as_array()) {
            for item in items {
                let symbol = parse_scalar_string_field(item, &["symbol"]).unwrap_or_default();
                if symbol.is_empty() {
                    continue;
                }
                occurrences.push((
                    symbol,
                    file.clone(),
                    parse_position_field(
                        item.get("range")
                            .or_else(|| item.get("position"))
                            .unwrap_or(item),
                    ),
                    parse_definition_roles(item),
                ));
            }
        }
    }

    let mut out = Vec::new();
    for (symbol, file, range, is_definition) in occurrences {
        if !symbol_defs.contains(&symbol) || is_definition {
            continue;
        }
        let candidate = select_function_context(&file_symbols, &file, range.as_ref())
            .unwrap_or_else(|| ScipSymbolCandidate {
                symbol,
                file: file.clone(),
                range: range.clone(),
                kind: None,
            });
        out.push(ScipSymbolLocation {
            symbol: candidate.symbol,
            file: file.clone(),
            line: range.as_ref().map(|r| r.start_line),
            column: range.and_then(|r| r.start_col),
        });
    }
    dedupe_locations(out)
}

fn trim_bytes_tail(input: &str, max_bytes: usize) -> String {
    if input.len() <= max_bytes {
        return input.to_string();
    }
    let start = input.len().saturating_sub(max_bytes);
    let boundary = (start..input.len())
        .find(|&idx| input.is_char_boundary(idx))
        .unwrap_or(start);
    format!("…[{}바이트 생략]\\n{}", max_bytes, &input[boundary..])
}

fn build_scip_backend_status(cwd: &str, entry: &BackendEntry) -> ScipBackend {
    let root = scip_root_for_workspace(cwd);
    let _ = std::fs::create_dir_all(&root);
    let index_path = scip_index_path(&root, entry.key);
    let index_exists = index_path
        .metadata()
        .map(|meta| meta.is_file() && meta.len() > 0)
        .unwrap_or(false);
    ScipBackend {
        language: entry.language.to_string(),
        key: entry.key.to_string(),
        binary: entry.binary.to_string(),
        available: has_binary(entry.binary),
        index_path: index_path.to_string_lossy().into_owned(),
        index_exists,
    }
}

fn build_command_candidates(index_path: &Path) -> Vec<Vec<String>> {
    let idx = index_path.to_string_lossy().to_string();
    vec![
        vec![
            "index".to_string(),
            "-p".to_string(),
            ".".to_string(),
            "-o".to_string(),
            idx.clone(),
        ],
        vec![
            "index".to_string(),
            "--project".to_string(),
            ".".to_string(),
            "--output".to_string(),
            idx.clone(),
        ],
        vec!["index".to_string(), "-o".to_string(), idx.clone()],
        vec!["index".to_string(), "--output".to_string(), idx.clone()],
        vec![
            "index".to_string(),
            ".".to_string(),
            "--output".to_string(),
            idx.clone(),
        ],
        vec!["index".to_string(), idx],
    ]
}

async fn try_build_index(binary: &str, args: Vec<String>, cwd: &Path) -> ScipCommandAttempt {
    let command = format!("{} {}", binary, args.join(" "));
    let mut proc = TokioCommand::new(binary);
    proc.args(&args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let child = match proc.spawn() {
        Ok(child) => child,
        Err(err) => {
            return ScipCommandAttempt {
                command,
                exit_code: None,
                timed_out: false,
                stdout: String::new(),
                stderr: format!("spawn 실패: {err}"),
            };
        }
    };

    let output = timeout(
        Duration::from_secs(SCIP_BUILD_TIMEOUT_SECS),
        child.wait_with_output(),
    )
    .await;

    match output {
        Ok(Ok(out)) => ScipCommandAttempt {
            command,
            exit_code: out.status.code(),
            timed_out: false,
            stdout: trim_bytes_tail(&String::from_utf8_lossy(&out.stdout), SCIP_BUILD_LOG_LIMIT),
            stderr: trim_bytes_tail(&String::from_utf8_lossy(&out.stderr), SCIP_BUILD_LOG_LIMIT),
        },
        Ok(Err(err)) => ScipCommandAttempt {
            command,
            exit_code: None,
            timed_out: false,
            stdout: String::new(),
            stderr: format!("wait_with_output 실패: {err}"),
        },
        Err(_) => ScipCommandAttempt {
            command,
            exit_code: None,
            timed_out: true,
            stdout: String::new(),
            stderr: "타임아웃".to_string(),
        },
    }
}

/// 사용자 PATH에서 scip-언어별 백엔드 바이너리 감지 상태를 반환.
pub fn detect_scip_backends(cwd: Option<String>) -> Vec<ScipBackend> {
    let cwd = resolve_cwd(cwd);
    KNOWN_BACKENDS
        .iter()
        .map(|entry| build_scip_backend_status(&cwd, entry))
        .collect()
}

/// 현재 옵션 UI에서 opt-in이 켜진 뒤에도 실제로 실행 가능한 SCIP 백엔드가 있으면 true.
pub fn has_available_scip_backend() -> bool {
    detect_scip_backends(None).into_iter().any(|b| b.available)
}

/// UI/모듈에서 사용할 수 있는 상태 스냅샷.
#[tauri::command]
pub fn scip_status(cwd: Option<String>) -> ScipStatus {
    let configured_enabled = crate::commands::config::load_config()
        .ok()
        .and_then(|cfg| cfg.react_scip_tools_enabled)
        .unwrap_or(false);
    let backends = detect_scip_backends(cwd);
    let available = configured_enabled && backends.iter().any(|b| b.available);
    ScipStatus {
        enabled: available,
        backends,
    }
}

/// 작업공간 기준 SCIP 인덱스를 생성/갱신한다. `force`가 없으면 기존 index.scip이 있을 때는 생략한다.
#[tauri::command]
pub async fn scip_rebuild_index(
    cwd: Option<String>,
    language: Option<String>,
    force: Option<bool>,
) -> Result<ScipRebuildSummary> {
    let cwd = resolve_cwd(cwd);
    let workspace = Path::new(&cwd);
    if !workspace.exists() {
        return Err(LumError::Io(format!(
            "워크스페이스 경로가 존재하지 않습니다: {cwd}"
        )));
    }

    let requested = language.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    let entries: Vec<&'static BackendEntry> = match requested.as_deref() {
        Some(ref language) => {
            let found = scip_backend_by_request(language);
            if found.is_none() {
                return Err(LumError::Config(format!(
                    "지원하지 않는 SCIP 언어입니다: {language}. 지원 언어: rust, typescript, go"
                )));
            }
            vec![found.unwrap()]
        }
        None => KNOWN_BACKENDS.iter().collect(),
    };

    let force = force.unwrap_or(false);
    let mut results = Vec::new();
    for entry in entries {
        let backend = build_scip_backend_status(&cwd, entry);
        let requested_by_key = requested
            .as_ref()
            .and_then(|r| scip_backend_by_request(r))
            .is_some_and(|matched| matched.key == entry.key);

        if !backend.available {
            results.push(ScipRebuildResult {
                language: backend.language,
                binary: backend.binary,
                available: false,
                index_path: backend.index_path,
                requested: requested_by_key,
                skipped: false,
                success: false,
                timed_out: false,
                message: "SCIP 바이너리가 PATH에 없습니다".to_string(),
            });
            continue;
        }

        if backend.index_exists && !force {
            results.push(ScipRebuildResult {
                language: backend.language,
                binary: backend.binary,
                available: true,
                index_path: backend.index_path,
                requested: requested_by_key,
                skipped: true,
                success: true,
                timed_out: false,
                message: "기존 index.scip이 있어 생략".to_string(),
            });
            continue;
        }

        let index_path = Path::new(&backend.index_path);
        if let Some(dir) = index_path.parent() {
            std::fs::create_dir_all(dir)?;
        }

        let candidates = build_command_candidates(index_path);
        let mut last_attempt = ScipCommandAttempt {
            command: String::new(),
            exit_code: None,
            timed_out: false,
            stdout: String::new(),
            stderr: String::new(),
        };
        let mut success = false;

        for candidate in candidates {
            let attempt = try_build_index(&backend.binary, candidate, workspace).await;
            if attempt.timed_out {
                last_attempt = attempt;
                break;
            }
            if attempt.exit_code == Some(0) && index_path.exists() {
                success = true;
                last_attempt = attempt;
                break;
            }
            last_attempt = attempt;
        }

        if success {
            results.push(ScipRebuildResult {
                language: backend.language,
                binary: backend.binary,
                available: true,
                index_path: backend.index_path,
                requested: requested_by_key,
                skipped: false,
                success: true,
                timed_out: false,
                message: format!("SCIP 인덱스 생성 완료 (명령: {}).", last_attempt.command),
            });
            continue;
        }

        let mut message = if last_attempt.timed_out {
            "SCIP 인덱스 생성이 타임아웃으로 중단되었습니다. 수동 실행 필요".to_string()
        } else {
            let code = last_attempt
                .exit_code
                .map(|v| v.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            format!(
                "SCIP 인덱스 생성 실패(코드: {code}, 명령: {})",
                last_attempt.command
            )
        };
        if !last_attempt.stderr.trim().is_empty() {
            message.push_str(&format!(" stderr: {}", last_attempt.stderr.trim()));
        }
        if !last_attempt.stdout.trim().is_empty() {
            message.push_str(&format!(" stdout: {}", last_attempt.stdout.trim()));
        }
        message.push_str(" | 수동 실행: `scip-<언어> index -o .lum_scip/<언어>/index.scip`");

        results.push(ScipRebuildResult {
            language: backend.language,
            binary: backend.binary,
            available: true,
            index_path: backend.index_path,
            requested: requested_by_key,
            skipped: false,
            success: false,
            timed_out: last_attempt.timed_out,
            message,
        });
    }

    Ok(ScipRebuildSummary {
        requested_language: requested,
        force,
        results,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    use std::{env, fs};

    #[test]
    fn parse_scalar_string_field_지원_형식_해석() {
        let value = serde_json::json!({"name": "foo", "num": 7});
        assert_eq!(
            parse_scalar_string_field(&value, &["none", "name"]).as_deref(),
            Some("foo")
        );
        assert_eq!(
            parse_scalar_string_field(&value, &["num"]).as_deref(),
            Some("7")
        );
    }

    #[test]
    fn parse_u64_field_문자열_및_숫자() {
        let value = serde_json::json!({"line": "12", "col": -1, "end": 34});
        assert_eq!(parse_u64_field(&value, &["line"]), Some(12));
        assert_eq!(parse_u64_field(&value, &["col"]), None);
        assert_eq!(parse_u64_field(&value, &["end"]), Some(34));
    }

    #[test]
    fn parse_position_field_범위_변환() {
        let value = serde_json::json!({
            "start": {"line": 10, "character": 5},
            "end": {"line": 12, "character": 2}
        });
        let range = parse_position_field(&value).expect("범위 파싱");
        assert_eq!(range.start_line, 10);
        assert_eq!(range.end_line, 12);
        assert_eq!(range.start_col, Some(5));
        assert_eq!(range.end_col, Some(2));
    }

    #[test]
    fn parse_position_field_평면_키() {
        let value = serde_json::json!({
            "start_line": 3,
            "start_char": 1,
            "end_line": 3,
            "end_character": 9,
        });
        let range = parse_position_field(&value).expect("범위 파싱");
        assert_eq!(range.start_line, 3);
        assert_eq!(range.start_col, Some(1));
        assert_eq!(range.end_line, 3);
        assert_eq!(range.end_col, Some(9));
    }

    #[test]
    fn parse_definition_roles_배열_문자열_처리() {
        let value = serde_json::json!({"symbolRoles": ["definition", "read"]});
        assert!(parse_definition_roles(&value));
    }

    #[test]
    fn parse_definition_roles_숫자_비트_처리() {
        let value = serde_json::json!({"symbolRole": 1});
        assert!(parse_definition_roles(&value));
    }

    #[test]
    fn symbol_token_match_테일_매칭() {
        assert!(symbol_token_match("foo", "pkg#foo"));
        assert!(symbol_token_match("foo(", "pkg#foo("));
        assert!(symbol_token_match("helper", "my.module#helper"));
        assert!(!symbol_token_match("bar", "pkg#foo"));
    }

    #[test]
    fn query_scip_symbol_definitions_from_documents_중복_제거와_매칭_검증() {
        let documents = vec![
            serde_json::json!({
                "relative_path": "src/main.rs",
                "symbols": [
                    {
                        "symbol": "pkg#foo",
                        "kind": "function",
                        "range": {
                            "start": {"line": 4, "character": 0},
                            "end": {"line": 10, "character": 1}
                        }
                    },
                    {
                        "symbol": "pkg#foo",
                        "kind": "function",
                        "range": {
                            "start": {"line": 4, "character": 0},
                            "end": {"line": 10, "character": 1}
                        }
                    }
                ]
            }),
            serde_json::json!({
                "file": "src/lib.rs",
                "symbols": [
                    {"symbol": "pkg#foo", "kind": "function", "range": {"start_line": 1, "start_char": 0, "end_line": 3, "end_character": 2}},
                    {"symbol": "pkg#bar", "kind": "method", "start_line": 12, "start_char": 0, "end_line": 14, "end_character": 4}
                ]
            }),
            serde_json::json!({
                "relativePath": "README.md",
                "symbols": [
                    {"symbol": "docs::ignore", "kind": "note", "start_line": 1, "start_char": 0, "end_line": 1, "end_character": 5}
                ]
            }),
        ];

        let result = query_scip_symbol_definitions_from_documents("foo", &documents);
        assert_eq!(result.len(), 2);
        assert!(result
            .iter()
            .any(|item| item.symbol == "pkg#foo" && item.file == "src/lib.rs"));
        assert!(result
            .iter()
            .any(|item| item.symbol == "pkg#foo" && item.file == "src/main.rs"));
    }

    #[test]
    fn query_scip_callers_from_documents_호출자_추적_및_중복_검증() {
        let documents = vec![
            serde_json::json!({
                "path": "src/caller.rs",
                "symbols": [
                    {"symbol": "pkg#main", "kind": "function", "start_line": 1, "start_char": 0, "end_line": 20, "end_character": 1},
                    {"symbol": "pkg#helper", "kind": "function", "start_line": 30, "start_char": 0, "end_line": 40, "end_character": 1},
                    {"symbol": "pkg#foo", "kind": "var", "start_line": 100, "start_char": 0, "end_line": 101, "end_character": 1},
                ],
                "occurrences": [
                    {"symbol": "pkg#foo", "start_line": 2, "start_char": 3, "end_line": 2, "end_character": 7, "symbolRoles": ["read"]},
                    {"symbol": "pkg#foo", "start_line": 34, "start_char": 8, "end_line": 34, "end_character": 12, "symbolRoles": ["read"]},
                    {"symbol": "pkg#foo", "start_line": 80, "start_char": 1, "end_line": 80, "end_character": 5, "symbolRoles": ["definition"]},
                    {"symbol": "pkg#foo", "start_line": 82, "start_char": 1, "end_line": 82, "end_character": 4, "symbolRoles": ["read"]}
                ]
            }),
            serde_json::json!({
                "path": "src/another.rs",
                "symbols": [
                    {"symbol": "pkg#other", "kind": "function", "start_line": 1, "start_char": 0, "end_line": 10, "end_character": 1}
                ],
                "occurrences": [
                    {"symbol": "pkg#foo", "start_line": 2, "start_char": 2, "end_line": 2, "end_character": 5, "symbolRoles": ["read"]},
                    {"symbol": "pkg#bar", "start_line": 3, "start_char": 1, "end_line": 3, "end_character": 4, "symbolRoles": ["read"]}
                ]
            }),
            serde_json::json!({
                "uri": "src/caller.rs",
                "occurrences": [
                    {"symbol": "pkg#foo", "start_line": 2, "start_char": 3, "end_line": 2, "end_character": 7, "symbolRoles": ["read"]}
                ]
            }),
        ];

        let result = query_scip_callers_from_documents("foo", &documents);
        assert_eq!(result.len(), 4);

        assert!(result.iter().any(|item| item.symbol == "pkg#main"
            && item.file == "src/caller.rs"
            && item.line == Some(2)));
        assert!(result.iter().any(|item| item.symbol == "pkg#helper"
            && item.file == "src/caller.rs"
            && item.line == Some(34)));
        assert!(result.iter().any(|item| item.symbol == "pkg#foo"
            && item.file == "src/caller.rs"
            && item.line == Some(82)));
        assert!(result.iter().any(|item| item.symbol == "pkg#other"
            && item.file == "src/another.rs"
            && item.line == Some(2)));
    }

    #[test]
    fn detect_scip_backends_항목_개수_확인() {
        let backends = detect_scip_backends(Some(".".to_string()));
        assert_eq!(backends.len(), KNOWN_BACKENDS.len());
    }

    #[test]
    fn detect_scip_backends_키_정보_확인() {
        let backends = detect_scip_backends(Some(".".to_string()));
        let keys: Vec<_> = backends.iter().map(|b| b.key.as_str()).collect();
        assert!(keys.contains(&"rust"));
        assert!(keys.contains(&"typescript"));
        assert!(keys.contains(&"go"));
    }

    #[test]
    fn detect_scip_backends_인덱스_경로_워크스페이스_반영() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("시간 계산")
            .as_nanos();
        let workspace = env::temp_dir().join(format!("lum_scip_test_workspace_{nonce}"));
        fs::create_dir_all(&workspace).unwrap();

        let backends = detect_scip_backends(Some(workspace.to_string_lossy().to_string()));
        assert!(!backends.is_empty(), "백엔드가 탐지되어야 함: {backends:?}");

        for backend in &backends {
            assert!(
                backend.index_path.contains(".lum_scip"),
                "인덱스 경로에 .lum_scip가 포함되어야 함: {}",
                backend.index_path
            );
            assert!(
                backend.index_path.ends_with("index.scip"),
                "SCIP 인덱스 경로는 index.scip로 끝나야 함: {}",
                backend.index_path
            );
        }

        let _ = fs::remove_dir_all(&workspace);
    }

    #[test]
    fn detect_scip_backends_인덱스_존재_탐지() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("시간 계산")
            .as_nanos();
        let workspace = env::temp_dir().join(format!("lum_scip_test_workspace_idx_{nonce}"));
        let workspace = workspace.to_string_lossy().to_string();
        let backends = detect_scip_backends(Some(workspace.clone()));
        let rust_backend = backends
            .iter()
            .find(|b| b.language == "Rust")
            .expect("Rust 백엔드 항목");
        assert!(
            !rust_backend.index_exists,
            "초기 상태에서 index_exists는 false여야 함"
        );

        let rust_index = Path::new(&rust_backend.index_path);
        let rust_dir = rust_index.parent().unwrap();
        fs::create_dir_all(rust_dir).unwrap();
        fs::write(rust_index, b"test index").unwrap();
        let backends_after = detect_scip_backends(Some(workspace.clone()));
        let rust_backend_after = backends_after
            .iter()
            .find(|b| b.language == "Rust")
            .expect("Rust 백엔드 항목");
        assert!(
            rust_backend_after.index_exists,
            "index.scip 생성 시 index_exists는 true여야 함"
        );

        let cleanup_target = Path::new(&workspace);
        let _ = fs::remove_dir_all(cleanup_target);
    }

    #[test]
    fn detect_scip_backends_항목_개수_재확인() {
        let backends = detect_scip_backends(None);
        assert_eq!(backends.len(), KNOWN_BACKENDS.len());
    }

    #[test]
    fn has_available_scip_backend_반환_타입() {
        let available = has_available_scip_backend();
        assert!(matches!(available, true | false));
    }

    #[test]
    fn scip_backend_by_request_지원언어_매칭() {
        let target = scip_backend_by_request("rust").expect("rust 매칭");
        assert_eq!(target.key, "rust");
        let target2 = scip_backend_by_request(" TypeScript ").expect("typescript 매칭");
        assert_eq!(target2.key, "typescript");
    }

    #[test]
    fn scip_backend_by_request_알수없는언어_처리() {
        assert!(scip_backend_by_request("python").is_none());
    }

    #[tokio::test]
    async fn scip_rebuild_index_요청언어_검증() {
        let result = scip_rebuild_index(None, Some("python".to_string()), None).await;
        assert!(result.is_err());
    }
}
