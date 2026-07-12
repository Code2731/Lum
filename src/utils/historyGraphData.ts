export interface HistoryGraphNodeData {
  label: string;
  nodeType: "history" | "healing_approve" | "healing_reject";
  cluster: number;
  timestamp: number;
  clusterColor: string;
}

export interface HistoryGraphClusterLabelData {
  label: string;
  color: string;
  count: number;
}

export interface HistoryGraphFlowSummary {
  badges: [string, string, string];
  helper: string;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNodeType = (
  value: unknown,
): value is HistoryGraphNodeData["nodeType"] =>
  value === "history" || value === "healing_approve" || value === "healing_reject";

export const parseHistoryGraphNodeData = (
  value: unknown,
): HistoryGraphNodeData | null => {
  if (!isObjectRecord(value)) return null;
  const label = value.label;
  const nodeType = value.nodeType;
  const cluster = value.cluster;
  const timestamp = value.timestamp;
  const clusterColor = value.clusterColor;

  if (typeof label !== "string") return null;
  if (!isNodeType(nodeType)) return null;
  if (typeof cluster !== "number") return null;
  if (typeof timestamp !== "number") return null;
  if (typeof clusterColor !== "string") return null;

  return { label, nodeType, cluster, timestamp, clusterColor };
};

export const parseHistoryGraphClusterLabelData = (
  value: unknown,
): HistoryGraphClusterLabelData | null => {
  if (!isObjectRecord(value)) return null;
  const label = value.label;
  const color = value.color;
  const count = value.count;

  if (typeof label !== "string") return null;
  if (typeof color !== "string") return null;
  if (typeof count !== "number") return null;

  return { label, color, count };
};

export const getHistoryGraphFlowSummary = (
  nodes: HistoryGraphNodeData[],
  clusters: HistoryGraphClusterLabelData[],
): HistoryGraphFlowSummary => {
  if (nodes.length === 0) {
    return {
      badges: ["히스토리 비어 있음", "클러스터 없음", "기록 수집 대기"],
      helper: "명령 기록이나 healing 데이터가 쌓이면 여기서 흐름과 군집을 함께 읽을 수 있습니다.",
    };
  }

  const approveCount = nodes.filter((node) => node.nodeType === "healing_approve").length;
  const rejectCount = nodes.filter((node) => node.nodeType === "healing_reject").length;
  const clusterBadge = clusters.length > 0 ? `클러스터 ${clusters.length}개` : "단일 흐름";
  const healingBadge =
    approveCount + rejectCount > 0
      ? `치유 ${approveCount}/${rejectCount}`
      : "명령 기록 중심";

  return {
    badges: [`노드 ${nodes.length}개`, clusterBadge, healingBadge],
    helper:
      approveCount + rejectCount > 0
        ? "명령 기록과 healing 승인/거절 패턴을 함께 보면서 반복 흐름과 예외 지점을 찾을 수 있습니다."
        : "주요 명령 기록을 시간축과 군집 기준으로 보면서 작업 흐름의 반복 패턴을 읽을 수 있습니다.",
  };
};
