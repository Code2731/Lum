import { describe, expect, it } from "vitest";
import {
  getAdvancedRecommendation,
  getAdvancedRecommendationFlowSummary,
} from "./advanced-recommendation";

describe("advanced-recommendation", () => {
  it("추천 사유와 점수를 우선순위대로 계산한다", () => {
    expect(
      getAdvancedRecommendation({
        isNew: true,
        isActive: true,
        isPinnedContext: true,
        isStarter: true,
        hasBadge: true,
      }),
    ).toEqual({
      reason: { label: "새 기능", tone: "amber" },
      score: 320,
    });

    expect(
      getAdvancedRecommendation({
        isNew: false,
        isActive: false,
        isPinnedContext: true,
        isStarter: false,
        hasBadge: false,
      }),
    ).toEqual({
      reason: { label: "복귀", tone: "emerald" },
      score: 220,
    });
  });

  it("새 기능 flow summary를 반환한다", () => {
    expect(
      getAdvancedRecommendationFlowSummary({
        isNew: true,
        isActive: false,
        isPinnedContext: false,
        isStarter: false,
        hasBadge: false,
      }),
    ).toEqual({
      badges: ["새 기능", "먼저 둘러보기", "즉시 진입 가능"],
      helper: "새로 추가된 기능이라 현재 작업 흐름에 맞는지 빠르게 확인해 볼 가치가 있습니다.",
    });
  });

  it("활성/복귀/시작점/기본 상태별 flow summary를 반환한다", () => {
    expect(
      getAdvancedRecommendationFlowSummary({
        isNew: false,
        isActive: true,
        isPinnedContext: false,
        isStarter: false,
        hasBadge: false,
      }),
    ).toEqual({
      badges: ["작업 중", "현재 문맥 유지", "바로 복귀 가능"],
      helper: "지금 열려 있거나 최근 작업과 직접 이어지는 기능이라 전환 비용이 가장 낮습니다.",
    });

    expect(
      getAdvancedRecommendationFlowSummary({
        isNew: false,
        isActive: false,
        isPinnedContext: true,
        isStarter: false,
        hasBadge: false,
      }),
    ).toEqual({
      badges: ["복귀 후보", "이전 문맥 유지", "다시 열기 적합"],
      helper: "이전에 중요하게 다루던 맥락과 연결돼 있어 다시 이어서 보기 좋은 후보입니다.",
    });

    expect(
      getAdvancedRecommendationFlowSummary({
        isNew: false,
        isActive: false,
        isPinnedContext: false,
        isStarter: true,
        hasBadge: false,
      }),
    ).toEqual({
      badges: ["시작점", "기본 흐름 안내", "다음 단계 진입"],
      helper: "처음 들어갈 때 전체 흐름을 잡아 주는 기능이라 시작점으로 두기 좋습니다.",
    });

    expect(
      getAdvancedRecommendationFlowSummary({
        isNew: false,
        isActive: false,
        isPinnedContext: false,
        isStarter: false,
        hasBadge: false,
      }),
    ).toEqual({
      badges: ["추천 없음", "기본 목록", "수동 탐색"],
      helper: "현재는 강조 조건이 없어 전체 목록에서 필요한 기능을 직접 고르는 상태입니다.",
    });
  });
});
