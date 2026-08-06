import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CommandPalette, {
  getCommandPaletteArchiveWorkspaceFlowSummary,
  getCommandPaletteHistoryFlowSummary,
  getCommandPaletteQuickActionsFlowSummary,
  getCommandPaletteRecommendedWorkspaceFlowSummary,
  getCommandPaletteTabsFlowSummary,
} from "./CommandPalette";

vi.mock("@/components/ui/command", () => ({
  CommandDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => <input aria-label="검색" placeholder={placeholder} />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ heading, children }: { heading: string; children: React.ReactNode }) => (
    <section aria-label={heading}>{children}</section>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

function createProps(overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  return {
    tabs: [],
    activeTabId: "tab-1",
    workspaces: [],
    quickActions: [],
    recentHistory: [],
    onSwitchTab: vi.fn(),
    onRestoreWorkspace: vi.fn(),
    onRunAction: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("CommandPalette", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("팔레트 섹션별 흐름 요약을 계산한다", () => {
    expect(getCommandPaletteTabsFlowSummary(1)).toEqual({
      badges: ["탭 1개", "현재 흐름", "즉시 이동"],
      helper: "지금 열려 있는 흐름을 먼저 훑고 바로 전환합니다.",
    });

    expect(getCommandPaletteRecommendedWorkspaceFlowSummary(2)).toEqual({
      badges: ["추천 복귀 2개", "Enter 이어서", "대표 경로"],
      helper: "최근 복귀 흐름과 프로젝트 위치를 한 번에 이어서 찾습니다.",
    });

    expect(getCommandPaletteArchiveWorkspaceFlowSummary()).toEqual({
      badges: ["보관 탐색", "탭 흐름", "저장 시점"],
      helper: "보관된 복귀 흐름을 열기 전에 탭과 저장 시점을 함께 훑어봅니다.",
    });

    expect(getCommandPaletteQuickActionsFlowSummary(1)).toEqual({
      badges: ["빠른 액션 1개", "다음 실행", "반복 작업"],
      helper: "자주 쓰는 명령을 고르고 바로 실행 흐름으로 이어갑니다.",
    });

    expect(getCommandPaletteHistoryFlowSummary(1)).toEqual({
      badges: ["최근 기록 1개", "다음 재실행", "같은 흐름"],
      helper: "방금 썼던 명령 흐름을 골라 같은 맥락으로 다시 시작합니다.",
    });
  });

  it("검색 입력 상단에서 통합 탐색 범위를 안내한다", () => {
    render(<CommandPalette {...createProps()} />);

    expect(screen.getByLabelText("검색")).toHaveAttribute("placeholder", "탭, 워크스페이스, 액션, 히스토리 검색…");
    expect(screen.getByText("탭 전환, 워크스페이스 복귀, 명령 재실행까지 한 번에 이어서 찾습니다.")).toBeInTheDocument();
    expect(screen.getByText("통합 탐색")).toBeInTheDocument();
    expect(screen.getByText("빠른 이동")).toBeInTheDocument();
  });

  it("빈 결과 상태에서도 다시 시도할 검색 범위를 안내한다", () => {
    render(<CommandPalette {...createProps()} />);

    expect(screen.getByText("결과 없음")).toBeInTheDocument();
    expect(screen.getByText("탭 이름, 워크스페이스, 자주 쓰는 명령어로 다시 찾아보세요.")).toBeInTheDocument();
  });

  it("작업공간 항목에 프로젝트 수, 대표 경로, 복원 메타정보를 함께 노출한다", () => {
    window.sessionStorage.setItem(
      "lum.workspaceRecentRestore.v1",
      JSON.stringify({
        "ws-old": { lastRestoredAt: 1000, restoreCount: 3 },
        "ws-recent": { lastRestoredAt: 2000, restoreCount: 1 },
      }),
    );

    render(
      <CommandPalette
        {...createProps({
          workspaces: [
            {
              id: "ws-old",
              name: "이전 작업공간",
              tabs: [{ id: "tab-a", title: "api", cwd: "/tmp/api" }],
              active_tab_id: "tab-a",
              created_at: 10,
            },
            {
              id: "ws-recent",
              name: "최근 작업공간",
              tabs: [{ id: "tab-b", title: "ui", cwd: "/tmp/ui" }],
              active_tab_id: "tab-b",
              created_at: 20,
            },
          ],
        })}
      />,
    );

    const workspaceButtons = screen.getAllByRole("button");
    expect(workspaceButtons[0]).toHaveTextContent("최근 작업공간");
    expect(workspaceButtons[0]).toHaveTextContent("바로 복귀");
    expect(workspaceButtons[0]).toHaveTextContent("최근 복원");
    expect(workspaceButtons[0]).toHaveTextContent("탭 1개 · 프로젝트 1곳 · 복원 1회");
    expect(screen.getAllByText("탭 1개").length).toBeGreaterThan(0);
    expect(screen.getAllByText("프로젝트 1곳").length).toBeGreaterThan(0);
    expect(screen.getAllByText("복원 1회").length).toBeGreaterThan(0);
    expect(workspaceButtons[0]).toHaveTextContent("가장 최근에 다시 연 복귀 흐름");
    expect(workspaceButtons[0]).toHaveTextContent("최근 탭");
    expect(workspaceButtons[0]).toHaveTextContent("먼저 이어갈 탭을 바로 봅니다.");
    expect(workspaceButtons[0]).toHaveTextContent("대표 경로");
    expect(workspaceButtons[0]).toHaveTextContent("프로젝트 위치를 바로 봅니다.");
    expect(workspaceButtons[0]).toHaveTextContent("최근 탭 · ui");
    expect(workspaceButtons[0]).toHaveTextContent("대표 경로 · ui");
    expect(workspaceButtons[0]).toHaveTextContent("복귀 시점");
    expect(workspaceButtons[0]).toHaveTextContent("최근 이어서");
    expect(screen.getByLabelText("추천 복귀")).toBeInTheDocument();
    expect(screen.getByText("최근 우선")).toBeInTheDocument();
    expect(screen.getByText("Enter 복귀")).toBeInTheDocument();
    expect(screen.getByText("추천 복귀 2개")).toBeInTheDocument();
    expect(screen.getByText("Enter 이어서")).toBeInTheDocument();
    expect(screen.getAllByText("대표 경로").length).toBeGreaterThan(0);
    expect(screen.getByText("최근 복귀 흐름과 프로젝트 위치를 한 번에 이어서 찾습니다.")).toBeInTheDocument();
    expect(screen.getByText("자주 복원")).toBeInTheDocument();
  });

  it("탭 섹션은 전환 힌트와 탭 전환 콜백을 함께 제공한다", () => {
    const onSwitchTab = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPalette
        {...createProps({
          tabs: [
            { id: "tab-1", title: "현재 탭", cwd: "/tmp/current" },
            { id: "tab-2", title: "로그 확인", cwd: "/tmp/logs" },
          ],
          activeTabId: "tab-1",
          onSwitchTab,
          onClose,
        })}
      />,
    );

    expect(screen.getByLabelText("탭")).toBeInTheDocument();
    expect(screen.getByText("열려 있는 다른 탭으로 바로 전환해 현재 흐름을 이어갑니다.")).toBeInTheDocument();
    expect(screen.getByText("즉시 전환")).toBeInTheDocument();
    expect(screen.getByText("탭 1개")).toBeInTheDocument();
    expect(screen.getByText("현재 흐름")).toBeInTheDocument();
    expect(screen.getByText("즉시 이동")).toBeInTheDocument();
    expect(screen.getByText("지금 열려 있는 흐름을 먼저 훑고 바로 전환합니다.")).toBeInTheDocument();
    expect(screen.getByText("전환")).toBeInTheDocument();
    expect(screen.getByText("열려 있는 흐름으로 바로 전환합니다.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /로그 확인/ }));

    expect(onSwitchTab).toHaveBeenCalledWith("tab-2");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("추천 복귀와 전체 작업공간 섹션을 분리해 보여준다", () => {
    render(
      <CommandPalette
        {...createProps({
          workspaces: [
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
          ],
        })}
      />,
    );

    expect(screen.getByLabelText("추천 복귀")).toBeInTheDocument();
    expect(screen.getByLabelText("전체 작업공간")).toBeInTheDocument();
    expect(screen.getByText("최근에 다시 연 흐름부터 바로 이어갈 수 있게 정리했습니다.")).toBeInTheDocument();
    expect(screen.getByText("저장해 둔 복귀 지점을 전체 순서로 둘러볼 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("2개 항목")).toBeInTheDocument();
    expect(screen.getByText("1개 항목")).toBeInTheDocument();
    expect(screen.getAllByText("보관 탐색").length).toBeGreaterThan(0);
    expect(screen.getByText("최근 복귀 흐름과 프로젝트 위치를 한 번에 이어서 찾습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("탭 흐름").length).toBeGreaterThan(0);
    expect(screen.getAllByText("저장 시점").length).toBeGreaterThan(0);
    expect(screen.getByText("보관된 복귀 흐름을 열기 전에 탭과 저장 시점을 함께 훑어봅니다.")).toBeInTheDocument();
    expect(screen.getAllByText("바로 복귀").length).toBeGreaterThan(0);
    expect(screen.getAllByText("지금 바로 이어갈 가능성이 높은 복귀 흐름").length).toBeGreaterThan(0);
    expect(screen.getAllByText("탭 1개").length).toBeGreaterThan(0);
    expect(screen.getAllByText("프로젝트 1곳").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /셋째 작업공간/ })).toBeInTheDocument();
    expect(screen.getByText("보관")).toBeInTheDocument();
    expect(screen.getByText("보관 열기")).toBeInTheDocument();
    expect(screen.getByText("보관해 둔 흐름을 다시 꺼내는 작업공간")).toBeInTheDocument();
    expect(screen.getAllByText("탭 1개").length).toBeGreaterThan(0);
    expect(screen.getAllByText("프로젝트 1곳").length).toBeGreaterThan(0);
    expect(screen.getAllByText("저장 시점").length).toBeGreaterThan(0);
    expect(screen.getAllByText("최근 탭").length).toBeGreaterThan(0);
    expect(screen.getByText("다시 꺼낼 탭 흐름을 먼저 봅니다.")).toBeInTheDocument();
    expect(screen.getAllByText("대표 경로").length).toBeGreaterThan(0);
    expect(screen.getByText("저장된 프로젝트 위치를 바로 봅니다.")).toBeInTheDocument();
    expect(screen.getByText(/대표 경로 · ops/)).toBeInTheDocument();
  });

  it("작업공간 선택 시 복원과 닫기 콜백을 호출한다", () => {
    const onRestoreWorkspace = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPalette
        {...createProps({
          workspaces: [
            {
              id: "ws-1",
              name: "복원 테스트",
              tabs: [{ id: "tab-a", title: "api", cwd: "/tmp/api" }],
              active_tab_id: "tab-a",
              created_at: 10,
            },
          ],
          onRestoreWorkspace,
          onClose,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /복원 테스트/ }));

    expect(onRestoreWorkspace).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("빠른 액션과 히스토리 섹션은 행동 힌트와 재실행 콜백을 함께 제공한다", () => {
    const onRunAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPalette
        {...createProps({
          quickActions: [
            { id: "qa-1", label: "개발 서버", command: "npm run dev" },
          ],
          recentHistory: ["git status"],
          onRunAction,
          onClose,
        })}
      />,
    );

    expect(screen.getByLabelText("빠른 액션")).toBeInTheDocument();
    expect(screen.getByText("반복 실행하는 명령을 바로 다시 호출할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("즉시 실행")).toBeInTheDocument();
    expect(screen.getByText("빠른 액션 1개")).toBeInTheDocument();
    expect(screen.getByText("다음 실행")).toBeInTheDocument();
    expect(screen.getByText("반복 작업")).toBeInTheDocument();
    expect(screen.getByText("자주 쓰는 명령을 고르고 바로 실행 흐름으로 이어갑니다.")).toBeInTheDocument();
    expect(screen.getByText("실행")).toBeInTheDocument();
    expect(screen.getByText("저장해 둔 반복 명령을 바로 실행합니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("히스토리")).toBeInTheDocument();
    expect(screen.getByText("최근에 실행한 기록을 골라 같은 흐름을 다시 이어갑니다.")).toBeInTheDocument();
    expect(screen.getByText("최근 재실행")).toBeInTheDocument();
    expect(screen.getByText("최근 기록 1개")).toBeInTheDocument();
    expect(screen.getByText("다음 재실행")).toBeInTheDocument();
    expect(screen.getByText("같은 흐름")).toBeInTheDocument();
    expect(screen.getByText("방금 썼던 명령 흐름을 골라 같은 맥락으로 다시 시작합니다.")).toBeInTheDocument();
    expect(screen.getByText("재실행")).toBeInTheDocument();
    expect(screen.getByText("최근 실행 기록에서 같은 흐름을 다시 시작합니다.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /개발 서버/ }));
    fireEvent.click(screen.getByRole("button", { name: /git status/ }));

    expect(onRunAction).toHaveBeenNthCalledWith(1, "npm run dev");
    expect(onRunAction).toHaveBeenNthCalledWith(2, "git status");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
