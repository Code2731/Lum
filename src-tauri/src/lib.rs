pub mod audio;
#[cfg(feature = "local-ai")]
pub mod burn_inference;
pub mod commands;
pub mod desktop;
pub mod error;
pub mod mcp;
pub mod memory;
pub mod platform;
pub mod sandbox;
pub mod swarm;

use crate::commands::sysmon::SysmonState;
use crate::commands::terminal::TerminalState;
use crate::mcp::McpState;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// Phase 115 — Quake Mode 단축키 modifiers. macOS=Cmd+Shift, 그 외=Ctrl+Shift.
// 백틱(`) 대신 Space — 셸에서 백틱이 자주 쓰여 충돌 회피.
#[cfg(target_os = "macos")]
const QUAKE_MODS: Modifiers = Modifiers::META.union(Modifiers::SHIFT);
#[cfg(not(target_os = "macos"))]
const QUAKE_MODS: Modifiers = Modifiers::CONTROL.union(Modifiers::SHIFT);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let terminal_state = TerminalState {
        ptys: Arc::new(Mutex::new(HashMap::new())),
        spawning: Arc::new(Mutex::new(std::collections::HashSet::new())),
    };

    let mcp_state = McpState {
        servers: Arc::new(Mutex::new(HashMap::new())),
    };

    #[cfg(feature = "local-ai")]
    let local_ai_state = burn_inference::LocalAIState::new();

    tauri::Builder::default()
        .manage(terminal_state)
        .manage(mcp_state)
        .manage(SysmonState::new())
        .manage(commands::models::DownloadCancelMap::default())
        .manage(commands::ai::AiStreamCancel::default())
        .manage({
            #[cfg(feature = "local-ai")]
            {
                local_ai_state
            }
            #[cfg(not(feature = "local-ai"))]
            {
                ()
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Phase 115 — Quake Mode: 글로벌 단축키로 윈도우 toggle + AI 바 자동 포커스.
            let quake = Shortcut::new(Some(QUAKE_MODS), Code::Space);
            let handle = app.handle().clone();
            app.global_shortcut().on_shortcut(quake, move |_app, _scut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                let Some(window) = handle.get_webview_window("main") else { return; };
                let visible = window.is_visible().unwrap_or(false);
                let focused = window.is_focused().unwrap_or(false);
                if visible && focused {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    // 프론트가 AI 바를 열고 입력에 포커스
                    let _ = handle.emit("quake_invoked", ());
                }
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Hardware
            commands::hardware::get_hardware_specs,
            // Local AI (burn/wgpu) — local-ai 피처 빌드에서만 노출
            #[cfg(feature = "local-ai")]
            burn_inference::init_local_model,
            #[cfg(feature = "local-ai")]
            burn_inference::generate_with_local_model,
            #[cfg(feature = "local-ai")]
            burn_inference::get_local_model_status,
            // Model Management
            commands::models::list_local_models,
            commands::models::download_model,
            commands::models::delete_model,
            commands::models::cancel_download,
            commands::models::check_repo_status,
            // AI Commands
            commands::agent::agent_plan,
            commands::agent::agent_observe,
            commands::react_agent::react_agent_run,
            commands::react_agent::react_agent_cancel,
            // Phase 70: Repo Map + Edit Apply
            commands::repo_map::get_repo_map,
            commands::edit_apply::apply_edit_block,
            commands::edit_apply::parse_edit_blocks_cmd,
            commands::ai::generate_ai_command,
            commands::ai::stream_ai_command,
            commands::ai::cancel_ai_stream,
            commands::ai::analyze_error,
            commands::ai::explain_command,
            commands::ai::verify_vision_goal,
            commands::ai::check_xllm_status,
            commands::ai::list_xllm_models,
            // Ollama 백엔드 (선택)
            commands::ollama::check_ollama_status,
            commands::ollama::list_ollama_models,
            commands::config::save_ollama_settings,
            // Terminal Commands
            commands::terminal::spawn_pty,
            commands::terminal::write_to_pty,
            commands::terminal::resize_pty,
            commands::terminal::close_pty,
            commands::terminal::spawn_ssh_pty,
            // System & Security
            sandbox::verify_command_safety,
            desktop::capture_screen,
            desktop::simulate_mouse,
            desktop::simulate_keyboard,
            desktop::simulate_click,
            desktop::simulate_scroll,
            desktop::simulate_key_combo,
            // Network & Swarm
            swarm::start_p2p_node,
            swarm::list_peers,
            swarm::send_swarm_task,
            swarm::delegate_swarm_task,
            // Memory & Audio
            audio::start_voice_recording,
            audio::stop_voice_recording,
            memory::add_to_memory,
            memory::search_memory,
            // Terminal Completions
            commands::terminal::get_completions,
            // RAG (Retrieval-Augmented Generation)
            commands::rag::index_project,
            commands::rag::search_codebase,
            commands::rag::generate_embedding,
            commands::rag::rag_context_for_file,
            // History (Semantic Search)
            commands::history::add_history_entry,
            commands::history::search_history,
            commands::history::get_recent_history,
            // Git
            commands::git::generate_commit_message,
            commands::git::analyze_diff,
            // Config
            commands::config::load_app_config,
            commands::config::save_xllm_settings,
            commands::config::save_terminal_appearance,
            commands::config::save_quick_actions,
            commands::config::save_hf_token,
            commands::config::check_onboarding_complete,
            commands::config::complete_onboarding,
            // Phase 71: 안전 모드 + VRAM 캡
            commands::config::save_safety_mode,
            commands::config::save_vram_cap_override,
            // Phase 72: capability 토글
            commands::config::save_capability_toggles,
            // Phase 105: 모델 저장 경로 설정
            commands::config::save_model_download_dir,
            commands::file_dialog::pick_gguf_file,
            commands::file_dialog::pick_model_dir,
            // Phase 73: 테스트 피드백 루프
            commands::test_runner::detect_project_tests,
            commands::test_runner::run_tests,
            // Session Persistence
            commands::session::save_session,
            commands::session::load_session,
            // Phase 116 — Worktree Squad
            commands::squad::squad_list,
            commands::squad::squad_create,
            commands::squad::squad_remove,
            // Phase 117 — Auto-Heal 학습 데이터셋
            commands::healing_dataset::record_healing_decision,
            commands::healing_dataset::list_healing_dataset,
            commands::healing_dataset::clear_healing_dataset,
            commands::healing_dataset::export_healing_dataset,
            // Workspace
            commands::workspace::save_workspace,
            commands::workspace::list_workspaces,
            commands::workspace::delete_workspace,
            // Project Context
            commands::context::get_project_context,
            commands::context::get_git_context,
            commands::context::get_staged_diff,
            commands::context::read_path_for_context,
            commands::context::list_directory,
            commands::context::parent_directory,
            // Updater
            commands::updater::check_for_update,
            commands::updater::install_update,
            // xLLM 모델 관리
            commands::xllm::get_xllm_model_info,
            commands::xllm::switch_xllm_model,
            commands::xllm::unload_xllm_model,
            // SSH 프로필 영속성
            commands::ssh_profiles::list_ssh_profiles,
            commands::ssh_profiles::save_ssh_profile,
            commands::ssh_profiles::delete_ssh_profile,
            // 환경 파일 자동 감지
            commands::env::detect_env_files,
            // 스크립트 라이브러리
            commands::scripts::list_scripts,
            commands::scripts::save_script,
            commands::scripts::delete_script,
            // System Monitor
            commands::sysmon::get_system_stats,
            // 모델 다운로드/스캔 (~/.lum_mistral_models/) — 임베디드용으로도 동일하게 사용
            commands::mistral_setup::download_mistral_model,
            commands::mistral_setup::cancel_mistral_download,
            commands::mistral_setup::list_mistral_models,
            commands::mistral_setup::delete_mistral_model,
            // Phase 85b — embedded mistralrs (subprocess 없이 LUM 프로세스 안에서 직접 추론)
            commands::embed::embed_load_gguf,
            commands::embed::embed_load_normal,
            commands::embed::embed_load_lora,
            commands::embed::embed_unload,
            commands::embed::embed_status,
            commands::embed::embed_loaded_info,
            commands::embed::embed_infer,
            commands::embed::embed_infer_stream,
            commands::embed::list_embed_candidates,
            commands::embed::list_lora_candidates,
            // MCP Tools (Phase 74 — 제대로 된 handshake + 서버 관리)
            mcp::list_mcp_servers,
            mcp::save_mcp_server,
            mcp::delete_mcp_server,
            mcp::mcp_stop_server,
            mcp::mcp_list_tools,
            mcp::mcp_call_tool,
            mcp::mcp_install_presets,
            mcp::mcp_system_prompt,
            mcp::list_internal_tools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
