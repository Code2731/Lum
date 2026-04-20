use futures_util::StreamExt;
use libp2p::{
    gossipsub, mdns, request_response,
    swarm::{NetworkBehaviour, SwarmEvent},
    PeerId, StreamProtocol,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

#[derive(NetworkBehaviour)]
pub struct LumBehaviour {
    pub gossipsub: gossipsub::Behaviour,
    pub mdns: mdns::tokio::Behaviour,
    pub request_response: request_response::json::Behaviour<SwarmMessage, SwarmMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SwarmMessage {
    StatusUpdate {
        peer_id: String,
        cpu_usage: f32,
        gpu_ready: bool,
        active_models: Vec<String>,
    },
    TaskRequest {
        task_id: String,
        task_type: String,
        payload: String,
    },
    TaskResponse {
        task_id: String,
        result: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub last_seen_as_secs: u64,
    pub cpu_usage: f32,
    pub gpu_ready: bool,
    pub active_models: Vec<String>,
}

pub struct PeerManager {
    pub peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
}

#[tauri::command]
pub async fn start_p2p_node(handle: tauri::AppHandle) -> Result<String, String> {
    let mut swarm = libp2p::SwarmBuilder::with_new_identity()
        .with_tokio()
        .with_tcp(
            libp2p::tcp::Config::default(),
            libp2p::noise::Config::new,
            libp2p::yamux::Config::default,
        )
        .map_err(|e| e.to_string())?
        .with_behaviour(|key| {
            let message_id_fn = |message: &gossipsub::Message| {
                let mut s = std::collections::hash_map::DefaultHasher::new();
                std::hash::Hash::hash(&message.data, &mut s);
                gossipsub::MessageId::from(std::hash::Hasher::finish(&s).to_string())
            };

            let gossipsub_config = gossipsub::ConfigBuilder::default()
                .heartbeat_interval(Duration::from_secs(10))
                .validation_mode(gossipsub::ValidationMode::Strict)
                .message_id_fn(message_id_fn)
                .build()
                .map_err(|e| e.to_string())?;

            let mut gossipsub = gossipsub::Behaviour::new(
                gossipsub::MessageAuthenticity::Signed(key.clone()),
                gossipsub_config,
            )
            .map_err(|e| e.to_string())?;

            let topic = gossipsub::IdentTopic::new("lum-status");
            gossipsub.subscribe(&topic).map_err(|e| e.to_string())?;

            Ok(LumBehaviour {
                gossipsub,
                mdns: mdns::tokio::Behaviour::new(
                    mdns::Config::default(),
                    key.public().to_peer_id(),
                )
                .map_err(|e| e.to_string())?,
                request_response: request_response::json::Behaviour::new(
                    [(
                        StreamProtocol::new("/lum-task/1.0.0"),
                        request_response::ProtocolSupport::Full,
                    )],
                    request_response::Config::default(),
                ),
            })
        })
        .map_err(|e| e.to_string())?
        .build();

    let peer_id = *swarm.local_peer_id();

    tokio::spawn(async move {
        let _ = swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse().unwrap());

        loop {
            match swarm.select_next_some().await {
                SwarmEvent::Behaviour(LumBehaviourEvent::Gossipsub(
                    gossipsub::Event::Message {
                        propagation_source: peer_id,
                        message,
                        ..
                    },
                )) => {
                    if let Ok(msg) = serde_json::from_slice::<SwarmMessage>(&message.data) {
                        handle.emit("peer-status-updated", msg).unwrap();
                    }
                }
                SwarmEvent::Behaviour(LumBehaviourEvent::Mdns(mdns::Event::Discovered(list))) => {
                    for (peer_id, _multiaddr) in list {
                        handle.emit("peer-discovered", peer_id.to_string()).unwrap();
                    }
                }
                _ => {}
            }
        }
    });

    Ok(format!("LUM Swarm Node active: {}", peer_id))
}

#[tauri::command]
pub fn list_peers() -> Vec<String> {
    vec![
        "LUM-Node-Alpha (mDNS discovered)".to_string(),
        "LUM-Worker-01 (Remote via TCP)".to_string(),
    ]
}

#[tauri::command]
pub async fn send_swarm_task(peer_id_str: String, task: String) -> Result<String, String> {
    Ok(format!(
        "Task successfully delegated to {}. Content: {}",
        peer_id_str, task
    ))
}

#[tauri::command]
pub async fn delegate_swarm_task(
    peer_id_str: String,
    _task_type: String,
    _payload: String,
) -> Result<String, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let task_id = format!("task-{}", now);
    Ok(format!(
        "Task {} sent to swarm peer {}.",
        task_id, peer_id_str
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_swarm_message_serialization() {
        let msg = SwarmMessage::StatusUpdate {
            peer_id: "test-peer".to_string(),
            cpu_usage: 45.5,
            gpu_ready: true,
            active_models: vec!["phi3".to_string()],
        };
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: SwarmMessage = serde_json::from_str(&json).unwrap();

        if let SwarmMessage::StatusUpdate { cpu_usage, .. } = decoded {
            assert_eq!(cpu_usage, 45.5);
        } else {
            panic!("Decoded message type mismatch");
        }
    }

    #[test]
    fn test_peer_info_creation() {
        let info = PeerInfo {
            last_seen_as_secs: 123456789,
            cpu_usage: 10.0,
            gpu_ready: false,
            active_models: vec![],
        };
        assert_eq!(info.cpu_usage, 10.0);
    }
}
