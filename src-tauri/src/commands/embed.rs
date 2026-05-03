//! Phase 85b — embedded mistralrs Tauri command facade.
//!
//! `embedded-ai` feature 활성화 여부에 무관하게 *동일한 invoke 인터페이스*를 제공.
//! 활성 시 `mistralrs_inline` 진짜 구현 호출, 비활성 시 stub 에러 반환.
//! lib.rs의 invoke_handler가 cfg 분기 없이 항상 같은 entry로 등록 가능.

use serde::Serialize;

#[derive(Serialize)]
pub struct EmbedCandidate {
    pub folder: String,
    pub folder_label: String,
    pub gguf_files: Vec<String>,
    /// config.json + *.safetensors 존재 → BF16 ISQ 로드 가능
    pub has_safetensors: bool,
}

#[derive(Serialize)]
pub struct LoraCandidate {
    pub folder: String,
    pub folder_label: String,
}

/// 모델 저장 루트 디렉토리 안의 모델 폴더 목록 반환.
/// GGUF 파일이 있으면 `gguf_files`, BF16 safetensors 폴더면 `has_safetensors = true`.
/// embedded-ai feature 무관하게 항상 동작.
#[tauri::command]
pub fn list_embed_candidates() -> Vec<EmbedCandidate> {
    let root = crate::commands::mistral_setup::model_root_dir();
    let Ok(entries) = std::fs::read_dir(&root) else {
        return vec![];
    };

    let mut out = Vec::<EmbedCandidate>::new();
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if !ft.is_dir() {
            continue;
        }
        let folder = entry.path();
        let label = entry.file_name().to_string_lossy().into_owned();

        let mut ggufs: Vec<String> = Vec::new();
        let mut has_safetensors = false;
        let has_config = folder.join("config.json").exists();

        for fe in std::fs::read_dir(&folder)
            .ok()
            .into_iter()
            .flatten()
            .flatten()
        {
            let p = fe.path();
            if !p.is_file() {
                continue;
            }
            if p.extension()
                .is_some_and(|x| x.eq_ignore_ascii_case("gguf"))
            {
                if let Some(n) = p.file_name() {
                    ggufs.push(n.to_string_lossy().into_owned());
                }
            } else if has_config
                && p.extension()
                    .is_some_and(|x| x.eq_ignore_ascii_case("safetensors"))
            {
                has_safetensors = true;
            }
        }
        // 샤딩된 safetensors도 감지 (model.safetensors.index.json)
        if has_config && folder.join("model.safetensors.index.json").exists() {
            has_safetensors = true;
        }
        ggufs.sort();

        if !ggufs.is_empty() || has_safetensors {
            out.push(EmbedCandidate {
                folder: folder.to_string_lossy().into_owned(),
                folder_label: label,
                gguf_files: ggufs,
                has_safetensors,
            });
        }
    }
    out.sort_by(|a, b| a.folder_label.cmp(&b.folder_label));
    out
}

/// 모델 저장 루트 안의 LoRA 어댑터 폴더 목록 반환.
/// `adapter_config.json` 존재 여부로 표준 HuggingFace LoRA 어댑터 감지.
#[tauri::command]
pub fn list_lora_candidates() -> Vec<LoraCandidate> {
    let root = crate::commands::mistral_setup::model_root_dir();
    let Ok(entries) = std::fs::read_dir(&root) else {
        return vec![];
    };

    let mut out: Vec<LoraCandidate> = entries
        .flatten()
        .filter_map(|entry| {
            let ft = entry.file_type().ok()?;
            if !ft.is_dir() {
                return None;
            }
            let folder = entry.path();
            folder
                .join("adapter_config.json")
                .exists()
                .then(|| LoraCandidate {
                    folder: folder.to_string_lossy().into_owned(),
                    folder_label: entry.file_name().to_string_lossy().into_owned(),
                })
        })
        .collect();
    out.sort_by(|a, b| a.folder_label.cmp(&b.folder_label));
    out
}

// 플랫폼별로 권장 dev 명령이 다름 — macOS=metal, Windows/Linux=cuda.
#[cfg(target_os = "macos")]
const DISABLED_MSG: &str =
    "embedded-ai feature 비활성 — npm run tauri:dev:metal (macOS Apple Silicon)";
#[cfg(not(target_os = "macos"))]
const DISABLED_MSG: &str =
    "embedded-ai feature 비활성 — scripts/cargo-check-cuda.bat 또는 npm run tauri:dev:cuda";

/// GGUF 모델 로드. 이미 같은 파일이면 스킵, 다른 모델이면 VRAM 해제 후 핫스왑.
#[tauri::command]
pub async fn embed_load_gguf(
    app: tauri::AppHandle,
    model_dir: String,
    gguf_file: String,
) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::load_model(&app, &model_dir, &gguf_file).await
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = (app, model_dir, gguf_file);
        Err(DISABLED_MSG.to_string())
    }
}

/// 로드된 모델을 Drop해 VRAM을 해제. 헤더/툴바 즉시 갱신용 이벤트도 emit.
#[tauri::command]
pub async fn embed_unload(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(feature = "embedded-ai")]
    {
        use tauri::Emitter;
        crate::commands::mistralrs_inline::unload_model().await;
        let _ = app.emit("embed_load_progress", "🗑 모델 언로드");
        Ok(())
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = app;
        Err(DISABLED_MSG.to_string())
    }
}

/// 모델 로드 여부 (UI 상태 표시용).
#[tauri::command]
pub fn embed_status() -> bool {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::loaded_key().is_some()
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        false
    }
}

/// 현재 로드된 모델 키 반환 — UI에서 로드된 모델 이름 표시용.
#[tauri::command]
pub fn embed_loaded_info() -> Option<String> {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::loaded_key()
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        None
    }
}

/// GGUF 베이스 + LoRA 어댑터 로드. `lora_adapter` = HF repo ID 또는 로컬 경로.
#[tauri::command]
pub async fn embed_load_lora(
    app: tauri::AppHandle,
    model_dir: String,
    gguf_file: String,
    lora_adapter: String,
) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::load_model_with_lora(
            &app,
            &model_dir,
            &gguf_file,
            &lora_adapter,
        )
        .await
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = (app, model_dir, gguf_file, lora_adapter);
        Err(DISABLED_MSG.to_string())
    }
}

/// ISQ 타입 문자열 파싱.
/// "Auto4" 등 Auto 접두사 → `IsqSetting::Auto(IsqBits)` (플랫폼 최적 자동 선택).
/// "Q4K" 등 → `IsqSetting::Specific(IsqType)`.
#[cfg(feature = "embedded-ai")]
fn parse_isq_setting(s: &str) -> Result<mistralrs::IsqSetting, String> {
    use mistralrs::{IsqBits, IsqSetting, IsqType};
    match s {
        // Auto — 플랫폼 최적 (CUDA: Q*K, Metal: AFQ*)
        "Auto2" => Ok(IsqSetting::Auto(IsqBits::Two)),
        "Auto3" => Ok(IsqSetting::Auto(IsqBits::Three)),
        "Auto4" => Ok(IsqSetting::Auto(IsqBits::Four)),
        "Auto5" => Ok(IsqSetting::Auto(IsqBits::Five)),
        "Auto6" => Ok(IsqSetting::Auto(IsqBits::Six)),
        "Auto8" => Ok(IsqSetting::Auto(IsqBits::Eight)),
        // GGUF 호환 Q*K
        "Q2K" => Ok(IsqSetting::Specific(IsqType::Q2K)),
        "Q3K" => Ok(IsqSetting::Specific(IsqType::Q3K)),
        "Q4_0" => Ok(IsqSetting::Specific(IsqType::Q4_0)),
        "Q4K" | "Q4_K_M" => Ok(IsqSetting::Specific(IsqType::Q4K)),
        "Q5_0" => Ok(IsqSetting::Specific(IsqType::Q5_0)),
        "Q5K" | "Q5_K_M" => Ok(IsqSetting::Specific(IsqType::Q5K)),
        "Q6K" | "Q6_K" => Ok(IsqSetting::Specific(IsqType::Q6K)),
        "Q8_0" => Ok(IsqSetting::Specific(IsqType::Q8_0)),
        "Q8K" => Ok(IsqSetting::Specific(IsqType::Q8K)),
        // HyperQuant — GGUF Q4보다 정밀
        "HQQ4" => Ok(IsqSetting::Specific(IsqType::HQQ4)),
        "HQQ8" => Ok(IsqSetting::Specific(IsqType::HQQ8)),
        other => Err(format!("알 수 없는 ISQ 타입: {other}")),
    }
}

/// BF16 safetensors 폴더를 ISQ 양자화해서 로드.
/// `isq_type`: "Auto4" | "Q4K" | "Q5K" | "Q6K" | "Q8_0" | "HQQ4" | "HQQ8" 등
#[tauri::command]
pub async fn embed_load_normal(
    app: tauri::AppHandle,
    model_path: String,
    isq_type: String,
) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        let isq = parse_isq_setting(&isq_type)?;
        crate::commands::mistralrs_inline::load_model_normal(&app, &model_path, isq).await
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = (app, model_path, isq_type);
        Err(DISABLED_MSG.to_string())
    }
}

/// 단일 추론 호출 (블로킹 — 풀 응답 받아서 반환).
#[tauri::command]
pub async fn embed_infer(prompt: String) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        crate::commands::mistralrs_inline::infer_once(&prompt).await
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = prompt;
        Err(DISABLED_MSG.to_string())
    }
}

/// 토큰별 스트리밍 추론 — `embed_token` 이벤트로 토큰 emit, 풀 응답을 반환값으로.
/// XllmPanel 디버그 패널 전용 (main AI 흐름의 `xllm_token`과 cross-talk 방지).
/// `cancel_ai_stream`을 호출하면 추론 중단.
#[tauri::command]
pub async fn embed_infer_stream(
    app: tauri::AppHandle,
    prompt: String,
    cancel_flag: tauri::State<'_, crate::commands::ai::AiStreamCancel>,
) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        use std::sync::atomic::Ordering;
        cancel_flag.store(false, Ordering::Relaxed);
        crate::commands::mistralrs_inline::infer_stream(
            &app,
            &prompt,
            &cancel_flag,
            true,
            "embed_token",
        )
        .await
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = (app, prompt, cancel_flag);
        Err(DISABLED_MSG.to_string())
    }
}
