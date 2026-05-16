export type RovingMenuKey = "ArrowRight" | "ArrowLeft" | "Home" | "End";

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
