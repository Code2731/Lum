export type RovingMenuKey = "ArrowRight" | "ArrowLeft" | "Home" | "End";
export type RovingMenuInputKey =
  | "ArrowRight"
  | "ArrowLeft"
  | "ArrowDown"
  | "ArrowUp"
  | "Home"
  | "End"
  | "Tab";

export interface RovingMenuFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function isRovingMenuInputKey(key: string): key is RovingMenuInputKey {
  return [
    "ArrowRight",
    "ArrowLeft",
    "ArrowDown",
    "ArrowUp",
    "Home",
    "End",
    "Tab",
  ].includes(key);
}

export function normalizeRovingMenuNavKey(
  key: RovingMenuInputKey,
  isShift: boolean,
): RovingMenuKey {
  if (key === "ArrowDown") {
    return "ArrowRight";
  }
  if (key === "ArrowUp") {
    return "ArrowLeft";
  }
  if (key === "Tab") {
    return isShift ? "ArrowLeft" : "ArrowRight";
  }
  return key;
}

export function getRovingMenuNextIndex(
  key: RovingMenuKey,
  count: number,
  currentIndex: number,
): number {
  if (count <= 0) return -1;
  const safeIndex = currentIndex >= 0 && currentIndex < count ? currentIndex : 0;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (safeIndex + 1) % count;
  return (safeIndex - 1 + count) % count;
}

export function getRovingMenuFlowSummary(key: RovingMenuInputKey): RovingMenuFlowSummary {
  const normalized = normalizeRovingMenuNavKey(key, false);

  if (key === "Tab") {
    return {
      badges: ["Tab 이동", "다음 항목 순회", "포커스 유지"],
      helper: "Tab 계열 입력도 같은 roving 흐름으로 처리해 메뉴 안에서 포커스를 안정적으로 순환시킵니다.",
    };
  }

  if (normalized === "Home" || normalized === "End") {
    return {
      badges: [normalized === "Home" ? "처음 이동" : "끝 이동", "경계 점프", "빠른 탐색"],
      helper: "Home/End는 메뉴 양 끝으로 즉시 이동해 긴 액션 목록을 빠르게 훑을 때 유용합니다.",
    };
  }

  return {
    badges: ["방향 이동", normalized === "ArrowRight" ? "다음 항목" : "이전 항목", "순환 탐색"],
    helper: "화살표 입력을 같은 roving 규칙으로 정규화해 현재 메뉴 안에서 끊김 없이 이동할 수 있게 합니다.",
  };
}
