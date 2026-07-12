import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { focusMainInput } from "@/utils/focus";
import WorkspacePanel, {
  getWorkspaceArchiveFlowSummary,
  getWorkspaceEmptyFlowSummary,
  getWorkspaceRecommendedFlowSummary,
  getWorkspaceSaveFlowSummary,
} from "./WorkspacePanel";

const closeAutoFocusEvent = {
  preventDefault: vi.fn(),
};

vi.mock("@/components/ui/dialog", () => {
  return {
    Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DialogContent: ({
      children,
      onCloseAutoFocus,
    }: {
      children: React.ReactNode;
      onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
    }) => (
      <>
        {children}
        <button type="button" onClick={() => onCloseAutoFocus?.(closeAutoFocusEvent)}>
          워크스페이스 닫기(테스트)
        </button>
      </>
    ),
    DialogTitle: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
  };
});

vi.mock("@/utils/focus", () => ({
  focusMainInput: vi.fn(() => true),
}));

describe("WorkspacePanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    closeAutoFocusEvent.preventDefault.mockClear();
    window.sessionStorage.clear();
  });

  const defaultWorkspaceName = `워크스페이스 ${new Date().toLocaleDateString("ko-KR")}`;

  it("워크스페이스 단계별 흐름 요약을 계산한다", () => {
    expect(getWorkspaceSaveFlowSummary(false, false)).toEqual({
      badges: ["먼저 이름 확인", "다음 저장 준비", "마지막 복귀 연결"],
      helper: "현재 세션 이름을 먼저 정하고 저장하면 다음 복귀 흐름에 탭 묶음과 프로젝트 문맥이 함께 추가됩니다.",
    });

    expect(getWorkspaceSaveFlowSummary(true, false)).toEqual({
      badges: ["추천 이름 확인", "다음 저장 준비", "마지막 복귀 연결"],
      helper: "추천 이름을 빠르게 적용한 뒤 저장하면 다음 복귀 흐름 상단에서 바로 이어갈 수 있습니다.",
    });

    expect(getWorkspaceEmptyFlowSummary()).toEqual({
      badges: ["먼저 저장", "탭 흐름", "다음 복귀"],
      helper: "위에서 현재 세션을 저장해 두면 다음에 탭 묶음과 프로젝트 문맥을 바로 복구할 수 있습니다.",
    });

    expect(getWorkspaceRecommendedFlowSummary(2)).toEqual({
      badges: ["추천 복귀 2개", "탭 흐름", "대표 경로"],
      helper: "최근에 이어갈 흐름과 프로젝트 위치를 함께 정리합니다.",
    });

    expect(getWorkspaceArchiveFlowSummary()).toEqual({
      badges: ["보관 탐색", "탭 흐름", "저장 시점"],
      helper: "보관된 흐름을 다시 열기 전에 탭과 저장 시점을 함께 훑어봅니다.",
    });
  });

  it("닫기 핸들러가 onCloseAutoFocus를 통해 main 입력으로 포커스를 시도한다", async () => {
    const focusMainInputMock = vi.mocked(focusMainInput);
    render(
      <>
        <input type="text" data-lum-main-input="true" aria-label="메인 입력" />
        <WorkspacePanel
          currentTabs={[]}
          activeTabId="tab-1"
          workspaces={[]}
          loading={false}
          onSave={vi.fn()}
          onRestore={vi.fn()}
          onDelete={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "워크스페이스 닫기(테스트)" }));

    expect(closeAutoFocusEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(focusMainInputMock).toHaveBeenCalledTimes(1);
  });

  it("빈 상태에서는 저장 안내 문구를 노출한다", () => {
    render(
      <WorkspacePanel
        currentTabs={[{ id: "tab-1", title: "main", cwd: "/Users/namhyunjun/MyProject/Lum" }]}
        activeTabId="tab-1"
        workspaces={[]}
        loading={false}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("현재 탭 1개와 프로젝트 1곳을 복귀 지점으로 저장합니다.")).toBeInTheDocument();
    expect(screen.getByText("1개 탭 준비")).toBeInTheDocument();
    expect(screen.getByText("빠른 복귀")).toBeInTheDocument();
    expect(screen.getByText("먼저 이름 확인")).toBeInTheDocument();
    expect(screen.getByText("다음 저장 준비")).toBeInTheDocument();
    expect(screen.getByText("마지막 복귀 연결")).toBeInTheDocument();
    expect(screen.getByText("결제 버그 조사, QA 재현, 릴리스 점검처럼 다시 찾을 이름으로 저장해 두세요.")).toBeInTheDocument();
    expect(screen.getByText("빠른 이름 제안")).toBeInTheDocument();
    expect(screen.getByText("클릭 즉시 입력")).toBeInTheDocument();
    expect(screen.getByText("결제 버그 조사")).toBeInTheDocument();
    expect(screen.getByText("QA 재현")).toBeInTheDocument();
    expect(screen.getByText("릴리스 점검")).toBeInTheDocument();
    expect(screen.getByText("자동 이름")).toBeInTheDocument();
    expect(screen.getByText("현재 입력")).toBeInTheDocument();
    expect(screen.getByText("자동 저장")).toBeInTheDocument();
    expect(screen.getByText("다음 복귀")).toBeInTheDocument();
    expect(screen.getByText(`${defaultWorkspaceName} 이름으로 저장됩니다.`)).toBeInTheDocument();
    expect(screen.getByText("비워 두면 오늘 날짜 기준 기본 이름으로 빠르게 저장됩니다.")).toBeInTheDocument();
    expect(screen.getByText("저장 후 추천 복귀 상단에서 이 이름으로 바로 이어집니다.")).toBeInTheDocument();
    expect(screen.getByText("빈칸이면 오늘 날짜로 저장")).toBeInTheDocument();
    expect(screen.getAllByText("Enter").length).toBeGreaterThan(0);
    expect(screen.getByText("Enter 저장")).toBeInTheDocument();
    expect(screen.getByText("지금 저장")).toBeInTheDocument();
    expect(screen.getByText("현재 세션을 다음 복귀 흐름에 바로 추가합니다.")).toBeInTheDocument();
    expect(screen.getByText("탭 1개 · 프로젝트 1곳이 함께 저장됩니다.")).toBeInTheDocument();
    expect(screen.getByText("먼저 저장")).toBeInTheDocument();
    expect(screen.getByText("다음 복귀")).toBeInTheDocument();
    expect(screen.getByText("위에서 현재 세션을 저장해 두면 다음에 탭 묶음과 프로젝트 문맥을 바로 복구할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("저장된 워크스페이스가 없습니다")).toBeInTheDocument();
  });

  it("빠른 이름 제안을 누르면 선택 상태를 표시한다", () => {
    render(
      <WorkspacePanel
        currentTabs={[{ id: "tab-1", title: "main", cwd: "/Users/namhyunjun/MyProject/Lum" }]}
        activeTabId="tab-1"
        workspaces={[]}
        loading={false}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "QA 재현" }));

    expect(screen.getByText("선택됨")).toBeInTheDocument();
    expect(screen.getByText("추천 적용 중")).toBeInTheDocument();
    expect(screen.getByText("추천 적용")).toBeInTheDocument();
    expect(screen.getByText("저장 이름")).toBeInTheDocument();
    expect(screen.getByText("추천 복귀")).toBeInTheDocument();
    expect(screen.getByText("현재 입력 · QA 재현")).toBeInTheDocument();
    expect(screen.getByText("날짜 붙이기로 같은 흐름의 새 세션 버전을 바로 만듭니다.")).toBeInTheDocument();
    expect(screen.getByText("저장 후 추천 복귀 상단에서 이 이름으로 바로 이어집니다.")).toBeInTheDocument();
    expect(screen.getByText("추천 이름")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지우기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "날짜 붙이기" })).toBeInTheDocument();
    expect(screen.getByText("현재 선택 · QA 재현")).toBeInTheDocument();
    expect(screen.getByText("QA 재현 이름으로 복귀 지점을 만듭니다.")).toBeInTheDocument();
  });

  it("입력 지우기를 누르면 자동 이름 안내로 돌아간다", () => {
    render(
      <WorkspacePanel
        currentTabs={[{ id: "tab-1", title: "main", cwd: "/Users/namhyunjun/MyProject/Lum" }]}
        activeTabId="tab-1"
        workspaces={[]}
        loading={false}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "QA 재현" }));
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));

    expect(screen.getByText("자동 이름")).toBeInTheDocument();
    expect(screen.getByText(`${defaultWorkspaceName} 이름으로 저장됩니다.`)).toBeInTheDocument();
    expect(screen.queryByText("추천 이름")).not.toBeInTheDocument();
    expect(screen.queryByText("현재 선택 · QA 재현")).not.toBeInTheDocument();
  });

  it("날짜 붙이기를 누르면 추천 이름을 바탕으로 직접 입력 상태로 전환한다", () => {
    render(
      <WorkspacePanel
        currentTabs={[{ id: "tab-1", title: "main", cwd: "/Users/namhyunjun/MyProject/Lum" }]}
        activeTabId="tab-1"
        workspaces={[]}
        loading={false}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "QA 재현" }));
    fireEvent.click(screen.getByRole("button", { name: "날짜 붙이기" }));

    expect(screen.getByText("저장 이름")).toBeInTheDocument();
    expect(screen.getByText("직접 입력")).toBeInTheDocument();
    expect(screen.getByText("직접 저장")).toBeInTheDocument();
    expect(screen.queryByText("추천 이름")).not.toBeInTheDocument();
    expect(screen.queryByText("현재 선택 · QA 재현")).not.toBeInTheDocument();
  });

  it("직접 이름을 입력하면 저장 버튼도 해당 이름 기준으로 안내한다", () => {
    render(
      <WorkspacePanel
        currentTabs={[{ id: "tab-1", title: "main", cwd: "/Users/namhyunjun/MyProject/Lum" }]}
        activeTabId="tab-1"
        workspaces={[]}
        loading={false}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("예: 결제 버그 조사 · QA 재현 · 릴리스 점검"),
      { target: { value: "배포 전 점검" } },
    );

    expect(screen.getAllByText("직접 입력").length).toBeGreaterThan(0);
    expect(screen.getByText("현재 입력 · 배포 전 점검")).toBeInTheDocument();
    expect(screen.getByText("직접 저장")).toBeInTheDocument();
    expect(screen.getByText("직접 입력한 이름으로 저장하면 추천 복귀에서 바로 다시 이어갈 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("저장 후 추천 복귀 상단에서 이 이름으로 바로 이어집니다.")).toBeInTheDocument();
    expect(screen.getByText("배포 전 점검 이름으로 복귀 지점을 만듭니다.")).toBeInTheDocument();
  });

  it("최근 복원된 워크스페이스를 우선 노출하고 배지를 표시한다", () => {
    window.sessionStorage.setItem(
      "lum.workspaceRecentRestore.v1",
      JSON.stringify({
        ws-older: { lastRestoredAt: 1000, restoreCount: 3 },
        ws-recent: { lastRestoredAt: 2000, restoreCount: 1 },
      }),
    );

    render(
      <WorkspacePanel
        currentTabs={[]}
        activeTabId="tab-1"
        workspaces={[
          {
            id: "ws-older",
            name: "이전 작업공간",
            tabs: [{ id: "tab-a", title: "api", cwd: "/tmp/api" }],
            active_tab_id: "tab-a",
            created_at: 10,
          },
          {
            id: "ws-recent",
            name: "최근 복원 작업공간",
            tabs: [{ id: "tab-b", title: "ui", cwd: "/tmp/ui" }],
            active_tab_id: "tab-b",
            created_at: 20,
          },
        ]}
        loading={false}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const workspaceTitles = screen.getAllByText(/작업공간/).map((node) => node.textContent);
    expect(workspaceTitles[0]).toBe("최근 복원 작업공간");
    expect(screen.getByText("추천 복귀")).toBeInTheDocument();
    expect(screen.getByText("최근 복원")).toBeInTheDocument();
    expect(screen.getByText("자주 복원")).toBeInTheDocument();
    expect(screen.getByText("최근 우선")).toBeInTheDocument();
    expect(screen.getByText("탭 흐름")).toBeInTheDocument();
    expect(screen.getByText("대표 경로")).toBeInTheDocument();
    expect(screen.getByText("최근에 이어갈 흐름과 프로젝트 위치를 함께 정리합니다.")).toBeInTheDocument();
    expect(screen.getByText("추천 복귀 2개")).toBeInTheDocument();
    expect(screen.getByText("최근 이어서")).toBeInTheDocument();
    expect(screen.getAllByText("탭 1개").length).toBeGreaterThan(0);
    expect(screen.getAllByText("프로젝트 1곳").length).toBeGreaterThan(0);
    expect(screen.getByText("추천 후보 · 가장 최근에 다시 연 작업공간")).toBeInTheDocument();
    expect(screen.getByText("최근 탭")).toBeInTheDocument();
    expect(screen.getByText("먼저 이어갈 탭을 바로 봅니다.")).toBeInTheDocument();
    expect(screen.getByText("대표 경로")).toBeInTheDocument();
    expect(screen.getByText("프로젝트 위치를 바로 봅니다.")).toBeInTheDocument();
    expect(screen.getByText(/최근 탭 · ui/)).toBeInTheDocument();
    expect(screen.getByText(/대표 경로 · \/tmp\/ui/)).toBeInTheDocument();
    expect(screen.getByText("복귀 시점")).toBeInTheDocument();
    expect(screen.getByText(/복원 3회/)).toBeInTheDocument();
  });

  it("추천 복귀 섹션과 전체 작업공간 목록을 분리해 보여준다", () => {
    render(
      <WorkspacePanel
        currentTabs={[]}
        activeTabId="tab-1"
        workspaces={[
          {
            id: "ws-1",
            name: "첫 작업공간",
            tabs: [{ id: "tab-a", title: "api", cwd: "/tmp/api" }],
            active_tab_id: "tab-a",
            created_at: 30,
          },
          {
            id: "ws-2",
            name: "둘째 작업공간",
            tabs: [{ id: "tab-b", title: "ui", cwd: "/tmp/ui" }],
            active_tab_id: "tab-b",
            created_at: 20,
          },
          {
            id: "ws-3",
            name: "셋째 작업공간",
            tabs: [{ id: "tab-c", title: "ops", cwd: "/tmp/ops" }],
            active_tab_id: "tab-c",
            created_at: 10,
          },
        ]}
        loading={false}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("추천 복귀")).toBeInTheDocument();
    expect(screen.getByText("전체 작업공간")).toBeInTheDocument();
    expect(screen.getByText("최근에 다시 연 흐름부터 바로 이어갈 수 있게 정리했습니다.")).toBeInTheDocument();
    expect(screen.getByText("저장해 둔 복귀 지점을 전체 순서로 둘러볼 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("2개 항목")).toBeInTheDocument();
    expect(screen.getByText("1개 항목")).toBeInTheDocument();
    expect(screen.getByText("보관 탐색")).toBeInTheDocument();
    expect(screen.getByText("최근에 이어갈 흐름과 프로젝트 위치를 함께 정리합니다.")).toBeInTheDocument();
    expect(screen.getByText("탭 흐름")).toBeInTheDocument();
    expect(screen.getByText("저장 시점")).toBeInTheDocument();
    expect(screen.getByText("보관된 흐름을 다시 열기 전에 탭과 저장 시점을 함께 훑어봅니다.")).toBeInTheDocument();
    expect(screen.getByText("추천 후보 · 지금 다시 열 가능성이 높은 작업공간")).toBeInTheDocument();
    expect(screen.getByText("바로 복귀")).toBeInTheDocument();
    expect(screen.getAllByText("탭 1개").length).toBeGreaterThan(0);
    expect(screen.getAllByText("프로젝트 1곳").length).toBeGreaterThan(0);
    expect(screen.getAllByText("최근 탭").length).toBeGreaterThan(0);
    expect(screen.getAllByText("대표 경로").length).toBeGreaterThan(0);
    expect(screen.getByText("셋째 작업공간")).toBeInTheDocument();
    expect(screen.getByText("보관")).toBeInTheDocument();
    expect(screen.getByText("보관 열기")).toBeInTheDocument();
    expect(screen.getByText("보관해 둔 흐름을 다시 꺼내는 작업공간")).toBeInTheDocument();
    expect(screen.getByText("저장 시점")).toBeInTheDocument();
    expect(screen.getByText("마지막 복원")).toBeInTheDocument();
    expect(screen.getByText("다시 꺼낼 탭 흐름을 먼저 봅니다.")).toBeInTheDocument();
    expect(screen.getByText("저장된 프로젝트 위치를 바로 봅니다.")).toBeInTheDocument();
    expect(screen.getByText(/최근 탭 · api/)).toBeInTheDocument();
  });
});
