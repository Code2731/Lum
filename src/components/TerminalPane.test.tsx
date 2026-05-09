import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";

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
  try {
    localStorage.removeItem("lum_input_toolbelt_tip_dismissed");
  } catch {}
  invokeMock.mockImplementation((cmd: string) => {
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

    fireEvent.change(input, { target: { value: "ls -la" } });
    expect(screen.getByText("SHELL")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "@xllm closure가 뭐야?" } });
    expect(screen.getByText("AI @XLLM")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "@local src/utils.ts 함수 수정해줘" } });
    expect(screen.getByText("AGENT @LOCAL")).toBeInTheDocument();
  });

  it("툴벨트에 backend 단축키 안내 문구가 노출된다", () => {
    render(<TerminalPane id="tab-1" />);
    expect(screen.getByText("Cmd/Ctrl+1~4 토글 · 0 해제 · `/. 정순환 · Shift+`/, 역순환")).toBeInTheDocument();
  });

  it("입력 툴벨트 TIP 배너는 기본 노출되고 닫으면 사라진다", () => {
    render(<TerminalPane id="tab-1" />);
    expect(screen.getByText(/TIP · Cmd\/Ctrl\+1~4로 backend 즉시 전환/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "dismiss-input-toolbelt-tip" }));
    expect(screen.queryByText(/TIP · Cmd\/Ctrl\+1~4로 backend 즉시 전환/)).not.toBeInTheDocument();
  });

  it("툴벨트 @ 파일 첨부 버튼으로 첨부 트리거를 삽입하고 목록 로드를 시작한다", async () => {
    invokeMock.mockImplementation((cmd: string, args?: { path?: string }) => {
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

  it("툴벨트 CLEAR/UNDO 버튼으로 입력 초기화 후 즉시 복원할 수 있다", () => {
    const { container } = render(<TerminalPane id="tab-1" />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "@xllm # 로그 요약해줘" } });
    expect(input).toHaveValue("@xllm # 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-clear" }));
    expect(input).toHaveValue("");
    expect(screen.getByText("AUTO 라우팅")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO 1");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).not.toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: "quick-input-undo" }));
    expect(input).toHaveValue("@xllm # 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveTextContent("UNDO");
    expect(screen.getByRole("button", { name: "quick-input-undo" })).toHaveAttribute("disabled");
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
      expect(writeCallsAfter.at(-1)).toEqual([
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

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-xllm" }));
    expect(input).toHaveValue("@xllm 로그 요약해줘");
    expect(screen.getByRole("button", { name: "quick-backend-last" })).toHaveTextContent("LAST @XLLM");

    fireEvent.click(screen.getByRole("button", { name: "quick-backend-auto" }));
    expect(input).toHaveValue("로그 요약해줘");

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
