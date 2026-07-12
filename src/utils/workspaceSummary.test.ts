import { describe, expect, it } from "vitest";
import {
  countWorkspaceProjects,
  getPrimaryWorkspaceCwd,
  getWorkspaceFlowSummary,
  summarizeWorkspaceTabs,
} from "./workspaceSummary";

describe("workspaceSummary", () => {
  const tabs = [
    { id: "t1", title: "api", cwd: "/repo/app" },
    { id: "t2", title: "worker", cwd: "/repo/app" },
    { id: "t3", title: "admin", cwd: "/repo/admin" },
  ];

  it("프로젝트 수를 cwd 기준으로 계산한다", () => {
    expect(countWorkspaceProjects(tabs as any)).toBe(2);
  });

  it("첫 번째 유효 cwd를 primary cwd로 반환한다", () => {
    expect(getPrimaryWorkspaceCwd(tabs as any)).toBe("/repo/app");
    expect(getPrimaryWorkspaceCwd([{ id: "x", title: "empty", cwd: "   " }] as any)).toBeNull();
  });

  it("탭 제목 요약을 생성한다", () => {
    expect(summarizeWorkspaceTabs(tabs as any)).toBe("api · worker +1");
    expect(summarizeWorkspaceTabs([{ id: "x", title: "   ", cwd: "" }] as any)).toBe("탭 정보 없음");
  });

  it("비어 있는 워크스페이스는 새 흐름 시작 상태를 반환한다", () => {
    expect(getWorkspaceFlowSummary([] as any)).toEqual({
      badges: ["워크스페이스 비어 있음", "탭 없음", "새 흐름 시작"],
      helper: "아직 저장된 탭 구성이 없어 현재 작업 상태를 먼저 묶어 두는 편이 좋습니다.",
    });
  });

  it("단일 프로젝트 워크스페이스는 복원 친화적 흐름을 반환한다", () => {
    expect(
      getWorkspaceFlowSummary([
        { id: "t1", title: "api", cwd: "/repo/app" },
        { id: "t2", title: "worker", cwd: "/repo/app" },
      ] as any),
    ).toEqual({
      badges: ["단일 프로젝트", "탭 2개", "api · worker"],
      helper: "같은 프로젝트 안에서 이어지는 탭 흐름이라 복원 후 바로 작업을 재개하기 쉽습니다.",
    });
  });

  it("다중 프로젝트 워크스페이스는 교차 문맥 복원 상태를 반환한다", () => {
    expect(getWorkspaceFlowSummary(tabs as any)).toEqual({
      badges: ["프로젝트 2개", "탭 3개", "api · worker +1"],
      helper: "여러 프로젝트 문맥을 함께 복원하는 워크스페이스라 탭 구성과 순서가 중요합니다.",
    });
  });
});
