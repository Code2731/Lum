import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";
import WarpInputBar, { type WarpInputBarHandle } from "./WarpInputBar";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
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
    invokeMock.mockResolvedValue(undefined);
  });

  it("Enter → onSubmit(input 원본) 호출, 입력 비워짐", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "ls -la" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("ls -la");
    expect(input).toHaveValue("");
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
});
