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
