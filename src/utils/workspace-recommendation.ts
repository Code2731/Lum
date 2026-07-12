export interface WorkspaceRecommendationFlags {
  recommended?: boolean;
  latest?: boolean;
  frequent?: boolean;
}

export interface WorkspaceRecommendationFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getWorkspaceRecommendationReason({
  recommended,
  latest,
  frequent,
}: WorkspaceRecommendationFlags) {
  if (latest && frequent) {
    return "추천 후보 · 방금 열었고 반복해서 돌아가는 작업공간";
  }
  if (latest) {
    return "추천 후보 · 가장 최근에 다시 연 작업공간";
  }
  if (frequent) {
    return "추천 후보 · 반복해서 자주 복귀하는 작업공간";
  }
  if (recommended) {
    return "추천 후보 · 지금 다시 열 가능성이 높은 작업공간";
  }
  return null;
}

export function getWorkspaceSectionDescription(section: "recommended" | "all") {
  if (section === "recommended") {
    return "최근에 다시 연 흐름부터 바로 이어갈 수 있게 정리했습니다.";
  }
  return "저장해 둔 복귀 지점을 전체 순서로 둘러볼 수 있습니다.";
}

export function getWorkspaceSectionFlowSummary(
  section: "recommended" | "all",
): WorkspaceRecommendationFlowSummary {
  if (section === "recommended") {
    return {
      badges: ["추천 작업공간", "최근 복귀 우선", "바로 이어서 열기"],
      helper: "최근성과 반복 복귀 패턴을 바탕으로 지금 다시 열 가능성이 높은 작업공간부터 보여줍니다.",
    };
  }

  return {
    badges: ["전체 작업공간", "저장 순서 확인", "복귀 지점 비교"],
    helper: "추천 여부와 관계없이 저장된 모든 작업공간을 둘러보며 필요한 복귀 지점을 선택할 수 있습니다.",
  };
}
