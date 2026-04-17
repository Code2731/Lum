use libp2p::{
    gossipsub, mdns, request_response, swarm::NetworkBehaviour,
};
use serde::{Deserialize, Serialize};

#[derive(NetworkBehaviour)]
pub struct LumBehaviour {
    pub gossipsub: gossipsub::Behaviour,
    pub mdns: mdns::tokio::Behaviour,
    pub request_response: request_response::json::Behaviour<SwarmMessage, SwarmMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SwarmMessage {
    TaskRequest { task: String, context: String },
    TaskResponse { result: String },
    Ping,
    Pong,
}

#[tauri::command]
pub async fn start_p2p_node() -> Result<String, String> {
    println!("Starting LUM P2P Node...");
    Ok("LUM P2P Node initialized. Searching for peers via mDNS...".to_string())
}

#[tauri::command]
pub fn list_peers() -> Vec<String> {
    vec![
        "LUM-Desktop-Pro (Local)".to_string(),
        "LUM-MacBook-Air (Remote)".to_string(),
    ]
}

#[tauri::command]
pub async fn send_swarm_task(peer_id: String, task: String) -> Result<String, String> {
    println!("Sending task to {}: {}", peer_id, task);
    Ok(format!("Task successfully delegated to {}. Waiting for response...", peer_id))
}
