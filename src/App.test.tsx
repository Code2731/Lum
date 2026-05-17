import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === "check_onboarding_complete") return Promise.resolve(true);
    if (cmd === "check_xllm_status") return Promise.resolve(false);
    if (cmd === "load_session") return Promise.reject("no session");
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
    expect(screen.getByLabelText("새 탭 (Cmd+T)")).toBeInTheDocument();
  });

  it("SSH 연결 버튼이 툴바에 있어야 함", () => {
    render(<App />);
    expect(screen.getByLabelText("SSH 연결 (Cmd+Shift+H)")).toBeInTheDocument();
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
    render(<App />);

    fireEvent.click(screen.getByLabelText("Inspector"));

    await waitFor(() => {
      expect(screen.getByText("터미널에서 최근 명령을 실행하면 여기에서 실패 블록·추천 커맨드·최근 기록을 확인할 수 있습니다.")).toBeInTheDocument();
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
