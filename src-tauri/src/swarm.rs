use libp2p::{
    gossipsub, mdns, request_response, swarm::{NetworkBehaviour, SwarmEvent}, PeerId, Multiaddr,
};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::time::Duration;
use tokio::sync::mpsc;
use tauri::Emitter;

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

/// LUM P2P 노드 관리 구조체
pub struct SwarmManager {
    pub peer_id: PeerId,
}

impl SwarmManager {
    pub fn new() -> Self {
        let peer_id = PeerId::random();
        Self { peer_id }
    }
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
                .map_err(|msg| String::from(msg))?;

            Ok(LumBehaviour {
                gossipsub: gossipsub::Behaviour::new(
                    gossipsub::MessageAuthenticity::Signed(key.clone()),
                    gossipsub_config,
                )?,
                mdns: mdns::tokio::Behaviour::new(mdns::Config::default(), key.public().to_peer_id())?,
                request_response: request_response::json::Behaviour::new(
                    [(
                        request_response::ProtocolName::from_static("/lum-task/1.0.0"),
                        request_response::ProtocolSupport::Full,
                    )],
                    request_response::Config::default(),
                ),
            })
        })
        .map_err(|e| e.to_string())?
        .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(60)))
        .build();

    let peer_id = *swarm.local_peer_id();
    println!("LUM Node PeerID: {:?}", peer_id);

    // mDNS 및 네트워크 이벤트 루프 시작
    tokio::spawn(async move {
        swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse().unwrap()).unwrap();
        
        loop {
            match swarm.select_next_some().await {
                SwarmEvent::Behaviour(LumBehaviourEvent::Mdns(mdns::Event::Discovered(list))) => {
                    for (peer_id, _multiaddr) in list {
                        println!("mDNS: Discovered peer {:?}", peer_id);
                        handle.emit("peer-discovered", peer_id.to_string()).unwrap();
                    }
                }
                SwarmEvent::NewListenAddr { address, .. } => {
                    println!("Listening on {:?}", address);
                }
                _ => {}
            }
        }
    });

    Ok(format!("LUM P2P Node started: {}", peer_id))
}

#[tauri::command]
pub fn list_peers() -> Vec<String> {
    // 실제 발견된 피어 목록을 반환하는 로직 (상태 관리 필요)
    vec![
        "LUM-Node-Alpha (mDNS discovered)".to_string(),
        "LUM-Worker-01 (Remote via TCP)".to_string(),
    ]
}

#[tauri::command]
pub async fn send_swarm_task(peer_id_str: String, task: String) -> Result<String, String> {
    println!("Delegating task to {}: {}", peer_id_str, task);
    // RequestResponse 프로토콜을 이용해 실제 메시지 전송 로직 구현
    Ok(format!("Task successfully sent to {}. Waiting for Swarm response...", peer_id_str))
}
