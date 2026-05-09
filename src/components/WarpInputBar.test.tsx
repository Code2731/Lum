import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { createRef } from "react";
import WarpInputBar, { type WarpInputBarHandle } from "./WarpInputBar";

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

function setup(overrides: Partial<React.ComponentProps<typeof WarpInputBar>> = {}) {
  const onSubmit = vi.fn();
  const onInterrupt = vi.fn();
  const onTab = vi.fn(() => false);
  const onChange = vi.fn();
  const ref = createRef<WarpInputBarHandle>();
  const utils = render(
    <WarpInputBar
      ref={ref}
      fontFamily="monospace"
      fontSize={13}
      onSubmit={onSubmit}
      onInterrupt={onInterrupt}
      onTab={onTab}
      onChange={onChange}
      {...overrides}
    />,
  );
  const input = utils.container.querySelector("input")!;
  return { input, onSubmit, onInterrupt, onTab, onChange, ref, ...utils };
}

describe("WarpInputBar — dumb input, 라우팅은 상위에서", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    voiceListeners.splice(0, voiceListeners.length);
    voiceStateListeners.splice(0, voiceStateListeners.length);
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "voice_recording_status") return false;
      return undefined;
    });
  });

  it("Enter → onSubmit(input 원본) 호출, 입력 비워짐", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("ls -la");
    expect(input).toHaveValue("");
  });

  it("@backend 단독 입력 + Enter는 실행하지 않고 입력을 유지", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "@local" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("@local ");
  });

  it("@embedded 단독 입력 + Enter는 canonical(@local)로 정규화", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "@embedded" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("@local ");
  });

  it("@backend 질의 실행 후 입력창은 같은 backend prefix를 유지", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "@local 로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("@local 로그 요약해줘");
    expect(input).toHaveValue("@local ");
  });

  it("@backend + >> 태스크 실행 후에도 backend prefix를 유지", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "@ollama >> 테스트 실패 원인 찾아줘" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("@ollama >> 테스트 실패 원인 찾아줘");
    expect(input).toHaveValue("@ollama ");
  });

  it("backend 프리픽스가 있으면 BACKEND 배지가 표시되고 해제 시 사라진다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@xllm 로그 요약해줘" } });
    expect(screen.getByText("BACKEND XLLM")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "3", ctrlKey: true });
    expect(screen.queryByText("BACKEND XLLM")).not.toBeInTheDocument();
  });

  it("BACKEND 배지를 클릭하면 backend 프리픽스가 해제된다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@gemini 로그 요약해줘" } });
    expect(screen.getByText("BACKEND GEMINI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "clear-backend-badge" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.queryByText("BACKEND GEMINI")).not.toBeInTheDocument();
  });

  it(">> 입력도 그대로 onSubmit에 전달 (라우팅은 부모가)", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: ">> 파일 목록" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith(">> 파일 목록");
  });

  it("자연어 입력도 그대로 onSubmit", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "현재 디렉토리 파일 개수" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("현재 디렉토리 파일 개수");
  });

  it("빈 입력 도움말에 backend 단축키가 노출된다", () => {
    setup();
    expect(screen.getByText(/Cmd\/Ctrl\+1~4\/0/)).toBeInTheDocument();
    expect(screen.getByText(/`\/\./)).toBeInTheDocument();
    expect(screen.getByText(/Shift\+`\/,/)).toBeInTheDocument();
  });

  it("onChange 한 글자씩 호출", () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: "l" } });
    fireEvent.change(input, { target: { value: "ls" } });
    expect(onChange).toHaveBeenNthCalledWith(1, "l");
    expect(onChange).toHaveBeenNthCalledWith(2, "ls");
  });

  it("IME 조합 중 Enter → swallow", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "안녕" } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("안녕");
  });

  it("빈 입력 Ctrl+C → onInterrupt", () => {
    const { input, onInterrupt } = setup();
    fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    expect(onInterrupt).toHaveBeenCalled();
  });

  it("Tab → onTab(buf) 호출, true 반환 시 preventDefault", () => {
    const onTab = vi.fn(() => true);
    const { input } = setup({ onTab });
    fireEvent.change(input, { target: { value: "gi" } });
    const evt = fireEvent.keyDown(input, { key: "Tab" });
    expect(onTab).toHaveBeenCalledWith("gi");
    expect(evt).toBe(false);
  });

  it("ArrowUp → 히스토리 네비게이션", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("second");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("first");
  });

  it("Escape → 클리어", () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("backend 강제 상태에서 Escape는 본문만 지우고 prefix 유지", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@local 로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("@local ");
  });

  it("backend prefix만 남은 상태에서 Escape는 전체 클리어", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@local 로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("@local ");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
  });

  it("Cmd/Ctrl+1로 @local 프리픽스 적용", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "1", ctrlKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");
  });

  it("Cmd/Ctrl+2/3/4로 @ollama/@xllm/@gemini 프리픽스 적용", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "what is closure?" } });
    fireEvent.keyDown(input, { key: "2", ctrlKey: true });
    expect(input).toHaveValue("@ollama what is closure?");
    fireEvent.keyDown(input, { key: "3", ctrlKey: true });
    expect(input).toHaveValue("@xllm what is closure?");
    fireEvent.keyDown(input, { key: "4", ctrlKey: true });
    expect(input).toHaveValue("@gemini what is closure?");
  });

  it("같은 Cmd/Ctrl+숫자를 다시 누르면 backend 프리픽스 해제", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "1", ctrlKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");
    fireEvent.keyDown(input, { key: "1", ctrlKey: true });
    expect(input).toHaveValue("로그 요약해줘");
  });

  it("Cmd/Ctrl+`로 backend를 순환한다 (AUTO→local→ollama→xllm→gemini→AUTO)", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "`", ctrlKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");
    fireEvent.keyDown(input, { key: "`", ctrlKey: true });
    expect(input).toHaveValue("@ollama 로그 요약해줘");
    fireEvent.keyDown(input, { key: "`", ctrlKey: true });
    expect(input).toHaveValue("@xllm 로그 요약해줘");
    fireEvent.keyDown(input, { key: "`", ctrlKey: true });
    expect(input).toHaveValue("@gemini 로그 요약해줘");
    fireEvent.keyDown(input, { key: "`", ctrlKey: true });
    expect(input).toHaveValue("로그 요약해줘");
  });

  it("Cmd/Ctrl+.로 backend 정방향 순환이 동작한다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });
    fireEvent.keyDown(input, { key: ".", code: "Period", ctrlKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");
    fireEvent.keyDown(input, { key: ".", code: "Period", ctrlKey: true });
    expect(input).toHaveValue("@ollama 로그 요약해줘");
  });

  it("Cmd+`(mac)도 backend 순환이 동작한다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "`", metaKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");
  });

  it("Ctrl+Shift+Backquote 경로도 backend 순환이 동작한다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "~", code: "Backquote", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@gemini 로그 요약해줘");
  });

  it("Ctrl+Shift+Backquote는 역방향 순환을 수행한다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@xllm 로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "~", code: "Backquote", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@ollama 로그 요약해줘");
    fireEvent.keyDown(input, { key: "~", code: "Backquote", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("@local 로그 요약해줘");
    fireEvent.keyDown(input, { key: "~", code: "Backquote", ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue("로그 요약해줘");
  });

  it("Cmd/Ctrl+,로 backend 역방향 순환이 동작한다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@local 로그 요약해줘" } });
    fireEvent.keyDown(input, { key: ",", code: "Comma", ctrlKey: true });
    expect(input).toHaveValue("로그 요약해줘");
    fireEvent.keyDown(input, { key: ",", code: "Comma", ctrlKey: true });
    expect(input).toHaveValue("@gemini 로그 요약해줘");
  });

  it("기존 @backend 프리픽스는 Cmd/Ctrl+숫자로 교체", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@ollama src/utils.ts 함수 수정해줘" } });
    fireEvent.keyDown(input, { key: "1", ctrlKey: true });
    expect(input).toHaveValue("@local src/utils.ts 함수 수정해줘");
  });

  it("Cmd/Ctrl+0으로 backend 프리픽스를 해제한다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@xllm 로그 요약해줘" } });
    fireEvent.keyDown(input, { key: "0", ctrlKey: true });
    expect(input).toHaveValue("로그 요약해줘");
  });

  it("ref.setValue로 외부 설정", () => {
    const { input, ref, onChange } = setup();
    act(() => { ref.current?.setValue("git status"); });
    expect(input).toHaveValue("git status");
    expect(onChange).toHaveBeenCalledWith("git status");
  });

  it("마이크 버튼: 시작→중지 시 STT 텍스트 주입", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_voice_recording") return;
      if (cmd === "stop_voice_recording") return "git status";
      return;
    });
    const { getByLabelText, input, onChange } = setup();

    const startBtn = getByLabelText("음성 녹음 시작");
    await act(async () => {
      fireEvent.click(startBtn);
    });
    expect(invokeMock).toHaveBeenCalledWith("start_voice_recording", undefined);

    const stopBtn = getByLabelText("음성 녹음 중지");
    await act(async () => {
      fireEvent.click(stopBtn);
    });
    expect(invokeMock).toHaveBeenCalledWith("stop_voice_recording", undefined);
    expect(input).toHaveValue("git status");
    expect(onChange).toHaveBeenLastCalledWith("git status");
  });

  it("마이크 시작 실패 시 오류 배지 표시", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_voice_recording") throw new Error("mic permission denied");
      return;
    });
    const { getByLabelText, findByText } = setup();
    const startBtn = getByLabelText("음성 녹음 시작");
    await act(async () => {
      fireEvent.click(startBtn);
    });
    expect(await findByText(/음성 입력 오류:/)).toBeInTheDocument();
    expect(await findByText(/마이크 권한이 거부되었습니다\./)).toBeInTheDocument();
    // 실패 후에도 시작 상태여야 함(녹음중 아님).
    expect(getByLabelText("음성 녹음 시작")).toBeInTheDocument();
  });

  it("마운트 시 voice_recording_status 조회", async () => {
    setup();
    expect(invokeMock).toHaveBeenCalledWith("voice_recording_status", undefined);
  });

  it("voice_transcript 이벤트 수신 시 입력창에 주입", async () => {
    const { input, onChange } = setup();
    await act(async () => {
      const cb = voiceListeners[voiceListeners.length - 1];
      cb?.({ payload: "cargo test" });
    });
    expect(input).toHaveValue("cargo test");
    expect(onChange).toHaveBeenLastCalledWith("cargo test");
  });

  it("voice_recording_state 이벤트 수신 시 마이크 라벨 동기화", async () => {
    const { getByLabelText } = setup();
    expect(getByLabelText("음성 녹음 시작")).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      const cb = voiceStateListeners[voiceStateListeners.length - 1];
      cb?.({ payload: true });
    });
    expect(getByLabelText("음성 녹음 중지")).toBeInTheDocument();
  });
});
