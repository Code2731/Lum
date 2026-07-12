import { describe, expect, it } from "vitest";
import {
  getWorkspaceRecommendationReason,
  getWorkspaceSectionDescription,
  getWorkspaceSectionFlowSummary,
} from "./workspace-recommendation";

describe("workspace-recommendation", () => {
  it("추천 사유를 우선순위에 맞게 반환한다", () => {
    expect(getWorkspaceRecommendationReason({ latest: true, frequent: true })).toBe(
      "추천 후보 · 방금 열었고 반복해서 돌아가는 작업공간",
    );
    expect(getWorkspaceRecommendationReason({ latest: true })).toBe(
      "추천 후보 · 가장 최근에 다시 연 작업공간",
    );
    expect(getWorkspaceRecommendationReason({ frequent: true })).toBe(
      "추천 후보 · 반복해서 자주 복귀하는 작업공간",
    );
    expect(getWorkspaceRecommendationReason({ recommended: true })).toBe(
      "추천 후보 · 지금 다시 열 가능성이 높은 작업공간",
    );
    expect(getWorkspaceRecommendationReason({})).toBeNull();
  });

  it("섹션 설명을 반환한다", () => {
    expect(getWorkspaceSectionDescription("recommended")).toBe(
      "최근에 다시 연 흐름부터 바로 이어갈 수 있게 정리했습니다.",
    );
    expect(getWorkspaceSectionDescription("all")).toBe(
      "저장해 둔 복귀 지점을 전체 순서로 둘러볼 수 있습니다.",
    );
  });

  it("추천 섹션 흐름 요약을 반환한다", () => {
    expect(getWorkspaceSectionFlowSummary("recommended")).toEqual({
      badges: ["추천 작업공간", "최근 복귀 우선", "바로 이어서 열기"],
      helper: "최근성과 반복 복귀 패턴을 바탕으로 지금 다시 열 가능성이 높은 작업공간부터 보여줍니다.",
    });
  });

  it("전체 섹션 흐름 요약을 반환한다", () => {
    expect(getWorkspaceSectionFlowSummary("all")).toEqual({
      badges: ["전체 작업공간", "저장 순서 확인", "복귀 지점 비교"],
      helper: "추천 여부와 관계없이 저장된 모든 작업공간을 둘러보며 필요한 복귀 지점을 선택할 수 있습니다.",
    });
  });
});
