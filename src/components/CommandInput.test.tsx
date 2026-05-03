import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CommandInput from "./CommandInput";

const invokeMock = vi.fn();
const voiceListeners: Array<(event: { payload: string }) => void> = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: (event: { payload: string }) => void) => {
    if (event === "voice_transcript") {
      voiceListeners.push(cb);
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
});
