export type RovingMenuKey = "ArrowRight" | "ArrowLeft" | "Home" | "End";
export type RovingMenuInputKey =
  | "ArrowRight"
  | "ArrowLeft"
  | "ArrowDown"
  | "ArrowUp"
  | "Home"
  | "End"
  | "Tab";

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
