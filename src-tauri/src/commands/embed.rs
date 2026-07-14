//! Phase 85b — embedded mistralrs Tauri command facade.
//!
//! `embedded-ai` feature 활성화 여부에 무관하게 *동일한 invoke 인터페이스*를 제공.
//! 활성 시 `mistralrs_inline` 진짜 구현 호출, 비활성 시 stub 에러 반환.
//! lib.rs의 invoke_handler가 cfg 분기 없이 항상 같은 entry로 등록 가능.

use serde::Serialize;
#[cfg(feature = "embedded-ai")]
use tauri::Emitter;

#[cfg(feature = "embedded-ai")]
#[derive(Debug, Clone)]
enum ParsedEmbedKey {
    Gguf {
        model_dir: String,
        gguf_file: String,
    },
    Lora {
        model_dir: String,
        gguf_file: String,
        lora_adapter: String,
    },
    Isq {
        model_path: String,
        isq_type: String,
    },
}

#[cfg(feature = "embedded-ai")]
impl ParsedEmbedKey {
    /// 저장된 키 문자열을 로드 방식으로 복원한다.
    /// - `{model_dir}/{gguf}+lora:{lora_adapter}`
    /// - `{model_dir}/{gguf}+isq:{isq}`
    /// - `{model_dir}/{gguf}`
    fn parse(raw: &str) -> Option<Self> {
        let key = raw.trim();
        if key.is_empty() {
            return None;
        }

        if let Some((base, lora_adapter)) = key.split_once("+lora:") {
            let (model_dir, gguf_file) = split_model_file(base)?;
            if lora_adapter.trim().is_empty() || gguf_file.trim().is_empty() {
                return None;
            }
            return Some(Self::Lora {
                model_dir,
                gguf_file,
                lora_adapter: lora_adapter.trim().to_string(),
            });
        }

        if let Some((base, isq_type)) = key.split_once("+isq:") {
            if isq_type.trim().is_empty() {
                return None;
            }
            return Some(Self::Isq {
                model_path: base.trim().to_string(),
                isq_type: isq_type.trim().to_string(),
            });
        }

        let (model_dir, gguf_file) = split_model_file(key)?;
        Some(Self::Gguf {
            model_dir,
            gguf_file,
        })
    }
}

#[cfg(feature = "embedded-ai")]
fn split_model_file(model_ref: &str) -> Option<(String, String)> {
    let slash = model_ref.rfind('/');
    let backslash = model_ref.rfind('\\');
    let idx = slash.max(backslash)?;
    if idx + 1 >= model_ref.len() {
        return None;
    }
    let model_dir = model_ref[..idx].trim().to_string();
    let gguf_file = model_ref[idx + 1..].trim().to_string();
    if model_dir.is_empty() || gguf_file.is_empty() {
        None
    } else {
        Some((model_dir, gguf_file))
    }
}

#[cfg(feature = "embedded-ai")]
fn save_last_embed_key(key: &str) {
    let mut config = match crate::commands::config::load_config() {
        Ok(c) => c,
        Err(_) => return,
    };
    config.mistral_last_embed_key = Some(key.to_string());
    let _ = crate::commands::config::save_config(&config);
}

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

#[cfg_attr(not(feature = "embedded-ai"), allow(dead_code))]
fn gguf_default_rank(file: &str) -> Option<usize> {
    let name = file.to_ascii_lowercase();
    if name.starts_with("mmproj") || name.contains("mmproj-") || name.contains("-bf16") {
        return None;
    }

    let priorities = [
        "q4_k_m", "q4_k_s", "q4_0", "q4_1", "iq4_xs", "iq4_nl", "q5_k_m", "q5_k_s", "q6_k",
        "q8_0", "q3_k_m", "q3_k_s", "ud-q4", "ud-iq4", "ud-q5", "ud-q3", "ud-iq3", "ud-q2",
        "ud-iq2",
    ];

    priorities
        .iter()
        .position(|needle| name.contains(needle))
        .or(Some(priorities.len()))
}

#[cfg_attr(not(feature = "embedded-ai"), allow(dead_code))]
fn preferred_gguf_file(files: &[String]) -> Option<String> {
    files
        .iter()
        .filter_map(|file| gguf_default_rank(file).map(|rank| (rank, file)))
        .min_by(|(rank_a, file_a), (rank_b, file_b)| rank_a.cmp(rank_b).then(file_a.cmp(file_b)))
        .map(|(_, file)| file.clone())
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
pub const DISABLED_MSG: &str =
    "embedded-ai feature 비활성 — npm run tauri:dev:metal (macOS Apple Silicon)";
#[cfg(not(target_os = "macos"))]
pub const DISABLED_MSG: &str =
    "embedded-ai feature 비활성 — scripts/cargo-check-cuda.bat 또는 npm run tauri:dev:cuda";

/// 마지막 로드 모델이 없거나 포맷이 맞지 않으면, 로컬에 설치된 첫 번째 mistral 모델을 기본 복원 대상으로 사용.
#[cfg(feature = "embedded-ai")]
fn pick_default_local_embed_key() -> Option<ParsedEmbedKey> {
    pick_default_local_embed_key_with_hint(None)
}

#[cfg(feature = "embedded-ai")]
fn pick_default_local_embed_key_with_hint(hint: Option<&str>) -> Option<ParsedEmbedKey> {
    let hint = hint
        .map(|h| h.trim().to_lowercase())
        .filter(|h| !h.is_empty());
    let candidates = list_embed_candidates();
    if candidates.is_empty() {
        return None;
    }

    if let Some(hint) = hint {
        let hint = hint;
        for candidate in candidates.iter() {
            let haystack = format!(
                "{} {}",
                candidate.folder.to_lowercase(),
                candidate.folder_label.to_lowercase()
            )
            .replace(['/', '\\'], " ");
            let folder_match = candidate
                .gguf_files
                .iter()
                .any(|f| f.to_lowercase().contains(&hint));
            if haystack.contains(&hint) || folder_match {
                let key = if let Some(gguf_file) = preferred_gguf_file(&candidate.gguf_files) {
                    ParsedEmbedKey::Gguf {
                        model_dir: candidate.folder.clone(),
                        gguf_file,
                    }
                } else if candidate.has_safetensors {
                    ParsedEmbedKey::Isq {
                        model_path: candidate.folder.clone(),
                        isq_type: "Auto4".to_string(),
                    }
                } else {
                    continue;
                };
                return Some(key);
            }
        }
    }

    list_embed_candidates().into_iter().find_map(|candidate| {
        if let Some(gguf_file) = preferred_gguf_file(&candidate.gguf_files) {
            return Some(ParsedEmbedKey::Gguf {
                model_dir: candidate.folder,
                gguf_file,
            });
        }
        if candidate.has_safetensors {
            return Some(ParsedEmbedKey::Isq {
                model_path: candidate.folder,
                isq_type: "Auto4".to_string(),
            });
        }
        None
    })
}

/// 저장된 `mistral_last_embed_key` 또는 로컬 설치 모델 기준으로 임베디드 모델 자동 복원.
/// 저장된 키가 없으면 로컬 모델(모델 폴더 정렬 1순위) 기본 복원으로 시도.
#[tauri::command]
pub async fn restore_last_embedded_model(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(feature = "embedded-ai")]
    {
        let config = crate::commands::config::load_config().map_err(|e| e.to_string())?;
        let saved_key = config.mistral_last_embed_key.clone();
        let preferred_hint = config
            .coding_model
            .as_deref()
            .or(config.doc_model.as_deref())
            .map(|s| s.to_string());
        let preferred_hint_ref = preferred_hint.as_deref();

        let mut tried_saved_key = false;
        let mut saved_key_loaded = false;
        if let Some(target) = saved_key.as_deref().and_then(|k| ParsedEmbedKey::parse(k)) {
            tried_saved_key = true;
            match target {
                ParsedEmbedKey::Lora {
                    model_dir,
                    gguf_file,
                    lora_adapter,
                } => {
                    if let Ok(_) =
                        embed_load_lora(app.clone(), model_dir, gguf_file, lora_adapter).await
                    {
                        saved_key_loaded = true;
                        return Ok(true);
                    }
                }
                ParsedEmbedKey::Isq {
                    model_path,
                    isq_type,
                } => {
                    if let Ok(_) = embed_load_normal(app.clone(), model_path, isq_type).await {
                        saved_key_loaded = true;
                        return Ok(true);
                    }
                }
                ParsedEmbedKey::Gguf {
                    model_dir,
                    gguf_file,
                } => {
                    if let Ok(_) = embed_load_gguf(app.clone(), model_dir, gguf_file).await {
                        saved_key_loaded = true;
                        return Ok(true);
                    }
                }
            }
        }

        let target = pick_default_local_embed_key_with_hint(preferred_hint_ref);

        if tried_saved_key && !saved_key_loaded {
            let _ = app.emit(
                "embed_load_progress",
                "⚠️ 저장 키 복원 실패 — 로컬 모델 재탐색으로 전환".to_string(),
            );
        }

        match target {
            Some(ParsedEmbedKey::Lora {
                model_dir,
                gguf_file,
                lora_adapter,
            }) => {
                let _ = embed_load_lora(app, model_dir, gguf_file, lora_adapter).await?;
            }
            Some(ParsedEmbedKey::Isq {
                model_path,
                isq_type,
            }) => {
                let _ = embed_load_normal(app, model_path, isq_type).await?;
            }
            Some(ParsedEmbedKey::Gguf {
                model_dir,
                gguf_file,
            }) => {
                let _ = embed_load_gguf(app, model_dir, gguf_file).await?;
            }
            None => return Ok(false),
        }
        Ok(true)
    }
    #[cfg(not(feature = "embedded-ai"))]
    {
        let _ = app;
        Err(DISABLED_MSG.to_string())
    }
}

/// GGUF 모델 로드. 이미 같은 파일이면 스킵, 다른 모델이면 VRAM 해제 후 핫스왑.
#[tauri::command]
pub async fn embed_load_gguf(
    app: tauri::AppHandle,
    model_dir: String,
    gguf_file: String,
) -> Result<String, String> {
    #[cfg(feature = "embedded-ai")]
    {
        let result =
            crate::commands::mistralrs_inline::load_model(&app, &model_dir, &gguf_file).await;
        if result.is_ok() {
            save_last_embed_key(&format!("{model_dir}/{gguf_file}"));
        }
        result
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
        let result = crate::commands::mistralrs_inline::load_model_with_lora(
            &app,
            &model_dir,
            &gguf_file,
            &lora_adapter,
        )
        .await
        .and_then(|r| {
            save_last_embed_key(&format!("{model_dir}/{gguf_file}+lora:{lora_adapter}"));
            Ok(r)
        })?;
        Ok(result)
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
        let result =
            crate::commands::mistralrs_inline::load_model_normal(&app, &model_path, isq).await;
        if result.is_ok() {
            save_last_embed_key(&format!("{model_path}+isq:{isq_type}"));
        }
        result
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

#[cfg(test)]
mod gguf_selection_tests {
    use super::*;

    #[test]
    fn preferred_gguf_skips_bf16_and_mmproj() {
        let files = vec![
            "gemma-4-E4B-it-BF16.gguf".to_string(),
            "mmproj-F16.gguf".to_string(),
            "gemma-4-E4B-it-Q4_K_M.gguf".to_string(),
        ];

        assert_eq!(
            preferred_gguf_file(&files),
            Some("gemma-4-E4B-it-Q4_K_M.gguf".to_string())
        );
    }

    #[test]
    fn preferred_gguf_uses_practical_quant_before_larger_quant() {
        let files = vec![
            "model-Q8_0.gguf".to_string(),
            "model-Q5_K_M.gguf".to_string(),
            "model-Q4_K_S.gguf".to_string(),
        ];

        assert_eq!(preferred_gguf_file(&files), Some("model-Q4_K_S.gguf".to_string()));
    }
}

#[cfg(all(test, feature = "embedded-ai"))]
mod tests {
    use super::*;

    #[test]
    fn parse_embed_key_gguf() {
        let parsed = ParsedEmbedKey::parse("/models/Qwen/Q4.gguf").unwrap();
        let ParsedEmbedKey::Gguf {
            model_dir,
            gguf_file,
        } = parsed
        else {
            panic!("GGUF 키 파싱 실패");
        };
        assert_eq!(model_dir, "/models/Qwen");
        assert_eq!(gguf_file, "Q4.gguf");
    }

    #[test]
    fn parse_embed_key_lora() {
        let parsed = ParsedEmbedKey::parse("/models/Qwen/Q4.gguf+lora:/lora/adapter").unwrap();
        let ParsedEmbedKey::Lora {
            model_dir,
            gguf_file,
            lora_adapter,
        } = parsed
        else {
            panic!("LoRA 키 파싱 실패");
        };
        assert_eq!(model_dir, "/models/Qwen");
        assert_eq!(gguf_file, "Q4.gguf");
        assert_eq!(lora_adapter, "/lora/adapter");
    }

    #[test]
    fn parse_embed_key_isq() {
        let parsed = ParsedEmbedKey::parse("/models/bf16-model+isq:Auto4").unwrap();
        let ParsedEmbedKey::Isq {
            model_path,
            isq_type,
        } = parsed
        else {
            panic!("ISQ 키 파싱 실패");
        };
        assert_eq!(model_path, "/models/bf16-model");
        assert_eq!(isq_type, "Auto4");
    }

    #[test]
    fn parse_embed_key_invalid() {
        assert!(ParsedEmbedKey::parse(" ").is_none());
    }
}
