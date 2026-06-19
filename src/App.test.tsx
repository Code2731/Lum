import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCommandBlocks } from "./hooks/useCommandBlocks";
import { isEventTargetWithinSelector } from "./utils/pointerGuard";
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

vi.mock("./components/AiBar", () => ({
  default: ({ value, onChange, onSubmit, onCancel, onClose, disabled, processing }: any) => (
    <div data-testid="ai-bar-mock">
      <input
        data-testid="ai-bar-input"
        placeholder="AI에게 질문하세요… (Enter 전송 · Esc 닫기)"
        value={value}
        disabled={disabled}
        onChange={(e: any) => onChange(e.target.value)}
        onKeyDown={(e: any) => {
          if (e.key === "Enter") { e.preventDefault(); onSubmit(); }
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
      />
      {processing && <button data-testid="ai-bar-stop" aria-label="AI 응답 중지" onClick={onCancel}>Stop</button>}
      <span>Esc 또는 Cmd/Ctrl+Shift+K 로 닫기</span>
    </div>
  ),
}));

vi.mock("./components/TabBar", () => ({
  default: ({ onAddTab, onOpenSshModal, onToggleSplitH, onToggleSplitV, activeTab }: any) => (
    <div data-testid="tab-bar-mock">
      <button aria-label="새 탭 (Cmd/Ctrl+T)" onClick={onAddTab}>+</button>
      <button aria-label="SSH 연결 (Cmd/Ctrl+Shift+H)" onClick={onOpenSshModal}><svg /></button>
      <button
        aria-label="수평 분할 (Cmd/Ctrl+Shift+D)"
        aria-pressed={activeTab?.splitDir === "h" ? "true" : "false"}
        onClick={onToggleSplitH}
      >H</button>
      <button
        aria-label="수직 분할 (Cmd/Ctrl+Shift+E)"
        aria-pressed={activeTab?.splitDir === "v" ? "true" : "false"}
        onClick={onToggleSplitV}
      >V</button>
    </div>
  ),
}));

vi.mock("./hooks/useCommandBlocks", () => ({
  useCommandBlocks: vi.fn(),
}));

describe("App (LUM 터미널)", () => {
  const mockedInvoke = vi.mocked(invoke);
  const mockedUseCommandBlocks = vi.mocked(useCommandBlocks);

  const setMockCommandBlocks = (blocks: Array<{
    id: string;
    command: string;
    output: string;
    exitCode: number | null;
    startedAt: number;
    endedAt: number | null;
  }>) => {
    mockedUseCommandBlocks.mockReturnValue({
      blocks,
      feedRaw: vi.fn(),
      clearBlocks: vi.fn(),
    });
  };

  beforeEach(() => {
    mockedInvoke.mockClear();
    setMockCommandBlocks([]);
  });

  it("이벤트 타깃 선택자 판정은 Element가 아니어도 안전하다", () => {
    const textNode = document.createTextNode("hello");
    expect(isEventTargetWithinSelector(textNode, "[data-test='x']")).toBe(false);
    expect(isEventTargetWithinSelector(null, "[data-test='x']")).toBe(false);
    expect(isEventTargetWithinSelector(new EventTarget(), "[data-test='x']")).toBe(false);
  });

  it("이벤트 타깃 선택자 판정은 closest 매칭 여부를 반환한다", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-test", "x");
    const child = document.createElement("button");
    const outside = document.createElement("span");
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);
    document.body.appendChild(outside);

    expect(isEventTargetWithinSelector(child, "[data-test='x']")).toBe(true);
    expect(isEventTargetWithinSelector(outside, "[data-test='x']")).toBe(false);
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

  it("Cmd+Shift+K는 AI 바를 연다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "K", metaKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)")).toBeInTheDocument();
  });

  it("AI 입력바 전송 중에는 유지되고 Stop으로 취소할 수 있다", async () => {
    let resolveStream: (() => void) | null = null;
    const baseImpl = mockedInvoke.getMockImplementation();
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      if (cmd === "cancel_ai_stream") {
        resolveStream?.();
        resolveStream = null;
        return Promise.resolve();
      }
      return baseImpl ? baseImpl(cmd) : Promise.resolve("{}");
    });

    render(<App />);

    fireEvent.keyDown(window, { key: "K", ctrlKey: true, shiftKey: true });
    const aiInput = screen.getByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)");
    fireEvent.change(aiInput, { target: { value: "로그 요약해줘" } });
    fireEvent.keyDown(aiInput, { key: "Enter" });

    expect(screen.getByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)")).toBeInTheDocument();
    expect(screen.getByLabelText("AI 응답 중지")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("AI 응답 중지"));

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)"),
      ).not.toBeInTheDocument();
    });
    expect(mockedInvoke).toHaveBeenCalledWith("cancel_ai_stream");
  });

  it("Cmd/Ctrl+Shift+D는 수평 분할 토글이 동작한다", async () => {
    render(<App />);
    const splitBtn = screen.getByLabelText("수평 분할 (Cmd/Ctrl+Shift+D)");
    const before = splitBtn.getAttribute("aria-pressed");

    fireEvent.keyDown(window, { key: "D", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(splitBtn).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
    });

    fireEvent.keyDown(window, { key: "d", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(splitBtn).toHaveAttribute("aria-pressed", before ?? "false");
    });
  });

  it("Ctrl+Shift+D는 수평 분할 토글이 동작한다", async () => {
    render(<App />);
    const splitBtn = screen.getByLabelText("수평 분할 (Cmd/Ctrl+Shift+D)");
    const before = splitBtn.getAttribute("aria-pressed");

    fireEvent.keyDown(window, { key: "D", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(splitBtn).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
    });

    fireEvent.keyDown(window, { key: "d", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(splitBtn).toHaveAttribute("aria-pressed", before ?? "false");
    });
  });

  it("Cmd/Ctrl+Shift+E는 수직 분할 토글이 동작한다", async () => {
    render(<App />);
    const splitBtn = screen.getByLabelText("수직 분할 (Cmd/Ctrl+Shift+E)");
    const before = splitBtn.getAttribute("aria-pressed");

    fireEvent.keyDown(window, { key: "E", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(splitBtn).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
    });

    fireEvent.keyDown(window, { key: "e", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(splitBtn).toHaveAttribute("aria-pressed", before ?? "false");
    });
  });

  it("Ctrl+Shift+E는 수직 분할 토글이 동작한다", async () => {
    render(<App />);
    const splitBtn = screen.getByLabelText("수직 분할 (Cmd/Ctrl+Shift+E)");
    const before = splitBtn.getAttribute("aria-pressed");

    fireEvent.keyDown(window, { key: "E", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(splitBtn).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
    });

    fireEvent.keyDown(window, { key: "e", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(splitBtn).toHaveAttribute("aria-pressed", before ?? "false");
    });
  });

  it("Ctrl+Alt+Shift+K는 AI 바 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "K", ctrlKey: true, altKey: true, shiftKey: true });
    expect(screen.queryByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)")).not.toBeInTheDocument();
  });

  it("Cmd+Alt+Shift+K는 AI 바 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "K", metaKey: true, altKey: true, shiftKey: true });
    expect(screen.queryByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)")).not.toBeInTheDocument();
  });

  it("Ctrl+R은 히스토리 검색을 연다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    expect(await screen.findByPlaceholderText(/자연어로 검색/)).toBeInTheDocument();
  });

  it("리스트 뷰에서는 Ctrl+R이 히스토리 검색을 열지 않는다", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText("리스트"));
    await waitFor(() => {
      expect(screen.getByLabelText("리스트")).toHaveAttribute("aria-pressed", "true");
    });

    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    expect(screen.queryByPlaceholderText(/자연어로 검색/)).not.toBeInTheDocument();
  });

  it("캔버스 뷰에서는 Ctrl+R이 히스토리 검색을 열지 않는다", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText("캔버스"));
    await waitFor(() => {
      expect(screen.getByLabelText("캔버스")).toHaveAttribute("aria-pressed", "true");
    });

    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    expect(screen.queryByPlaceholderText(/자연어로 검색/)).not.toBeInTheDocument();
  });

  it("Cmd+R은 히스토리 검색 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "r", metaKey: true });
    expect(screen.queryByPlaceholderText(/자연어로 검색/)).not.toBeInTheDocument();
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

  it("Cmd/Ctrl+Alt+K는 커맨드 팔레트 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "k", metaKey: true, altKey: true });
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

  it("Cmd+B는 파일 탐색기 토글을 실행한다", async () => {
    render(<App />);
    const initiallyVisible = screen.queryByTestId("file-explorer-mock") !== null;

    fireEvent.keyDown(window, { key: "b", metaKey: true });

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

  it("Cmd+Alt+B는 파일 탐색기 단축키로 처리되지 않는다", () => {
    render(<App />);
    const beforeVisible = screen.queryByTestId("file-explorer-mock") !== null;

    fireEvent.keyDown(window, { key: "b", metaKey: true, altKey: true });

    const afterVisible = screen.queryByTestId("file-explorer-mock") !== null;
    expect(afterVisible).toBe(beforeVisible);
  });

  it("Quick Action 단축키는 Ctrl+숫자만 소비하고 Ctrl+Alt+숫자는 소비하지 않는다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");
    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          quick_actions: [{ id: "qa-1", label: "List", command: "ls", shortcut: 1 }],
        });
      }
      return baseImpl(cmd, args[0], args[1]);
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
      mockedInvoke.mockImplementation(baseImpl);
    }
  });

  it("Quick Action 단축키는 Cmd+숫자만 소비하고 Cmd+Alt+숫자는 소비하지 않는다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");
    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          quick_actions: [{ id: "qa-1", label: "List", command: "ls", shortcut: 1 }],
        });
      }
      return baseImpl(cmd, args[0], args[1]);
    });

    try {
      render(<App />);
      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("load_app_config");
      });

      await waitFor(() => {
        const consumed = !window.dispatchEvent(new KeyboardEvent("keydown", {
          key: "1",
          metaKey: true,
          cancelable: true,
        }));
        expect(consumed).toBe(true);
      });

      const consumedWithAlt = !window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "1",
        metaKey: true,
        altKey: true,
        cancelable: true,
      }));
      expect(consumedWithAlt).toBe(false);
    } finally {
      mockedInvoke.mockImplementation(baseImpl);
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

  it("Cmd+Alt 단축키는 App 전역 단축키로 소비되지 않는다", () => {
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
        metaKey: true,
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

  it("Ctrl+Alt+Shift+T는 새 탭 단축키로 처리되지 않는다", () => {
    render(<App />);
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "T", ctrlKey: true, altKey: true, shiftKey: true });

    const afterCount = screen.getAllByTestId(/^terminal-pane-/).length;
    expect(afterCount).toBe(beforeCount);
  });

  it("Cmd+Shift+T는 새 탭 단축키로 처리되지 않는다", () => {
    render(<App />);
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "T", metaKey: true, shiftKey: true });

    const afterCount = screen.getAllByTestId(/^terminal-pane-/).length;
    expect(afterCount).toBe(beforeCount);
  });

  it("Cmd+T는 새 탭 단축키로 처리된다", () => {
    render(<App />);
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "t", metaKey: true });

    const afterCount = screen.getAllByTestId(/^terminal-pane-/).length;
    expect(afterCount).toBe(beforeCount + 1);
  });

  it("Ctrl+Alt+T는 새 탭 단축키로 처리되지 않는다", () => {
    render(<App />);
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "T", ctrlKey: true, altKey: true });

    const afterCount = screen.getAllByTestId(/^terminal-pane-/).length;
    expect(afterCount).toBe(beforeCount);
  });

  it("Cmd+Alt+T는 새 탭 단축키로 처리되지 않는다", () => {
    render(<App />);
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "T", metaKey: true, altKey: true });

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

  it("Cmd+W는 탭 닫기 단축키로 처리된다", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("새 탭 (Cmd/Ctrl+T)"));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBeGreaterThan(1);
    });
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "W", metaKey: true });

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBe(beforeCount - 1);
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

  it("Cmd+Alt+W는 탭 닫기 단축키로 처리되지 않는다", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("새 탭 (Cmd/Ctrl+T)"));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBeGreaterThan(1);
    });
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "W", metaKey: true, altKey: true });

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBe(beforeCount);
    });
  });

  it("Cmd+Shift+W는 탭 닫기 단축키로 처리되지 않는다", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("새 탭 (Cmd/Ctrl+T)"));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBeGreaterThan(1);
    });
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "W", metaKey: true, shiftKey: true });

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBe(beforeCount);
    });
  });

  it("Cmd+Alt+Shift+W는 탭 닫기 단축키로 처리되지 않는다", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("새 탭 (Cmd/Ctrl+T)"));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBeGreaterThan(1);
    });
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "W", metaKey: true, altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBe(beforeCount);
    });
  });

  it("Ctrl+Alt+Shift+W는 탭 닫기 단축키로 처리되지 않는다", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("새 탭 (Cmd/Ctrl+T)"));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBeGreaterThan(1);
    });
    const beforeCount = screen.getAllByTestId(/^terminal-pane-/).length;

    fireEvent.keyDown(window, { key: "W", ctrlKey: true, altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBe(beforeCount);
    });
  });

  it("Cmd+Shift+R은 Diff 리뷰를 연다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "R", metaKey: true, shiftKey: true });
    expect(await screen.findByText("AI Diff Reviewer")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/자연어로 검색/)).not.toBeInTheDocument();
  });

  it("Cmd+Alt+Shift+R은 Diff 리뷰 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "R", metaKey: true, altKey: true, shiftKey: true });
    expect(screen.queryByText("AI Diff Reviewer")).not.toBeInTheDocument();
  });

  it("Cmd/Ctrl+Shift+G는 커밋 패널이 열리고, Alt 조합은 처리되지 않는다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "G", metaKey: true, shiftKey: true });
    expect(await screen.findByText("AI 커밋 메시지 생성")).toBeInTheDocument();

    const beforeCount = screen.getAllByText("AI 커밋 메시지 생성").length;
    fireEvent.keyDown(window, { key: "G", metaKey: true, shiftKey: true, altKey: true });
    await waitFor(() => {
      expect(screen.getAllByText("AI 커밋 메시지 생성").length).toBe(beforeCount);
    });
  });

  it("Ctrl+Shift+G는 커밋 패널을 열고, Alt 조합은 처리되지 않는다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "G", ctrlKey: true, shiftKey: true });
    expect(await screen.findByText("AI 커밋 메시지 생성")).toBeInTheDocument();

    const beforeCount = screen.getAllByText("AI 커밋 메시지 생성").length;
    fireEvent.keyDown(window, { key: "G", ctrlKey: true, shiftKey: true, altKey: true });
    await waitFor(() => {
      expect(screen.getAllByText("AI 커밋 메시지 생성").length).toBe(beforeCount);
    });
  });

  it("Cmd/Ctrl+Shift+S는 워크스페이스 패널을 열고, Ctrl/Cmd+Alt+Shift+S는 처리되지 않는다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");

    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({});
      }
      if (cmd === "list_workspaces") {
        return Promise.resolve([]);
      }
      return baseImpl(cmd, args[0], args[1]);
    });

    try {
      render(<App />);

      fireEvent.keyDown(window, { key: "S", metaKey: true, shiftKey: true });
      expect(await screen.findByText("현재 세션 저장")).toBeInTheDocument();
      expect(screen.getByText("워크스페이스")).toBeInTheDocument();

      const beforeCount = screen.getAllByText("현재 세션 저장").length;
      fireEvent.keyDown(window, { key: "S", metaKey: true, shiftKey: true, altKey: true });
      await waitFor(() => {
        expect(screen.getAllByText("현재 세션 저장").length).toBe(beforeCount);
      });

      fireEvent.keyDown(window, { key: "S", ctrlKey: true, shiftKey: true });
      expect(await screen.findByText("현재 세션 저장")).toBeInTheDocument();
      const beforeCountWithCtrl = screen.getAllByText("현재 세션 저장").length;

      fireEvent.keyDown(window, { key: "S", ctrlKey: true, shiftKey: true, altKey: true });
      await waitFor(() => {
        expect(screen.getAllByText("현재 세션 저장").length).toBe(beforeCountWithCtrl);
      });
    } finally {
      mockedInvoke.mockImplementation(baseImpl);
    }
  });

  it("Cmd/Ctrl+Shift+M는 시스템 모니터 패널을 열고, Alt 조합은 처리되지 않는다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");

    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "get_system_stats") {
        return Promise.resolve({
          cpu_usage: 18.5,
          memory_used_gb: 6.3,
          memory_total_gb: 16,
          memory_percent: 39.375,
          cpu_count: 12,
          top_cpu: [],
          top_mem: [],
        });
      }
      if (cmd === "load_app_config") {
        return Promise.resolve({});
      }
      return baseImpl(cmd, args[0], args[1]);
    });

    try {
      render(<App />);

      fireEvent.keyDown(window, { key: "M", metaKey: true, shiftKey: true });
      expect(await screen.findByText("시스템 모니터")).toBeInTheDocument();
      expect(screen.getByText("18.5%")).toBeInTheDocument();

      const beforeCount = screen.getAllByText("시스템 모니터").length;
      fireEvent.keyDown(window, { key: "M", metaKey: true, shiftKey: true, altKey: true });
      await waitFor(() => {
        expect(screen.getAllByText("시스템 모니터").length).toBe(beforeCount);
      });
    } finally {
      mockedInvoke.mockImplementation(baseImpl);
    }
  });

  it("Ctrl+Shift+M는 시스템 모니터 패널을 열고, Alt 조합은 처리되지 않는다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");

    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "get_system_stats") {
        return Promise.resolve({
          cpu_usage: 21.0,
          memory_used_gb: 6.9,
          memory_total_gb: 16,
          memory_percent: 43.125,
          cpu_count: 12,
          top_cpu: [],
          top_mem: [],
        });
      }
      if (cmd === "load_app_config") {
        return Promise.resolve({});
      }
      return baseImpl(cmd, args[0], args[1]);
    });

    try {
      render(<App />);

      fireEvent.keyDown(window, { key: "M", ctrlKey: true, shiftKey: true });
      expect(await screen.findByText("시스템 모니터")).toBeInTheDocument();
      expect(screen.getByText("21.0%")).toBeInTheDocument();

      const beforeCount = screen.getAllByText("시스템 모니터").length;
      fireEvent.keyDown(window, { key: "M", ctrlKey: true, shiftKey: true, altKey: true });
      await waitFor(() => {
        expect(screen.getAllByText("시스템 모니터").length).toBe(beforeCount);
      });
    } finally {
      mockedInvoke.mockImplementation(baseImpl);
    }
  });

  it("Cmd/Ctrl+Shift+F는 실패 블록을 순환 포커스한다", async () => {
    setMockCommandBlocks([
      {
        id: "cmd-1",
        command: "echo ok",
        output: "ok output",
        exitCode: 0,
        startedAt: 1,
        endedAt: 2,
      },
      {
        id: "cmd-2",
        command: "npm run test",
        output: "exit 1",
        exitCode: 1,
        startedAt: 3,
        endedAt: 4,
      },
      {
        id: "cmd-3",
        command: "make build",
        output: "exit 2",
        exitCode: 2,
        startedAt: 5,
        endedAt: 6,
      },
    ]);

    render(<App />);

    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });
    expect(await screen.findByText("3/3")).toBeInTheDocument();
    expect(screen.getByLabelText("이전 블록 (Cmd/Ctrl+Shift+↑)")).not.toBeDisabled();
    expect(screen.getByLabelText("다음 블록 (Cmd/Ctrl+Shift+↓)")).toBeDisabled();

    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(screen.getByText("2/3")).toBeInTheDocument();
      expect(screen.getByLabelText("이전 블록 (Cmd/Ctrl+Shift+↑)")).not.toBeDisabled();
      expect(screen.getByLabelText("다음 블록 (Cmd/Ctrl+Shift+↓)")).not.toBeDisabled();
    });
  });

  it("Ctrl+Shift+F도 실패 블록을 순환 포커스한다", async () => {
    setMockCommandBlocks([
      {
        id: "cmd-1",
        command: "echo ok",
        output: "ok output",
        exitCode: 0,
        startedAt: 1,
        endedAt: 2,
      },
      {
        id: "cmd-2",
        command: "npm run test",
        output: "exit 1",
        exitCode: 1,
        startedAt: 3,
        endedAt: 4,
      },
      {
        id: "cmd-3",
        command: "make build",
        output: "exit 2",
        exitCode: 2,
        startedAt: 5,
        endedAt: 6,
      },
    ]);

    render(<App />);

    fireEvent.keyDown(window, { key: "f", ctrlKey: true, shiftKey: true });
    expect(await screen.findByText("3/3")).toBeInTheDocument();
    expect(screen.getByLabelText("이전 블록 (Cmd/Ctrl+Shift+↑)")).not.toBeDisabled();

    fireEvent.keyDown(window, { key: "f", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(screen.getByText("2/3")).toBeInTheDocument();
      expect(screen.getByLabelText("이전 블록 (Cmd/Ctrl+Shift+↑)")).not.toBeDisabled();
      expect(screen.getByLabelText("다음 블록 (Cmd/Ctrl+Shift+↓)")).not.toBeDisabled();
    });
  });

  it("Cmd/Ctrl+Shift+ArrowUp/ArrowDown는 커맨드 블록 선택 인덱스를 이동한다", async () => {
    setMockCommandBlocks([
      {
        id: "cmd-1",
        command: "echo one",
        output: "one output",
        exitCode: 0,
        startedAt: 10,
        endedAt: 11,
      },
      {
        id: "cmd-2",
        command: "echo two",
        output: "two output",
        exitCode: 0,
        startedAt: 12,
        endedAt: 13,
      },
      {
        id: "cmd-3",
        command: "echo three",
        output: "three output",
        exitCode: 0,
        startedAt: 14,
        endedAt: 15,
      },
    ]);

    render(<App />);

    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true, shiftKey: true });
    expect(await screen.findByText("3/3")).toBeInTheDocument();
    expect(screen.getByLabelText("다음 블록 (Cmd/Ctrl+Shift+↓)")).toBeDisabled();

    fireEvent.keyDown(window, { key: "ArrowUp", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(screen.getByText("2/3")).toBeInTheDocument();
      expect(screen.getByLabelText("다음 블록 (Cmd/Ctrl+Shift+↓)")).not.toBeDisabled();
    });
  });

  it("Cmd/Ctrl+Shift+F에서 Alt가 함께면 실패 블록 포커스 단축키가 처리되지 않는다", () => {
    setMockCommandBlocks([
      {
        id: "cmd-1",
        command: "cmd for fail",
        output: "exit 1",
        exitCode: 1,
        startedAt: 1,
        endedAt: 2,
      },
    ]);

    render(<App />);

    expect(screen.getByText("1/1")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true, altKey: true });
    fireEvent.keyDown(window, { key: "f", ctrlKey: true, shiftKey: true, altKey: true });
    expect(screen.getByText("1/1")).toBeInTheDocument();
  });

  it("Cmd/Ctrl+Shift+D는 Alt가 함께면 split 토글이 처리되지 않는다", () => {
    render(<App />);
    const splitBtn = screen.getByLabelText("수평 분할 (Cmd/Ctrl+Shift+D)");
    const before = splitBtn.getAttribute("aria-pressed");

    fireEvent.keyDown(window, { key: "d", metaKey: true, shiftKey: true, altKey: true });
    expect(splitBtn).toHaveAttribute("aria-pressed", before ?? "false");

    fireEvent.keyDown(window, { key: "D", ctrlKey: true, shiftKey: true, altKey: true });
    expect(splitBtn).toHaveAttribute("aria-pressed", before ?? "false");
  });

  it("Cmd/Ctrl+Shift+E는 Alt가 함께면 수직 분할 토글이 처리되지 않는다", () => {
    render(<App />);
    const splitBtn = screen.getByLabelText("수직 분할 (Cmd/Ctrl+Shift+E)");
    const before = splitBtn.getAttribute("aria-pressed");

    fireEvent.keyDown(window, { key: "e", metaKey: true, shiftKey: true, altKey: true });
    expect(splitBtn).toHaveAttribute("aria-pressed", before ?? "false");

    fireEvent.keyDown(window, { key: "E", ctrlKey: true, shiftKey: true, altKey: true });
    expect(splitBtn).toHaveAttribute("aria-pressed", before ?? "false");
  });

  it("Cmd/Ctrl+Shift+ArrowUp/ArrowDown에서 Alt가 함께면 블록 네비게이션 단축키가 처리되지 않는다", () => {
    setMockCommandBlocks([
      {
        id: "cmd-1",
        command: "echo one",
        output: "one output",
        exitCode: 0,
        startedAt: 1,
        endedAt: 2,
      },
      {
        id: "cmd-2",
        command: "echo two",
        output: "two output",
        exitCode: 0,
        startedAt: 3,
        endedAt: 4,
      },
    ]);

    render(<App />);

    expect(screen.getByText("2/2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true, shiftKey: true, altKey: true });
    fireEvent.keyDown(window, { key: "ArrowUp", metaKey: true, shiftKey: true, altKey: true });
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("Cmd/Ctrl+Shift+O는 워크스페이스 패널을 열고, Alt 조합은 처리되지 않는다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");

    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({});
      }
      if (cmd === "list_workspaces") {
        return Promise.resolve([]);
      }
      return baseImpl(cmd, args[0], args[1]);
    });

    try {
      render(<App />);

      fireEvent.keyDown(window, { key: "O", metaKey: true, shiftKey: true });
      expect(await screen.findByText("현재 세션 저장")).toBeInTheDocument();
      expect(screen.getByText("워크스페이스")).toBeInTheDocument();

      const beforeCount = screen.getAllByText("현재 세션 저장").length;
      fireEvent.keyDown(window, { key: "O", metaKey: true, shiftKey: true, altKey: true });
      await waitFor(() => {
        expect(screen.getAllByText("현재 세션 저장").length).toBe(beforeCount);
      });

      fireEvent.keyDown(window, { key: "O", ctrlKey: true, shiftKey: true });
      expect(await screen.findByText("현재 세션 저장")).toBeInTheDocument();

      const beforeCountWithCtrl = screen.getAllByText("현재 세션 저장").length;
      fireEvent.keyDown(window, { key: "O", ctrlKey: true, shiftKey: true, altKey: true });
      await waitFor(() => {
        expect(screen.getAllByText("현재 세션 저장").length).toBe(beforeCountWithCtrl);
      });
    } finally {
      mockedInvoke.mockImplementation(baseImpl);
    }
  });

  it("Cmd+I는 Inspector 요약 탭을 연다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "i", metaKey: true });
    expect(await screen.findByText("개요")).toBeInTheDocument();
  });

  it("Ctrl+I는 Inspector 요약 탭을 연다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "i", ctrlKey: true });
    expect(await screen.findByText("개요")).toBeInTheDocument();
  });

  it("Cmd+Alt+I는 Inspector 토글로 처리되지 않는다", async () => {
    render(<App />);
    const inspectorButton = screen.getByLabelText("Inspector");
    const before = inspectorButton.getAttribute("aria-pressed");

    fireEvent.keyDown(window, { key: "i", metaKey: true, altKey: true });
    await waitFor(() => {
      expect(inspectorButton).toHaveAttribute("aria-pressed", before ?? "false");
    });
  });

  it("Ctrl+Alt+I는 Inspector 토글로 처리되지 않는다", async () => {
    render(<App />);
    const inspectorButton = screen.getByLabelText("Inspector");
    const before = inspectorButton.getAttribute("aria-pressed");

    fireEvent.keyDown(window, { key: "i", ctrlKey: true, altKey: true });
    await waitFor(() => {
      expect(inspectorButton).toHaveAttribute("aria-pressed", before ?? "false");
    });
  });

  it("Cmd+Shift+I는 Inspector 토글로 처리되지 않는다", async () => {
    render(<App />);
    const inspectorButton = screen.getByLabelText("Inspector");
    const before = inspectorButton.getAttribute("aria-pressed");

    fireEvent.keyDown(window, { key: "I", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(inspectorButton).toHaveAttribute("aria-pressed", before ?? "false");
    });
  });

  it("Cmd+,는 터미널 테마 패널을 연다", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: ",", metaKey: true });
    expect(await screen.findByText("터미널 테마 설정")).toBeInTheDocument();
  });

  it("Cmd+Shift+<는 터미널 테마 단축키로 처리되지 않는다", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "<", metaKey: true, shiftKey: true, code: "Comma" });
    expect(screen.queryByText("터미널 테마 설정")).not.toBeInTheDocument();
  });

  it("Cmd/Ctrl+Shift+Q는 Quick Actions 바를 토글한다", () => {
    render(<App />);

    expect(screen.getByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "q", metaKey: true, shiftKey: true });
    expect(screen.queryByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "q", metaKey: true, shiftKey: true });
    expect(screen.getByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).toBeInTheDocument();
  });

  it("Ctrl+Shift+Q도 Quick Actions 바를 토글한다", () => {
    render(<App />);

    expect(screen.getByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "q", ctrlKey: true, shiftKey: true });
    expect(screen.queryByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "q", ctrlKey: true, shiftKey: true });
    expect(screen.getByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).toBeInTheDocument();
  });

  it("Ctrl+Alt+Shift+Q는 Quick Actions 바 단축키로 처리되지 않는다", () => {
    render(<App />);

    expect(screen.getByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "q", ctrlKey: true, altKey: true, shiftKey: true });
    expect(screen.getByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).toBeInTheDocument();
  });

  it("Cmd+Alt+Shift+Q는 Quick Actions 바 단축키로 처리되지 않는다", () => {
    render(<App />);

    expect(screen.getByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "q", metaKey: true, altKey: true, shiftKey: true });
    expect(screen.getByText("빠른 실행 없음 · 오른쪽 설정에서 추가")).toBeInTheDocument();
  });

  it("Cmd+Shift+L로 스크립트 패널이 열리고, Ctrl/Cmd+Shift+H는 SSH 모달로 동작한다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");

    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "list_scripts") return Promise.resolve([]);
      if (cmd === "load_app_config") return Promise.resolve({});
      return baseImpl(cmd, args[0], args[1]);
    });

    try {
      render(<App />);

      fireEvent.keyDown(window, { key: "L", metaKey: true, shiftKey: true });
      expect(await screen.findByText("스크립트 라이브러리")).toBeInTheDocument();
    } finally {
      mockedInvoke.mockImplementation(baseImpl);
    }
  });

  it("Cmd/Ctrl+Shift+L에서 Alt가 함께면 스크립트 패널 토글이 처리되지 않는다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");

    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "list_scripts") return Promise.resolve([]);
      if (cmd === "load_app_config") return Promise.resolve({});
      return baseImpl(cmd, args[0], args[1]);
    });

    try {
      render(<App />);

      fireEvent.keyDown(window, { key: "L", metaKey: true, shiftKey: true, altKey: true });
      expect(screen.queryByText("스크립트 라이브러리")).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: "L", ctrlKey: true, shiftKey: true, altKey: true });
      expect(screen.queryByText("스크립트 라이브러리")).not.toBeInTheDocument();
    } finally {
      mockedInvoke.mockImplementation(baseImpl);
    }
  });

  it("Ctrl+Shift+L로도 스크립트 패널이 열린다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");

    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "list_scripts") return Promise.resolve([]);
      if (cmd === "load_app_config") return Promise.resolve({});
      return baseImpl(cmd, args[0], args[1]);
    });

    try {
      render(<App />);

      fireEvent.keyDown(window, { key: "L", ctrlKey: true, shiftKey: true });
      expect(await screen.findByText("스크립트 라이브러리")).toBeInTheDocument();
    } finally {
      mockedInvoke.mockImplementation(baseImpl);
    }
  });

  it("Cmd+Shift+H는 SSH 연결 모달이 열리고, Alt 조합은 처리되지 않는다", async () => {
    const baseImpl = mockedInvoke.getMockImplementation() as
      ((cmd: string, args?: unknown, options?: unknown) => Promise<unknown>);
    if (!baseImpl) throw new Error("invoke mock implementation not found");

    mockedInvoke.mockImplementation((cmd: string, ...args: unknown[]) => {
      if (cmd === "list_ssh_profiles") return Promise.resolve([]);
      if (cmd === "load_app_config") return Promise.resolve({});
      return baseImpl(cmd, args[0], args[1]);
    });

    try {
      render(<App />);

      fireEvent.keyDown(window, { key: "H", metaKey: true, shiftKey: true });
      expect(await screen.findByText("SSH 연결")).toBeInTheDocument();

      const beforeCount = screen.getAllByText("SSH 연결").length;
      fireEvent.keyDown(window, { key: "H", metaKey: true, shiftKey: true, altKey: true });
      await waitFor(() => {
        expect(screen.getAllByText("SSH 연결").length).toBe(beforeCount);
      });

      fireEvent.keyDown(window, { key: "H", ctrlKey: true, shiftKey: true });
      expect(await screen.findByText("SSH 연결")).toBeInTheDocument();

      const beforeCountWithCtrl = screen.getAllByText("SSH 연결").length;
      fireEvent.keyDown(window, { key: "H", ctrlKey: true, shiftKey: true, altKey: true });
      await waitFor(() => {
        expect(screen.getAllByText("SSH 연결").length).toBe(beforeCountWithCtrl);
      });
    } finally {
      mockedInvoke.mockImplementation(baseImpl);
    }
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

  it("글로벌 단축키는 입력 필드 포커스 시 동작하지 않는다(Ctrl/Cmd)", async () => {
    render(<App />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    try {
      const beforePanes = screen.getAllByTestId(/^terminal-pane-/).length;

      input.focus();
      expect(document.activeElement).toBe(input);

      fireEvent.keyDown(input, { key: "k", ctrlKey: true, shiftKey: true });
      expect(screen.queryByPlaceholderText("AI에게 질문하세요… (Enter 전송 · Esc 닫기)")).not.toBeInTheDocument();

      fireEvent.keyDown(input, { key: "b", ctrlKey: true });
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBe(beforePanes);

      fireEvent.keyDown(input, { key: "t", metaKey: true });
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBe(beforePanes);

      fireEvent.keyDown(input, { key: "r", metaKey: true });
      expect(screen.queryByPlaceholderText(/자연어로 검색/)).not.toBeInTheDocument();
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

  it("실패 블록에서 AI ANALYZE를 누르면 분석 상태가 STREAMING으로 표시된다", async () => {
    setMockCommandBlocks([{
      id: "b1",
      command: "npm test",
      output: "FAIL: missing snapshot",
      exitCode: 1,
      startedAt: 1,
      endedAt: 10,
    }]);
    const { container } = render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
    await waitFor(() => {
      summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      expect(summaryPanel).not.toBeNull();
    });

    const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
    fireEvent.click(analyzeButton);

    await waitFor(() => {
      expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
    });
  });

  it("실패 블록 id가 BOM-only면 AI ANALYZE가 여전히 STREAMING으로 진입해야 한다", async () => {
    setMockCommandBlocks([{
      id: "\uFEFF",
      command: "pnpm lint",
      output: "FAIL: malformed id target",
      exitCode: 2,
      startedAt: 1,
      endedAt: 10,
    }]);
    const { container } = render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
    await waitFor(() => {
      summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      expect(summaryPanel).not.toBeNull();
    });

    const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
    fireEvent.click(analyzeButton);

    await waitFor(() => {
      expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
    });
  });

  it("AI ANALYZE 결과가 완료되면 Inspector에서 추천 커맨드가 표시된다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });

    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b3",
        command: "npm run build",
        output: "FAIL: unable to resolve module",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\necho npm run build --fix\nnpm run test -- --watch\n```\n",
      });
      resolveStream?.();

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
        expect(within(summaryPanel as HTMLElement).getByText("DONE")).toBeInTheDocument();
        expect(within(summaryPanel as HTMLElement).getByRole("button", { name: "RUN #1" })).toBeInTheDocument();
      });
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("추천 커맨드 RUN #1을 누르면 Inspector 패널이 닫힌다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b5",
        command: "pnpm test",
        output: "FAIL: test failed",
        exitCode: 2,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });
      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\necho pnpm test --watch\nnpm run lint\n```\n",
      });
      resolveStream?.();

      const runFirstButton = await waitFor(() => within(summaryPanel as HTMLElement).getByRole("button", { name: "RUN #1" }));
      fireEvent.click(runFirstButton);

      await waitFor(() => {
        expect(screen.queryByRole("tablist", { name: "Inspector 탭" })).not.toBeInTheDocument();
      });
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("추천 커맨드 RUN #1에서 Blocked 검사 결과면 실행하지 않고 Inspector가 유지된다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      if (cmd === "verify_command_safety") {
        return Promise.resolve({
          level: "Blocked",
          reason: "policy deny",
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd, args) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b7",
        command: "flutter test",
        output: "FAIL: test failed",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });
      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\nflutter analyze\nflutter test\n```\n",
      });
      resolveStream?.();

      const runFirstButton = await waitFor(() => within(summaryPanel as HTMLElement).getByRole("button", { name: "RUN #1" }));
      fireEvent.click(runFirstButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });
      expect(screen.queryByTestId("ai-bar-input")).not.toBeInTheDocument();
      expect(invoke).toHaveBeenCalledWith("verify_command_safety", { command: "flutter analyze" });
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("추천 커맨드 RUN #1에서 Dangerous 검사 결과면 AI 입력바로 이동하고 실행은 보류한다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      if (cmd === "verify_command_safety") {
        return Promise.resolve({
          level: "Dangerous",
          reason: "manual check",
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd, args) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b8",
        command: "npm run lint",
        output: "FAIL: lint error",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });
      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\nnpm run lint --fix\nnpm run test\n```\n",
      });
      resolveStream?.();

      const runFirstButton = await waitFor(() => within(summaryPanel as HTMLElement).getByRole("button", { name: "RUN #1" }));
      fireEvent.click(runFirstButton);

      await waitFor(() => {
        expect(screen.queryByRole("tablist", { name: "Inspector 탭" })).not.toBeInTheDocument();
      });
      const aiBarInput = await screen.findByTestId("ai-bar-input");
      expect(aiBarInput).toHaveValue("npm run lint --fix");
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("추천 커맨드 RUN #1에서 Safe 검사 결과면 즉시 실행 흐름으로 처리된다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      if (cmd === "verify_command_safety") {
        return Promise.resolve({
          level: "Safe",
          reason: "low risk",
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd, args) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b9",
        command: "yarn lint",
        output: "FAIL: lints",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });
      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\nyarn test\nnpm run lint\n```\n",
      });
      resolveStream?.();

      const runFirstButton = await waitFor(() => within(summaryPanel as HTMLElement).getByRole("button", { name: "RUN #1" }));
      fireEvent.click(runFirstButton);

      await waitFor(() => {
        expect(screen.queryByRole("tablist", { name: "Inspector 탭" })).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId("ai-bar-input")).not.toBeInTheDocument();
      expect(invoke).toHaveBeenCalledWith("verify_command_safety", { command: "yarn test" });
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("추천 커맨드 RUN #1에서 Warning 검사 결과도 즉시 실행 흐름으로 처리된다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      if (cmd === "verify_command_safety") {
        return Promise.resolve({
          level: "Warning",
          reason: "potentially risky",
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd, args) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b10",
        command: "pnpm install",
        output: "FAIL: missing lockfile",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });
      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\npnpm update\npnpm install\n```\n",
      });
      resolveStream?.();

      const runFirstButton = await waitFor(() => within(summaryPanel as HTMLElement).getByRole("button", { name: "RUN #1" }));
      fireEvent.click(runFirstButton);

      await waitFor(() => {
        expect(screen.queryByRole("tablist", { name: "Inspector 탭" })).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId("ai-bar-input")).not.toBeInTheDocument();
      expect(invoke).toHaveBeenCalledWith("verify_command_safety", { command: "pnpm update" });
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("추천 커맨드 RUN #1에서 안전도 검사 오류가 나면 Inspector가 즉시 닫히지 않는다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      if (cmd === "verify_command_safety") {
        return Promise.reject(new Error("checker crashed"));
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd, args) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b11",
        command: "go test ./...",
        output: "FAIL: test failed",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });
      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\ngo test ./... -run TestX\n```\n",
      });
      resolveStream?.();

      const runFirstButton = await waitFor(() => within(summaryPanel as HTMLElement).getByRole("button", { name: "RUN #1" }));
      fireEvent.click(runFirstButton);

      expect(await screen.findByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      expect(screen.queryByTestId("ai-bar-input")).not.toBeInTheDocument();
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("추천 명령이 파싱되지 않으면 RUN 버튼이 렌더링되지 않는다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b12",
        command: "python script.py",
        output: "FAIL: syntax error",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({ payload: "추천 가능한 명령이 없습니다." });
      resolveStream?.();

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("DONE")).toBeInTheDocument();
      });
      expect(within(summaryPanel as HTMLElement).queryAllByRole("button", { name: /^RUN #/i })).toHaveLength(0);
      expect(summaryPanel?.querySelector("[data-inspector-command-menu-row='1']")).toBeNull();
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("추천 커맨드가 3개를 초과해도 UI는 상위 3개만 표시한다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b13",
        command: "pytest -q",
        output: "FAIL: timeout",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\ncmd1\ncmd2\ncmd3\ncmd4\ncmd5\n```\n",
      });
      resolveStream?.();

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("DONE")).toBeInTheDocument();
      });
      const runButtons = within(summaryPanel as HTMLElement).getAllByRole("button", { name: /^RUN #/i });
      expect(runButtons).toHaveLength(3);
      expect(within(summaryPanel as HTMLElement).getByRole("button", { name: "RUN #1" })).toBeInTheDocument();
      expect(within(summaryPanel as HTMLElement).getByRole("button", { name: "RUN #3" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "RUN #4" })).not.toBeInTheDocument();
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("compact 모드에서 추천 커맨드 행의 R 키가 실행 처리로 이어져 Inspector가 닫힌다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;
    localStorage.setItem("lum.inspectorDensity", "compact");

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      if (cmd === "verify_command_safety") {
        return Promise.resolve({
          level: "Safe",
          reason: "low risk",
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd, args) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b16",
        command: "npm ci",
        output: "FAIL: cannot find lock",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });
      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\nnpm run build\nnpm run lint\n```\n",
      });
      resolveStream?.();

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("DONE")).toBeInTheDocument();
      });

      const firstRow = container.querySelector("[data-inspector-command-menu-row='1']");
      expect(firstRow).not.toBeNull();
      fireEvent.keyDown(firstRow as HTMLElement, { key: "r" });

      await waitFor(() => {
        expect(screen.queryByRole("tablist", { name: "Inspector 탭" })).not.toBeInTheDocument();
      });
      expect(invoke).toHaveBeenCalledWith("verify_command_safety", { command: "npm run build" });
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      localStorage.removeItem("lum.inspectorDensity");
      resolveStream = null;
    }
  });

  it("compact 모드에서 추천 커맨드 행 메뉴가 열리면 C/L 키가 각각 복사/로드로 동작한다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;
    const writeText = vi.fn().mockResolvedValue(undefined);
    const baseClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    localStorage.setItem("lum.inspectorDensity", "compact");

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b17",
        command: "npm pack",
        output: "FAIL: missing package",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\nnpm run test\nnpm run lint\n```\n",
      });
      resolveStream?.();

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("DONE")).toBeInTheDocument();
      });

      const moreButton = within(summaryPanel as HTMLElement).getAllByRole("button", { name: "MORE" })[0];
      fireEvent.click(moreButton);

      const firstRow = container.querySelector("[data-inspector-command-menu-row='1']");
      expect(firstRow).not.toBeNull();
      fireEvent.keyDown(firstRow as HTMLElement, { key: "c" });

      expect(writeText).toHaveBeenCalledWith("npm run test");

      fireEvent.keyDown(firstRow as HTMLElement, { key: "l" });
      const aiBarInput = await screen.findByTestId("ai-bar-input");
      expect(aiBarInput).toHaveValue("npm run test");
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: baseClipboard });
      localStorage.removeItem("lum.inspectorDensity");
      resolveStream = null;
    }
  });

  it("compact 모드에서 두 번째 추천 커맨드 행의 MORE 메뉴가 열리면 두 번째 행에 대해 C/L 키가 동작한다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;
    const writeText = vi.fn().mockResolvedValue(undefined);
    const baseClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    localStorage.setItem("lum.inspectorDensity", "compact");

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b20",
        command: "npm exec",
        output: "FAIL: script error",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\nnpm run test\nnpm run lint\n```\n",
      });
      resolveStream?.();

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("DONE")).toBeInTheDocument();
      });

      const moreButtonSecond = within(summaryPanel as HTMLElement).getAllByRole("button", { name: "MORE" })[1];
      fireEvent.click(moreButtonSecond);

      const secondRow = container.querySelector("[data-inspector-command-menu-row='2']");
      expect(secondRow).not.toBeNull();
      fireEvent.keyDown(secondRow as HTMLElement, { key: "c" });

      expect(writeText).toHaveBeenCalledWith("npm run lint");

      fireEvent.keyDown(secondRow as HTMLElement, { key: "l" });
      const aiBarInput = await screen.findByTestId("ai-bar-input");
      expect(aiBarInput).toHaveValue("npm run lint");
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: baseClipboard });
      localStorage.removeItem("lum.inspectorDensity");
      resolveStream = null;
    }
  });

  it("compact 모드에서 추천 커맨드 행이 닫힌 상태면 C/L 키는 무시된다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;
    const writeText = vi.fn().mockResolvedValue(undefined);
    const baseClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    localStorage.setItem("lum.inspectorDensity", "compact");

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      if (cmd === "verify_command_safety") {
        return Promise.resolve({
          level: "Safe",
          reason: "low risk",
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd, args) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b18",
        command: "npm ci",
        output: "FAIL: lockfile invalid",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\nnpm run test\nnpm run lint\n```\n",
      });
      resolveStream?.();

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("DONE")).toBeInTheDocument();
      });

      const secondRow = container.querySelector("[data-inspector-command-menu-row='2']");
      expect(secondRow).not.toBeNull();
      fireEvent.keyDown(secondRow as HTMLElement, { key: "c" });
      fireEvent.keyDown(secondRow as HTMLElement, { key: "l" });

      expect(writeText).not.toHaveBeenCalled();
      expect(screen.queryByTestId("ai-bar-input")).not.toBeInTheDocument();
      expect(invoke).not.toHaveBeenCalledWith("verify_command_safety", { command: "npm run lint" });
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: baseClipboard });
      localStorage.removeItem("lum.inspectorDensity");
      resolveStream = null;
    }
  });

  it("compact 모드에서 두 번째 추천 커맨드 행의 R 키는 두 번째 명령을 적용한다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;
    localStorage.setItem("lum.inspectorDensity", "compact");

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      if (cmd === "verify_command_safety") {
        return Promise.resolve({
          level: "Safe",
          reason: "low risk",
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd, args) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b19",
        command: "npm run build",
        output: "FAIL: missing peer dep",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\nnpm run test\nnpm run lint\n```\n",
      });
      resolveStream?.();

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("DONE")).toBeInTheDocument();
      });

      const secondRow = container.querySelector("[data-inspector-command-menu-row='2']");
      expect(secondRow).not.toBeNull();
      fireEvent.keyDown(secondRow as HTMLElement, { key: "r" });

      await waitFor(() => {
        expect(screen.queryByRole("tablist", { name: "Inspector 탭" })).not.toBeInTheDocument();
      });
      expect(invoke).toHaveBeenCalledWith("verify_command_safety", { command: "npm run lint" });
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      localStorage.removeItem("lum.inspectorDensity");
      resolveStream = null;
    }
  });

  it("분석 결과 전체 복사 버튼은 분석 요약을 클립보드에 반영한다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;
    const writeText = vi.fn().mockResolvedValue(undefined);
    const baseClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b14",
        command: "npm run test",
        output: "FAIL: intermittent network",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({ payload: "추천 수정: `npm run test` 를 다시 실행" });
      resolveStream?.();

      const copyAnalyzeButton = await waitFor(
        () => within(summaryPanel as HTMLElement).getByTitle("분석 결과 전체 복사"),
      );
      fireEvent.click(copyAnalyzeButton);

      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Command: npm run test"));
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Status: DONE"));
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("추천 수정: `npm run test` 를 다시 실행"));
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: baseClipboard });
      resolveStream = null;
    }
  });

  it("분석 결과 전체 복사 실패는 앱 예외로 이어지지 않고 패널을 유지한다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    const baseClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b15",
        command: "npm run build",
        output: "FAIL: typescript error",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({ payload: "추천 수정: 타입 에러를 수정해보세요" });
      resolveStream?.();

      const copyAnalyzeButton = await waitFor(
        () => within(summaryPanel as HTMLElement).getByTitle("분석 결과 전체 복사"),
      );
      fireEvent.click(copyAnalyzeButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: baseClipboard });
      resolveStream = null;
    }
  });

  it("추천 커맨드의 COPY/LOAD가 각각 클립보드와 AI 바로 반영된다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;
    const writeText = vi.fn().mockResolvedValue(undefined);
    const baseClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b6",
        command: "cargo test",
        output: "FAIL: compile error",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({
        payload: "```bash\ncargo fmt\ncargo check\ncargo test -q\n```\n",
      });
      resolveStream?.();

      const firstRow = await waitFor(() => container.querySelector("[data-inspector-command-menu-row='1']"));
      const rowCopyButton = within(firstRow as HTMLElement).getByRole("button", { name: "COPY" });
      const rowLoadButton = within(firstRow as HTMLElement).getByRole("button", { name: "LOAD" });

      fireEvent.click(rowCopyButton);
      fireEvent.click(rowLoadButton);

      expect(writeText).toHaveBeenCalledWith("cargo fmt");
      const aiBarInput = await screen.findByTestId("ai-bar-input");
      expect(aiBarInput).toHaveValue("cargo fmt");
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: baseClipboard });
      resolveStream = null;
    }
  });

  it("AI 분석 실패 응답은 ERROR 상태로 표시된다", async () => {
    const tokenHandlers: Array<(event: { payload: string }) => void> = [];
    const mockedListen = vi.mocked(listen);
    const mockedBaseListen = mockedListen.getMockImplementation();
    const mockedBaseInvoke = mockedInvoke.getMockImplementation();
    let resolveStream: (() => void) | null = null;

    mockedListen.mockImplementation((event, callback) => {
      if (event === "xllm_token") {
        tokenHandlers.push((payloadEvent) => callback(payloadEvent));
      }
      return Promise.resolve(() => {});
    });
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
      }
      return mockedBaseInvoke ? mockedBaseInvoke(cmd) : Promise.resolve("{}");
    });

    try {
      setMockCommandBlocks([{
        id: "b4",
        command: "go test ./...",
        output: "FAIL: import cycle",
        exitCode: 1,
        startedAt: 1,
        endedAt: 10,
      }]);
      const { container } = render(<App />);

      const inspectorButton = screen.getByLabelText("Inspector");
      fireEvent.click(inspectorButton);

      await waitFor(() => {
        expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
      });

      let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      await waitFor(() => {
        summaryPanel = container.querySelector("#inspector-tabpanel-summary");
        expect(summaryPanel).not.toBeNull();
      });

      const analyzeButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "AI ANALYZE" });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("STREAMING")).toBeInTheDocument();
      });

      tokenHandlers[0]?.({ payload: "❌ 분석 실행 실패" });
      resolveStream?.();

      await waitFor(() => {
        expect(within(summaryPanel as HTMLElement).getByText("ERROR")).toBeInTheDocument();
      });
    } finally {
      mockedListen.mockImplementation(mockedBaseListen as any);
      mockedInvoke.mockImplementation(mockedBaseInvoke);
      resolveStream = null;
    }
  });

  it("AI 분석 LOAD PROMPT를 누르면 AI 바에 실패 블록 분석 프롬프트가 채워진다", async () => {
    setMockCommandBlocks([{
      id: "b2",
      command: "python -m pytest",
      output: "FAIL: import error",
      exitCode: 1,
      startedAt: 1,
      endedAt: 10,
    }]);
    const { container } = render(<App />);

    const inspectorButton = screen.getByLabelText("Inspector");
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Inspector 탭" })).toBeInTheDocument();
    });

    let summaryPanel = container.querySelector("#inspector-tabpanel-summary");
    await waitFor(() => {
      summaryPanel = container.querySelector("#inspector-tabpanel-summary");
      expect(summaryPanel).not.toBeNull();
    });

    const loadPromptButton = within(summaryPanel as HTMLElement).getByRole("button", { name: "LOAD PROMPT" });
    fireEvent.click(loadPromptButton);

    const aiBarInput = await screen.findByTestId("ai-bar-input");
    expect(aiBarInput).toHaveValue(expect.stringContaining("Command: python -m pytest"));
    expect(aiBarInput).toHaveValue(expect.stringContaining("Exit Code: 1"));
    expect(screen.queryByRole("tablist", { name: "Inspector 탭" })).not.toBeInTheDocument();
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

  it("고급 액션 메뉴 내부 포인터 다운은 바깥 클릭으로 처리되지 않는다", async () => {
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
    const diffButton = await waitFor(() => within(summary).getByRole("button", { name: "Diff" }));

    fireEvent.pointerDown(diffButton);

    expect(within(summary).getByRole("button", { name: "Diff" })).toBeInTheDocument();
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
