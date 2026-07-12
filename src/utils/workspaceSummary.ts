import type { WorkspaceTab } from "../hooks/useWorkspace";

export interface WorkspaceFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function countWorkspaceProjects(tabs: WorkspaceTab[]) {
  return new Set(
    tabs
      .map((tab) => (tab.cwd ?? "").trim())
      .filter(Boolean),
  ).size;
}

export function getPrimaryWorkspaceCwd(tabs: WorkspaceTab[]) {
  return tabs.find((tab) => (tab.cwd ?? "").trim().length > 0)?.cwd ?? null;
}

export function summarizeWorkspaceTabs(tabs: WorkspaceTab[]) {
  const titles = tabs
    .map((tab) => tab.title.trim())
    .filter(Boolean);
  const preview = titles.slice(0, 2).join(" · ");
  const suffix = titles.length > 2 ? ` +${titles.length - 2}` : "";
  return preview ? `${preview}${suffix}` : "탭 정보 없음";
}

export function getWorkspaceFlowSummary(tabs: WorkspaceTab[]): WorkspaceFlowSummary {
  const projectCount = countWorkspaceProjects(tabs);
  const tabCount = tabs.length;
  const preview = summarizeWorkspaceTabs(tabs);

  if (tabCount === 0) {
    return {
      badges: ["워크스페이스 비어 있음", "탭 없음", "새 흐름 시작"],
      helper: "아직 저장된 탭 구성이 없어 현재 작업 상태를 먼저 묶어 두는 편이 좋습니다.",
    };
  }

  return {
    badges: [
      projectCount > 1 ? `프로젝트 ${projectCount}개` : "단일 프로젝트",
      `탭 ${tabCount}개`,
      preview,
    ],
    helper:
      projectCount > 1
        ? "여러 프로젝트 문맥을 함께 복원하는 워크스페이스라 탭 구성과 순서가 중요합니다."
        : "같은 프로젝트 안에서 이어지는 탭 흐름이라 복원 후 바로 작업을 재개하기 쉽습니다.",
  };
}
