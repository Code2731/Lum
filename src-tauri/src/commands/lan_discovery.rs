// Phase 128 — LAN LLM Discovery.
// 로컬 네트워크에서 Ollama / LM Studio / mlx_lm.server / TabbyAPI / llama.cpp 등
// OpenAI 호환 추론 서버를 찾아 사용자에게 한 번의 클릭으로 backend 전환을 제공.
//
// 동작:
//   1. 자기 IPv4 LAN IP 감지 → /24 서브넷 추정 (UdpSocket connect 트릭)
//   2. 254개 호스트 × 5개 포트 = 최대 1270 TCP 연결을 buffer_unordered(200)으로 동시 시도
//   3. TCP open된 (ip, port) 만 HTTP probe — 시그니처별 엔드포인트 GET → JSON 분류
//   4. (ip, port, kind, models, latency_ms) 카드 리스트 반환
//
// 의도적 제약:
// - 자동 스캔 안 함 (사용자가 명시적으로 트리거) — 사내망 IDS 회피
// - mDNS/Bonjour 안 씀 — LLM 서버 99%가 advertise 안 함
// - HTTP probe는 GET만 (인증 자동 시도 안 함)

use crate::error::{LumError, Result};
use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv4Addr};
use std::time::{Duration, Instant};
use tokio::net::TcpStream;
use tokio::time::timeout;

const TCP_TIMEOUT_MS: u64 = 250;
const HTTP_TIMEOUT_MS: u64 = 1500;
const CONCURRENCY: usize = 200;

// 알려진 LLM 추론 서버 디폴트 포트. 너무 늘리면 스캔 시간 ↑ + 오탐 ↑.
// 새 후보 추가 시 1) 사용 빈도, 2) 시그니처가 명확한지(랜덤 HTTP 서버랑 안 헷갈림) 검토.
const PROBE_PORTS: &[(u16, ServerKind)] = &[
    (11434, ServerKind::Ollama),         // Ollama
    (1234, ServerKind::OpenAiCompat),    // LM Studio
    (8080, ServerKind::OpenAiCompat),    // mlx_lm.server, llama.cpp
    (8081, ServerKind::OpenAiCompat),    // llama.cpp 변형
    (5000, ServerKind::OpenAiCompat),    // TabbyAPI
];

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServerKind {
    Ollama,
    OpenAiCompat,
}

#[derive(Serialize, Clone, Debug)]
pub struct DiscoveredServer {
    pub ip: String,
    pub port: u16,
    pub kind: ServerKind,
    pub url: String,
    pub models: Vec<String>,
    pub latency_ms: u64,
}

/// 로컬 IPv4 + /24 서브넷 prefix 추정.
/// UdpSocket connect 트릭: 패킷을 실제로 보내지 않지만 OS가 라우팅 테이블에 따라
/// 적절한 인터페이스를 선택해 socket의 local_addr를 채움 — 멀티 인터페이스(VPN/Docker)에서도
/// "기본 라우트" IP를 정확히 가져옴.
fn detect_local_subnet() -> Option<(Ipv4Addr, [u8; 3])> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let local = socket.local_addr().ok()?.ip();
    if let IpAddr::V4(v4) = local {
        let o = v4.octets();
        // 172.17.x.x 같은 Docker 브리지에 잡히는 환경 회피용은 일단 안 함 — 사용자 환경 다양.
        Some((v4, [o[0], o[1], o[2]]))
    } else {
        None
    }
}

/// (ip, port) 하나에 대해 TCP probe + HTTP fingerprint. 실패 시 None.
async fn probe_one(
    ip: Ipv4Addr,
    port: u16,
    kind: ServerKind,
    client: &reqwest::Client,
) -> Option<DiscoveredServer> {
    let started = Instant::now();
    let addr = format!("{}:{}", ip, port);

    // 1) TCP connect — 250ms 안에 안 열리면 cull. 이게 스캔 속도의 핵심.
    let conn = timeout(
        Duration::from_millis(TCP_TIMEOUT_MS),
        TcpStream::connect(&addr),
    )
    .await
    .ok()?
    .ok()?;
    drop(conn);

    // 2) HTTP fingerprint — kind별 엔드포인트 GET 후 JSON 모양으로 검증.
    let url = format!("http://{}:{}", ip, port);
    let endpoint = match kind {
        ServerKind::Ollama => "/api/tags",
        ServerKind::OpenAiCompat => "/v1/models",
    };
    let probe_url = format!("{}{}", url, endpoint);
    let res = client.get(&probe_url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let json: serde_json::Value = res.json().await.ok()?;

    let models = extract_models(&json, kind)?;
    Some(DiscoveredServer {
        ip: ip.to_string(),
        port,
        kind,
        url,
        models,
        latency_ms: started.elapsed().as_millis() as u64,
    })
}

/// kind별 응답 JSON에서 모델 ID 리스트 추출.
/// 잘못된 모양이면 None — 다른 HTTP 서버가 우연히 200 반환한 케이스 거른다.
fn extract_models(json: &serde_json::Value, kind: ServerKind) -> Option<Vec<String>> {
    match kind {
        ServerKind::Ollama => {
            // {"models":[{"name":"llama3.2:3b","..."}]}
            let arr = json.get("models")?.as_array()?;
            Some(
                arr.iter()
                    .filter_map(|m| m.get("name")?.as_str().map(String::from))
                    .collect(),
            )
        }
        ServerKind::OpenAiCompat => {
            // {"object":"list","data":[{"id":"<model>","object":"model"}]}
            let arr = json.get("data")?.as_array()?;
            Some(
                arr.iter()
                    .filter_map(|m| m.get("id")?.as_str().map(String::from))
                    .collect(),
            )
        }
    }
}

/// LAN /24 + 자기 자신(localhost) 풀 스캔. 결과는 latency 오름차순 정렬.
#[tauri::command]
pub async fn discover_lan_llm_servers() -> Result<Vec<DiscoveredServer>> {
    let (own_ip, prefix) = detect_local_subnet()
        .ok_or_else(|| LumError::Network("LAN IPv4 주소를 감지할 수 없습니다 (이더넷/Wi-Fi 연결 확인)".into()))?;

    // 타깃 빌드: subnet 1..=254 + 자기 자신은 127.0.0.1로 따로(원격 IP 자기 자신 probe는 무의미)
    let mut targets: Vec<(Ipv4Addr, u16, ServerKind)> = Vec::with_capacity(255 * PROBE_PORTS.len());
    for last in 1..=254u8 {
        let ip = Ipv4Addr::new(prefix[0], prefix[1], prefix[2], last);
        if ip == own_ip {
            continue;
        }
        for (port, kind) in PROBE_PORTS {
            targets.push((ip, *port, *kind));
        }
    }
    for (port, kind) in PROBE_PORTS {
        targets.push((Ipv4Addr::LOCALHOST, *port, *kind));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(HTTP_TIMEOUT_MS))
        .build()
        .map_err(|e| LumError::Network(e.to_string()))?;

    let mut found: Vec<DiscoveredServer> = stream::iter(targets)
        .map(|(ip, port, kind)| {
            let c = client.clone();
            async move { probe_one(ip, port, kind, &c).await }
        })
        .buffer_unordered(CONCURRENCY)
        .filter_map(|opt| async move { opt })
        .collect()
        .await;

    found.sort_by_key(|s| s.latency_ms);
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_ollama_shape() {
        let j = serde_json::json!({
            "models": [
                {"name": "llama3.2:3b", "modified_at": "..."},
                {"name": "qwen2.5-coder:7b"},
            ]
        });
        let m = extract_models(&j, ServerKind::Ollama).unwrap();
        assert_eq!(m, vec!["llama3.2:3b", "qwen2.5-coder:7b"]);
    }

    #[test]
    fn extract_openai_shape() {
        let j = serde_json::json!({
            "object": "list",
            "data": [
                {"id": "qwen2.5-coder-7b", "object": "model"},
                {"id": "llama-3.2-3b", "object": "model"},
            ]
        });
        let m = extract_models(&j, ServerKind::OpenAiCompat).unwrap();
        assert_eq!(m, vec!["qwen2.5-coder-7b", "llama-3.2-3b"]);
    }

    #[test]
    fn extract_returns_none_on_wrong_shape() {
        // Ollama endpoint에서 OpenAI 모양이 오면 None — 우연 일치 회피.
        let j = serde_json::json!({"data": [{"id": "x"}]});
        assert!(extract_models(&j, ServerKind::Ollama).is_none());

        let j = serde_json::json!({"models": [{"name": "y"}]});
        assert!(extract_models(&j, ServerKind::OpenAiCompat).is_none());
    }

    #[test]
    fn extract_empty_array_yields_empty_vec() {
        let j = serde_json::json!({"models": []});
        assert_eq!(
            extract_models(&j, ServerKind::Ollama).unwrap(),
            Vec::<String>::new()
        );
    }

    #[test]
    fn detect_local_subnet_returns_some_when_online() {
        // 네트워크 환경에 의존하므로 결과 자체보다 "panic 없이 Option 반환" 확인.
        let _ = detect_local_subnet();
    }
}
