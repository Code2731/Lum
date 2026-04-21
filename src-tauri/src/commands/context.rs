use std::path::Path;

/// 프로젝트 디렉토리를 스캔해 AI가 사용할 컨텍스트 문자열을 반환.
/// 예: "cwd: my-app, Node.js project \"my-app\" (scripts: dev, test, build)"
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

    if dir.join("package.json").exists() {
        parts.push(read_node_context(dir));
    } else if dir.join("Cargo.toml").exists() {
        parts.push(read_cargo_context(dir));
    } else if dir.join("go.mod").exists() {
        parts.push("Go project".to_string());
    } else if dir.join("pyproject.toml").exists() || dir.join("setup.py").exists() {
        parts.push("Python project".to_string());
    } else if dir.join("pom.xml").exists() || dir.join("build.gradle").exists() {
        parts.push("Java project".to_string());
    }

    // git 여부
    if dir.join(".git").exists() {
        parts.push("git repo".to_string());
    }

    parts.join(", ")
}

fn read_node_context(dir: &Path) -> String {
    let Ok(content) = std::fs::read_to_string(dir.join("package.json")) else {
        return "Node.js project".to_string();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
        return "Node.js project".to_string();
    };
    let name = json["name"].as_str().unwrap_or("").to_string();
    let scripts: Vec<&str> = json["scripts"]
        .as_object()
        .map(|s| s.keys().map(|k| k.as_str()).take(6).collect())
        .unwrap_or_default();
    if scripts.is_empty() {
        format!("Node.js project \"{name}\"")
    } else {
        format!("Node.js project \"{name}\" (scripts: {})", scripts.join(", "))
    }
}

fn read_cargo_context(dir: &Path) -> String {
    let Ok(content) = std::fs::read_to_string(dir.join("Cargo.toml")) else {
        return "Rust project".to_string();
    };
    let name = content
        .lines()
        .find(|l| l.trim_start().starts_with("name"))
        .and_then(|l| l.split('"').nth(1))
        .unwrap_or("unknown");
    format!("Rust project \"{name}\"")
}
