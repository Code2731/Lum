import type { RecommendationReasonTone } from "@/components/ui/recommendation-reason-badge";

interface AdvancedRecommendationInput {
  isNew: boolean;
  isActive: boolean;
  isPinnedContext: boolean;
  isStarter: boolean;
  hasBadge: boolean;
}

interface AdvancedRecommendationReason {
  label: string;
  tone: RecommendationReasonTone;
}

interface AdvancedRecommendationResult {
  reason: AdvancedRecommendationReason | null;
  score: number;
}

export interface AdvancedRecommendationFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getAdvancedRecommendation({
  isNew,
  isActive,
  isPinnedContext,
  isStarter,
  hasBadge,
}: AdvancedRecommendationInput): AdvancedRecommendationResult {
  if (isNew) {
    return { reason: { label: "새 기능", tone: "amber" }, score: 320 };
  }
  if (isActive) {
    return { reason: { label: "작업 중", tone: "violet" }, score: 260 };
  }
  if (isPinnedContext) {
    return { reason: { label: "복귀", tone: "emerald" }, score: 220 };
  }
  if (isStarter) {
    return { reason: { label: "시작점", tone: "cyan" }, score: 120 };
  }
  if (hasBadge) {
    return { reason: { label: "활성", tone: "neutral" }, score: 160 };
  }
  return { reason: null, score: 0 };
}

export function getAdvancedRecommendationFlowSummary({
  isNew,
  isActive,
  isPinnedContext,
  isStarter,
  hasBadge,
}: AdvancedRecommendationInput): AdvancedRecommendationFlowSummary {
  if (isNew) {
    return {
      badges: ["새 기능", "먼저 둘러보기", "즉시 진입 가능"],
      helper: "새로 추가된 기능이라 현재 작업 흐름에 맞는지 빠르게 확인해 볼 가치가 있습니다.",
    };
  }
  if (isActive) {
    return {
      badges: ["작업 중", "현재 문맥 유지", "바로 복귀 가능"],
      helper: "지금 열려 있거나 최근 작업과 직접 이어지는 기능이라 전환 비용이 가장 낮습니다.",
    };
  }
  if (isPinnedContext) {
    return {
      badges: ["복귀 후보", "이전 문맥 유지", "다시 열기 적합"],
      helper: "이전에 중요하게 다루던 맥락과 연결돼 있어 다시 이어서 보기 좋은 후보입니다.",
    };
  }
  if (isStarter) {
    return {
      badges: ["시작점", "기본 흐름 안내", "다음 단계 진입"],
      helper: "처음 들어갈 때 전체 흐름을 잡아 주는 기능이라 시작점으로 두기 좋습니다.",
    };
  }
  if (hasBadge) {
    return {
      badges: ["활성 상태", "보조 정보 있음", "상세 확인 가능"],
      helper: "배지 정보가 있어 현재 상태를 빠르게 파악한 뒤 세부 화면으로 들어가기 좋습니다.",
    };
  }
  return {
    badges: ["추천 없음", "기본 목록", "수동 탐색"],
    helper: "현재는 강조 조건이 없어 전체 목록에서 필요한 기능을 직접 고르는 상태입니다.",
  };
}
