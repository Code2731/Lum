use crate::commands::ai::call_xllm;
use crate::error::{LumError, Result};
use serde::Serialize;
use std::process::Command;

/// git diff --cached 를 가져와 xLLM으로 커밋 메시지 생성
#[tauri::command]
pub async fn generate_commit_message(repo_path: String, model: String) -> Result<String> {
    let dir = if repo_path.trim().is_empty() {
        crate::platform::home_dir()
    } else {
        std::path::PathBuf::from(&repo_path)
    };

    // 스테이징된 변경 요약
    let stat = Command::new("git")
        .args(["diff", "--cached", "--stat"])
        .current_dir(&dir)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    // 스테이징된 전체 diff
    let diff_out = Command::new("git")
        .args(["diff", "--cached"])
        .current_dir(&dir)
        .output()
        .map_err(|e| LumError::Io(e.to_string()))?;

    let diff = String::from_utf8_lossy(&diff_out.stdout).to_string();

    if diff.trim().is_empty() {
        return Err(LumError::Io(
            "스테이징된 변경사항이 없습니다. git add 를 먼저 실행하세요.".into(),
        ));
    }

    // 파일별 균등 예산으로 smart truncate (모든 변경 파일을 AI가 볼 수 있도록)
    let diff_ctx = smart_truncate_diff(&diff, 8000);

    let prompt = format!(
        "다음 git diff를 분석해 커밋 메시지를 작성하세요.\n\
규칙:\n\
- 제목: 50자 이내, 영어 명령형 동사로 시작 (feat:, fix:, refactor:, docs: 등 conventional commit)\n\
- 본문: 필요 시 변경 이유·영향 1-3줄 추가 (blank line 후)\n\
- 커밋 메시지 텍스트만 출력 (설명, 마크다운, 따옴표 없이)\n\
\n변경 요약:\n{}\n\ndiff:\n{}",
        stat.trim(),
        diff_ctx
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .unwrap_or_default();
    let msg = call_xllm(&client, &model, &prompt).await?;
    Ok(msg.trim().to_string())
}

#[derive(Serialize, Clone)]
pub struct FileDiffReview {
    pub path: String,
    pub risk: String, // "safe" | "caution" | "risk"
    pub summary: String,
}

/// git diff(staged 또는 unstaged)를 AI로 파일별 리스크 분석
#[tauri::command]
pub async fn analyze_diff(
    repo_path: String,
    staged: bool,
    model: String,
) -> Result<Vec<FileDiffReview>> {
    let dir = if repo_path.trim().is_empty() {
        crate::platform::home_dir()
    } else {
        std::path::PathBuf::from(&repo_path)
    };

    let mut diff_args = vec!["diff"];
    if staged {
        diff_args.push("--cached");
    }

    let diff_out = Command::new("git")
        .args(&diff_args)
        .current_dir(&dir)
        .output()
        .map_err(|e| LumError::Io(e.to_string()))?;

    let diff = String::from_utf8_lossy(&diff_out.stdout).to_string();
    if diff.trim().is_empty() {
        return Ok(vec![]);
    }

    // 파일 목록 수집
    let stat_out = Command::new("git")
        .args({
            let mut a = vec!["diff", "--name-only"];
            if staged {
                a.push("--cached");
            }
            a
        })
        .current_dir(&dir)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    let files: Vec<&str> = stat_out.lines().filter(|l| !l.is_empty()).collect();

    // 파일별 균등 예산으로 smart truncate (모든 변경 파일을 AI가 볼 수 있도록)
    let diff_ctx = smart_truncate_diff(&diff, 10_000);

    let prompt = format!(
        "다음 git diff를 파일별로 분석하세요.\n\
각 파일에 대해 아래 형식으로 한 줄씩만 출력하세요 (다른 텍스트 없이):\n\
RISK:<safe|caution|risk>|PATH:<경로>|NOTE:<한 줄 요약>\n\n\
risk 기준:\n\
- safe: 로직 변경 없음 (리팩토링, 주석, 스타일, 포맷)\n\
- caution: 로직 변경 있으나 범위 제한적\n\
- risk: 인터페이스 변경, 보안 코드, 에러 처리 제거, 데이터 손실 가능성\n\n\
분석 대상 파일: {}\n\ndiff:\n{}",
        files.join(", "),
        diff_ctx
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .unwrap_or_default();
    let raw = call_xllm(&client, &model, &prompt).await?;

    let mut reviews: Vec<FileDiffReview> = raw.lines().filter_map(parse_review_line).collect();

    // AI가 누락한 파일은 caution 으로 채움
    for f in &files {
        if !reviews.iter().any(|r| r.path == *f) {
            reviews.push(FileDiffReview {
                path: f.to_string(),
                risk: "caution".into(),
                summary: "분석 결과 없음".into(),
            });
        }
    }

    Ok(reviews)
}

fn parse_review_line(line: &str) -> Option<FileDiffReview> {
    let line = line.trim();
    if !line.starts_with("RISK:") {
        return None;
    }
    let parts: Vec<&str> = line.splitn(3, '|').collect();
    if parts.len() < 3 {
        return None;
    }
    let risk = parts[0].trim_start_matches("RISK:").trim().to_lowercase();
    let risk = match risk.as_str() {
        "safe" | "caution" | "risk" => risk,
        _ => "caution".into(),
    };
    let path = parts[1].trim_start_matches("PATH:").trim().to_string();
    let summary = parts[2].trim_start_matches("NOTE:").trim().to_string();
    if path.is_empty() {
        return None;
    }
    Some(FileDiffReview {
        path,
        risk,
        summary,
    })
}

/// diff를 파일 단위로 분할해 파일별 예산 내에서 균등 truncate.
/// 단순 cut-off 방식과 달리 모든 변경 파일을 AI가 볼 수 있다.
fn smart_truncate_diff(diff: &str, max_chars: usize) -> String {
    if diff.chars().count() <= max_chars {
        return diff.to_string();
    }
    // "diff --git " 경계로 파일별 섹션 분할
    let mut sections: Vec<&str> = Vec::new();
    let mut prev = 0;
    let marker = "\ndiff --git ";
    let mut search = 0;
    while let Some(pos) = diff[search..].find(marker) {
        let abs = search + pos;
        if abs > prev {
            sections.push(&diff[prev..abs]);
        }
        prev = abs + 1; // '\n' 이후부터
        search = abs + 1;
    }
    sections.push(&diff[prev..]);
    let sections: Vec<&str> = sections
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .collect();

    if sections.len() <= 1 {
        return format!(
            "{}\n...(이하 생략)...",
            diff.chars().take(max_chars).collect::<String>()
        );
    }

    let per_file = (max_chars / sections.len()).max(300);
    let mut result = String::new();
    for section in &sections {
        let chars: Vec<char> = section.chars().collect();
        if chars.len() <= per_file {
            result.push_str(section);
        } else {
            result.push_str(&chars[..per_file].iter().collect::<String>());
            result.push_str("\n...(이하 생략)...\n");
        }
    }
    result
}
