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
            { local_ai_state }
            #[cfg(not(feature = "local-ai"))]
            { () }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            // AI Commands
            commands::agent::agent_plan,
            commands::agent::agent_observe,
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
            // Session Persistence
            commands::session::save_session,
            commands::session::load_session,
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
            // TabbyAPI / MLX-LM 설치·실행 관리
            commands::tabbyapi_setup::get_platform_arch,
            commands::tabbyapi_setup::check_tabbyapi_status,
            commands::tabbyapi_setup::get_recommended_port,
            commands::tabbyapi_setup::install_tabbyapi,
            commands::tabbyapi_setup::start_tabbyapi,
            commands::tabbyapi_setup::stop_tabbyapi,
            commands::tabbyapi_setup::restart_with_model,
            // MCP Tools
            mcp::call_mcp_tool,
            mcp::list_internal_tools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
