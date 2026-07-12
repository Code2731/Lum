import { describe, expect, it } from "vitest";
import {
  getHistoryGraphFlowSummary,
  parseHistoryGraphClusterLabelData,
  parseHistoryGraphNodeData,
} from "./historyGraphData";

describe("historyGraphData", () => {
  it("parseHistoryGraphNodeData는 유효한 node data를 파싱한다", () => {
    const parsed = parseHistoryGraphNodeData({
      label: "npm test",
      nodeType: "history",
      cluster: 1,
      timestamp: 123,
      clusterColor: "#fff",
    });
    expect(parsed).toEqual({
      label: "npm test",
      nodeType: "history",
      cluster: 1,
      timestamp: 123,
      clusterColor: "#fff",
    });
  });

  it("parseHistoryGraphNodeData는 형식이 틀리면 null", () => {
    expect(parseHistoryGraphNodeData(null)).toBeNull();
    expect(parseHistoryGraphNodeData({})).toBeNull();
    expect(
      parseHistoryGraphNodeData({
        label: "x",
        nodeType: "invalid",
        cluster: 1,
        timestamp: 1,
        clusterColor: "#000",
      }),
    ).toBeNull();
  });

  it("parseHistoryGraphClusterLabelData는 유효한 label data를 파싱한다", () => {
    const parsed = parseHistoryGraphClusterLabelData({
      label: "cluster",
      color: "#0f0",
      count: 4,
    });
    expect(parsed).toEqual({ label: "cluster", color: "#0f0", count: 4 });
  });

  it("parseHistoryGraphClusterLabelData는 형식이 틀리면 null", () => {
    expect(parseHistoryGraphClusterLabelData(null)).toBeNull();
    expect(parseHistoryGraphClusterLabelData({ label: "x", color: "#0f0" })).toBeNull();
    expect(parseHistoryGraphClusterLabelData({ label: "x", color: 1, count: 1 })).toBeNull();
  });

  it("히스토리 그래프가 비어 있으면 수집 대기 흐름을 반환한다", () => {
    expect(getHistoryGraphFlowSummary([], [])).toEqual({
      badges: ["히스토리 비어 있음", "클러스터 없음", "기록 수집 대기"],
      helper: "명령 기록이나 healing 데이터가 쌓이면 여기서 흐름과 군집을 함께 읽을 수 있습니다.",
    });
  });

  it("healing 데이터가 없으면 명령 기록 중심 흐름을 반환한다", () => {
    expect(
      getHistoryGraphFlowSummary(
        [
          {
            label: "npm test",
            nodeType: "history",
            cluster: 1,
            timestamp: 1,
            clusterColor: "#fff",
          },
        ],
        [{ label: "cluster-1", color: "#fff", count: 1 }],
      ),
    ).toEqual({
      badges: ["노드 1개", "클러스터 1개", "명령 기록 중심"],
      helper: "주요 명령 기록을 시간축과 군집 기준으로 보면서 작업 흐름의 반복 패턴을 읽을 수 있습니다.",
    });
  });

  it("healing 데이터가 있으면 승인/거절 흐름을 함께 반환한다", () => {
    expect(
      getHistoryGraphFlowSummary(
        [
          {
            label: "npm test",
            nodeType: "history",
            cluster: 1,
            timestamp: 1,
            clusterColor: "#fff",
          },
          {
            label: "fix 1",
            nodeType: "healing_approve",
            cluster: 1,
            timestamp: 2,
            clusterColor: "#fff",
          },
          {
            label: "fix 2",
            nodeType: "healing_reject",
            cluster: 2,
            timestamp: 3,
            clusterColor: "#0f0",
          },
        ],
        [
          { label: "cluster-1", color: "#fff", count: 2 },
          { label: "cluster-2", color: "#0f0", count: 1 },
        ],
      ),
    ).toEqual({
      badges: ["노드 3개", "클러스터 2개", "치유 1/1"],
      helper: "명령 기록과 healing 승인/거절 패턴을 함께 보면서 반복 흐름과 예외 지점을 찾을 수 있습니다.",
    });
  });
});
