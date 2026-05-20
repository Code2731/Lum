import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@xterm/xterm", () => {
  class Terminal {
    options: Record<string, unknown> = {};
    cols = 80;
    rows = 24;
    buffer = { active: { cursorX: 0, cursorY: 0 } };
    loadAddon() {}
    open() {}
    write() {}
    onData() {}
    focus() {}
    dispose() {}
    attachCustomKeyEventHandler() {}
    registerMarker() { return null; }
    registerDecoration() { return null; }
  }
  return { Terminal };
});

vi.mock("@xterm/addon-fit", () => {
  class FitAddon { fit() {} activate() {} dispose() {} }
  return { FitAddon };
});

vi.mock("@xterm/addon-search", () => {
  class SearchAddon {
    findNext() {} findPrevious() {} clearDecorations() {} activate() {} dispose() {}
  }
  return { SearchAddon };
});

import TerminalPane from "./TerminalPane";

beforeEach(() => {
  invokeMock.mockReset();
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string): string | null => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value));
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  });
  try {
    localStorage.removeItem("lum_input_toolbelt_tip_dismissed");
    localStorage.removeItem("lum_toolbelt_show_advanced");
    localStorage.removeItem("lum_toolbelt_show_backend");
    localStorage.removeItem("lum_input_submit_history");
  } catch {}
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "load_app_config") {
      return Promise.resolve({
        ui_show_input_toolbelt_tip: true,
        ui_show_advanced_input_tools: true,
        ui_show_backend_quick_tools: true,
      });
    }
    if (cmd === "spawn_pty") return Promise.resolve();
    if (cmd === "write_to_pty") return Promise.resolve();
    if (cmd === "resize_pty") return Promise.resolve();
    if (cmd === "get_project_context") return Promise.resolve("");
    if (cmd === "get_recent_history") return Promise.resolve([]);
    if (cmd === "generate_ai_command") return Promise.resolve(JSON.stringify({ command: "ls -la" }));
    return Promise.resolve();
  });
});

function submitInput(container: HTMLElement, value: string) {
  const input = container.querySelector("input")!;
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("TerminalPane — 입력 라우팅", () => {
  it("알려진 CLI (ls) → write_to_pty", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
  });

  it("자연어 → onAskAI 호출, PTY는 건드리지 않음", async () => {
    const onAskAI = vi.fn();
    const { container } = render(<TerminalPane id="tab-1" onAskAI={onAskAI} />);
    submitInput(container, "현재 디렉토리 파일 개수 세줘");
    await waitFor(() => {
      expect(onAskAI).toHaveBeenCalledWith("현재 디렉토리 파일 개수 세줘");
    });
    const writeCalls = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
    expect(writeCalls.length).toBe(0);
  });

  it(">> 에이전트 → onAgentTrigger 호출, PTY/AI 모두 안 건드림", async () => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, ">> 이 프로젝트 빌드");
    await waitFor(() => {
      expect(onAgentTrigger).toHaveBeenCalledWith("이 프로젝트 빌드", undefined);
    });
    expect(onAskAI).not.toHaveBeenCalled();
    const writeCalls = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
    expect(writeCalls.length).toBe(0);
  });

  it("@local 코딩 의도 → agent + backend=local", async () => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, "@local src/utils.ts 함수 수정해줘");
    await waitFor(() => {
      expect(onAgentTrigger).toHaveBeenCalledWith("src/utils.ts 함수 수정해줘", "local");
    });
    expect(onAskAI).not.toHaveBeenCalled();
    const writeCalls = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
    expect(writeCalls.length).toBe(0);
  });

  it("@backend + >> 조합 → agent + backend 유지", async () => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, "@local >> 테스트 실패 원인 찾아서 고쳐줘");
    await waitFor(() => {
      expect(onAgentTrigger).toHaveBeenCalledWith("테스트 실패 원인 찾아서 고쳐줘", "local");
    });
    expect(onAskAI).not.toHaveBeenCalled();
    const writeCalls = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
    expect(writeCalls.length).toBe(0);
  });

  it("입력 중 라우팅 칩이 동적으로 바뀐다 (SHELL/AI/AGENT)", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    expect(screen.getByText("AUTO 라우팅")).toBeInTheDocument();
    expect(screen.getByText("BACKEND AUTO (LOCAL→OLLAMA→XLLM→GEMINI)")).toBeInTheDocument();
    expect(screen.getByText("WHY EMPTY")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "ls -la" } });
    expect(screen.getByText("SHELL")).toBeInTheDocument();
    expect(screen.getByText("BACKEND AUTO (LOCAL→OLLAMA→XLLM→GEMINI)")).toBeInTheDocument();
    expect(screen.getByText("WHY HEURISTIC CLI")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "@xllm closure가 뭐야?" } });
    expect(screen.getByText("AI @XLLM")).toBeInTheDocument();
    expect(screen.getByText("BACKEND FORCED @XLLM")).toBeInTheDocument();
    expect(screen.getByText("WHY BACKEND @XLLM")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "@sglang closure가 뭐야?" } });
    expect(screen.getByText("AI @XLLM")).toBeInTheDocument();
    expect(screen.getByText("BACKEND FORCED @XLLM")).toBeInTheDocument();
    expect(screen.getByText("WHY BACKEND @XLLM")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "@local src/utils.ts 함수 수정해줘" } });
    expect(screen.getByText("AGENT @LOCAL")).toBeInTheDocument();
    expect(screen.getByText("BACKEND FORCED @LOCAL")).toBeInTheDocument();
    expect(screen.getByText("WHY BACKEND @LOCAL")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "#로그 요약해줘" } });
    expect(screen.getByText("AI AUTO")).toBeInTheDocument();
    expect(screen.getByText("WHY HEURISTIC INTENT")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "# 로그 요약해줘" } });
    expect(screen.getByText("AI CMD #")).toBeInTheDocument();
    expect(screen.getByText("WHY PREFIX #")).toBeInTheDocument();
  });

  it("툴벨트에 backend 단축키 안내 문구가 노출된다", () => {
    render(<TerminalPane id="tab-1" />);
    expect(
      screen.getByText("Cmd/Ctrl+1~4 토글 · 0 해제 · `/. 정순환 · Shift+`/, 역순환 · Shift+A @첨부 · Shift+B/N BACK/LAST · Shift+K/Z/R/L/M/P 편집 단축키"),
    ).toBeInTheDocument();
  });

  it("입력 툴벨트 TIP 배너는 기본 노출되고 닫으면 사라진다", () => {
    render(<TerminalPane id="tab-1" />);
    expect(screen.getByText(/TIP · Cmd\/Ctrl\+1~4 backend 전환 · Shift\+A @첨부 · Shift\+B\/N BACK\/LAST · Shift\+K\/Z\/R\/L\/M\/P 입력 편집/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "dismiss-input-toolbelt-tip" }));
    expect(screen.queryByText(/TIP · Cmd\/Ctrl\+1~4 backend 전환 · Shift\+A @첨부 · Shift\+B\/N BACK\/LAST · Shift\+K\/Z\/R\/L\/M\/P 입력 편집/)).not.toBeInTheDocument();
  });

  it("설정 값 기반으로 툴벨트 표시가 반영된다", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: false,
          ui_show_advanced_input_tools: false,
          ui_show_backend_quick_tools: false,
        });
      }
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "get_project_context") return Promise.resolve("");
      if (cmd === "get_recent_history") return Promise.resolve([]);
      if (cmd === "generate_ai_command") return Promise.resolve(JSON.stringify({ command: "ls -la" }));
      return Promise.resolve();
    });
    render(<TerminalPane id="tab-1" />);

    await waitFor(() => {
      expect(screen.queryByText(/TIP · Cmd\/Ctrl\+1~4 backend 전환 · Shift\+A @첨부 · Shift\+B\/N BACK\/LAST · Shift\+K\/Z\/R\/L\/M\/P 입력 편집/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-input-merge-recall" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-backend-local" })).not.toBeInTheDocument();
    });
  });

  it("기존 localStorage 값은 config로 마이그레이션되고 즉시 반영된다", async () => {
    try {
      localStorage.setItem("lum_input_toolbelt_tip_dismissed", "1");
      localStorage.setItem("lum_toolbelt_show_advanced", "0");
      localStorage.setItem("lum_toolbelt_show_backend", "0");
    } catch {}
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "get_project_context") return Promise.resolve("");
      if (cmd === "get_recent_history") return Promise.resolve([]);
      if (cmd === "generate_ai_command") return Promise.resolve(JSON.stringify({ command: "ls -la" }));
      return Promise.resolve();
    });

    render(<TerminalPane id="tab-1" />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_ui_preferences", {
        showInputToolbeltTip: false,
        showAdvancedInputTools: false,
        showBackendQuickTools: false,
      });
      expect(localStorage.getItem("lum_input_toolbelt_tip_dismissed")).toBeNull();
      expect(localStorage.getItem("lum_toolbelt_show_advanced")).toBeNull();
      expect(localStorage.getItem("lum_toolbelt_show_backend")).toBeNull();
      expect(screen.queryByText(/TIP · Cmd\/Ctrl\+1~4 backend 전환 · Shift\+A @첨부 · Shift\+B\/N BACK\/LAST · Shift\+K\/Z\/R\/L\/M\/P 입력 편집/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-input-merge-recall" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-backend-local" })).not.toBeInTheDocument();
    });
  });

  it("Cmd/Ctrl+/로 단축키 치트시트를 열고 Esc로 닫는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.queryByText("SHORTCUT CHEATSHEET")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "/", code: "Slash", ctrlKey: true });
    expect(screen.getByText("SHORTCUT CHEATSHEET")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByText("SHORTCUT CHEATSHEET")).not.toBeInTheDocument();
  });

  it("Cmd/Ctrl+K로 Action Palette를 열고 Esc로 닫는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.queryByText("ACTION PALETTE")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
    expect(screen.getByText("ACTION PALETTE")).toBeInTheDocument();

    const paletteInput = screen.getByRole("textbox", { name: "action-palette-input" });
    fireEvent.keyDown(paletteInput, { key: "Escape" });
    expect(screen.queryByText("ACTION PALETTE")).not.toBeInTheDocument();
  });

  it("Action Palette 검색 후 Enter로 액션을 실행한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    expect(input).toHaveValue("");

    fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
    const paletteInput = screen.getByRole("textbox", { name: "action-palette-input" });
    fireEvent.change(paletteInput, { target: { value: "undo" } });
    fireEvent.keyDown(paletteInput, { key: "Enter" });

    expect(screen.queryByText("ACTION PALETTE")).not.toBeInTheDocument();
    expect(input).toHaveValue("alpha");
  });

  it("Action Palette에서 Home/End로 항목 선택 포인트를 이동한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
    const paletteInput = screen.getByRole("textbox", { name: "action-palette-input" });

    let items = screen.getAllByRole("button", { name: /^action-palette-item-/ });
    expect(items[0]).toHaveClass("is-active");
    fireEvent.keyDown(paletteInput, { key: "End" });
    items = screen.getAllByRole("button", { name: /^action-palette-item-/ });
    expect(items[items.length - 1]).toHaveClass("is-active");

    fireEvent.keyDown(paletteInput, { key: "Home" });
    items = screen.getAllByRole("button", { name: /^action-palette-item-/ });
    expect(items[0]).toHaveClass("is-active");

    fireEvent.keyDown(paletteInput, { key: "Escape" });
    expect(screen.queryByText("ACTION PALETTE")).not.toBeInTheDocument();
  });

  it("Action Palette에서 결과가 없을 때 Home/End 입력이 크래시 없이 처리된다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
    const paletteInput = screen.getByRole("textbox", { name: "action-palette-input" });
    fireEvent.change(paletteInput, { target: { value: "__no_match__" } });
    expect(screen.getByText("일치하는 액션이 없습니다.")).toBeInTheDocument();

    fireEvent.keyDown(paletteInput, { key: "Home" });
    expect(screen.getByText("일치하는 액션이 없습니다.")).toBeInTheDocument();

    fireEvent.keyDown(paletteInput, { key: "End" });
    expect(screen.getByText("일치하는 액션이 없습니다.")).toBeInTheDocument();
  });

  it("툴벨트 @ 파일 첨부 버튼으로 첨부 트리거를 삽입하고 목록 로드를 시작한다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
          ui_show_advanced_input_tools: true,
          ui_show_backend_quick_tools: true,
        });
      }
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "list_directory" && args?.path === "/repo") {
        return Promise.resolve([
          { name: "README.md", path: "/repo/README.md", is_dir: false, size: 123 },
        ]);
      }
      return Promise.resolve();
    });

    const { container } = render(<TerminalPane id="tab-1" cwd="/repo" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "분석해줘" } });

    fireEvent.click(screen.getByRole("button", { name: "quick-mention-trigger" }));
    expect(input).toHaveValue("분석해줘 @");

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("list_directory", { path: "/repo" });
    });
  });

  it("빈 입력에서 @ 파일 첨부 버튼을 누르면 멘션 패널이 열리고 항목 선택이 반영된다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
          ui_show_advanced_input_tools: true,
          ui_show_backend_quick_tools: true,
        });
      }
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "list_directory" && args?.path === "/repo") {
        return Promise.resolve([
          { name: "README.md", path: "/repo/README.md", is_dir: false, size: 512 },
        ]);
      }
      return Promise.resolve();
    });

    const { container } = render(<TerminalPane id="tab-1" cwd="/repo" />);
    const input = container.querySelector("input")!;
    expect(input).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "quick-mention-trigger" }));
    expect(input).toHaveValue("@");
    await waitFor(() => expect(screen.getByText(/컨텍스트 첨부/)).toBeInTheDocument());

    const itemButton = screen.getByRole("button", { name: /README\.md/ });
    fireEvent.click(itemButton);

    expect(input).toHaveValue("@README.md ");
  });

  it("선행 공백 + @backend 입력은 멘션 패널을 열지 않는다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
          ui_show_advanced_input_tools: true,
          ui_show_backend_quick_tools: true,
        });
      }
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "list_directory" && args?.path === "/repo") {
        return Promise.resolve([
          { name: "README.md", path: "/repo/README.md", is_dir: false, size: 512 },
        ]);
      }
      return Promise.resolve();
    });

    const { container } = render(<TerminalPane id="tab-1" cwd="/repo" />);
    const input = container.querySelector("input")!;
    await act(async () => {
      fireEvent.change(input, { target: { value: "   @local" } });
      await Promise.resolve();
    });

    const listCalls = invokeMock.mock.calls.filter(
      ([cmd, args]) => cmd === "list_directory" && (args as { path?: string } | undefined)?.path === "/repo",
    );
    expect(listCalls).toHaveLength(0);
    expect(screen.queryByText(/컨텍스트 첨부/)).not.toBeInTheDocument();
  });

  it("멘션 패널에서 Home/End로 항목 선택 포인트를 이동한다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
          ui_show_advanced_input_tools: true,
          ui_show_backend_quick_tools: true,
        });
      }
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "list_directory" && args?.path === "/repo") {
        return Promise.resolve([
          { name: "alpha.md", path: "/repo/alpha.md", is_dir: false, size: 512 },
          { name: "beta.md", path: "/repo/beta.md", is_dir: false, size: 512 },
        ]);
      }
      return Promise.resolve();
    });

    const { container } = render(<TerminalPane id="tab-1" cwd="/repo" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "분석해줘 @" } });
    await waitFor(() => {
      expect(screen.getByText("@alpha.md")).toBeInTheDocument();
      expect(screen.getByText("@beta.md")).toBeInTheDocument();
    });

    const firstMention = screen.getByRole("button", { name: /@alpha\.md/ });
    expect(firstMention).toHaveClass("is-active");

    fireEvent.keyDown(input, { key: "End" });
    expect(screen.getByRole("button", { name: /@beta\.md/ })).toHaveClass("is-active");

    fireEvent.keyDown(input, { key: "Home" });
    expect(screen.getByRole("button", { name: /@alpha\.md/ })).toHaveClass("is-active");
  });

  it("빈 디렉터리에서는 @ 파일 첨부 패널에 빈 상태 메시지가 표시된다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
          ui_show_advanced_input_tools: true,
          ui_show_backend_quick_tools: true,
        });
      }
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "list_directory" && args?.path === "/repo-empty") return Promise.resolve([]);
      return Promise.resolve();
    });

    const { container } = render(<TerminalPane id="tab-1" cwd="/repo-empty" />);
    const input = container.querySelector("input")!;

    fireEvent.click(screen.getByRole("button", { name: "quick-mention-trigger" }));
    expect(input).toHaveValue("@");
    await waitFor(() => expect(screen.getByText("일치하는 항목이 없습니다.")).toBeInTheDocument());
  });

  it("빈 멘션 패널에서 Home/End가 크래시 없이 처리된다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
          ui_show_advanced_input_tools: true,
          ui_show_backend_quick_tools: true,
        });
      }
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "list_directory" && args?.path === "/repo-empty") return Promise.resolve([]);
      return Promise.resolve();
    });

    const { container } = render(<TerminalPane id="tab-1" cwd="/repo-empty" />);
    const input = container.querySelector("input")!;

    fireEvent.click(screen.getByRole("button", { name: "quick-mention-trigger" }));
    expect(input).toHaveValue("@");
    await waitFor(() => expect(screen.getByText("일치하는 항목이 없습니다.")).toBeInTheDocument());

    fireEvent.keyDown(input, { key: "Home" });
    expect(screen.getByText("일치하는 항목이 없습니다.")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "End" });
    expect(screen.getByText("일치하는 항목이 없습니다.")).toBeInTheDocument();
  });

  it("툴벨트 커스터마이징으로 고급 편집/백엔드 버튼 표시를 토글한다", () => {
    render(<TerminalPane id="tab-1" />);

    expect(screen.getByRole("button", { name: "quick-input-merge-recall" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-backend-local" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "toolbelt-customize-toggle" }));
    fireEvent.click(screen.getByRole("button", { name: "toolbelt-toggle-advanced" }));
    fireEvent.click(screen.getByRole("button", { name: "toolbelt-toggle-backend" }));

    expect(screen.queryByRole("button", { name: "quick-input-merge-recall" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-backend-local" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "toolbelt-toggle-advanced" }));
    fireEvent.click(screen.getByRole("button", { name: "toolbelt-toggle-backend" }));
    expect(screen.getByRole("button", { name: "quick-input-merge-recall" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-backend-local" })).toBeInTheDocument();
  });

  it("입력 단축키 Cmd/Ctrl+Shift+A로 @ 파일 첨부 트리거를 삽입한다", () => {
    const { container } = render(<TerminalPane id="tab-1" cwd="/repo" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "분석해줘" } });

    fireEvent.keyDown(input, { key: "A", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("분석해줘 @");
  });

  it("툴벨트 CLEAR/UNDO 버튼으로 입력 초기화 후 즉시 복원할 수 있다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-clear" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "@xllm # 로그 요약해줘" } });
    expect(input).toHaveValue("@xllm # 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-input-clear" })).not.toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "quick-input-clear" })).toHaveAttribute("disabled");
    expect(screen.getByText("AUTO 라우팅")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-undo" }));
    expect(input).toHaveValue("@xllm # 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveAttribute("disabled");
  });

  it("툴벨트 RESET 버튼으로 입력/UNDO/RECALL 상태를 한 번에 초기화한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-reset-all" })).toHaveAttribute("disabled");

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    fireEvent.change(input, { target: { value: "temp" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    expect(screen.getByRole("button", { name: "quick-input-undo" })).not.toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-reset-all" }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-rerun" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-reset-all" })).toHaveAttribute("disabled");
  });

  it("툴벨트 UNDO는 다중 CLEAR 이력을 LIFO 순서로 복원한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 2");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-undo" }));
    expect(input).toHaveValue("second");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    fireEvent.click(screen.getByRole("button", { name: "quick-input-undo" }));
    expect(input).toHaveValue("second");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-undo" }));
    expect(input).toHaveValue("first");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveAttribute("disabled");
  });

  it("툴벨트 FORGET 버튼으로 CLEAR 복원 이력을 비운다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-forget-undo" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    fireEvent.change(input, { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 2");
    expect(screen.getByRole("button", { name: "quick-input-forget-undo" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-forget-undo" }));
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-forget-undo" })).toHaveAttribute("disabled");
  });

  it("동일 입력을 연속 CLEAR해도 UNDO 스택은 중복 저장하지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "same" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");

    fireEvent.change(input, { target: { value: "same" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");
  });

  it("툴벨트 STOP 버튼으로 인터럽트(SIGINT)를 전송한다", async () => {
    render(<TerminalPane id="tab-1" />);
    fireEvent.click(screen.getByRole("button", { name: "quick-input-stop" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "\u0003",
      });
    });
  });

  it("입력 단축키 Cmd/Ctrl+Shift+C로 인터럽트(SIGINT)를 전송한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "sleep 30" } });
    fireEvent.keyDown(input, { key: "C", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "\u0003",
      });
    });
  });

  it("툴벨트 RECALL 버튼으로 직전 실행 입력을 복원한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent(/^RECALL$/);
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveAttribute("disabled");

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL ls -la");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).not.toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-rerun" })).toHaveTextContent("RERUN ls -la");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-recall" }));
    expect(input).toHaveValue("ls -la");
  });

  it("툴벨트 HISTORY 패널에서 실행 입력을 선택해 복원한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-history-open" })).toHaveAttribute("disabled");

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    submitInput(container, "pwd");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    const historyOpen = screen.getByRole("button", { name: "quick-input-history-open" });
    expect(historyOpen).not.toHaveAttribute("disabled");
    fireEvent.click(historyOpen);
    expect(screen.getByText("INPUT HISTORY")).toBeInTheDocument();
    expect(screen.getByLabelText("input-history-shortcuts")).toHaveTextContent("Del/Backspace 삭제");
    expect(screen.getByLabelText("input-history-shortcuts")).toHaveTextContent("Shift+↑/↓ 범위 선택");
    expect(screen.getByLabelText("input-history-shortcuts")).toHaveTextContent("Shift+클릭 범위 선택");
    expect(screen.getByLabelText("input-history-shortcuts")).toHaveTextContent("Cmd/Ctrl+A 전체 선택");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-item-1" }));
    expect(screen.queryByText("INPUT HISTORY")).not.toBeInTheDocument();
    expect(input).toHaveValue("ls -la");
  });

  it("HISTORY CLEAR로 실행 입력 기록을 비운다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-clear" }));
    expect(screen.getByText("기록된 실행 입력이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-history-open" })).toHaveTextContent("HISTORY");
  });

  it("HISTORY DEL로 개별 실행 입력을 삭제하고 RECALL 대상을 갱신한다", async () => {
    render(<TerminalPane id="tab-1" />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("pwd");
    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-remove-0" }));

    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("ls -la");
    expect(screen.getByRole("button", { name: "quick-input-history-open" })).toHaveTextContent("HISTORY 1");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL ls -la");
  });

  it("HISTORY 검색창에서 필터 후 Enter/Escape 키로 복원/닫기를 처리한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    submitInput(container, "npm test");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "npm test\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.change(search, { target: { value: "npm" } });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("npm test");

    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.queryByText("INPUT HISTORY")).not.toBeInTheDocument();
    expect(input).toHaveValue("npm test");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const reopenSearch = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.keyDown(reopenSearch, { key: "Escape" });
    expect(screen.queryByText("INPUT HISTORY")).not.toBeInTheDocument();
  });

  it("HISTORY 검색창에서 Home/End로 항목 선택 포인트를 이동한다", async () => {
    render(<TerminalPane id="tab-1" />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    fireEvent.change(input, { target: { value: "npm test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "npm test\r",
      });
    });
    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    let historyItems = screen.getAllByRole("button", { name: /^quick-input-history-item-\d+$/ });
    expect(historyItems[0].parentElement).toHaveClass("lum-overlay-split-row is-active");

    fireEvent.keyDown(search, { key: "End" });
    historyItems = screen.getAllByRole("button", { name: /^quick-input-history-item-\d+$/ });
    expect(historyItems[historyItems.length - 1].parentElement).toHaveClass("lum-overlay-split-row is-active");

    fireEvent.keyDown(search, { key: "Home" });
    historyItems = screen.getAllByRole("button", { name: /^quick-input-history-item-\d+$/ });
    expect(historyItems[0].parentElement).toHaveClass("lum-overlay-split-row is-active");
  });

  it("HISTORY 검색창에서 결과가 없을 때 Home/End를 눌러도 크래시나 예외가 없어야 함", async () => {
    render(<TerminalPane id="tab-1" />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    fireEvent.change(input, { target: { value: "npm test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "npm test\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.change(search, { target: { value: "zzz-no-match" } });
    expect(screen.getByText("기록된 실행 입력이 없습니다.")).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Home" });
    expect(screen.getByText("기록된 실행 입력이 없습니다.")).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "End" });
    expect(screen.getByText("기록된 실행 입력이 없습니다.")).toBeInTheDocument();
  });

  it("HISTORY 검색창에서 Delete/Backspace 키로 선택 항목을 삭제한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    submitInput(container, "npm test");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "npm test\r",
      });
    });
    submitInput(container, "pwd");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.change(search, { target: { value: "p" } });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("pwd");

    fireEvent.keyDown(search, { key: "Delete" });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("npm test");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL npm test");

    fireEvent.change(search, { target: { value: "ls" } });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("ls -la");
    fireEvent.keyDown(search, { key: "Backspace" });
    expect(screen.queryByRole("button", { name: "quick-input-history-item-0" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-history-open" })).toHaveTextContent("HISTORY 1");
  });

  it("HISTORY 검색창에서 Shift+Arrow + Delete로 범위를 일괄 삭제한다", async () => {
    render(<TerminalPane id="tab-1" />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "npm test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "npm test\r",
      });
    });

    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("pwd");
    expect(screen.getByRole("button", { name: "quick-input-history-item-1" })).toHaveTextContent("npm test");
    expect(screen.getByRole("button", { name: "quick-input-history-item-2" })).toHaveTextContent("ls -la");

    fireEvent.keyDown(search, { key: "ArrowDown", shiftKey: true });
    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2 selected");
    expect(screen.getByLabelText("input-history-selected-preview")).toHaveTextContent("pwd");
    expect(screen.getByLabelText("input-history-selected-preview")).toHaveTextContent("npm test");
    fireEvent.keyDown(search, { key: "Delete" });

    expect(screen.queryByLabelText("input-history-selected-count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-input-history-item-1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("ls -la");
    expect(screen.getByRole("button", { name: "quick-input-history-open" })).toHaveTextContent("HISTORY 1");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL ls -la");
  });

  it("HISTORY 목록에서 Shift+클릭으로 범위를 선택하고 Delete로 일괄 삭제한다", async () => {
    render(<TerminalPane id="tab-1" />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "npm test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "npm test\r",
      });
    });

    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-item-1" }), { shiftKey: true });

    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2 selected");
    expect(screen.getByText("INPUT HISTORY")).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Delete" });
    expect(screen.queryByLabelText("input-history-selected-count")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("ls -la");
    expect(screen.getByRole("button", { name: "quick-input-history-open" })).toHaveTextContent("HISTORY 1");
  });

  it("HISTORY 검색창에서 Cmd/Ctrl+A로 필터 결과 전체 선택 후 Delete로 일괄 삭제한다", async () => {
    render(<TerminalPane id="tab-1" />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "npm test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "npm test\r",
      });
    });

    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.change(search, { target: { value: "p" } });

    fireEvent.keyDown(search, { key: "a", ctrlKey: true });
    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2 selected");

    fireEvent.keyDown(search, { key: "Delete" });
    expect(screen.queryByLabelText("input-history-selected-count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-input-history-item-0" })).not.toBeInTheDocument();
    expect(screen.getByText("기록된 실행 입력이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-history-open" })).toHaveTextContent("HISTORY 1");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL ls -la");
  });

  it("HISTORY 선택 해제 버튼으로 멀티 선택 상태만 초기화한다", async () => {
    render(<TerminalPane id="tab-1" />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "npm test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "npm test\r",
      });
    });

    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const search = screen.getByRole("textbox", { name: "input-history-search" });

    fireEvent.keyDown(search, { key: "ArrowDown", shiftKey: true });
    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2 selected");
    expect(screen.getByRole("button", { name: "quick-input-history-clear-selection" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-clear-selection" }));
    expect(screen.queryByLabelText("input-history-selected-count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-input-history-clear-selection" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("pwd");
    expect(screen.getByRole("button", { name: "quick-input-history-item-1" })).toHaveTextContent("npm test");
    expect(screen.getByRole("button", { name: "quick-input-history-item-2" })).toHaveTextContent("ls -la");
  });

  it("HISTORY 멀티 선택 상태에서 Esc는 먼저 선택만 해제하고, 다시 누르면 패널을 닫는다", async () => {
    render(<TerminalPane id="tab-1" />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "npm test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "npm test\r",
      });
    });

    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-open" }));
    const search = screen.getByRole("textbox", { name: "input-history-search" });

    fireEvent.keyDown(search, { key: "ArrowDown", shiftKey: true });
    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2 selected");

    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByLabelText("input-history-selected-count")).not.toBeInTheDocument();
    expect(screen.getByText("INPUT HISTORY")).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByText("INPUT HISTORY")).not.toBeInTheDocument();
  });

  it("툴벨트 RECALL로 교체된 입력은 UNDO로 직전 입력 복원이 가능하다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-recall" }));
    expect(input).toHaveValue("ls -la");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-undo" }));
    expect(input).toHaveValue("pwd");
  });

  it("툴벨트 SET RECALL 버튼으로 실행 없이 현재 입력을 RECALL 대상으로 저장한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-set-recall" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "   echo custom command   " } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-set-recall" }));
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL echo custom comm…");
    expect(screen.getByRole("button", { name: "quick-input-rerun" })).not.toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-recall" }));
    expect(input).toHaveValue("echo custom command");
  });

  it("툴벨트 FORGET RECALL 버튼으로 직전 실행 입력 기록을 비운다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    expect(screen.getByRole("button", { name: "quick-input-forget-recall" })).toHaveAttribute("disabled");

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL ls -la");
    expect(screen.getByRole("button", { name: "quick-input-forget-recall" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-forget-recall" }));
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-rerun" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-swap" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-forget-recall" })).toHaveAttribute("disabled");
  });

  it("실행되지 않는 # 입력은 RECALL 대상을 덮어쓰지 않는다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL ls -la");

    submitInput(container, "# 로그 요약 명령어 만들어줘");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL ls -la");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-recall" }));
    expect(input).toHaveValue("ls -la");
  });

  it("툴벨트 RERUN 버튼으로 직전 실행 입력을 즉시 재실행한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    expect(screen.getByRole("button", { name: "quick-input-rerun" })).toHaveAttribute("disabled");

    submitInput(container, "pwd");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });
    expect(screen.getByRole("button", { name: "quick-input-rerun" })).not.toHaveAttribute("disabled");

    const writeCallsBefore = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length;
    fireEvent.click(screen.getByRole("button", { name: "quick-input-rerun" }));
    await waitFor(() => {
      const writeCallsAfter = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
      expect(writeCallsAfter.length).toBe(writeCallsBefore + 1);
      expect(writeCallsAfter[writeCallsAfter.length - 1]).toEqual([
        "write_to_pty",
        { id: "tab-1", data: "pwd\r" },
      ]);
    });
  });

  it("툴벨트 SWAP 버튼으로 현재 입력과 직전 실행 입력을 교환한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-swap" })).toHaveAttribute("disabled");

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    fireEvent.change(input, { target: { value: "pwd" } });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-swap" }));
    expect(input).toHaveValue("ls -la");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL pwd");
  });

  it("RECALL/SWAP/SET RECALL은 no-op 상태에서 비활성화된다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    expect(screen.getByRole("button", { name: "quick-input-recall" })).not.toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-swap" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-recall" }));
    expect(input).toHaveValue("ls -la");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-swap" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-set-recall" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "pwd" } });
    expect(screen.getByRole("button", { name: "quick-input-recall" })).not.toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-swap" })).not.toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-set-recall" })).not.toHaveAttribute("disabled");
  });

  it("툴벨트 MERGE 버튼으로 현재 입력 뒤에 직전 실행 입력을 붙인다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-merge-recall" })).toHaveAttribute("disabled");

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    expect(screen.getByRole("button", { name: "quick-input-merge-recall" })).not.toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "echo done" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-merge-recall" }));
    expect(input).toHaveValue("echo done ls -la");
    expect(screen.getByRole("button", { name: "quick-input-merge-recall" })).toHaveAttribute("disabled");
  });

  it("툴벨트 PREPEND 버튼으로 현재 입력 앞에 직전 실행 입력을 붙인다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-prepend-recall" })).toHaveAttribute("disabled");

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    expect(screen.getByRole("button", { name: "quick-input-prepend-recall" })).not.toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "echo done" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-prepend-recall" }));
    expect(input).toHaveValue("ls -la echo done");
    expect(screen.getByRole("button", { name: "quick-input-prepend-recall" })).toHaveAttribute("disabled");
  });

  it("툴벨트 PLAIN 버튼으로 강제 프리픽스를 제거하고 일반 입력으로 전환한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-plain" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "@xllm # 로그 요약해줘" } });
    expect(screen.getByRole("button", { name: "quick-input-plain" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-plain" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-input-plain" })).toHaveAttribute("disabled");
    expect(screen.getByText("AI AUTO")).toBeInTheDocument();
  });

  it("툴벨트 TRIM 버튼으로 입력 앞뒤 공백을 정리한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-trim" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "   @xllm 로그 요약해줘   " } });
    expect(screen.getByRole("button", { name: "quick-input-trim" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-trim" }));
    expect(input).toHaveValue("@xllm 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-input-trim" })).toHaveAttribute("disabled");
  });

  it("툴벨트 SQUASH 버튼으로 연속 공백을 한 칸으로 압축한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-squash" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "echo    hello   world" } });
    expect(screen.getByRole("button", { name: "quick-input-squash" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-squash" }));
    expect(input).toHaveValue("echo hello world");
    expect(screen.getByRole("button", { name: "quick-input-squash" })).toHaveAttribute("disabled");
  });

  it("툴벨트 CLEAN 버튼으로 trim+squash를 한 번에 수행한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.getByRole("button", { name: "quick-input-clean" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "   echo    hello   world   " } });
    expect(screen.getByRole("button", { name: "quick-input-clean" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-clean" }));
    expect(input).toHaveValue("echo hello world");
    expect(screen.getByRole("button", { name: "quick-input-clean" })).toHaveAttribute("disabled");
  });

  it("툴벨트 CLEAN으로 바뀐 입력은 UNDO로 원복할 수 있다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "   echo    hello   world   " } });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-clean" }));
    expect(input).toHaveValue("echo hello world");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-undo" }));
    expect(input).toHaveValue("   echo    hello   world   ");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+K/Z/R로 CLEAR/UNDO/RECALL을 실행한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "K", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");

    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("pwd");

    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+L/M/P로 CLEAN/MERGE/PREPEND를 실행한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "   echo    done   " } });
    fireEvent.keyDown(input, { key: "L", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("echo done");

    fireEvent.keyDown(input, { key: "M", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("echo done ls -la");

    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.keyDown(input, { key: "P", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la pwd");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+S/F로 SET/FORGET RECALL을 실행한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "  echo shortcut  " } });
    fireEvent.keyDown(input, { key: "S", ctrlKey: true, shiftKey: true });
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL echo shortcut");
    expect(screen.getByRole("button", { name: "quick-input-rerun" })).not.toHaveAttribute("disabled");

    fireEvent.keyDown(input, { key: "F", ctrlKey: true, shiftKey: true });
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-input-rerun" })).toHaveAttribute("disabled");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+X/D로 RESET/FORGET(UNDO)을 실행한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "temp" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");
    expect(screen.getByRole("button", { name: "quick-input-forget-undo" })).not.toHaveAttribute("disabled");

    fireEvent.keyDown(input, { key: "D", ctrlKey: true, shiftKey: true });
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO");
    expect(screen.getByRole("button", { name: "quick-input-forget-undo" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "다시 입력" } });
    expect(screen.getByRole("button", { name: "quick-input-reset-all" })).not.toHaveAttribute("disabled");
    fireEvent.keyDown(input, { key: "X", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "quick-input-reset-all" })).toHaveAttribute("disabled");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+E/W로 RERUN/SWAP을 실행한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "pwd");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    const writeCallsBefore = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length;
    fireEvent.keyDown(input, { key: "E", ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      const writeCallsAfter = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
      expect(writeCallsAfter.length).toBe(writeCallsBefore + 1);
      expect(writeCallsAfter[writeCallsAfter.length - 1]).toEqual([
        "write_to_pty",
        { id: "tab-1", data: "pwd\r" },
      ]);
    });

    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "W", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("pwd");
    expect(screen.getByRole("button", { name: "quick-input-recall" })).toHaveTextContent("RECALL ls -la");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+B/N으로 BACK/LAST backend를 복원한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-local" }));
    fireEvent.click(screen.getByRole("button", { name: "quick-backend-gemini" }));
    expect(input).toHaveValue("@gemini 로그 요약해줘");

    fireEvent.keyDown(input, { key: "B", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-auto" }));
    expect(input).toHaveValue("로그 요약해줘");
    fireEvent.keyDown(input, { key: "N", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+O로 AUTO 해제/복원을 토글한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "@gemini 로그 요약해줘" } });

    fireEvent.keyDown(input, { key: "O", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.getByText("AI AUTO")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "O", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@gemini 로그 요약해줘");
    expect(screen.getByText("AI @GEMINI")).toBeInTheDocument();
  });

  it("입력 단축키 Cmd/Ctrl+Shift+1~4/0으로 backend를 지정/해제한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.keyDown(input, { key: "1", code: "Digit1", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");

    fireEvent.keyDown(input, { key: "3", code: "Digit3", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@xllm 로그 요약해줘");

    fireEvent.keyDown(input, { key: "0", code: "Digit0", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.getByText("AI AUTO")).toBeInTheDocument();
  });

  it("입력 단축키 Cmd/Ctrl+Shift+←/→로 backend를 순환한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.keyDown(input, { key: "ArrowRight", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");

    fireEvent.keyDown(input, { key: "ArrowRight", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@ollama 로그 요약해줘");

    fireEvent.keyDown(input, { key: "ArrowLeft", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+G/T/Q로 PLAIN/TRIM/SQUASH를 실행한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "   @xllm 로그    요약해줘   " } });
    fireEvent.keyDown(input, { key: "G", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("   로그    요약해줘");

    fireEvent.keyDown(input, { key: "T", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("로그    요약해줘");

    fireEvent.keyDown(input, { key: "Q", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("로그 요약해줘");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+H/Y/J/U로 모드 프리픽스를 토글한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.keyDown(input, { key: "H", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("!! 로그 요약해줘");

    fireEvent.keyDown(input, { key: "Y", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("!로그 요약해줘");

    fireEvent.keyDown(input, { key: "J", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue(">> 로그 요약해줘");

    fireEvent.keyDown(input, { key: "U", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("? 로그 요약해줘");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+V/I로 # Cmd와 @ AI 모드를 토글한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.keyDown(input, { key: "V", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("# 로그 요약해줘");

    fireEvent.keyDown(input, { key: "I", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@로그 요약해줘");
  });

  it("툴벨트 !/>>/? 버튼으로 입력 모드 프리픽스를 토글한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.click(screen.getByRole("button", { name: "quick-mode-agent" }));
    expect(input).toHaveValue(">> 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-mode-agent" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("AGENT AUTO")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "quick-mode-agent" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-mode-agent" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "quick-mode-shell" }));
    expect(input).toHaveValue("!로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-mode-shell" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "quick-mode-explain" }));
    expect(input).toHaveValue("? 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-mode-shell" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "quick-mode-explain" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "quick-mode-ai-cmd" }));
    expect(input).toHaveValue("# 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-mode-ai-cmd" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "quick-mode-explain" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("AI CMD #")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "quick-mode-force-ai" }));
    expect(input).toHaveValue("@로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-mode-force-ai" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "quick-mode-ai-cmd" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("AI AUTO")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "quick-mode-force-ai" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-mode-force-ai" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "quick-mode-heavy" }));
    expect(input).toHaveValue("!! 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-mode-heavy" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "quick-mode-shell" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("HEAVY !!")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "quick-mode-heavy" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-mode-heavy" })).toHaveAttribute("aria-pressed", "false");
  });

  it("공백 없는 #/? 입력은 quick mode 활성으로 취급하지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    const explainBtn = screen.getByRole("button", { name: "quick-mode-explain" });
    const aiCmdBtn = screen.getByRole("button", { name: "quick-mode-ai-cmd" });

    fireEvent.change(input, { target: { value: "#로그 요약해줘" } });
    expect(aiCmdBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.change(input, { target: { value: "?로그 요약해줘" } });
    expect(explainBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("선행 공백 + @ 강제 AI 입력도 force-ai 토글로 정상 해제된다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "   @로그 요약해줘" } });

    const forceAiButton = screen.getByRole("button", { name: "quick-mode-force-ai" });
    expect(forceAiButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(forceAiButton);
    expect(input).toHaveValue("   로그 요약해줘");
    expect(forceAiButton).toHaveAttribute("aria-pressed", "false");
  });

  it("선행 공백 입력에서 force-ai 토글 ON 시 @ 위치를 보존한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    const forceAiButton = screen.getByRole("button", { name: "quick-mode-force-ai" });

    fireEvent.change(input, { target: { value: "   로그 요약해줘" } });
    fireEvent.click(forceAiButton);

    expect(input).toHaveValue("   @로그 요약해줘");
    expect(forceAiButton).toHaveAttribute("aria-pressed", "true");
  });

  it("선행 공백 + quick mode prefix도 토글로 정상 해제된다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    const shellButton = screen.getByRole("button", { name: "quick-mode-shell" });

    fireEvent.change(input, { target: { value: "   !로그 요약해줘" } });
    expect(shellButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(shellButton);
    expect(input).toHaveValue("   로그 요약해줘");
    expect(shellButton).toHaveAttribute("aria-pressed", "false");
  });

  it("툴벨트 이전/다음 버튼으로 backend를 순환한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-next" }));
    expect(input).toHaveValue("@local 로그 요약해줘");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-next" }));
    expect(input).toHaveValue("@ollama 로그 요약해줘");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-prev" }));
    expect(input).toHaveValue("@local 로그 요약해줘");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-prev" }));
    expect(input).toHaveValue("로그 요약해줘");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-prev" }));
    expect(input).toHaveValue("@gemini 로그 요약해줘");
  });

  it("툴벨트 quick backend 버튼으로 입력 프리픽스를 즉시 전환", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-local" }));
    expect(input).toHaveValue("@local 로그 요약해줘");
    expect(screen.getByText("AI @LOCAL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-backend-local" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "quick-backend-auto" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-xllm" }));
    expect(input).toHaveValue("@xllm 로그 요약해줘");
    expect(screen.getByText("AI @XLLM")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-backend-xllm" })).toHaveAttribute("aria-pressed", "true");

    // 같은 backend 버튼을 한 번 더 누르면 AUTO로 해제된다.
    fireEvent.click(screen.getByRole("button", { name: "quick-backend-xllm" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.getByText("AI AUTO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-backend-auto" })).toHaveAttribute("aria-pressed", "true");
  });

  it("툴벨트 LAST 버튼으로 마지막 backend를 복원한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    expect(screen.getByRole("button", { name: "quick-backend-last" })).toHaveTextContent("LAST @LOCAL");
    expect(screen.getByRole("button", { name: "quick-backend-last" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-xllm" }));
    expect(input).toHaveValue("@xllm 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-backend-last" })).toHaveTextContent("LAST @XLLM");
    expect(screen.getByRole("button", { name: "quick-backend-last" })).toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-auto" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-backend-last" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-last" }));
    expect(input).toHaveValue("@xllm 로그 요약해줘");
  });

  it("툴벨트 BACK 버튼으로 직전 backend를 왕복 전환한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    expect(screen.getByRole("button", { name: "quick-backend-back" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "quick-backend-back" })).toHaveTextContent("BACK @-");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-local" }));
    fireEvent.click(screen.getByRole("button", { name: "quick-backend-gemini" }));
    expect(input).toHaveValue("@gemini 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-backend-back" })).toHaveTextContent("BACK @LOCAL");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-back" }));
    expect(input).toHaveValue("@local 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-backend-back" })).toHaveTextContent("BACK @GEMINI");
  });

  it("툴벨트 AUTO 버튼으로 backend 강제 프리픽스를 해제하고, AUTO 상태 재클릭 시 LAST를 복원", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "@gemini 로그 요약해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-backend-auto" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.getByText("AI AUTO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-backend-auto" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "quick-backend-gemini" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-auto" }));
    expect(input).toHaveValue("@gemini 로그 요약해줘");
    expect(screen.getByText("AI @GEMINI")).toBeInTheDocument();
  });

  it("선행 공백 + @backend 입력도 AUTO 해제 시 공백을 보존한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "   @xllm 로그 요약해줘" } });

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-auto" }));
    expect(input).toHaveValue("   로그 요약해줘");
  });

  it("! 강제 shell → 자연어여도 PTY", async () => {
    const onAskAI = vi.fn();
    const { container } = render(<TerminalPane id="tab-1" onAskAI={onAskAI} />);
    submitInput(container, "!안녕_shell");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "안녕_shell\r",
      });
    });
    expect(onAskAI).not.toHaveBeenCalled();
  });

  it("@ 강제 AI → ls여도 AI Chat", async () => {
    const onAskAI = vi.fn();
    const { container } = render(<TerminalPane id="tab-1" onAskAI={onAskAI} />);
    submitInput(container, "@ls 왜 에러?");
    await waitFor(() => {
      expect(onAskAI).toHaveBeenCalledWith("ls 왜 에러?");
    });
    const writeCalls = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
    expect(writeCalls.length).toBe(0);
  });

  it("@local prefix → backend=local로 AI Chat 호출", async () => {
    const onAskAI = vi.fn();
    const { container } = render(<TerminalPane id="tab-1" onAskAI={onAskAI} />);
    submitInput(container, "@local 최근 로그 요약해줘");
    await waitFor(() => {
      expect(onAskAI).toHaveBeenCalledWith("최근 로그 요약해줘", undefined, undefined, "local");
    });
    const writeCalls = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
    expect(writeCalls.length).toBe(0);
  });

  it("@sglang prefix → backend=xllm로 AI Chat 호출", async () => {
    const onAskAI = vi.fn();
    const { container } = render(<TerminalPane id="tab-1" onAskAI={onAskAI} />);
    submitInput(container, "@sglang 최신 로그 요약해줘");
    await waitFor(() => {
      expect(onAskAI).toHaveBeenCalledWith("최신 로그 요약해줘", undefined, undefined, "xllm");
    });
    const writeCalls = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
    expect(writeCalls.length).toBe(0);
  });

  it("@sglang + coding intent → agent + backend=xllm 호출", async () => {
    const onAgentTrigger = vi.fn();
    const { container } = render(<TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} />);
    submitInput(container, "@sglang 파일 수정해줘");
    await waitFor(() => {
      expect(onAgentTrigger).toHaveBeenCalledWith("파일 수정해줘", "xllm");
    });
  });

  it("./run.sh 같은 경로 → shell", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    submitInput(container, "./run.sh");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "./run.sh\r",
      });
    });
  });

  it("id prop이 다른 PTY로 라우팅됨", async () => {
    const { container } = render(<TerminalPane id="split-xyz" />);
    submitInput(container, "pwd");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "split-xyz",
        data: "pwd\r",
      });
    });
  });

  it("@ 첨부 메뉴에서 Enter로 파일 토큰을 입력창에 삽입", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
          ui_show_advanced_input_tools: true,
          ui_show_backend_quick_tools: true,
        });
      }
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "list_directory" && args?.path === "/repo") {
        return Promise.resolve([
          { name: "README.md", path: "/repo/README.md", is_dir: false, size: 123 },
        ]);
      }
      return Promise.resolve();
    });

    const { container } = render(<TerminalPane id="tab-1" cwd="/repo" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "설명해줘 @rea" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("list_directory", { path: "/repo" });
    });

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(input).toHaveValue("설명해줘 @README.md ");
    });
  });

  it("@ 첨부 메뉴에서 디렉토리 Enter 시 drill-down 후 파일 첨부 가능", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
          ui_show_advanced_input_tools: true,
          ui_show_backend_quick_tools: true,
        });
      }
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "list_directory" && args?.path === "/repo") {
        return Promise.resolve([
          { name: "src", path: "/repo/src", is_dir: true, size: 0 },
        ]);
      }
      if (cmd === "list_directory" && args?.path === "/repo/src") {
        return Promise.resolve([
          { name: "App.tsx", path: "/repo/src/App.tsx", is_dir: false, size: 321 },
        ]);
      }
      return Promise.resolve();
    });

    const { container } = render(<TerminalPane id="tab-1" cwd="/repo" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "분석 @s" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("list_directory", { path: "/repo" });
    });

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("list_directory", { path: "/repo/src" });
    });
    await waitFor(() => {
      expect(container.textContent).toContain("@src/App.tsx");
    });

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(input).toHaveValue("분석 @src/App.tsx ");
    });
  });

  it("aiMessages가 비어있으면 AIBlockStream 미렌더", () => {
    const { queryByTestId } = render(<TerminalPane id="tab-1" aiMessages={[]} />);
    expect(queryByTestId("ai-block-stream")).toBeNull();
  });

  it("aiMessages가 있으면 AIBlockStream 렌더", () => {
    const messages = [
      { id: "1", role: "user" as const, content: "안녕", timestamp: Date.now() },
      { id: "2", role: "assistant" as const, content: "네 안녕하세요", timestamp: Date.now() },
    ];
    const { getByTestId } = render(
      <TerminalPane id="tab-1" aiMessages={messages} aiStreaming={false} />,
    );
    expect(getByTestId("ai-block-stream")).toBeInTheDocument();
  });
});
