import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CommandInput from "./CommandInput";
import { getCommandInputRouteFlowSummary } from "./CommandInput";

type WriteSpy = ReturnType<typeof vi.fn>;

function setupClipboardWriteMock() {
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
      }
    },
  };
}

const invokeMock = vi.fn();
const voiceListeners: Array<(event: { payload: string }) => void> = [];
const voiceStateListeners: Array<(event: { payload: boolean }) => void> = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: (event: { payload: unknown }) => void) => {
    if (event === "voice_transcript") {
      voiceListeners.push(cb as (event: { payload: string }) => void);
    }
    if (event === "voice_recording_state") {
      voiceStateListeners.push(cb as (event: { payload: boolean }) => void);
    }
    return () => {
      const idx = voiceListeners.indexOf(cb as (event: { payload: string }) => void);
      if (idx >= 0) voiceListeners.splice(idx, 1);
      const sidx = voiceStateListeners.indexOf(cb as (event: { payload: boolean }) => void);
      if (sidx >= 0) voiceStateListeners.splice(sidx, 1);
    };
  }),
}));

// react-simple-code-editor는 내부적으로 복잡한 DOM을 가지므로,
// 테스트 환경에서는 단순 textarea로 모킹하여 핵심 인터랙션만 검증합니다.
vi.mock("react-simple-code-editor", () => ({
  default: ({
    value,
    onValueChange,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    placeholder,
    textareaId,
  }: any) => (
    <textarea
      data-testid="mock-editor"
      id={textareaId}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={onKeyDown}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
    />
  ),
}));

describe("CommandInput Component", () => {
  const mockSubmit = vi.fn();
  const defaultProps = {
    onCommandSubmit: mockSubmit,
    selectedModel: "llama3",
    xllmOnline: true,
    context: { cwd: "/Users/test", git_branch: "main" },
  };

  beforeEach(() => {
    mockSubmit.mockReset();
    invokeMock.mockReset();
    voiceListeners.splice(0, voiceListeners.length);
    voiceStateListeners.splice(0, voiceStateListeners.length);
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "voice_recording_status") return false;
      return undefined;
    });
  });

  it("입력 모드별 하단 안내 요약을 계산해야 함", () => {
    expect(getCommandInputRouteFlowSummary(false)).toEqual({
      badges: ["현재 셸", "Enter 실행", "/ 로 AI"],
      helper: "명령어를 적고 Enter로 실행하거나, /로 시작해 AI 질문으로 전환합니다.",
    });

    expect(getCommandInputRouteFlowSummary(true)).toEqual({
      badges: ["현재 AI", "Enter 질문", "/ 지우면 셸"],
      helper: "AI로 보낼 질문을 적고 Enter로 바로 이어갑니다.",
    });
  });

  it("기본적으로 셸 모드로 렌더링되어야 함", () => {
    render(<CommandInput {...defaultProps} />);
    // 셸 프롬프트 '$'가 렌더링되어야 함
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("현재 셸")).toBeInTheDocument();
    expect(screen.getByText("Enter 실행")).toBeInTheDocument();
    expect(screen.getByText("/ 로 AI")).toBeInTheDocument();
    expect(screen.getByText("명령어를 적고 Enter로 실행하거나, /로 시작해 AI 질문으로 전환합니다.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("명령어를 입력하거나 /로 AI 질문을 시작하세요...")).toBeInTheDocument();
  });

  it("/ 입력 시 AI 모드로 전환되어야 함", () => {
    render(<CommandInput {...defaultProps} />);
    const input = screen.getByTestId("mock-editor");

    fireEvent.change(input, { target: { value: "/도와줘" } });

    // AI 모델 뱃지가 나타나야 함
    expect(screen.getByText(/AI · llama3/i)).toBeInTheDocument();
    expect(screen.getByText("현재 AI")).toBeInTheDocument();
    expect(screen.getByText("Enter 질문")).toBeInTheDocument();
    expect(screen.getByText("/ 지우면 셸")).toBeInTheDocument();
    expect(screen.getByText("AI로 보낼 질문을 적고 Enter로 바로 이어갑니다.")).toBeInTheDocument();
    // placeholder가 AI 모드용으로 변경되어야 함
    expect(input).toHaveAttribute("placeholder", "AI에게 질문하세요...");
  });

  it("Enter 키 입력 시 셸 명령어가 올바르게 제출되어야 함", () => {
    render(<CommandInput {...defaultProps} />);
    const input = screen.getByTestId("mock-editor");

    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(mockSubmit).toHaveBeenCalledWith("ls -la", "shell");
    expect(input).toHaveValue(""); // 제출 후 초기화
  });

  it("IME 조합 중 Enter는 제출을 트리거하지 않아야 함", () => {
    render(<CommandInput {...defaultProps} />);
    const input = screen.getByTestId("mock-editor");

    fireEvent.change(input, { target: { value: "안녕" } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(mockSubmit).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(mockSubmit).toHaveBeenCalledWith("안녕", "shell");
  });

  it("AI 명령어 입력 시 슬래시(/)가 제거된 상태로 제출되어야 함", () => {
    render(<CommandInput {...defaultProps} />);
    const input = screen.getByTestId("mock-editor");

    fireEvent.change(input, { target: { value: "/파일 찾아줘" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(mockSubmit).toHaveBeenCalledWith("파일 찾아줘", "ai");
  });

  it("voice_transcript 이벤트 수신 시 입력창에 반영되어야 함", () => {
    render(<CommandInput {...defaultProps} />);
    const input = screen.getByTestId("mock-editor");
    const cb = voiceListeners[voiceListeners.length - 1];
    act(() => {
      cb?.({ payload: "npm test" });
    });
    expect(input).toHaveValue("npm test");
    expect(screen.getAllByText("음성 반영 완료 · npm test").length).toBeGreaterThan(0);
  });

  it("unmount 이후 voice_transcript 이벤트는 무시되어야 함", async () => {
    const { unmount } = render(<CommandInput {...defaultProps} />);
    const before = voiceListeners.length;
    expect(before).toBeGreaterThan(0);
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(voiceListeners.length).toBeLessThan(before);
  });

  it("마운트 시 voice_recording_status를 조회해야 함", () => {
    render(<CommandInput {...defaultProps} />);
    expect(invokeMock).toHaveBeenCalledWith("voice_recording_status", undefined);
  });

  it("voice_recording_state 이벤트 수신 시 녹음 상태가 동기화되어야 함", async () => {
    render(<CommandInput {...defaultProps} />);
    const micButton = screen.getByLabelText("음성 녹음 시작");
    expect(micButton).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      const cb = voiceStateListeners[voiceStateListeners.length - 1];
      cb?.({ payload: true });
    });
    expect(screen.getByLabelText("음성 녹음 중지")).toHaveAttribute("aria-pressed", "true");
  });

  it("마이크 시작 실패 시 사용자 친화 오류를 표시해야 함", async () => {
    const clipboardMock = setupClipboardWriteMock();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "voice_recording_status") return false;
      if (cmd === "start_voice_recording") throw new Error("mic permission denied");
      return undefined;
    });
    render(<CommandInput {...defaultProps} />);
    const micButton = screen.getByLabelText("음성 녹음 시작");
    await act(async () => {
      fireEvent.click(micButton);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("마이크 권한이 거부되었습니다.");
    expect(micButton).toHaveAttribute("aria-pressed", "false");

    const copyButton = screen.getByTitle("복사");
    fireEvent.click(copyButton);
    expect(clipboardMock.writeText).toHaveBeenCalledWith(
      "음성 오류: 마이크 권한이 거부되었습니다. 시스템 설정에서 권한을 허용해 주세요.",
    );

    clipboardMock.restore();
  });

  it("음성 입력 오류 배너를 직접 닫을 수 있다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "voice_recording_status") return false;
      if (cmd === "start_voice_recording") throw new Error("mic permission denied");
      return undefined;
    });
    render(<CommandInput {...defaultProps} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText("음성 녹음 시작"));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("마이크 권한이 거부되었습니다.");
    fireEvent.click(screen.getByTitle("닫기"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("음성 입력 오류 배너에서 바로 다시 시도할 수 있다", async () => {
    let attempts = 0;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "voice_recording_status") return false;
      if (cmd === "start_voice_recording") {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("mic permission denied");
        }
        return undefined;
      }
      return undefined;
    });
    render(<CommandInput {...defaultProps} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText("음성 녹음 시작"));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("마이크 권한이 거부되었습니다.");

    await act(async () => {
      fireEvent.click(screen.getByTitle("다시 시도"));
    });

    expect(screen.getByLabelText("음성 녹음 중지")).toHaveAttribute("aria-pressed", "true");
    const startCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === "start_voice_recording");
    expect(startCalls).toHaveLength(2);
  });

  it("수동 입력을 다시 시작하면 음성 입력 오류 배너가 사라진다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "voice_recording_status") return false;
      if (cmd === "start_voice_recording") throw new Error("mic permission denied");
      return undefined;
    });
    render(<CommandInput {...defaultProps} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText("음성 녹음 시작"));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("마이크 권한이 거부되었습니다.");

    fireEvent.change(screen.getByTestId("mock-editor"), { target: { value: "hello again" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("음성 처리 중에는 마이크 연타를 무시해야 함", async () => {
    let resolveStart: (() => void) | null = null;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "voice_recording_status") return Promise.resolve(false);
      if (cmd === "start_voice_recording") {
        return new Promise<void>((resolve) => {
          resolveStart = resolve;
        });
      }
      return Promise.resolve(undefined);
    });
    render(<CommandInput {...defaultProps} />);
    const micButton = screen.getByLabelText("음성 녹음 시작");
    await act(async () => {
      fireEvent.click(micButton);
    });
    await act(async () => {
      fireEvent.click(micButton);
    });

    const startCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === "start_voice_recording");
    expect(startCalls).toHaveLength(1);
    expect(micButton).toBeDisabled();

    await act(async () => {
      resolveStart?.();
      await Promise.resolve();
    });
    expect(micButton).not.toBeDisabled();
  });

  it("IME 입력 중 Home/End는 히스토리 탐색을 트리거하면 안 된다", () => {
    render(<CommandInput {...defaultProps} />);
    const input = screen.getByTestId("mock-editor");

    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Home", code: "Home" });
    fireEvent.keyDown(input, { key: "End", code: "End" });

    expect(input).toHaveValue("");

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Home", code: "Home" });
    expect(input).toHaveValue("second");
  });

  it("Home/End에서 히스토리 항목의 최신/최초로 이동해야 함", () => {
    render(<CommandInput {...defaultProps} />);
    const input = screen.getByTestId("mock-editor");

    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Home", code: "Home" });
    expect(input).toHaveValue("second");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "End", code: "End" });
    expect(input).toHaveValue("first");
  });

  it("입력 내용이 있을 때 Home/End는 기존 텍스트를 유지해야 함", () => {
    render(<CommandInput {...defaultProps} />);
    const input = screen.getByTestId("mock-editor");

    fireEvent.change(input, { target: { value: "typing..." } });
    fireEvent.keyDown(input, { key: "Home", code: "Home" });
    fireEvent.keyDown(input, { key: "End", code: "End" });
    expect(input).toHaveValue("typing...");
  });
});
