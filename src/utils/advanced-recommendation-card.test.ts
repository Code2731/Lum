import { describe, expect, it } from "vitest";
import { getAdvancedRecommendationCardPresentation } from "./advanced-recommendation-card";

describe("advanced-recommendation-card", () => {
  it("첫 추천 카드는 우선 확인용 설명과 helper를 반환한다", () => {
    expect(
      getAdvancedRecommendationCardPresentation(0, "최근 작업과 직접 연결됩니다.", "amber"),
    ).toEqual({
      description: "먼저 확인 · 최근 작업과 직접 연결됩니다.",
      helper: "가장 우선순위가 높은 추천입니다. 최근 작업과 직접 연결됩니다.",
      priorityTone: "cyan",
      className: "border-cyan-300/22 bg-cyan-400/[0.1]",
      surfaceTone: "cyan",
    });
  });

  it("후순위 카드는 설명을 줄이고 tone 규칙을 유지한다", () => {
    expect(
      getAdvancedRecommendationCardPresentation(
        2,
        "설명이 조금 길어서 보조 카드에서는 잘린 형태로 보일 수 있습니다.",
        "amber",
      ),
    ).toEqual({
      description: "설명이 조금 길어서 보조 카드에서는 잘…",
      helper: "다음 후보로 빠르게 살펴볼 수 있습니다. 설명이 조금 길어서 보조 카드에서는 잘린 형태로 보일 수 있습니다.",
      priorityTone: "neutral",
      className: "bg-white/[0.04]",
      surfaceTone: "amber",
    });
  });
});
