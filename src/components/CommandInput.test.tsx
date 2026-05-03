import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CommandInput from "./CommandInput";

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
    return () => {};
  }),
}));

// react-simple-code-editor는 내부적으로 복잡한 DOM을 가지므로,
// 테스트 환경에서는 단순 textarea로 모킹하여 핵심 인터랙션만 검증합니다.
vi.mock("react-simple-code-editor", () => ({
  default: ({
    value,
    onValueChange,
    onKeyDown,
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

  it("기본적으로 셸 모드로 렌더링되어야 함", () => {
    render(<CommandInput {...defaultProps} />);
    // 셸 프롬프트 '$'가 렌더링되어야 함
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("/ 입력 시 AI 모드로 전환되어야 함", () => {
    render(<CommandInput {...defaultProps} />);
    const input = screen.getByTestId("mock-editor");

    fireEvent.change(input, { target: { value: "/도와줘" } });

    // AI 모델 뱃지가 나타나야 함
    expect(screen.getByText(/AI · llama3/i)).toBeInTheDocument();
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
  });

  it("마운트 시 voice_recording_status를 조회해야 함", () => {
    render(<CommandInput {...defaultProps} />);
    expect(invokeMock).toHaveBeenCalledWith("voice_recording_status", undefined);
  });

  it("voice_recording_state 이벤트 수신 시 녹음 상태가 동기화되어야 함", async () => {
    render(<CommandInput {...defaultProps} />);
    const micButton = screen.getByLabelText("Voice Command");
    expect(micButton).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      const cb = voiceStateListeners[voiceStateListeners.length - 1];
      cb?.({ payload: true });
    });
    expect(micButton).toHaveClass("active");
  });

  it("마이크 시작 실패 시 사용자 친화 오류를 표시해야 함", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "voice_recording_status") return false;
      if (cmd === "start_voice_recording") throw new Error("mic permission denied");
      return undefined;
    });
    render(<CommandInput {...defaultProps} />);
    const micButton = screen.getByLabelText("Voice Command");
    await act(async () => {
      fireEvent.click(micButton);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("마이크 권한이 거부되었습니다.");
    expect(micButton).not.toHaveClass("active");
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
    const micButton = screen.getByLabelText("Voice Command");
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
});
