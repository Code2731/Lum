use std::path::Path;

#[derive(serde::Serialize, Debug, Clone)]
pub struct EnvSuggestion {
    pub file: String,
    pub runtime: String,
    pub cmd: String,
    pub description: String,
}

struct EnvRule {
    file: &'static str,
    runtime: &'static str,
    cmd: &'static str,
    description: &'static str,
}

const ENV_RULES: &[EnvRule] = &[
    EnvRule {
        file: ".nvmrc",
        runtime: "Node.js",
        cmd: "nvm install && nvm use",
        description: ".nvmrc 감지 — Node 버전 전환",
    },
    EnvRule {
        file: ".node-version",
        runtime: "Node.js",
        cmd: "nvm install && nvm use",
        description: ".node-version 감지 — Node 버전 전환",
    },
    EnvRule {
        file: ".python-version",
        runtime: "Python",
        cmd: "pyenv install --skip-existing && pyenv local $(cat .python-version)",
        description: ".python-version 감지 — pyenv 버전 적용",
    },
    EnvRule {
        file: "Pipfile",
        runtime: "Python",
        cmd: "pipenv install",
        description: "Pipfile 감지 — pipenv 환경 설치",
    },
    EnvRule {
        file: "requirements.txt",
        runtime: "Python",
        cmd: "python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt",
        description: "requirements.txt 감지 — 가상환경 생성 및 패키지 설치",
    },
    EnvRule {
        file: "pyproject.toml",
        runtime: "Python",
        cmd: "python -m venv .venv && source .venv/bin/activate && pip install -e .",
        description: "pyproject.toml 감지 — 프로젝트 개발 모드 설치",
    },
    EnvRule {
        file: "Gemfile",
        runtime: "Ruby",
        cmd: "bundle install",
        description: "Gemfile 감지 — Ruby 의존성 설치",
    },
    EnvRule {
        file: ".ruby-version",
        runtime: "Ruby",
        cmd:
            "rbenv install --skip-existing $(cat .ruby-version) && rbenv local $(cat .ruby-version)",
        description: ".ruby-version 감지 — rbenv 버전 적용",
    },
    EnvRule {
        file: ".tool-versions",
        runtime: "asdf",
        cmd: "asdf install",
        description: ".tool-versions 감지 — asdf 런타임 전체 설치",
    },
    EnvRule {
        file: ".envrc",
        runtime: "direnv",
        cmd: "direnv allow .",
        description: ".envrc 감지 — direnv 환경 활성화",
    },
];

#[tauri::command]
pub async fn detect_env_files(cwd: String) -> Vec<EnvSuggestion> {
    let dir = Path::new(&cwd);
    if !dir.is_dir() {
        return vec![];
    }

    let mut suggestions: Vec<EnvSuggestion> = Vec::new();
    let mut seen_runtimes: std::collections::HashSet<String> = std::collections::HashSet::new();

    for rule in ENV_RULES {
        if dir.join(rule.file).exists() {
            // Python 관련 파일이 여러 개 있어도 최초 감지만 보여줌
            if seen_runtimes.contains(rule.runtime) {
                continue;
            }
            seen_runtimes.insert(rule.runtime.to_string());

            suggestions.push(EnvSuggestion {
                file: rule.file.to_string(),
                runtime: rule.runtime.to_string(),
                cmd: rule.cmd.to_string(),
                description: rule.description.to_string(),
            });
        }
    }

    // package.json 이 있고 node_modules 가 없을 때만 제안
    if dir.join("package.json").exists() && !dir.join("node_modules").exists() {
        let cmd = if dir.join("pnpm-lock.yaml").exists() {
            "pnpm install"
        } else if dir.join("yarn.lock").exists() {
            "yarn install"
        } else {
            "npm install"
        };
        suggestions.push(EnvSuggestion {
            file: "package.json".to_string(),
            runtime: "Node.js".to_string(),
            cmd: cmd.to_string(),
            description: "package.json 감지 (node_modules 없음) — 의존성 설치".to_string(),
        });
    }

    suggestions
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_tmp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("lum_env_test_{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn test_no_env_files() {
        let dir = make_tmp("empty");
        let result = detect_env_files(dir.to_string_lossy().to_string()).await;
        assert!(result.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn test_nvmrc_detected() {
        let dir = make_tmp("nvmrc");
        fs::write(dir.join(".nvmrc"), "18.0.0").unwrap();
        let result = detect_env_files(dir.to_string_lossy().to_string()).await;
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file, ".nvmrc");
        assert_eq!(result[0].runtime, "Node.js");
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn test_package_json_with_node_modules_skipped() {
        let dir = make_tmp("pkg_with_nm");
        fs::write(dir.join("package.json"), "{}").unwrap();
        fs::create_dir(dir.join("node_modules")).unwrap();
        let result = detect_env_files(dir.to_string_lossy().to_string()).await;
        assert!(result.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn test_package_json_without_node_modules_suggests_install() {
        let dir = make_tmp("pkg_no_nm");
        fs::write(dir.join("package.json"), "{}").unwrap();
        let result = detect_env_files(dir.to_string_lossy().to_string()).await;
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file, "package.json");
        assert!(result[0].cmd.contains("npm install"));
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn test_python_dedup() {
        let dir = make_tmp("py_dedup");
        fs::write(dir.join("requirements.txt"), "flask").unwrap();
        fs::write(dir.join("pyproject.toml"), "[build-system]").unwrap();
        let result = detect_env_files(dir.to_string_lossy().to_string()).await;
        let python_count = result.iter().filter(|s| s.runtime == "Python").count();
        assert_eq!(python_count, 1);
        let _ = fs::remove_dir_all(dir);
    }
}
