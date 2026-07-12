import type { RecommendationReasonTone } from "@/components/ui/recommendation-reason-badge";

export interface AdvancedRecommendationCardPresentation {
  description: string;
  helper: string;
  priorityTone: "neutral" | "cyan";
  className: string;
  surfaceTone: "neutral" | "cyan" | "amber";
}

function shortenSecondaryDescription(description: string) {
  if (description.length <= 26) {
    return description;
  }
  return `${description.slice(0, 26).trimEnd()}…`;
}

function buildAdvancedRecommendationDescription(index: number, description: string) {
  if (index === 0) {
    return `먼저 확인 · ${description}`;
  }
  return shortenSecondaryDescription(description);
}

function buildAdvancedRecommendationHelper(index: number, description: string) {
  if (index === 0) {
    return `가장 우선순위가 높은 추천입니다. ${description}`;
  }
  return `다음 후보로 빠르게 살펴볼 수 있습니다. ${description}`;
}

export function getAdvancedRecommendationCardPresentation(
  index: number,
  description: string,
  reasonTone?: RecommendationReasonTone,
): AdvancedRecommendationCardPresentation {
  const isPrimaryRecommendation = index === 0;

  return {
    description: buildAdvancedRecommendationDescription(index, description),
    helper: buildAdvancedRecommendationHelper(index, description),
    priorityTone: isPrimaryRecommendation ? "cyan" : "neutral",
    className: isPrimaryRecommendation ? "border-cyan-300/22 bg-cyan-400/[0.1]" : "bg-white/[0.04]",
    surfaceTone: isPrimaryRecommendation ? "cyan" : reasonTone === "amber" ? "amber" : "neutral",
  };
}
