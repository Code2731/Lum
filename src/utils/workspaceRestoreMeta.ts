import type { Workspace } from "../hooks/useWorkspace";

export const RECENT_RESTORE_STORAGE_KEY = "lum.workspaceRecentRestore.v1";

export type WorkspaceRestoreMetaEntry = {
  lastRestoredAt: number;
  restoreCount: number;
};

export type WorkspaceRestoreMeta = Record<string, WorkspaceRestoreMetaEntry>;

export interface WorkspaceRestoreFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function loadWorkspaceRestoreMeta(): WorkspaceRestoreMeta {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(RECENT_RESTORE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => {
          if (typeof key !== "string") {
            return null;
          }
          if (typeof value === "number" && Number.isFinite(value)) {
            return [key, { lastRestoredAt: value, restoreCount: 1 }] as const;
          }
          if (
            value
            && typeof value === "object"
            && typeof (value as WorkspaceRestoreMetaEntry).lastRestoredAt === "number"
            && Number.isFinite((value as WorkspaceRestoreMetaEntry).lastRestoredAt)
          ) {
            const entry = value as Partial<WorkspaceRestoreMetaEntry>;
            return [
              key,
              {
                lastRestoredAt: entry.lastRestoredAt as number,
                restoreCount:
                  typeof entry.restoreCount === "number" && Number.isFinite(entry.restoreCount)
                    ? Math.max(1, Math.floor(entry.restoreCount))
                    : 1,
              },
            ] as const;
          }
          return null;
        })
        .filter((entry): entry is readonly [string, WorkspaceRestoreMetaEntry] => entry !== null),
    );
  } catch {
    return {};
  }
}

export function persistWorkspaceRestoreMeta(meta: WorkspaceRestoreMeta) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(RECENT_RESTORE_STORAGE_KEY, JSON.stringify(meta));
  } catch {}
}

export function markWorkspaceRestored(
  meta: WorkspaceRestoreMeta,
  workspaceId: string,
  restoredAt = Date.now(),
): WorkspaceRestoreMeta {
  const previous = meta[workspaceId];
  return {
    ...meta,
    [workspaceId]: {
      lastRestoredAt: restoredAt,
      restoreCount: (previous?.restoreCount ?? 0) + 1,
    },
  };
}

export function getLatestRestoredWorkspaceId(meta: WorkspaceRestoreMeta): string | undefined {
  return Object.entries(meta)
    .sort((a, b) => b[1].lastRestoredAt - a[1].lastRestoredAt)[0]?.[0];
}

export function getMostRestoredWorkspaceId(meta: WorkspaceRestoreMeta): string | undefined {
  return Object.entries(meta)
    .sort((a, b) => {
      const countDelta = b[1].restoreCount - a[1].restoreCount;
      if (countDelta !== 0) {
        return countDelta;
      }
      return b[1].lastRestoredAt - a[1].lastRestoredAt;
    })[0]?.[0];
}

export function sortWorkspacesByRestoreMeta(
  workspaces: Workspace[],
  meta: WorkspaceRestoreMeta,
): Workspace[] {
  return [...workspaces].sort((a, b) => {
    const recentDelta = (meta[b.id]?.lastRestoredAt ?? 0) - (meta[a.id]?.lastRestoredAt ?? 0);
    if (recentDelta !== 0) {
      return recentDelta;
    }
    const countDelta = (meta[b.id]?.restoreCount ?? 0) - (meta[a.id]?.restoreCount ?? 0);
    if (countDelta !== 0) {
      return countDelta;
    }
    return b.created_at - a.created_at;
  });
}

export function getWorkspaceRestoreFlowSummary(
  workspaceId: string,
  meta: WorkspaceRestoreMeta,
): WorkspaceRestoreFlowSummary {
  const entry = meta[workspaceId];
  if (!entry) {
    return {
      badges: ["복원 기록 없음", "첫 복원 대기", "현재 상태 저장 가능"],
      helper: "아직 이 워크스페이스를 복원한 기록이 없어 첫 복원 이후부터 개인화된 우선순위가 쌓입니다.",
    };
  }

  const frequentBadge =
    entry.restoreCount >= 5 ? "자주 복원" : entry.restoreCount >= 2 ? "반복 복원" : "최근 1회 복원";

  return {
    badges: [frequentBadge, `복원 ${entry.restoreCount}회`, "세션 재개 준비"],
    helper:
      entry.restoreCount >= 5
        ? "자주 다시 여는 작업공간이라 최근 문맥 복귀 흐름의 우선순위를 높게 둘 만합니다."
        : entry.restoreCount >= 2
          ? "반복해서 복원한 작업공간이라 다음 진입 때도 빠른 복귀 후보로 보기 좋습니다."
          : "한 번 복원한 작업공간이라 이후 복원 패턴이 쌓이면 우선순위를 더 정확히 추천할 수 있습니다.",
  };
}
