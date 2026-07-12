import { describe, expect, it } from "vitest";
import { getSquadsMeta, type Squad } from "./useSquads";

describe("useSquads helpers", () => {
  it("로딩 중에는 squad worktree 준비 메타를 반환한다", () => {
    expect(getSquadsMeta([], true)).toEqual({
      title: "Squad 작업공간 불러오는 중",
      badges: ["먼저 분기 목록", "다음 worktree 상태", "마지막 병렬 작업 복귀"],
      helper: "분기된 작업공간과 worktree 목록을 읽어 여러 작업을 병렬로 이어갈 준비를 하고 있습니다.",
    });
  });

  it("활성 squad 수와 기준 브랜치 수를 함께 요약한다", () => {
    const squads: Squad[] = [
      {
        id: "s1",
        task: "release fix",
        worktree_path: "/tmp/s1",
        branch: "lum-squad/s1",
        base_branch: "main",
        repo_root: "/repo",
        created_at: 1,
      },
      {
        id: "s2",
        task: "docs polish",
        worktree_path: "/tmp/s2",
        branch: "lum-squad/s2",
        base_branch: "main",
        repo_root: "/repo",
        created_at: 2,
      },
      {
        id: "s3",
        task: "perf",
        worktree_path: "/tmp/s3",
        branch: "lum-squad/s3",
        base_branch: "develop",
        repo_root: "/repo",
        created_at: 3,
      },
    ];

    expect(getSquadsMeta(squads, false)).toEqual({
      title: "Squad 3개 준비됨",
      badges: ["Squad 3개", "기준 브랜치 2개", "바로 분업 가능"],
      helper: "각 task를 분리된 worktree로 나눠 현재 작업을 끊지 않고 병렬로 진행할 수 있습니다.",
    });
  });

  it("활성 squad가 없으면 새 squad 생성 흐름을 안내한다", () => {
    expect(getSquadsMeta([], false)).toEqual({
      title: "활성 Squad가 없습니다",
      badges: ["Squad 0개", "기준 브랜치 0개", "새 Squad 생성"],
      helper: "복잡한 작업을 분리해야 할 때 Squad를 만들면 별도 worktree에서 동시에 진행할 수 있습니다.",
    });
  });
});
