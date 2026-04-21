use std::path::Path;

#[tauri::command]
pub fn get_project_context(cwd: String) -> String {
    if cwd.is_empty() {
        return String::new();
    }
    let dir = Path::new(&cwd);
    let mut parts: Vec<String> = Vec::new();

    if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
        parts.push(format!("cwd: {name}"));
    }

    // 파일 읽기 시도로 프로젝트 타입 감지 — exists() 사전 체크 없이 I/O 결과로 판단
    if let Some(ctx) = read_node_context(dir) {
        parts.push(ctx);
    } else if let Some(ctx) = read_cargo_context(dir) {
        parts.push(ctx);
    } else if dir.join("go.mod").exists() {
        parts.push("Go project".to_string());
    } else if dir.join("pyproject.toml").exists() || dir.join("setup.py").exists() {
        parts.push("Python project".to_string());
    } else if dir.join("pom.xml").exists() || dir.join("build.gradle").exists() {
        parts.push("Java project".to_string());
    }

    if dir.join(".git").exists() {
        parts.push("git repo".to_string());
    }

    parts.join(", ")
}

fn read_node_context(dir: &Path) -> Option<String> {
    let content = std::fs::read_to_string(dir.join("package.json")).ok()?;
    let json = serde_json::from_str::<serde_json::Value>(&content).ok()?;
    let name = json["name"].as_str().unwrap_or("");
    let scripts: Vec<&str> = json["scripts"]
        .as_object()
        .map(|s| s.keys().map(|k| k.as_str()).take(6).collect())
        .unwrap_or_default();
    Some(if scripts.is_empty() {
        format!("Node.js project \"{name}\"")
    } else {
        format!("Node.js project \"{name}\" (scripts: {})", scripts.join(", "))
    })
}

fn read_cargo_context(dir: &Path) -> Option<String> {
    let content = std::fs::read_to_string(dir.join("Cargo.toml")).ok()?;
    let name = content
        .lines()
        .find(|l| l.trim_start().starts_with("name"))
        .and_then(|l| l.split('"').nth(1))
        .unwrap_or("unknown");
    Some(format!("Rust project \"{name}\""))
}
