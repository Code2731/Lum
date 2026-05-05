// Phase 141 — 시맨틱 히스토리 + 치유 그래프 데이터 생성.
// history / healing 임베딩 → 코사인 유사도 → BFS 클러스터 → 원형 배치.
// 프론트가 @xyflow/react로 렌더링.

use crate::commands::healing_dataset;
use crate::commands::history;
use crate::memory::cosine_similarity;
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::f32::consts::PI;

const SIM_THRESHOLD: f32 = 0.55;
const TOP_K_EDGES: usize = 5;
const MAX_NODES: usize = 200;
const CLUSTER_RING_R: f32 = 550.0;

// ─── 공개 직렬화 타입 ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    /// "history" | "healing_approve" | "healing_reject"
    pub node_type: String,
    pub cluster: usize,
    pub timestamp: u64,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Serialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub weight: f32,
}

#[derive(Debug, Serialize)]
pub struct ClusterInfo {
    pub id: usize,
    pub label: String,
    pub count: usize,
    pub cx: f32,
    pub cy: f32,
}

#[derive(Debug, Serialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub clusters: Vec<ClusterInfo>,
}

// ─── 내부 타입 ────────────────────────────────────────────────────────────────

struct RawNode {
    id: String,
    label: String,
    node_type: String,
    timestamp: u64,
    embedding: Vec<f32>,
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

fn truncate_label(s: &str, max: usize) -> String {
    let trimmed = s.trim();
    if trimmed.chars().count() <= max {
        trimmed.to_string()
    } else {
        let t: String = trimmed.chars().take(max).collect();
        format!("{t}…")
    }
}

/// BFS로 연결 컴포넌트(클러스터) 탐색 — 인접 리스트 기반.
pub fn bfs_clusters(adj: &HashMap<usize, Vec<usize>>, n: usize) -> Vec<usize> {
    let mut cluster = vec![usize::MAX; n];
    let mut next_id = 0usize;
    for start in 0..n {
        if cluster[start] != usize::MAX {
            continue;
        }
        let mut q = VecDeque::new();
        q.push_back(start);
        cluster[start] = next_id;
        while let Some(node) = q.pop_front() {
            for &nb in adj.get(&node).map(|v| v.as_slice()).unwrap_or(&[]) {
                if cluster[nb] == usize::MAX {
                    cluster[nb] = next_id;
                    q.push_back(nb);
                }
            }
        }
        next_id += 1;
    }
    cluster
}

/// 클러스터 중심을 큰 원에, 노드를 각 클러스터 내 작은 원에 배치.
pub fn circular_layout(cluster_ids: &[usize], n_clusters: usize) -> Vec<(f32, f32)> {
    let mut cluster_nodes: HashMap<usize, Vec<usize>> = HashMap::new();
    for (i, &cid) in cluster_ids.iter().enumerate() {
        cluster_nodes.entry(cid).or_default().push(i);
    }

    let mut positions = vec![(0.0f32, 0.0f32); cluster_ids.len()];
    let nc = n_clusters.max(1);

    for ci in 0..nc {
        let nodes = match cluster_nodes.get(&ci) {
            Some(v) => v,
            None => continue,
        };
        let cluster_angle = 2.0 * PI * ci as f32 / nc as f32;
        let cx = CLUSTER_RING_R * cluster_angle.cos();
        let cy = CLUSTER_RING_R * cluster_angle.sin();

        let nn = nodes.len();
        let node_r = 60.0 + (nn as f32).sqrt() * 20.0;
        for (ni, &node_idx) in nodes.iter().enumerate() {
            let a = 2.0 * PI * ni as f32 / nn.max(1) as f32;
            positions[node_idx] = (cx + node_r * a.cos(), cy + node_r * a.sin());
        }
    }
    positions
}

/// 클러스터 내 노드들의 레이블에서 빈도 높은 단어를 클러스터 이름으로.
pub fn label_cluster(labels: &[&str]) -> String {
    let stopwords: HashSet<&str> = [
        "the", "a", "an", "is", "in", "on", "at", "to", "for", "of", "and", "or",
        "it", "this", "that", "with", "cd", "ls", "git", "rm",
    ]
    .iter()
    .copied()
    .collect();

    let mut freq: HashMap<String, usize> = HashMap::new();
    for label in labels {
        for word in label.split_whitespace() {
            let w: String = word.chars().filter(|c| c.is_alphabetic()).collect::<String>().to_lowercase();
            if w.len() >= 3 && !stopwords.contains(w.as_str()) {
                *freq.entry(w).or_insert(0) += 1;
            }
        }
    }
    freq.into_iter()
        .max_by_key(|(_, c)| *c)
        .map(|(w, _)| w)
        .unwrap_or_else(|| "기타".to_string())
}

fn cluster_center(node_indices: &[usize], positions: &[(f32, f32)]) -> (f32, f32) {
    if node_indices.is_empty() {
        return (0.0, 0.0);
    }
    let (sx, sy) = node_indices
        .iter()
        .fold((0.0f32, 0.0f32), |(ax, ay), &i| (ax + positions[i].0, ay + positions[i].1));
    (sx / node_indices.len() as f32, sy / node_indices.len() as f32)
}

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

/// 히스토리 + 치유 기록 임베딩을 기반으로 클러스터 그래프 데이터를 반환.
/// 임베딩이 없는 항목은 제외. limit 기본값 200.
#[tauri::command]
pub fn get_history_graph(limit: Option<usize>) -> GraphData {
    let max = limit.unwrap_or(MAX_NODES).min(MAX_NODES);

    // ─ 히스토리 수집 ──────────────────────────────────────────────────────────
    let history_entries = history::search_history_raw();
    let hist_budget = max * 2 / 3;
    let mut raw: Vec<RawNode> = history_entries
        .into_iter()
        .rev() // 최근 우선
        .filter(|e| !e.embedding.is_empty())
        .take(hist_budget)
        .map(|e| RawNode {
            id: format!("h:{}", e.id),
            label: truncate_label(&e.command, 40),
            node_type: "history".into(),
            timestamp: e.timestamp,
            embedding: e.embedding,
        })
        .collect();

    // ─ 치유 기록 수집 ─────────────────────────────────────────────────────────
    let heal_budget = max.saturating_sub(raw.len());
    if let Ok(records) = healing_dataset::list_healing_dataset() {
        for rec in records.into_iter().rev().filter(|r| !r.embedding.is_empty()).take(heal_budget) {
            let node_type = if rec.decision == "approve" {
                "healing_approve"
            } else {
                "healing_reject"
            };
            raw.push(RawNode {
                id: format!("heal:{}", rec.ts_ms),
                label: truncate_label(&rec.suggestion, 40),
                node_type: node_type.into(),
                timestamp: rec.ts_ms / 1000,
                embedding: rec.embedding,
            });
        }
    }

    if raw.is_empty() {
        return GraphData { nodes: vec![], edges: vec![], clusters: vec![] };
    }

    let n = raw.len();

    // ─ 유사도 기반 엣지 + 인접 리스트 ──────────────────────────────────────────
    let mut adj: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut graph_edges: Vec<GraphEdge> = Vec::new();

    for i in 0..n {
        let mut scored: Vec<(usize, f32)> = (0..n)
            .filter(|&j| j != i)
            .map(|j| (j, cosine_similarity(&raw[i].embedding, &raw[j].embedding)))
            .filter(|(_, s)| *s > SIM_THRESHOLD)
            .collect();
        scored.sort_by(|a, b| b.1.total_cmp(&a.1));
        scored.truncate(TOP_K_EDGES);

        for (j, weight) in scored {
            adj.entry(i).or_default().push(j);
            adj.entry(j).or_default().push(i);
            if i < j {
                graph_edges.push(GraphEdge {
                    source: raw[i].id.clone(),
                    target: raw[j].id.clone(),
                    weight,
                });
            }
        }
    }

    // ─ 클러스터링 + 배치 ──────────────────────────────────────────────────────
    let cluster_ids = bfs_clusters(&adj, n);
    let n_clusters = cluster_ids.iter().copied().max().map(|m| m + 1).unwrap_or(1);
    let positions = circular_layout(&cluster_ids, n_clusters);

    let mut cluster_nodes: HashMap<usize, Vec<usize>> = HashMap::new();
    for (i, &cid) in cluster_ids.iter().enumerate() {
        cluster_nodes.entry(cid).or_default().push(i);
    }

    let clusters: Vec<ClusterInfo> = (0..n_clusters)
        .map(|cid| {
            let members = cluster_nodes.get(&cid).map(|v| v.as_slice()).unwrap_or(&[]);
            let labels: Vec<&str> = members.iter().map(|&i| raw[i].label.as_str()).collect();
            let label = label_cluster(&labels);
            let (cx, cy) = cluster_center(members, &positions);
            ClusterInfo { id: cid, label, count: members.len(), cx, cy }
        })
        .collect();

    let nodes: Vec<GraphNode> = raw
        .into_iter()
        .enumerate()
        .map(|(i, rn)| {
            let (x, y) = positions[i];
            GraphNode {
                id: rn.id,
                label: rn.label,
                node_type: rn.node_type,
                cluster: cluster_ids[i],
                timestamp: rn.timestamp,
                x,
                y,
            }
        })
        .collect();

    GraphData { nodes, edges: graph_edges, clusters }
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn adj(pairs: &[(usize, usize)]) -> HashMap<usize, Vec<usize>> {
        let mut m: HashMap<usize, Vec<usize>> = HashMap::new();
        for &(a, b) in pairs {
            m.entry(a).or_default().push(b);
            m.entry(b).or_default().push(a);
        }
        m
    }

    #[test]
    fn bfs_clusters_두_컴포넌트() {
        // 0-1-2 연결, 3-4 연결, 5 고립
        let a = adj(&[(0, 1), (1, 2), (3, 4)]);
        let ids = bfs_clusters(&a, 6);
        // 0,1,2 같은 클러스터
        assert_eq!(ids[0], ids[1]);
        assert_eq!(ids[1], ids[2]);
        // 3,4 같은 클러스터
        assert_eq!(ids[3], ids[4]);
        // 세 그룹은 모두 다름
        assert_ne!(ids[0], ids[3]);
        assert_ne!(ids[0], ids[5]);
        assert_ne!(ids[3], ids[5]);
    }

    #[test]
    fn bfs_clusters_모두_고립() {
        let a = HashMap::new();
        let ids = bfs_clusters(&a, 3);
        assert_ne!(ids[0], ids[1]);
        assert_ne!(ids[1], ids[2]);
    }

    #[test]
    fn circular_layout_노드_수만큼_좌표() {
        let ids = vec![0, 0, 1, 1, 2];
        let pos = circular_layout(&ids, 3);
        assert_eq!(pos.len(), 5);
        for (x, y) in &pos {
            assert!(x.is_finite() && y.is_finite(), "NaN/Inf 없어야: {x} {y}");
        }
    }

    #[test]
    fn circular_layout_클러스터별_분리() {
        // 클러스터 0과 1의 노드들이 충분히 떨어져야
        let ids = vec![0, 0, 1, 1];
        let pos = circular_layout(&ids, 2);
        let c0_center = ((pos[0].0 + pos[1].0) / 2.0, (pos[0].1 + pos[1].1) / 2.0);
        let c1_center = ((pos[2].0 + pos[3].0) / 2.0, (pos[2].1 + pos[3].1) / 2.0);
        let dist = ((c0_center.0 - c1_center.0).powi(2) + (c0_center.1 - c1_center.1).powi(2)).sqrt();
        assert!(dist > 100.0, "클러스터간 거리 부족: {dist}");
    }

    #[test]
    fn label_cluster_빈도_높은_단어() {
        let labels = vec!["cargo test", "cargo build", "npm test", "cargo check"];
        let label = label_cluster(&labels);
        assert_eq!(label, "cargo", "가장 빈도 높은 단어: {label}");
    }

    #[test]
    fn label_cluster_빈_입력() {
        let label = label_cluster(&[]);
        assert_eq!(label, "기타");
    }

    #[test]
    fn get_history_graph_빈_스토어_패닉_없음() {
        // 파일이 없거나 비어있을 때 → 빈 GraphData 반환, 패닉 없음
        let data = get_history_graph(Some(10));
        // 빈 환경에서는 nodes/edges/clusters 모두 비어있거나 파싱된 데이터
        let _ = data; // 구조적으로 유효하기만 하면 OK
    }

    #[test]
    fn truncate_label_길이_제한() {
        let long = "a".repeat(50);
        let out = truncate_label(&long, 40);
        assert!(out.chars().count() <= 42, "줄임말 포함 42자 이내: {}", out.len());
    }
}
