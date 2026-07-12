import { describe, expect, it } from "vitest";
import {
  getLatestRestoredWorkspaceId,
  getMostRestoredWorkspaceId,
  getWorkspaceRestoreFlowSummary,
  markWorkspaceRestored,
  sortWorkspacesByRestoreMeta,
  type WorkspaceRestoreMeta,
} from "./workspaceRestoreMeta";

describe("workspaceRestoreMeta", () => {
  it("markWorkspaceRestored는 복원 횟수와 시각을 누적한다", () => {
    const initial: WorkspaceRestoreMeta = {};
    const once = markWorkspaceRestored(initial, "ws-1", 100);
    const twice = markWorkspaceRestored(once, "ws-1", 200);

    expect(once).toEqual({
      "ws-1": { lastRestoredAt: 100, restoreCount: 1 },
    });
    expect(twice).toEqual({
      "ws-1": { lastRestoredAt: 200, restoreCount: 2 },
    });
  });

  it("최근/최다 복원 workspace id를 반환한다", () => {
    const meta: WorkspaceRestoreMeta = {
      a: { lastRestoredAt: 100, restoreCount: 2 },
      b: { lastRestoredAt: 300, restoreCount: 1 },
      c: { lastRestoredAt: 200, restoreCount: 5 },
    };

    expect(getLatestRestoredWorkspaceId(meta)).toBe("b");
    expect(getMostRestoredWorkspaceId(meta)).toBe("c");
  });

  it("restore meta 기준으로 workspace를 정렬한다", () => {
    const meta: WorkspaceRestoreMeta = {
      a: { lastRestoredAt: 100, restoreCount: 2 },
      b: { lastRestoredAt: 300, restoreCount: 1 },
    };
    const workspaces = [
      { id: "a", created_at: 10 },
      { id: "b", created_at: 20 },
      { id: "c", created_at: 30 },
    ];

    expect(sortWorkspacesByRestoreMeta(workspaces as any, meta).map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("복원 기록이 없으면 첫 복원 대기 흐름을 반환한다", () => {
    expect(getWorkspaceRestoreFlowSummary("ws-1", {})).toEqual({
      badges: ["복원 기록 없음", "첫 복원 대기", "현재 상태 저장 가능"],
      helper: "아직 이 워크스페이스를 복원한 기록이 없어 첫 복원 이후부터 개인화된 우선순위가 쌓입니다.",
    });
  });

  it("복원 횟수에 따라 반복/자주 복원 상태를 반환한다", () => {
    expect(
      getWorkspaceRestoreFlowSummary("ws-1", {
        "ws-1": { lastRestoredAt: 100, restoreCount: 2 },
      }),
    ).toEqual({
      badges: ["반복 복원", "복원 2회", "세션 재개 준비"],
      helper: "반복해서 복원한 작업공간이라 다음 진입 때도 빠른 복귀 후보로 보기 좋습니다.",
    });

    expect(
      getWorkspaceRestoreFlowSummary("ws-2", {
        "ws-2": { lastRestoredAt: 100, restoreCount: 6 },
      }),
    ).toEqual({
      badges: ["자주 복원", "복원 6회", "세션 재개 준비"],
      helper: "자주 다시 여는 작업공간이라 최근 문맥 복귀 흐름의 우선순위를 높게 둘 만합니다.",
    });
  });
});
