import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === "check_onboarding_complete") return Promise.resolve(true);
    if (cmd === "check_xllm_status") return Promise.resolve(false);
    if (cmd === "load_session") return Promise.reject("no session");
    if (cmd === "get_recent_history") return Promise.resolve([]);
    if (cmd === "search_history") return Promise.resolve([]);
    if (cmd === "get_hardware_specs") return Promise.resolve({
      total_memory_gb: 16,
      available_memory_gb: 8,
      cpu_cores: 8,
      gpu_type: "discrete",
      gpu_name: "RTX 3080",
      wgpu_supported: true,
      recommended_engine: "xllm",
      recommended_model: "Qwen2.5-Coder-7B",
      recommendation_reason: "충분한 VRAM",
    });
    return Promise.resolve("{}");
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    startDragging: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(() => {}),
  }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./components/FileExplorerPanel", () => ({
  default: () => <div data-testid="file-explorer-mock" />,
}));

vi.mock("./components/TerminalPane", () => ({
  default: ({ id }: { id: string }) => (
    <div data-testid={`terminal-pane-${id}`}>terminal:{id}</div>
  ),
}));

describe("App (LUM 터미널)", () => {
  beforeEach(() => {
    invoke.mockClear();
  });

  it("Phase 66 이후 헤더에 LUM 텍스트 로고 제거됨 — 아이콘만 사용", () => {
    render(<App />);
    // headline에 "LUM" 텍스트가 있어선 안 됨 (툴팁·aria-label은 허용)
    const matches = screen.queryAllByText("LUM");
    expect(matches.length).toBe(0);
  });

  it("기본 뷰가 터미널이어야 함 — TerminalPane이 최소 1개 렌더링됨", () => {
    render(<App />);
    const panes = screen.getAllByTestId(/^terminal-pane-/);
    expect(panes.length).toBeGreaterThan(0);
  });

  it("새 탭 버튼이 툴바에 있어야 함", () => {
    render(<App />);
    expect(screen.getByLabelText("새 탭 (Cmd/Ctrl+T)")).toBeInTheDocument();
  });

  it("SSH 연결 버튼이 툴바에 있어야 함", () => {
    render(<App />);
    expect(screen.getByLabelText("SSH 연결 (Cmd/Ctrl+Shift+H)")).toBeInTheDocument();
  });

  it("AI 바 도움말은 실제 닫기 단축키(Esc, Cmd/Ctrl+Shift+K)를 표시한다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)")).toBeInTheDocument();
    expect(screen.getByText("Esc 또는 Cmd/Ctrl+Shift+K 로 닫기")).toBeInTheDocument();
  });

  it("Shift 조합에서 key가 대문자여도 AI 바 단축키가 동작한다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "K", ctrlKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)")).toBeInTheDocument();
  });

  it("Ctrl+Alt+Shift+K는 AI 바 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "K", ctrlKey: true, altKey: true, shiftKey: true });
    expect(screen.queryByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)")).not.toBeInTheDocument();
  });

  it("Ctrl+R은 히스토리 검색을 연다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    expect(await screen.findByPlaceholderText(/자연어로 검색/)).toBeInTheDocument();
  });

  it("Ctrl+K는 커맨드 팔레트를 연다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByPlaceholderText(/탭, 워크스페이스, 액션, 히스토리 검색/)).toBeInTheDocument();
  });

  it("Ctrl+Alt+K는 커맨드 팔레트 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true, altKey: true });
    expect(screen.queryByPlaceholderText(/탭, 워크스페이스, 액션, 히스토리 검색/)).not.toBeInTheDocument();
  });

  it("Ctrl+B는 파일 탐색기 토글을 실행한다", async () => {
    render(<App />);
    const initiallyVisible = screen.queryByTestId("file-explorer-mock") !== null;

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    await waitFor(() => {
      if (initiallyVisible) {
        expect(screen.queryByTestId("file-explorer-mock")).not.toBeInTheDocument();
      } else {
        expect(screen.getByTestId("file-explorer-mock")).toBeInTheDocument();
      }
    });
    expect(invoke).toHaveBeenCalledWith("save_ui_preferences", {
      showFileExplorer: !initiallyVisible,
    });
  });

  it("Ctrl+Alt+B는 파일 탐색기 단축키로 처리되지 않는다", () => {
    render(<App />);
    const beforeVisible = screen.queryByTestId("file-explorer-mock") !== null;

    fireEvent.keyDown(window, { key: "b", ctrlKey: true, altKey: true });

    const afterVisible = screen.queryByTestId("file-explorer-mock") !== null;
    expect(afterVisible).toBe(beforeVisible);
  });

  it("Quick Action 단축키는 Ctrl+숫자만 소비하고 Ctrl+Alt+숫자는 소비하지 않는다", async () => {
    const baseImpl = invoke.getMockImplementation();
    if (!baseImpl) throw new Error("invoke mock implementation not found");
    invoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          quick_actions: [{ id: "qa-1", label: "List", command: "ls", shortcut: 1 }],
        });
      }
      return baseImpl(cmd, ...args);
    });

    try {
      render(<App />);
      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("load_app_config");
      });

      await waitFor(() => {
        const consumed = !window.dispatchEvent(new KeyboardEvent("keydown", {
          key: "1",
          ctrlKey: true,
          cancelable: true,
        }));
        expect(consumed).toBe(true);
      });

      const consumedWithAlt = !window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "1",
        ctrlKey: true,
        altKey: true,
        cancelable: true,
      }));
      expect(consumedWithAlt).toBe(false);
    } finally {
      invoke.mockImplementation(baseImpl);
    }
  });

  it("Ctrl+Alt+R은 히스토리 검색 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "r", ctrlKey: true, altKey: true });
    expect(screen.queryByPlaceholderText(/자연어로 검색/)).not.toBeInTheDocument();
  });

  it("Ctrl+Shift+R은 히스토리 검색 대신 Diff 리뷰를 연다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "R", ctrlKey: true, shiftKey: true });
    expect(await screen.findByText("AI Diff Reviewer")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/자연어로 검색/)).not.toBeInTheDocument();
  });

  it("Ctrl+Alt+Shift+R은 Diff 리뷰 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "R", ctrlKey: true, altKey: true, shiftKey: true });
    expect(screen.queryByText("AI Diff Reviewer")).not.toBeInTheDocument();
  });

  it("Ctrl+Alt 단축키는 App 전역 단축키로 소비되지 않는다", () => {
    render(<App />);

    const cases: Array<{ key: string; shiftKey?: boolean; code?: string }> = [
      { key: "i" },
      { key: ",", code: "Comma" },
      { key: "d" },
      { key: "q", shiftKey: true },
      { key: "1" },
      { key: "ArrowUp", shiftKey: true },
    ];

    for (const c of cases) {
      const event = new KeyboardEvent("keydown", {
        key: c.key,
        code: c.code,
        ctrlKey: true,
        altKey: true,
        shiftKey: c.shiftKey ?? false,
        cancelable: true,
      });
      const consumed = !window.dispatchEvent(event);
      expect(consumed).toBe(false);
    }
  });

  it("Ctrl+,는 터미널 테마 패널을 연다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    expect(await screen.findByText("터미널 테마 설정")).toBeInTheDocument();
  });

  it("Ctrl+Shift+<는 터미널 테마 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "<", ctrlKey: true, shiftKey: true, code: "Comma" });
    expect(screen.queryByText("터미널 테마 설정")).not.toBeInTheDocument();
  });

  it("Ctrl+Shift+T는 새 탭 단축키로 처리되지 않는다", () => {
    render(<App />);
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "T", ctrlKey: true, shiftKey: true });

    const afterCount = screen.getAllByTestId(/^terminal-pane-/).length;
    expect(afterCount).toBe(beforeCount);
  });

  it("Ctrl+Alt+T는 새 탭 단축키로 처리되지 않는다", () => {
    render(<App />);
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "T", ctrlKey: true, altKey: true });

    const afterCount = screen.getAllByTestId(/^terminal-pane-/).length;
    expect(afterCount).toBe(beforeCount);
  });

  it("Ctrl+Shift+W는 탭 닫기 단축키로 처리되지 않는다", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("새 탭 (Cmd/Ctrl+T)"));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBeGreaterThan(1);
    });
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "W", ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBe(beforeCount);
    });
  });

  it("Ctrl+Alt+W는 탭 닫기 단축키로 처리되지 않는다", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("새 탭 (Cmd/Ctrl+T)"));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBeGreaterThan(1);
    });
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "W", ctrlKey: true, altKey: true });

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBe(beforeCount);
    });
  });

  it("AI Chat 버튼은 제거됨 — AI는 WarpInputBar로 통합", () => {
    render(<App />);
    expect(screen.queryByLabelText("AI Chat (Cmd+Shift+A)")).toBeNull();
  });

  it("알림 센터 버튼이 툴바에 있어야 함", () => {
    render(<App />);
    expect(screen.getByLabelText("알림 센터")).toBeInTheDocument();
  });

  it("스크립트 라이브러리 버튼이 툴바에 있어야 함", () => {
    render(<App />);
    // 툴바 그룹화 이후: aria-label은 기능 이름만, 단축키는 Tooltip kbd로 분리
    expect(screen.getByLabelText("스크립트 라이브러리")).toBeInTheDocument();
  });

  it("Inspector 탭은 키보드 탐색과 단축키 속성을 갖는다", async () => {
    render(<App />);

    const tablist = screen.getByRole("tablist", { name: "Inspector 탭" });
    const tabRoles = within(tablist).getAllByRole("tab");
    expect(tabRoles).toHaveLength(4);

    expect(tabRoles[0]).toHaveAttribute("aria-keyshortcuts", "Alt+1");
    expect(tabRoles[1]).toHaveAttribute("aria-keyshortcuts", "Alt+2");
    expect(tabRoles[2]).toHaveAttribute("aria-keyshortcuts", "Alt+3");
    expect(tabRoles[3]).toHaveAttribute("aria-keyshortcuts", "Alt+4");

    expect(tabRoles[0]).toHaveTextContent("개요(1)");
    expect(tabRoles[1]).toHaveTextContent("RAG(2)");
    expect(tabRoles[2]).toHaveTextContent("Scripts(3)");
    expect(tabRoles[3]).toHaveTextContent("System(4)");

    tabRoles[0].focus();
    expect(tabRoles[0]).toHaveFocus();

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    await waitFor(() => {
      expect(tabRoles[1]).toHaveAttribute("aria-selected", "true");
      expect(tabRoles[1]).toHaveFocus();
    });

    fireEvent.keyDown(tablist, { key: "End" });
    await waitFor(() => {
      expect(tabRoles[3]).toHaveAttribute("aria-selected", "true");
      expect(tabRoles[3]).toHaveFocus();
    });
  });

  it("Inspector 단축키는 입력 필드 포커스일 때는 동작하지 않는다", async () => {
    render(<App />);
    const input = document.createElement("input");
    document.body.appendChild(input);

    try {
      const summaryTab = screen.getByRole("tab", { name: /개요/ });
      const ragTab = screen.getByRole("tab", { name: /RAG/ });

      fireEvent.keyDown(window, { key: "1", altKey: true });
      await waitFor(() => {
        expect(summaryTab).toHaveAttribute("aria-selected", "true");
      });

      input.focus();
      expect(document.activeElement).toBe(input);

      fireEvent.keyDown(input, { key: "2", altKey: true });

      await waitFor(() => {
        expect(summaryTab).toHaveAttribute("aria-selected", "true");
        expect(ragTab).toHaveAttribute("aria-selected", "false");
      });

      fireEvent.keyDown(window, { key: "2", altKey: true });
      await waitFor(() => {
        expect(ragTab).toHaveAttribute("aria-selected", "true");
      });
      fireEvent.keyDown(window, { key: "1", altKey: true });
      await waitFor(() => {
        expect(summaryTab).toHaveAttribute("aria-selected", "true");
      });
    } finally {
      input.remove();
    }
  });

  it("Inspector 닫기 버튼은 트리거 버튼으로 포커스를 되돌린다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    let inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");

    if (!inspectorCloseButton) {
      fireEvent.click(inspectorButton);
    }
    await waitFor(() => {
      expect(screen.getByLabelText("Inspector 닫기")).toBeInTheDocument();
    });
    inspectorCloseButton = screen.getByLabelText("Inspector 닫기");

    inspectorCloseButton.focus();
    inspectorCloseButton.blur();

    fireEvent.click(inspectorCloseButton);

    await waitFor(() => {
      expect(screen.queryByRole("tablist", { name: "Inspector 탭" })).not.toBeInTheDocument();
      expect(inspectorButton).toHaveAttribute("aria-pressed", "false");
      expect(inspectorButton).toHaveFocus();
    });
  });

  it("Inspector 초기 진입 시 활동 내역이 없으면 안내 문구가 노출된다", async () => {
    const { container } = render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    const inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");

    if (inspectorCloseButton) {
      fireEvent.click(inspectorCloseButton);
    }
    fireEvent.click(inspectorButton);

    let inspectorSummaryPanel = container.querySelector("#inspector-tabpanel-summary");
    if (!inspectorSummaryPanel) {
      await waitFor(() => {
        inspectorSummaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(inspectorSummaryPanel).not.toBeNull();
      });
    }
    if (!inspectorSummaryPanel) {
      throw new Error("Inspector summary panel not found");
    }

    expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    expect(within(inspectorSummaryPanel as HTMLElement).getByText(/실패 블록[\s·\-]*추천 커맨드/)).toBeInTheDocument();
    expect(within(inspectorSummaryPanel as HTMLElement).getByText("Quick Actions")).toBeInTheDocument();
  });

  it("요약에서 Quick Actions의 Project Bin 버튼을 누르면 파일 탐색기가 열린다", async () => {
    render(<App />);

    const fileExplorerToggle = screen.getByLabelText("파일 탐색기");
    const inspectorButton = screen.getByLabelText("Inspector");

    const inspectorSummaryPanel = async () => {
      let panel = document.querySelector("#inspector-tabpanel-summary");
      if (!panel) {
        await waitFor(() => {
          panel = document.querySelector("#inspector-tabpanel-summary");
          expect(panel).not.toBeNull();
        });
      }
      return panel;
    };

    fireEvent.click(fileExplorerToggle);
    await waitFor(() => {
      expect(screen.queryByTestId("file-explorer-mock")).not.toBeInTheDocument();
    });

    const inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");
    if (!inspectorCloseButton) {
      fireEvent.click(inspectorButton);
    }
    await waitFor(() => {
      expect(screen.getByLabelText("Inspector 닫기")).toBeInTheDocument();
    });

    const panel = await inspectorSummaryPanel();
    const projectBinButton = within(panel as HTMLElement).getByRole("button", { name: "Project Bin" });
    fireEvent.click(projectBinButton);

    await waitFor(() => {
      expect(screen.getByTestId("file-explorer-mock")).toBeInTheDocument();
    });

    expect(invoke).toHaveBeenCalledWith("save_ui_preferences", {
      showFileExplorer: true,
    });
  });

  it("Quick Actions에서 RAG 검색 버튼을 누르면 RAG 탭으로 이동한다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    const inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");

    if (inspectorCloseButton) {
      fireEvent.click(inspectorCloseButton);
    }
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const panel = document.querySelector("#inspector-tabpanel-summary");
    expect(panel).toBeTruthy();
    const ragButton = within(panel as HTMLElement).getByRole("button", { name: "RAG" });
    fireEvent.click(ragButton);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /RAG/ })).toHaveAttribute("aria-selected", "true");
      expect(document.querySelector("#inspector-tabpanel-rag")).toBeInTheDocument();
    });
  });

  it("Quick Actions 더보기로 고급 액션을 펼치고 닫을 수 있다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    const inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");

    if (inspectorCloseButton) {
      fireEvent.click(inspectorCloseButton);
    }
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const panel = document.querySelector("#inspector-tabpanel-summary");
    expect(panel).toBeTruthy();
    const summary = panel as HTMLElement;

    expect(within(summary).queryByRole("button", { name: "Diff" })).toBeNull();

    const moreButton = within(summary).getByRole("button", { name: "더보기" });
    fireEvent.click(moreButton);

    await waitFor(() => {
      expect(within(summary).getByRole("button", { name: "Diff" })).toBeInTheDocument();
    });

    fireEvent.click(within(summary).getByRole("button", { name: "축소" }));
    await waitFor(() => {
      expect(within(summary).queryByRole("button", { name: "Diff" })).toBeNull();
    });
  });

  it("Quick Actions 더보기는 Escape로 닫히고 토글 버튼으로 포커스가 돌아간다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    const inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");

    if (inspectorCloseButton) {
      fireEvent.click(inspectorCloseButton);
    }
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const panel = document.querySelector("#inspector-tabpanel-summary");
    expect(panel).toBeTruthy();
    const summary = panel as HTMLElement;

    const moreButton = within(summary).getByRole("button", { name: "더보기" });
    fireEvent.click(moreButton);

    await waitFor(() => {
      expect(within(summary).getByRole("button", { name: "Diff" })).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(within(summary).queryByRole("button", { name: "Diff" })).toBeNull();
      expect(moreButton).toHaveFocus();
    });
  });

  it("더보기 토글은 Enter/Space로도 열리고 닫힌다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    const inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");

    if (inspectorCloseButton) {
      fireEvent.click(inspectorCloseButton);
    }
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const panel = document.querySelector("#inspector-tabpanel-summary");
    expect(panel).toBeTruthy();
    const summary = panel as HTMLElement;
    const moreButton = within(summary).getByRole("button", { name: "더보기" });

    fireEvent.keyDown(moreButton, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      expect(within(summary).getByRole("button", { name: "Diff" })).toBeInTheDocument();
    });

    fireEvent.keyDown(moreButton, { key: " ", code: "Space" });
    await waitFor(() => {
      expect(within(summary).queryByRole("button", { name: "Diff" })).toBeNull();
    });
  });

  it("고급 액션 영역에서 좌우 화살표로 버튼 간 이동이 된다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    const inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");

    if (inspectorCloseButton) {
      fireEvent.click(inspectorCloseButton);
    }
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const panel = document.querySelector("#inspector-tabpanel-summary");
    expect(panel).toBeTruthy();
    const summary = panel as HTMLElement;

    const moreButton = within(summary).getByRole("button", { name: "더보기" });
    fireEvent.keyDown(moreButton, { key: "Enter", code: "Enter" });

    const historyButton = await waitFor(() => within(summary).getByRole("button", { name: "History" }));
    expect(historyButton).toBeInTheDocument();

    await waitFor(() => {
      expect(historyButton).toHaveFocus();
    });
    const diffButton = within(summary).getByRole("button", { name: "Diff" });
    fireEvent.keyDown(historyButton, { key: "ArrowRight", code: "ArrowRight" });
    await waitFor(() => {
      expect(diffButton).toHaveFocus();
    });
  });

  it("고급 액션은 열리면 첫 버튼으로 포커스가 이동한다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    const inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");

    if (inspectorCloseButton) {
      fireEvent.click(inspectorCloseButton);
    }
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const panel = document.querySelector("#inspector-tabpanel-summary");
    expect(panel).toBeTruthy();
    const summary = panel as HTMLElement;

    const moreButton = within(summary).getByRole("button", { name: "더보기" });
    fireEvent.keyDown(moreButton, { key: "Enter", code: "Enter" });

    const historyButton = await waitFor(() => within(summary).getByRole("button", { name: "History" }));
    await waitFor(() => {
      expect(historyButton).toHaveFocus();
    });
  });

  it("고급 액션 영역 밖을 클릭하면 패널이 닫힌다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    const inspectorCloseButton = screen.queryByLabelText("Inspector 닫기");

    if (inspectorCloseButton) {
      fireEvent.click(inspectorCloseButton);
    }
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    const panel = document.querySelector("#inspector-tabpanel-summary");
    expect(panel).toBeTruthy();
    const summary = panel as HTMLElement;

    const moreButton = within(summary).getByRole("button", { name: "더보기" });
    fireEvent.click(moreButton);
    await waitFor(() => {
      expect(within(summary).getByRole("button", { name: "Diff" })).toBeInTheDocument();
    });

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(within(summary).queryByRole("button", { name: "Diff" })).toBeNull();
    });
  });

  it("Inspector는 Escape 키로 닫히고 포커스가 트리거로 되돌아간다", async () => {
    render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("tablist", { name: "Inspector 탭" })).not.toBeInTheDocument();
      expect(inspectorButton).toHaveAttribute("aria-pressed", "false");
      expect(inspectorButton).toHaveFocus();
    });
  });
});
