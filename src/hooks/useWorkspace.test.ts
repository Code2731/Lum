import { describe, expect, it } from "vitest";
import { getWorkspaceMeta, type Workspace } from "./useWorkspace";

describe("useWorkspace helpers", () => {
  it("로딩 중에는 작업공간 복귀 준비 메타를 반환한다", () => {
    expect(getWorkspaceMeta([], true)).toEqual({
      title: "작업공간 불러오는 중",
      badges: ["먼저 저장된 세션", "다음 탭 구성", "마지막 복귀 흐름"],
      helper: "저장된 작업공간과 탭 구성을 읽어 현재 작업으로 빠르게 복귀할 준비를 하고 있습니다.",
    });
  });

  it("저장된 작업공간 수와 누적 탭 수를 함께 요약한다", () => {
    const workspaces: Workspace[] = [
      {
        id: "w1",
        name: "release",
        tabs: [
          { id: "t1", title: "api", cwd: "/repo/api" },
          { id: "t2", title: "web", cwd: "/repo/web" },
        ],
        active_tab_id: "t1",
        created_at: 1,
      },
      {
        id: "w2",
        name: "ops",
        tabs: [{ id: "t3", title: "logs", cwd: "/repo/logs" }],
        active_tab_id: "t3",
        created_at: 2,
      },
    ];

    expect(getWorkspaceMeta(workspaces, false)).toEqual({
      title: "작업공간 2개 준비됨",
      badges: ["작업공간 2개", "탭 3개", "바로 복귀 가능"],
      helper: "이전에 저장한 탭 구성을 기준으로 같은 작업 문맥에 빠르게 돌아갈 수 있습니다.",
    });
  });

  it("작업공간이 없으면 저장 흐름을 안내한다", () => {
    expect(getWorkspaceMeta([], false)).toEqual({
      title: "저장된 작업공간이 없습니다",
      badges: ["작업공간 0개", "탭 0개", "새 작업공간 저장"],
      helper: "현재 탭 구성을 작업공간으로 저장해두면 다음부터는 같은 문맥으로 빠르게 복귀할 수 있습니다.",
    });
  });
});
