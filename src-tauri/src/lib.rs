pub mod audio;
pub mod burn_inference;
pub mod commands;
pub mod desktop;
pub mod error;
pub mod mcp;
pub mod memory;
pub mod platform;
pub mod sandbox;
pub mod swarm;

use crate::commands::terminal::TerminalState;
use crate::mcp::McpState;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let terminal_state = TerminalState {
        ptys: Arc::new(Mutex::new(HashMap::new())),
    };

    let mcp_state = McpState {
        servers: Arc::new(Mutex::new(HashMap::new())),
    };

    tauri::Builder::default()
        .manage(terminal_state)
        .manage(mcp_state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Hardware
            commands::hardware::get_hardware_specs,
            // Model Management
            commands::models::list_local_models,
            commands::models::download_model,
            commands::models::delete_model,
            // AI Commands
            commands::ai::generate_ai_command,
            commands::ai::analyze_error,
            commands::ai::verify_vision_goal,
            commands::ai::check_xllm_status,
            commands::ai::list_xllm_models,
            // Terminal Commands
            commands::terminal::spawn_pty,
            commands::terminal::write_to_pty,
            commands::terminal::resize_pty,
            commands::terminal::close_pty,
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
            // Config
            commands::config::load_app_config,
            commands::config::save_xllm_settings,
            // Session Persistence
            commands::session::save_session,
            commands::session::load_session,
            // Project Context
            commands::context::get_project_context,
            // xLLM 모델 관리
            commands::xllm::get_xllm_model_info,
            commands::xllm::switch_xllm_model,
            commands::xllm::unload_xllm_model,
            // MCP Tools
            mcp::call_mcp_tool,
            mcp::list_internal_tools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
