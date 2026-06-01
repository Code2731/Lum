import { describe, expect, it } from "vitest";
import {
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
});
