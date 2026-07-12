// Phase 141 — 시맨틱 히스토리 + 치유 그래프 시각화.
// @xyflow/react 기반 force-layout 그래프.
// 노드 = 명령어/치유제안, 엣지 = 코사인 유사도, 색상 = 클러스터.

import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeProps,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { GitBranch, RefreshCw, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  parseHistoryGraphClusterLabelData,
  parseHistoryGraphNodeData,
} from "../utils/historyGraphData";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  node_type: "history" | "healing_approve" | "healing_reject";
  cluster: number;
  timestamp: number;
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface ClusterInfo {
  id: number;
  label: string;
  count: number;
  cx: number;
  cy: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: ClusterInfo[];
}

interface Props {
  onClose: () => void;
}

export interface HistoryGraphPanelFlowMeta {
  badges: [string, string, string];
  helper: string;
}

export function getHistoryGraphPanelFlowMeta(): HistoryGraphPanelFlowMeta {
  return {
    badges: ["먼저 새로고침", "다음 노드 선택", "마지막 라벨 확인"],
    helper: "그래프를 갱신한 뒤 관심 노드를 눌러 의미 묶음을 확인합니다.",
  };
}

export interface HistoryGraphPanelErrorMeta {
  badges: [string, string, string];
  copyTooltip: string;
}

export function getHistoryGraphPanelErrorMeta(): HistoryGraphPanelErrorMeta {
  return {
    badges: ["오류 확인", "텍스트 복사", "다시 계산"],
    copyTooltip: "오류 텍스트 복사",
  };
}

function copyText(text: string) {
  navigator.clipboard?.writeText?.(text).catch(() => {});
}

// ─── 클러스터 색상 팔레트 ────────────────────────────────────────────────────

const PALETTE = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  "#3b82f6", "#a855f7", "#22c55e", "#eab308", "#f43f5e",
];

const HISTORY_NODE_FONT_SIZE = 11;
const CLUSTER_LABEL_FONT_SIZE = 13;
const CLUSTER_COUNT_FONT_SIZE = 11;
const LEGEND_FONT_SIZE = 11;

function clusterColor(clusterId: number): string {
  return PALETTE[clusterId % PALETTE.length];
}

// ─── 커스텀 노드 컴포넌트 ────────────────────────────────────────────────────

function HistoryNode({ data }: NodeProps) {
  const d = parseHistoryGraphNodeData(data);
  if (!d) return null;
  const base = clusterColor(d.cluster);

  const bg =
    d.nodeType === "healing_approve"
      ? "#166534"
      : d.nodeType === "healing_reject"
      ? "#7f1d1d"
      : base + "22";

  const border =
    d.nodeType === "healing_approve"
      ? "#22c55e"
      : d.nodeType === "healing_reject"
      ? "#ef4444"
      : base;

  const icon =
    d.nodeType === "healing_approve" ? "✓" : d.nodeType === "healing_reject" ? "✗" : "▸";

  return (
    <div
      style={{
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 8,
        padding: "4px 8px",
        maxWidth: 160,
        cursor: "pointer",
        fontSize: HISTORY_NODE_FONT_SIZE,
        color: "#e2e8f0",
        lineHeight: 1.3,
      }}
      title={d.label}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span style={{ color: border, marginRight: 4 }}>{icon}</span>
      {d.label}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

// ─── 클러스터 레이블 노드 ────────────────────────────────────────────────────

function ClusterLabelNode({ data }: NodeProps) {
  const d = parseHistoryGraphClusterLabelData(data);
  if (!d) return null;
  return (
    <div
      style={{
        background: "transparent",
        color: d.color,
        fontSize: CLUSTER_LABEL_FONT_SIZE,
        fontWeight: 600,
        letterSpacing: "0.02em",
        textShadow: "0 1px 4px #000a",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      {d.label}
      <span style={{ opacity: 0.6, fontWeight: 400, fontSize: CLUSTER_COUNT_FONT_SIZE, marginLeft: 4 }}>
        ({d.count})
      </span>
    </div>
  );
}

const NODE_TYPES = { historyNode: HistoryNode, clusterLabel: ClusterLabelNode };

// ─── 메인 패널 ───────────────────────────────────────────────────────────────

export function HistoryGraphPanel({ onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const flowMeta = getHistoryGraphPanelFlowMeta();
  const errorMeta = getHistoryGraphPanelErrorMeta();

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<GraphData>("get_history_graph", { limit: 200 });

      if (data.nodes.length === 0) {
        setError("히스토리/치유 데이터 없음 — 명령어를 실행하거나 치유 제안을 승인/거부하면 그래프가 채워집니다.");
        setLoading(false);
        return;
      }

      // 데이터 노드
      const flowNodes: Node[] = data.nodes.map((n) => ({
        id: n.id,
        position: { x: n.x, y: n.y },
        data: {
          label: n.label,
          nodeType: n.node_type,
          cluster: n.cluster,
          timestamp: n.timestamp,
          clusterColor: clusterColor(n.cluster),
        },
        type: "historyNode",
      }));

      // 클러스터 레이블 노드
      data.clusters.forEach((c) => {
        flowNodes.push({
          id: `cluster-label-${c.id}`,
          position: { x: c.cx - 60, y: c.cy - 100 },
          data: { label: c.label, color: clusterColor(c.id), count: c.count },
          type: "clusterLabel",
          selectable: false,
          draggable: false,
        });
      });

      const flowEdges: Edge[] = data.edges.map((e, i) => ({
        id: `e${i}`,
        source: e.source,
        target: e.target,
        style: {
          stroke: "#94a3b8",
          strokeWidth: Math.max(0.5, e.weight * 2),
          opacity: Math.max(0.1, e.weight - 0.3),
        },
        animated: false,
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden"
        style={{ background: "#0d1117", border: "1px solid #30363d" }}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#30363d]">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <GitBranch size={15} className="text-indigo-400" />
            시맨틱 히스토리 그래프
            {!loading && nodes.length > 0 && (
              <span className="text-xs text-slate-500 font-normal">
                {nodes.filter((n) => !n.id.startsWith("cluster-label")).length}개 노드
              </span>
            )}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200"
              onClick={loadGraph}
              disabled={loading}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              새로고침
            </Button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          <div className="absolute left-4 top-4 z-10 rounded-xl border border-white/8 bg-[#161b22]/90 px-3 py-2 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone="neutral">{flowMeta.badges[0]}</StatusBadge>
              <StatusBadge tone="neutral">{flowMeta.badges[1]}</StatusBadge>
              <StatusBadge tone="neutral">{flowMeta.badges[2]}</StatusBadge>
              <span className="text-[10px] text-white/42">
                {flowMeta.helper}
              </span>
            </div>
          </div>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
              그래프 계산 중…
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-start justify-center pt-10 px-8 text-slate-500 text-sm">
              <div className="max-w-[72%] space-y-2">
                <div className="flex flex-wrap items-center gap-1.5 justify-center">
                  <StatusBadge tone="neutral">{errorMeta.badges[0]}</StatusBadge>
                  <StatusBadge tone="neutral">{errorMeta.badges[1]}</StatusBadge>
                  <StatusBadge tone="neutral">{errorMeta.badges[2]}</StatusBadge>
                </div>
                <div className="flex items-start gap-2">
                  <span className="min-w-0 break-words flex-1">{error}</span>
                  <IconButton
                    tooltip={errorMeta.copyTooltip}
                    onClick={() => copyText(error)}
                    className="p-1 rounded text-white/60 hover:text-white/85 hover:bg-white/10 transition-colors"
                  >
                    <Copy size={11} />
                  </IconButton>
                </div>
              </div>
            </div>
          )}
          {!loading && !error && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={NODE_TYPES}
              onNodeClick={(_, node) => {
                if (!node.id.startsWith("cluster-label")) {
                  const d = parseHistoryGraphNodeData(node.data);
                  if (d) {
                    setSelectedLabel(d.label);
                  }
                }
              }}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.05}
              maxZoom={3}
              style={{ background: "#0d1117" }}
            >
              <Background color="#1e2533" gap={20} />
              <Controls style={{ background: "#161b22", border: "1px solid #30363d" }} />
              <MiniMap
                style={{ background: "#161b22", border: "1px solid #30363d" }}
                nodeColor={(n) => {
                  const d = parseHistoryGraphNodeData(n.data);
                  if (!d) return "#334155";
                  if (d.nodeType === "healing_approve") return "#22c55e";
                  if (d.nodeType === "healing_reject") return "#ef4444";
                  return clusterColor(d.cluster ?? 0);
                }}
              />
              {/* 범례 */}
              <Panel position="top-right">
                <div
                  style={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: LEGEND_FONT_SIZE,
                    color: "#94a3b8",
                    lineHeight: 1.8,
                  }}
                >
                  <div>
                    <span style={{ color: "#6366f1" }}>▸</span> 명령어 히스토리
                  </div>
                  <div>
                    <span style={{ color: "#22c55e" }}>✓</span> 치유 승인
                  </div>
                  <div>
                    <span style={{ color: "#ef4444" }}>✗</span> 치유 거부
                  </div>
                </div>
              </Panel>
            </ReactFlow>
          )}
        </div>

        {/* 노드 클릭 시 전체 레이블 표시 */}
        {selectedLabel && (
          <div className="px-4 py-2 border-t border-[#30363d] text-xs text-slate-300 font-mono">
            <span className="text-slate-500 mr-2">선택:</span>
            {selectedLabel}
            <button
              className="ml-2 text-slate-600 hover:text-slate-300"
              onClick={() => setSelectedLabel(null)}
            >
              ×
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
