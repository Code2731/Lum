import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";

const invokeMock = vi.fn();
type WriteSpy = ReturnType<typeof vi.fn>;

type ClipboardState = {
  writeText: WriteSpy;
  restore: () => void;
};

function setupClipboardWriteMock(): ClipboardState {
  const nav = globalThis.navigator as Navigator & {
    clipboard?: { writeText: WriteSpy };
  };
  const originalClipboard = nav.clipboard;
  const writeText = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  return {
    writeText,
    restore: () => {
      if (originalClipboard) {
        Object.defineProperty(globalThis.navigator, "clipboard", {
          configurable: true,
          value: originalClipboard,
        });
      } else {
        delete (globalThis.navigator as Navigator & { clipboard?: { writeText: WriteSpy } }).clipboard;
      }
    },
  };
}

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

function openActionPalette() {
  if (screen.queryByRole("button", { name: "action-palette-item-clear" })) return;
  fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
}

function openInputHistoryPanel() {
  openActionPalette();
  fireEvent.click(screen.getByRole("button", { name: "action-palette-item-history_open" }));
}

function clearInputWithShortcut(input: HTMLInputElement) {
  fireEvent.keyDown(input, { key: "K", ctrlKey: true, shiftKey: true });
}

function expectHistoryActionDisabled() {
  openActionPalette();
  expect(screen.getByRole("button", { name: "action-palette-item-history_open" })).toHaveAttribute("disabled");
}

function expectHistoryActionEnabled() {
  openActionPalette();
  expect(screen.getByRole("button", { name: "action-palette-item-history_open" })).not.toHaveAttribute("disabled");
}

function expectRecallActionDisabled() {
  openActionPalette();
  expect(screen.getByRole("button", { name: "action-palette-item-recall" })).toHaveAttribute("disabled");
}

function expectRecallActionEnabled() {
  openActionPalette();
  expect(screen.getByRole("button", { name: "action-palette-item-recall" })).not.toHaveAttribute("disabled");
}

function expectUndoActionDisabled() {
  openActionPalette();
  expect(screen.getByRole("button", { name: "action-palette-item-undo" })).toHaveAttribute("disabled");
}

function expectUndoActionEnabled() {
  openActionPalette();
  expect(screen.getByRole("button", { name: "action-palette-item-undo" })).not.toHaveAttribute("disabled");
}

function expectClearActionDisabled() {
  openActionPalette();
  expect(screen.getByRole("button", { name: "action-palette-item-clear" })).toHaveAttribute("disabled");
}

function expectClearActionEnabled() {
  openActionPalette();
  expect(screen.getByRole("button", { name: "action-palette-item-clear" })).not.toHaveAttribute("disabled");
}

const TOOLBELT_TIP_FULL =
  "TIP · Cmd/Ctrl+1~4/0 백엔드 직접 지정·해제 · Cmd/Ctrl+./, 백엔드 직접 순환 · Cmd/Ctrl+Shift+A @첨부 · Cmd/Ctrl+Shift+B/N 백엔드 이전/마지막 · Cmd/Ctrl+Shift+K/Z/R/L/M/P 입력 편집";
const TOOLBELT_TIP_NARROW =
  "TIP · Cmd/Ctrl+1~4/0 백엔드 직접 지정·해제 · Cmd/Ctrl+./, 백엔드 직접 순환 · Shift+A @첨부 · Shift+B/N 백엔드 이전/마지막 · Shift+K/Z/R/L/M/P 편집";

describe("TerminalPane — 시작 안내와 입력 도크", () => {
  it("초기 랜딩 상태에서 입력 흐름 안내를 보여준다", () => {
    render(<TerminalPane id="tab-landing" />);

    expect(screen.getByLabelText("터미널 시작 안내")).toBeInTheDocument();
    expect(screen.getByText("질문 또는 명령 입력")).toBeInTheDocument();
    expect(screen.getByText("라우팅 확인")).toBeInTheDocument();
    expect(screen.getByText("터미널·AI 결과 검토")).toBeInTheDocument();
  });

  it("입력 도크에 현재 입력 상태 흐름을 보여준다", () => {
    render(<TerminalPane id="tab-dock" />);

    expect(screen.getByLabelText("터미널 입력 도크")).toBeInTheDocument();
    expect(screen.getByText("AI 랜딩")).toBeInTheDocument();
    expect(screen.getByText("텍스트 입력 준비")).toBeInTheDocument();
    expect(screen.getByText("입력 대기")).toBeInTheDocument();
  });
});

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

  it("CLI처럼 보이는 자연어 수정 요청 → agent", async () => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, "patch the auth issue");
    await waitFor(() => {
      expect(onAgentTrigger).toHaveBeenCalledWith("patch the auth issue", undefined);
    });
    expect(onAskAI).not.toHaveBeenCalled();
    const writeCalls = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
    expect(writeCalls.length).toBe(0);
  });

  it("@backend + CLI처럼 보이는 자연어 수정 요청 → agent + backend 유지", async () => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, "@local patch the auth issue");
    await waitFor(() => {
      expect(onAgentTrigger).toHaveBeenCalledWith("patch the auth issue", "local");
    });
    expect(onAskAI).not.toHaveBeenCalled();
    const writeCalls = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
    expect(writeCalls.length).toBe(0);
  });

  it("@sglang + CLI처럼 보이는 자연어 수정 요청 → agent + backend=xllm 유지", async () => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, "@sglang patch the auth issue");
    await waitFor(() => {
      expect(onAgentTrigger).toHaveBeenCalledWith("patch the auth issue", "xllm");
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

  it("@backend + 탭/개행 >> 조합 → agent + backend 유지", async () => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, "@local\t>> 테스트 실패 원인 찾아서 고쳐줘");
    await waitFor(() => {
      expect(onAgentTrigger).toHaveBeenCalledWith("테스트 실패 원인 찾아서 고쳐줘", "local");
    });
    expect(onAskAI).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length).toBe(0);
  });

  it("@backend + 개행 >> 입력은 단일 라인 input에서 AI fallback으로 처리된다", async () => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, "@xllm\n>> resolve the parse error");
    await waitFor(() => {
      expect(onAskAI).toHaveBeenCalledWith("xllm>> resolve the parse error");
    });
    expect(onAgentTrigger).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length).toBe(0);
  });

  it.each([
    "@local >>",
    "@local\t>>",
    "@xllm >>   ",
    "@cloud\t>>\t",
    "@OLLAMA  >>\t   ",
  ])("%s 뒤에 실제 작업이 없으면 실행은 생략된다", async (input) => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, input);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onAgentTrigger).not.toHaveBeenCalled();
    expect(onAskAI).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length).toBe(0);
  });

  it("@local hi 단독 입력은 backend 강제 AI 질의로 실행된다", async () => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, "@local hi");
    await waitFor(() => {
      expect(onAskAI).toHaveBeenCalledWith("hi", undefined, undefined, "local");
    });

    expect(onAgentTrigger).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length).toBe(0);
  });

  it.each([
    {
      label: "@local 단독 입력",
      input: "@local",
      expected: "@local ",
    },
    {
      label: "Alias + 앞뒤 공백",
      input: " @Embedded   ",
      expected: "@local ",
    },
    {
      label: "탭/개행 혼합 xllm",
      input: "\t@xllm\n",
      expected: "@xllm ",
    },
    {
      label: "개행/공백 혼합 cloud",
      input: "\n@Cloud   \t",
      expected: "@gemini ",
    },
    {
      label: "CR 단독 입력",
      input: "\r@local",
      expected: "@local ",
    },
    {
      label: "CRLF 단독 입력",
      input: "\r\n@Cloud\r\n",
      expected: "@gemini ",
    },
  ])("$label Enter는 즉시 실행되지 않고 canonical prefix 상태로 유지된다", async ({ input, expected }) => {
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAskAI={onAskAI} />,
    );
    const inputEl = container.querySelector("input")!;

    fireEvent.change(inputEl, { target: { value: input } });
    fireEvent.keyDown(inputEl, { key: "Enter" });

    expect(onAskAI).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length).toBe(0);
    expect(inputEl).toHaveValue(expected);
  });

  it.each([
    "@",
    "@  ",
    "@\r",
    "\r@",
    "\r\n@  ",
    "  @ local ",
    "\t @xllm ",
    "@ollama",
    "@xllm",
    "@gemini",
    "@embedded",
    "@cloud",
    "  @local   ",
    "\t@xllm\t",
    "   @ollama\n",
    "  @gemini   ",
    "   @cloud   ",
    "  @embedded \t",
    "@LOCAL",
    "@xLlM",
    "@Gemini",
  ])("%s 단독 입력은 실행이 생략된다", async (input) => {
    const onAgentTrigger = vi.fn();
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAgentTrigger={onAgentTrigger} onAskAI={onAskAI} />,
    );
    submitInput(container, input);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onAgentTrigger).not.toHaveBeenCalled();
    expect(onAskAI).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length).toBe(0);
  });

  it("입력 중 라우팅 칩이 동적으로 바뀐다 (셸/AI/에이전트)", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
    expect(screen.queryByText("BACKEND AUTO (LOCAL→OLLAMA→XLLM→GEMINI)")).not.toBeInTheDocument();
    expect(screen.queryByText("WHY EMPTY")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.blur(input);
    expect(screen.getByText("셸")).toBeInTheDocument();
    expect(screen.queryByText("BACKEND AUTO (LOCAL→OLLAMA→XLLM→GEMINI)")).not.toBeInTheDocument();
    expect(screen.queryByText("WHY HEURISTIC CLI")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "@xllm closure가 뭐야?" } });
    expect(screen.getByText("AI @XLLM")).toBeInTheDocument();
    expect(screen.getByText("백엔드 강제 @XLLM")).toBeInTheDocument();
    expect(screen.queryByText("WHY BACKEND @XLLM")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "@sglang closure가 뭐야?" } });
    expect(screen.getByText("AI @XLLM")).toBeInTheDocument();
    expect(screen.getByText("백엔드 강제 @XLLM")).toBeInTheDocument();
    expect(screen.queryByText("WHY BACKEND @XLLM")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "@local src/utils.ts 함수 수정해줘" } });
    expect(screen.getByText("에이전트 @LOCAL")).toBeInTheDocument();
    expect(screen.getByText("백엔드 강제 @LOCAL")).toBeInTheDocument();
    expect(screen.queryByText("WHY BACKEND @LOCAL")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "#로그 요약해줘" } });
    expect(screen.getByText("AI 자동")).toBeInTheDocument();
    expect(screen.queryByText("WHY HEURISTIC INTENT")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "# 로그 요약해줘" } });
    expect(screen.getByText("AI 명령 #")).toBeInTheDocument();
    expect(screen.queryByText("WHY PREFIX #")).not.toBeInTheDocument();
  });

  it("백엔드 단독 입력에서는 라우팅 칩이 표시되지 않는다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "   @xllm   " } });
    expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
    expect(screen.queryByText("백엔드 강제 @XLLM")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "\t@local\t>>\t" } });
    expect(screen.queryByText("에이전트 @LOCAL")).not.toBeInTheDocument();
    expect(screen.getByText("백엔드 강제 @LOCAL")).toBeInTheDocument();
  });

  it("백엔드 단독 입력 alias/대문자 조합도 칩이 표시되지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "@LOCAL" } });
    expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
    expect(screen.queryByText("백엔드 강제 @LOCAL")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: " @Cloud   " } });
    expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
    expect(screen.queryByText("백엔드 강제 @GEMINI")).not.toBeInTheDocument();
  });

  it("백엔드 단독 입력(개행/탭 조합)에서도 칩이 표시되지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "\n@cloud   " } });
    expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
    expect(screen.queryByText("백엔드 강제 @GEMINI")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "\t@Embedded\n" } });
    expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
    expect(screen.queryByText("백엔드 강제 @LOCAL")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "\r@xllm\r" } });
    expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
    expect(screen.queryByText("백엔드 강제 @XLLM")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "\r\n@Cloud\r\n" } });
    expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
    expect(screen.queryByText("백엔드 강제 @GEMINI")).not.toBeInTheDocument();
  });

  it.each([
    "\n@Cloud  \t",
    "\r@xllm\r",
    "\r\n@gemini\r\n",
  ])("백엔드 단독 Enter는 실행 이력에 저장되지 않는다", async (rawInput) => {
    const onAskAI = vi.fn();
    const { container } = render(
      <TerminalPane id="tab-1" onAskAI={onAskAI} />,
    );
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: rawInput } });
    fireEvent.keyDown(input, { key: "Enter" });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onAskAI).not.toHaveBeenCalled();
    expect(invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length).toBe(0);
    expect(localStorage.getItem("lum_input_submit_history")).toBeNull();
    expectRecallActionDisabled();
  });

  it("백엔드 단독 입력 Enter 연타 시 매번 정규화 유지되고 실행되지 않는다", async () => {
    const onAskAI = vi.fn();
    const { container } = render(<TerminalPane id="tab-1" onAskAI={onAskAI} />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "@xllm   \n" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(input).toHaveValue("@xllm ");
    expect(invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length).toBe(0);

    fireEvent.keyDown(input, { key: "Enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(input).toHaveValue("@xllm ");
    expect(invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length).toBe(0);
    expect(onAskAI).not.toHaveBeenCalled();
  });

  it("선행 공백 + # 탭 입력도 AI 명령 제안 호출 시 prefix를 제외한 prompt를 전달한다", async () => {
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
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "   #\t로그 요약해줘" } });

    await waitFor(() => {
      const call = invokeMock.mock.calls.find(
        ([cmd, args]) =>
          cmd === "generate_ai_command"
          && (args as { prompt?: string } | undefined)?.prompt === "로그 요약해줘",
      );
      expect(call).toBeTruthy();
    }, { timeout: 2500 });
  });

  it("선행 공백 + ? 탭 입력도 explain 호출 시 prefix를 제외한 command를 전달한다", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_app_config") return Promise.resolve({});
      if (cmd === "spawn_pty") return Promise.resolve();
      if (cmd === "write_to_pty") return Promise.resolve();
      if (cmd === "resize_pty") return Promise.resolve();
      if (cmd === "explain_command") return Promise.resolve("ok");
      return Promise.resolve();
    });
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "   ?\tgit status" } });

    await waitFor(() => {
      const call = invokeMock.mock.calls.find(
        ([cmd, args]) =>
          cmd === "explain_command"
          && (args as { command?: string } | undefined)?.command === "git status",
      );
      expect(call).toBeTruthy();
    }, { timeout: 2500 });
  });

  it("툴벨트에 backend 단축키 안내 문구를 기본 노출하지 않는다", () => {
    render(<TerminalPane id="tab-1" />);
    const fullHint = "Cmd/Ctrl+1~4/0 지정·해제 · Cmd/Ctrl+./, 순환 · Cmd/Ctrl+Shift+←/→ 역순환 · Cmd/Ctrl+Shift+A @첨부 · Cmd/Ctrl+Shift+B/N 백엔드 이전/마지막 · Cmd/Ctrl+Shift+K/Z/R/L/M/P 편집";
    const compactHint = "Cmd/Ctrl+1~4/0 · Cmd/Ctrl+./, · Cmd/Ctrl+Shift+←/→";
    expect(screen.queryByText(fullHint)).not.toBeInTheDocument();
    expect(screen.queryByText(compactHint)).not.toBeInTheDocument();
  });

  it("입력 툴벨트 TIP 배너는 기본 비노출이다", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
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
      expect(screen.queryByText(TOOLBELT_TIP_FULL)).not.toBeInTheDocument();
      expect(screen.queryByText(TOOLBELT_TIP_NARROW)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "dismiss-input-toolbelt-tip" })).not.toBeInTheDocument();
    });
  });

  it("설정 값 기반으로 툴벨트 표시가 반영된다", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: false,
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
      expect(screen.queryByText(TOOLBELT_TIP_FULL)).not.toBeInTheDocument();
      expect(screen.queryByText(TOOLBELT_TIP_NARROW)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-input-merge-recall" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-mode-shell" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-backend-local" })).not.toBeInTheDocument();
    });
  });

  it("간단 모드에서는 툴벨트 토글 없이 핵심 액션 버튼만 노출된다", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
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
      expect(screen.queryByRole("button", { name: "toolbelt-toggle-compact" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "quick-input-action-palette" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-input-clear" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-mention-trigger" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-backend-local" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-mode-shell" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-input-merge-recall" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-input-undo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-input-stop" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "터미널 표시/숨김 (shell 명령 실행 시 자동 표시)" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "비전 모드 — 이미지 첨부 활성화" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "추론 체인 표시 — <think> 블록 보이기 (전역 설정 토글)" })).not.toBeInTheDocument();
      expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
      expect(screen.queryByText("WHY EMPTY")).not.toBeInTheDocument();
      expect(screen.queryByText("BACKEND AUTO (LOCAL→OLLAMA→XLLM→GEMINI)")).not.toBeInTheDocument();
      expect(screen.queryByText("터미널 OFF")).not.toBeInTheDocument();
      expect(screen.queryByText(/MODEL /)).not.toBeInTheDocument();
      expect(screen.queryByText(/CWD /)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "quick-input-action-palette" })).toHaveTextContent("K");
    });

    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "action-palette-item-clear" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-interrupt" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-mention_attach" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-set_recall" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-forget_recall" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-swap_recall" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-merge_recall" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-prepend_recall" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-toggle_terminal" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-toggle_vision" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "action-palette-item-toggle_reasoning" })).toBeInTheDocument();
    });
  });

  it("입력 툴벨트 TIP 배너는 backend 지정·해제와 순환 단축키를 함께 노출한다", async () => {
    render(<TerminalPane id="tab-1" />);

    await waitFor(() => {
      expect(screen.getByText(TOOLBELT_TIP_NARROW)).toBeInTheDocument();
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
      });
      expect(localStorage.getItem("lum_input_toolbelt_tip_dismissed")).toBeNull();
      expect(localStorage.getItem("lum_toolbelt_show_advanced")).toBeNull();
      expect(localStorage.getItem("lum_toolbelt_show_backend")).toBeNull();
      expect(screen.queryByText(TOOLBELT_TIP_FULL)).not.toBeInTheDocument();
      expect(screen.queryByText(TOOLBELT_TIP_NARROW)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-input-merge-recall" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "quick-backend-local" })).not.toBeInTheDocument();
    });
  });

  it("Cmd/Ctrl+/로 단축키 치트시트를 열고 Esc로 닫는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.queryByText("단축키 치트시트")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "/", code: "Slash", ctrlKey: true });
    expect(screen.getByText("단축키 치트시트")).toBeInTheDocument();
    expect(screen.getByText("Cmd/Ctrl+Shift+C · 인터럽트")).toBeInTheDocument();
    expect(screen.getByText("Cmd/Ctrl+1~4/0 · 백엔드 직접 지정/해제")).toBeInTheDocument();
    expect(screen.getByText("Cmd/Ctrl+./, · 백엔드 직접 순환")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByText("단축키 치트시트")).not.toBeInTheDocument();
  });

  it("Cmd/Ctrl+K로 Action Palette를 열고 Esc로 닫는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.queryByText("액션 팔레트")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
    expect(screen.getByText("액션 팔레트")).toBeInTheDocument();

    const paletteInput = screen.getByRole("textbox", { name: "action-palette-input" });
    fireEvent.keyDown(paletteInput, { key: "Escape" });
    expect(screen.queryByText("액션 팔레트")).not.toBeInTheDocument();
  });

  it("Action Palette placeholder는 백엔드 예시를 노출한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
    expect(screen.getByText("액션 팔레트")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "action-palette-input" })).toHaveAttribute(
      "placeholder",
      "액션 검색 (예: 지우기, 복원, 백엔드)",
    );
  });

  it("Action Palette의 백엔드 액션 라벨이 한국어로 표시된다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
    const paletteInput = screen.getByRole("textbox", { name: "action-palette-input" });
    fireEvent.change(paletteInput, { target: { value: "backend" } });

    expect(screen.getByText("백엔드 자동 토글")).toBeInTheDocument();
    expect(screen.getByText("백엔드 이전")).toBeInTheDocument();
    expect(screen.getByText("백엔드 마지막")).toBeInTheDocument();
  });

  it("입력 단축키 Cmd/Ctrl+Alt+K는 Action Palette를 열지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.queryByText("액션 팔레트")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true, altKey: true });
    expect(screen.queryByText("액션 팔레트")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("입력 단축키 Cmd/Ctrl+Alt+Shift+K는 Action Palette를 열지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "echo done" } });

    fireEvent.keyDown(input, { key: "K", ctrlKey: true, shiftKey: true, altKey: true });
    expect(screen.queryByText("액션 팔레트")).not.toBeInTheDocument();
    expect(input).toHaveValue("echo done");
  });

  it("입력 단축키 Cmd/Ctrl+Alt+1은 backend quick prefix를 토글하지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.keyDown(input, { key: "1", code: "Digit1", ctrlKey: true, altKey: true });
    expect(input).toHaveValue("로그 요약해줘");
  });

  it("입력 단축키 Cmd/Ctrl+Alt+/는 단축키 치트시트를 열지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.queryByText("단축키 치트시트")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "/", code: "Slash", ctrlKey: true, altKey: true });
    expect(screen.queryByText("단축키 치트시트")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("입력 단축키 Cmd/Ctrl+Alt+Shift+C는 인터럽트를 전송하지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "sleep 30" } });

    fireEvent.keyDown(input, { key: "C", ctrlKey: true, shiftKey: true, altKey: true });
    expect(input).toHaveValue("sleep 30");
    const interruptCalls = invokeMock.mock.calls.filter(
      ([cmd, args]) => cmd === "write_to_pty" && (args as { data?: string } | undefined)?.data === "\u0003",
    );
    expect(interruptCalls.length).toBe(0);
  });

  it("Action Palette 검색 후 Enter로 액션을 실행한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "alpha" } });
    clearInputWithShortcut(input);
    expect(input).toHaveValue("");

    fireEvent.keyDown(input, { key: "k", code: "KeyK", ctrlKey: true });
    const paletteInput = screen.getByRole("textbox", { name: "action-palette-input" });
    fireEvent.change(paletteInput, { target: { value: "undo" } });
    fireEvent.keyDown(paletteInput, { key: "Enter" });

    expect(screen.queryByText("액션 팔레트")).not.toBeInTheDocument();
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
    expect(screen.queryByText("액션 팔레트")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-mention_attach" }));
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

    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-mention_attach" }));
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

    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-mention_attach" }));
    expect(input).toHaveValue("@");
    await waitFor(() => expect(screen.getByText("일치하는 항목이 없습니다.")).toBeInTheDocument());
  });

  it("빈 멘션 패널에서 Home/End가 크래시 없이 처리된다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          ui_show_input_toolbelt_tip: true,
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

    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-mention_attach" }));
    expect(input).toHaveValue("@");
    await waitFor(() => expect(screen.getByText("일치하는 항목이 없습니다.")).toBeInTheDocument());

    fireEvent.keyDown(input, { key: "Home" });
    expect(screen.getByText("일치하는 항목이 없습니다.")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "End" });
    expect(screen.getByText("일치하는 항목이 없습니다.")).toBeInTheDocument();
  });

  it("전체 툴벨트에서는 고급 토글/인라인 RECALL 없이 액션 팔레트만 사용한다", async () => {
    render(<TerminalPane id="tab-1" />);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "quick-input-recall" })).not.toBeInTheDocument();
      expectRecallActionDisabled();
      expect(screen.queryByRole("button", { name: "toolbelt-toggle-advanced" })).not.toBeInTheDocument();
    });
  });

  it("입력 단축키 Cmd/Ctrl+Shift+A로 @ 파일 첨부 트리거를 삽입한다", () => {
    const { container } = render(<TerminalPane id="tab-1" cwd="/repo" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "분석해줘" } });

    fireEvent.keyDown(input, { key: "A", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("분석해줘 @");
  });

  it("툴벨트 CLEAR 후 UNDO 단축키로 입력을 즉시 복원할 수 있다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expectClearActionDisabled();

    fireEvent.change(input, { target: { value: "@xllm # 로그 요약해줘" } });
    expect(input).toHaveValue("@xllm # 로그 요약해줘");
    expectClearActionEnabled();
    expectUndoActionDisabled();

    clearInputWithShortcut(input);
    expect(input).toHaveValue("");
    expectClearActionDisabled();
    expect(screen.queryByText("AUTO 라우팅")).not.toBeInTheDocument();
    expectUndoActionEnabled();

    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@xllm # 로그 요약해줘");
    expectUndoActionDisabled();
  });

  it("Action Palette RESET으로 입력/UNDO/RECALL 상태를 한 번에 초기화한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expect(screen.queryByRole("button", { name: "quick-input-reset-all" })).not.toBeInTheDocument();

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    fireEvent.change(input, { target: { value: "temp" } });
    clearInputWithShortcut(input);
    expectUndoActionEnabled();
    expectRecallActionEnabled();

    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-reset" }));
    expect(input).toHaveValue("");
    expectUndoActionDisabled();
    expectRecallActionDisabled();
    openActionPalette();
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).toHaveAttribute("disabled");
    expect(screen.queryByRole("button", { name: "quick-input-reset-all" })).not.toBeInTheDocument();
  });

  it("UNDO 단축키는 다중 CLEAR 이력을 LIFO 순서로 복원한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "first" } });
    clearInputWithShortcut(input);
    fireEvent.change(input, { target: { value: "second" } });
    clearInputWithShortcut(input);
    expectUndoActionEnabled();

    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("second");

    clearInputWithShortcut(input);
    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("second");

    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("first");
    expectUndoActionDisabled();
  });

  it("입력 단축키 FORGET으로 CLEAR 복원 이력을 비운다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expectUndoActionDisabled();

    fireEvent.change(input, { target: { value: "alpha" } });
    clearInputWithShortcut(input);
    fireEvent.change(input, { target: { value: "beta" } });
    clearInputWithShortcut(input);
    expectUndoActionEnabled();

    fireEvent.keyDown(input, { key: "D", ctrlKey: true, shiftKey: true });
    expectUndoActionDisabled();
  });

  it("동일 입력을 연속 CLEAR해도 UNDO 스택은 중복 저장하지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "same" } });
    clearInputWithShortcut(input);
    expectUndoActionEnabled();

    fireEvent.change(input, { target: { value: "same" } });
    clearInputWithShortcut(input);
    expectUndoActionEnabled();
    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("same");
    expectUndoActionDisabled();
  });

  it("Action Palette 인터럽트로 AI 스트림 취소와 인터럽트(SIGINT)를 전송한다", async () => {
    const onCancelAI = vi.fn();
    render(<TerminalPane id="tab-1" onCancelAI={onCancelAI} />);
    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-interrupt" }));
    expect(onCancelAI).toHaveBeenCalled();
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

  it("입력 단축키 Cmd/Ctrl+Shift+R로 직전 실행 입력을 복원한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expectRecallActionDisabled();

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    expect(input).toHaveValue("");
    expectRecallActionEnabled();
    openActionPalette();
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).not.toHaveAttribute("disabled");

    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
  });

  it("저장된 실행 입력 히스토리가 있으면 초기 렌더에서 RECALL/RERUN이 활성화된다", async () => {
    localStorage.setItem("lum_input_submit_history", JSON.stringify(["pwd"]));
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    await waitFor(() => {
      expectRecallActionEnabled();
    });
    openActionPalette();
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).not.toHaveAttribute("disabled");
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("pwd");
  });

  it("저장 히스토리 선두가 비실행 항목이어도 실행 가능한 다음 항목으로 RECALL을 복원한다", async () => {
    localStorage.setItem("lum_input_submit_history", JSON.stringify(["@local ", "pwd"]));
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    await waitFor(() => {
      expectRecallActionEnabled();
    });
    openActionPalette();
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).not.toHaveAttribute("disabled");
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("pwd");
  });

  it("툴벨트 HISTORY 패널에서 실행 입력을 선택해 복원한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    expectHistoryActionDisabled();

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

    expectHistoryActionEnabled();
    openInputHistoryPanel();
    expect(screen.getByText("입력 히스토리")).toBeInTheDocument();
    expect(screen.getByLabelText("input-history-shortcuts")).toHaveTextContent("Del/Backspace 삭제");
    expect(screen.getByLabelText("input-history-shortcuts")).toHaveTextContent("Shift+↑/↓ 범위 선택");
    expect(screen.getByLabelText("input-history-shortcuts")).toHaveTextContent("Shift+클릭 범위 선택");
    expect(screen.getByLabelText("input-history-shortcuts")).toHaveTextContent("Cmd/Ctrl+A 전체 선택");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-item-1" }));
    expect(screen.queryByText("입력 히스토리")).not.toBeInTheDocument();
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

    openInputHistoryPanel();
    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-clear" }));
    expect(screen.getByText("기록된 실행 입력이 없습니다.")).toBeInTheDocument();
    expectHistoryActionDisabled();
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

    openInputHistoryPanel();
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("pwd");
    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-remove-0" }));

    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("ls -la");
    expectHistoryActionEnabled();
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
  });

  it("HISTORY DEL 후 선두 비실행 항목을 건너뛰고 RECALL 대상을 갱신한다", async () => {
    localStorage.setItem("lum_input_submit_history", JSON.stringify(["@local ", "pwd", "ls -la"]));
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    await waitFor(() => {
      expectRecallActionEnabled();
    });

    openInputHistoryPanel();
    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-remove-1" }));

    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
    openActionPalette();
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).not.toHaveAttribute("disabled");
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

    openInputHistoryPanel();
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.change(search, { target: { value: "npm" } });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("npm test");

    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.queryByText("입력 히스토리")).not.toBeInTheDocument();
    expect(input).toHaveValue("npm test");

    openInputHistoryPanel();
    const reopenSearch = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.keyDown(reopenSearch, { key: "Escape" });
    expect(screen.queryByText("입력 히스토리")).not.toBeInTheDocument();
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

    openInputHistoryPanel();
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

    openInputHistoryPanel();
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
    const input = screen.getByRole("textbox");

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

    openInputHistoryPanel();
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.change(search, { target: { value: "p" } });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("pwd");

    fireEvent.keyDown(search, { key: "Delete" });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("npm test");
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("npm test");

    fireEvent.change(search, { target: { value: "ls" } });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("ls -la");
    fireEvent.keyDown(search, { key: "Backspace" });
    expect(screen.queryByRole("button", { name: "quick-input-history-item-0" })).not.toBeInTheDocument();
    expectHistoryActionEnabled();
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

    openInputHistoryPanel();
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("pwd");
    expect(screen.getByRole("button", { name: "quick-input-history-item-1" })).toHaveTextContent("npm test");
    expect(screen.getByRole("button", { name: "quick-input-history-item-2" })).toHaveTextContent("ls -la");

    fireEvent.keyDown(search, { key: "ArrowDown", shiftKey: true });
    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2개 선택");
    expect(screen.getByLabelText("input-history-selected-preview")).toHaveTextContent("pwd");
    expect(screen.getByLabelText("input-history-selected-preview")).toHaveTextContent("npm test");
    fireEvent.keyDown(search, { key: "Delete" });

    expect(screen.queryByLabelText("input-history-selected-count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-input-history-item-1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("ls -la");
    expectHistoryActionEnabled();
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
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

    openInputHistoryPanel();
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-history-item-1" }), { shiftKey: true });

    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2개 선택");
    expect(screen.getByText("입력 히스토리")).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Delete" });
    expect(screen.queryByLabelText("input-history-selected-count")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-history-item-0" })).toHaveTextContent("ls -la");
    expectHistoryActionEnabled();
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

    openInputHistoryPanel();
    const search = screen.getByRole("textbox", { name: "input-history-search" });
    fireEvent.change(search, { target: { value: "p" } });

    fireEvent.keyDown(search, { key: "a", ctrlKey: true });
    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2개 선택");

    fireEvent.keyDown(search, { key: "Delete" });
    expect(screen.queryByLabelText("input-history-selected-count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-input-history-item-0" })).not.toBeInTheDocument();
    expect(screen.getByText("기록된 실행 입력이 없습니다.")).toBeInTheDocument();
    expectHistoryActionEnabled();
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
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

    openInputHistoryPanel();
    const search = screen.getByRole("textbox", { name: "input-history-search" });

    fireEvent.keyDown(search, { key: "ArrowDown", shiftKey: true });
    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2개 선택");
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

    openInputHistoryPanel();
    const search = screen.getByRole("textbox", { name: "input-history-search" });

    fireEvent.keyDown(search, { key: "ArrowDown", shiftKey: true });
    expect(screen.getByLabelText("input-history-selected-count")).toHaveTextContent("2개 선택");

    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByLabelText("input-history-selected-count")).not.toBeInTheDocument();
    expect(screen.getByText("입력 히스토리")).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByText("입력 히스토리")).not.toBeInTheDocument();
  });

  it("RECALL 단축키로 교체된 입력은 UNDO로 직전 입력 복원이 가능하다", async () => {
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
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
    expectUndoActionEnabled();

    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("pwd");
  });

  it("Action Palette SET RECALL 액션으로 실행 없이 현재 입력을 RECALL 대상으로 저장한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    expect(screen.getByRole("button", { name: "action-palette-item-set_recall" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "   echo custom command   " } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-set_recall" }));
    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    expect(screen.getByRole("button", { name: "action-palette-item-recall" })).not.toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).not.toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("echo custom command");
  });

  it("공백만 다른 동일 입력은 SET RECALL 대상으로 다시 저장하지 않는다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "  echo hello  ");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "echo hello\r",
      });
    });

    fireEvent.change(input, { target: { value: "echo hello" } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    expect(screen.getByRole("button", { name: "action-palette-item-set_recall" })).toHaveAttribute("disabled");
  });

  it("공백만 다른 동일 입력에서는 SWAP 단축키가 no-op이고 RECALL은 원본을 복원한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "  echo hello  ");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "echo hello\r",
      });
    });

    fireEvent.change(input, { target: { value: "echo hello" } });
    fireEvent.keyDown(input, { key: "W", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("echo hello");
    expectRecallActionEnabled();
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("  echo hello  ");
  });

  it("backend prefix-only 입력은 SET RECALL 대상으로 저장하지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "@local " } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    expect(screen.getByRole("button", { name: "action-palette-item-set_recall" })).toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-set_recall" }));
    fireEvent.keyDown(input, { key: "S", ctrlKey: true, shiftKey: true });

    expect(screen.getByRole("button", { name: "action-palette-item-recall" })).toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).toHaveAttribute("disabled");
  });

  it("backend prefix-only 입력에서는 FOCUS 툴벨트 압축을 켜지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    const toolbeltRail = container.querySelector(".lum-toolbelt-rail");
    expect(toolbeltRail).toBeTruthy();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "@local " } });
    expect(toolbeltRail).not.toHaveClass("lum-toolbelt-rail--focus");

    fireEvent.change(input, { target: { value: "pwd" } });
    expect(toolbeltRail).toHaveClass("lum-toolbelt-rail--focus");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+F로 직전 실행 입력 기록을 비운다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });
    expectRecallActionEnabled();

    fireEvent.keyDown(input, { key: "F", ctrlKey: true, shiftKey: true });
    expectRecallActionDisabled();
    openActionPalette();
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).toHaveAttribute("disabled");
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
    expectRecallActionEnabled();

    submitInput(container, "# 로그 요약 명령어 만들어줘");
    expectRecallActionEnabled();

    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
  });

  it("Action Palette RERUN 액션으로 직전 실행 입력을 즉시 재실행한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    openActionPalette();
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).toHaveAttribute("disabled");

    submitInput(container, "pwd");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });
    openActionPalette();
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).not.toHaveAttribute("disabled");

    const writeCallsBefore = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length;
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-rerun" }));
    await waitFor(() => {
      const writeCallsAfter = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty");
      expect(writeCallsAfter.length).toBe(writeCallsBefore + 1);
      expect(writeCallsAfter[writeCallsAfter.length - 1]).toEqual([
        "write_to_pty",
        { id: "tab-1", data: "pwd\r" },
      ]);
    });
  });

  it("입력 단축키 Cmd/Ctrl+Shift+W로 현재 입력과 직전 실행 입력을 교환한다", async () => {
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

    fireEvent.keyDown(input, { key: "W", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("pwd");
  });

  it("비실행 현재 입력에서 SWAP 단축키는 no-op이고 RECALL/RERUN 상태를 유지한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "pwd");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.change(input, { target: { value: "@local " } });
    fireEvent.keyDown(input, { key: "W", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@local ");
    expectRecallActionEnabled();
    openActionPalette();
    expect(screen.getByRole("button", { name: "action-palette-item-rerun" })).not.toHaveAttribute("disabled");
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("pwd");
  });

  it("비실행 현재 입력에서 Cmd/Ctrl+Shift+W는 RECALL 슬롯을 바꾸지 않는다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "pwd");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "pwd\r",
      });
    });

    fireEvent.change(input, { target: { value: "@local " } });
    const consumed = fireEvent.keyDown(input, { key: "W", ctrlKey: true, shiftKey: true });
    expect(consumed).toBe(false);
    expectRecallActionEnabled();
    expect(input).toHaveValue("@local ");
  });

  it("RECALL 비활성 상태의 Cmd/Ctrl+Shift+R도 키 입력을 소비한다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
    expectRecallActionDisabled();

    const consumed = fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(consumed).toBe(false);
    expect(input).toHaveValue("ls -la");
  });

  it("RECALL/SET RECALL은 no-op 상태에서 비활성화되고 SWAP 단축키는 no-op이다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    expectRecallActionEnabled();
    fireEvent.keyDown(input, { key: "W", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("");

    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
    expectRecallActionDisabled();
    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    expect(screen.getByRole("button", { name: "action-palette-item-set_recall" })).toHaveAttribute("disabled");

    fireEvent.change(input, { target: { value: "pwd" } });
    expectRecallActionEnabled();
    fireEvent.keyDown(input, { key: "W", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    expect(screen.getByRole("button", { name: "action-palette-item-set_recall" })).not.toHaveAttribute("disabled");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+M으로 현재 입력 뒤에 직전 실행 입력을 붙인다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "echo done" } });
    fireEvent.keyDown(input, { key: "M", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("echo done ls -la");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+P로 현재 입력 앞에 직전 실행 입력을 붙인다", async () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    submitInput(container, "ls -la");
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
        id: "tab-1",
        data: "ls -la\r",
      });
    });

    fireEvent.change(input, { target: { value: "echo done" } });
    fireEvent.keyDown(input, { key: "P", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la echo done");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+G로 강제 프리픽스를 제거하고 일반 입력으로 전환한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "@xllm # 로그 요약해줘" } });

    fireEvent.keyDown(input, { key: "G", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("로그 요약해줘");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+T로 입력 앞뒤 공백을 정리한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "   @xllm 로그 요약해줘   " } });

    fireEvent.keyDown(input, { key: "T", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@xllm 로그 요약해줘");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+Q로 연속 공백을 한 칸으로 압축한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "echo    hello   world" } });

    fireEvent.keyDown(input, { key: "Q", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("echo hello world");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+L로 trim+squash를 한 번에 수행한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "   echo    hello   world   " } });

    fireEvent.keyDown(input, { key: "L", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("echo hello world");
  });

  it("CLEAN 단축키로 바뀐 입력은 UNDO로 원복할 수 있다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "   echo    hello   world   " } });

    fireEvent.keyDown(input, { key: "L", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("echo hello world");
    fireEvent.keyDown(input, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("   echo    hello   world   ");
  });

  it("Action Palette에서 Plain/Trim/Squash/Clean 액션을 제공한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "   @xllm echo    hello   world   " } });
    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    expect(screen.getByRole("button", { name: "action-palette-item-plain" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "action-palette-item-trim" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "action-palette-item-squash" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-plain" }));
    expect(input.value).toContain("echo    hello   world");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
    fireEvent.click(screen.getByRole("button", { name: "action-palette-item-clean" }));
    expect(input).toHaveValue("echo hello world");
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
    expectUndoActionEnabled();

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

    fireEvent.keyDown(input, { key: "E", ctrlKey: true, shiftKey: true });
    expect(invokeMock).toHaveBeenCalledWith("write_to_pty", {
      id: "tab-1",
      data: "echo shortcut\r",
    });
    const writeCountAfterSet = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length;

    fireEvent.keyDown(input, { key: "F", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(input, { key: "E", ctrlKey: true, shiftKey: true });
    const writeCountAfterForget = invokeMock.mock.calls.filter((c) => c[0] === "write_to_pty").length;
    expect(writeCountAfterForget).toBe(writeCountAfterSet);
  });

  it("입력 단축키 Cmd/Ctrl+Shift+X/D로 RESET/FORGET(UNDO)을 실행한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "temp" } });
    clearInputWithShortcut(input);
    expectUndoActionEnabled();

    fireEvent.keyDown(input, { key: "D", ctrlKey: true, shiftKey: true });
    expectUndoActionDisabled();
    const consumedNoopD = fireEvent.keyDown(input, { key: "D", ctrlKey: true, shiftKey: true });
    expect(consumedNoopD).toBe(false);

    fireEvent.change(input, { target: { value: "다시 입력" } });
    expect(screen.queryByRole("button", { name: "quick-input-reset-all" })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "X", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("");
    expect(screen.queryByRole("button", { name: "quick-input-reset-all" })).not.toBeInTheDocument();
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
    fireEvent.keyDown(input, { key: "R", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("ls -la");
  });

  it("입력 단축키 Cmd/Ctrl+Shift+B/N으로 이전/마지막 백엔드를 복원한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    fireEvent.keyDown(input, { key: "1", code: "Digit1", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(input, { key: "4", code: "Digit4", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@gemini 로그 요약해줘");

    fireEvent.keyDown(input, { key: "B", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");

    fireEvent.keyDown(input, { key: "O", ctrlKey: true, shiftKey: true });
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
    expect(screen.getByText("AI 자동")).toBeInTheDocument();

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
    expect(screen.getByText("AI 자동")).toBeInTheDocument();
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

  it("PLAIN 정리는 공백 없는 #/? bare 마커도 제거한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "#로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "G", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("로그 요약해줘");

    fireEvent.change(input, { target: { value: "?git status" } });
    fireEvent.keyDown(input, { key: "G", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("git status");
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

  it("액션 팔레트 모드 액션으로 입력 모드 프리픽스를 토글한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    const runPaletteAction = (id: string) => {
      fireEvent.click(screen.getByRole("button", { name: "quick-input-action-palette" }));
      fireEvent.click(screen.getByRole("button", { name: `action-palette-item-${id}` }));
    };
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });

    runPaletteAction("mode_agent");
    expect(input).toHaveValue(">> 로그 요약해줘");

    runPaletteAction("mode_agent");
    expect(input).toHaveValue("로그 요약해줘");

    runPaletteAction("mode_shell");
    expect(input).toHaveValue("!로그 요약해줘");

    runPaletteAction("mode_explain");
    expect(input).toHaveValue("? 로그 요약해줘");

    runPaletteAction("mode_ai_cmd");
    expect(input).toHaveValue("# 로그 요약해줘");

    runPaletteAction("mode_force_ai");
    expect(input).toHaveValue("@로그 요약해줘");

    runPaletteAction("mode_force_ai");
    expect(input).toHaveValue("로그 요약해줘");

    runPaletteAction("mode_heavy");
    expect(input).toHaveValue("!! 로그 요약해줘");

    runPaletteAction("mode_heavy");
    expect(input).toHaveValue("로그 요약해줘");
  });

  it("공백 없는 #/? 입력은 quick mode 활성으로 취급하지 않는다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "#로그 요약해줘" } });
    expect(screen.queryByText("AI 명령 #")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "?로그 요약해줘" } });
    expect(screen.queryByText("설명 ?")).not.toBeInTheDocument();
  });

  it("공백 없는 #/? 입력에서 모드 토글 단축키를 누르면 마커를 중첩하지 않고 정규화한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "#로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "V", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("# 로그 요약해줘");

    fireEvent.change(input, { target: { value: "?로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "U", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("? 로그 요약해줘");
  });

  it("선행 공백 + @ 강제 AI 입력도 force-ai 토글로 정상 해제된다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "   @로그 요약해줘" } });

    fireEvent.keyDown(input, { key: "I", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("   로그 요약해줘");
  });

  it("선행 공백 입력에서 force-ai 토글 ON 시 @ 위치를 보존한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "   로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "I", ctrlKey: true, shiftKey: true });

    expect(input).toHaveValue("   @로그 요약해줘");
  });

  it("선행 공백 + quick mode prefix도 토글로 정상 해제된다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "   !로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "Y", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("   로그 요약해줘");
  });

  it("툴벨트에서 backend 순환 화살표 버튼은 노출하지 않는다", () => {
    render(<TerminalPane id="tab-1" />);
    expect(screen.queryByRole("button", { name: "quick-backend-prev" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-backend-next" })).not.toBeInTheDocument();
  });

  it("툴벨트에서 LOCAL backend 버튼은 노출하지 않는다", () => {
    render(<TerminalPane id="tab-1" />);
    expect(screen.queryByRole("button", { name: "quick-backend-local" })).not.toBeInTheDocument();
  });

  it("툴벨트에서 이전/마지막 백엔드 버튼은 노출하지 않는다", () => {
    render(<TerminalPane id="tab-1" />);
    expect(screen.queryByRole("button", { name: "quick-backend-back" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-backend-last" })).not.toBeInTheDocument();
  });

  it("툴벨트에서 AUTO backend 버튼은 노출하지 않는다", () => {
    render(<TerminalPane id="tab-1" />);
    expect(screen.queryByRole("button", { name: "quick-backend-auto" })).not.toBeInTheDocument();
  });

  it("툴벨트에서 XLLM/OLLAMA/GEMINI backend 버튼은 노출하지 않는다", () => {
    render(<TerminalPane id="tab-1" />);
    expect(screen.queryByRole("button", { name: "quick-backend-xllm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-backend-ollama" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quick-backend-gemini" })).not.toBeInTheDocument();
  });

  it("선행 공백 + @backend 입력도 AUTO 해제 시 공백을 보존한다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "   @xllm 로그 요약해줘" } });

    fireEvent.click(screen.getByRole("button", { name: "clear-backend-badge" }));
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

    fireEvent.click(screen.getByRole("button", { name: /App\.tsx/ }));
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

  it("AI 추천 생성 실패 시 오류 배너에서 텍스트 복사가 동작해야 함", async () => {
    const clipboardMock = setupClipboardWriteMock();
    try {
      invokeMock.mockImplementation((cmd: string) => {
        if (cmd === "load_app_config") {
          return Promise.resolve({
            ui_show_input_toolbelt_tip: true,
          });
        }
        if (cmd === "spawn_pty") return Promise.resolve();
        if (cmd === "write_to_pty") return Promise.resolve();
        if (cmd === "resize_pty") return Promise.resolve();
        if (cmd === "get_project_context") return Promise.resolve("");
        if (cmd === "get_recent_history") return Promise.resolve([]);
        if (cmd === "generate_ai_command") return Promise.reject(new Error("AI 추천 생성 실패"));
        return Promise.resolve();
      });

      const { container } = render(<TerminalPane id="tab-1" />);
      const input = container.querySelector("input")!;
      fireEvent.change(input, { target: { value: "#로그 요약해줘" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(await screen.findByText("⚠ AI")).toBeInTheDocument();
      expect(screen.getByText("Error: AI 추천 생성 실패")).toBeInTheDocument();

      const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
      fireEvent.click(copyButton);
      expect(clipboardMock.writeText).toHaveBeenCalledWith("Error: AI 추천 생성 실패");
    } finally {
      clipboardMock.restore();
    }
  });
});
