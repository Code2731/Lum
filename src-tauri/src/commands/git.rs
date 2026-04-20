use crate::commands::ai::call_xllm;
use crate::error::{LumError, Result};
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

    // 토큰 절약을 위해 8000자 초과 시 truncate
    let diff_ctx = if diff.len() > 8000 {
        format!("{}\n...(이하 생략)...", &diff[..8000])
    } else {
        diff
    };

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

    let client = reqwest::Client::new();
    let msg = call_xllm(&client, &model, &prompt).await?;
    Ok(msg.trim().to_string())
}
