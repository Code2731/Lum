import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { createRef } from "react";
import WarpInputBar, { type WarpInputBarHandle } from "./WarpInputBar";
import { DEFAULT_TERMINAL_FONT_SIZE } from "../hooks/useTerminalTheme";

type WriteSpy = ReturnType<typeof vi.fn>;
type RestoreSpy = ReturnType<typeof vi.spyOn>;

function setupClipboardWriteMock() {
  const writeText = vi.fn().mockResolvedValue(undefined) as WriteSpy;
  const nav = globalThis.navigator as Navigator & {
    clipboard?: { writeText: WriteSpy };
  };
  const originalClipboard = nav.clipboard;

  if (originalClipboard) {
    return {
      writeText,
      restore: vi.spyOn(originalClipboard, "writeText").mockResolvedValue(undefined) as RestoreSpy,
    };
  }

  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  return {
    writeText,
    restore: null as RestoreSpy | null,
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
      fontSize={DEFAULT_TERMINAL_FONT_SIZE}
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

  it("빈 입력 Enter는 onSubmit을 호출하지 않는다", () => {
    const { input, onSubmit } = setup();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("공백만 입력된 Enter도 onSubmit을 호출하지 않는다", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("@backend 단독 입력 + Enter는 실행하지 않고 입력을 유지", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "@local" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("@local ");
  });

  it("선행 공백 + @backend 단독 입력도 실행하지 않고 canonical prefix로 정규화", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "   @embedded" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("@local ");
  });

  it("@sglang 단독 입력 + Enter는 @xllm으로 정규화", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "@sglang" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("@xllm ");
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

  it("backend 프리픽스가 있으면 백엔드 배지가 표시되고 해제 시 사라진다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@xllm 로그 요약해줘" } });
    expect(screen.getByText("백엔드 XLLM")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "3", ctrlKey: true });
    expect(screen.queryByText("백엔드 XLLM")).not.toBeInTheDocument();
  });

  it("backend 배지가 @sglang에서 @xllm으로 정규화되어 표시됨", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@sglang 로그 요약해줘" } });
    expect(screen.getByText("백엔드 XLLM")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "clear-backend-badge" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.queryByText("백엔드 XLLM")).not.toBeInTheDocument();
  });

  it("백엔드 배지를 클릭하면 backend 프리픽스가 해제된다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@gemini 로그 요약해줘" } });
    expect(screen.getByText("백엔드 GEMINI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "clear-backend-badge" }));
    expect(input).toHaveValue("로그 요약해줘");
    expect(screen.queryByText("백엔드 GEMINI")).not.toBeInTheDocument();
  });

  it("백엔드 배지 tooltip은 direct 지정·해제와 순환 단축키를 안내한다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "@local 로그 요약해줘" } });
    expect(screen.getByRole("button", { name: "clear-backend-badge" })).toHaveAttribute(
      "title",
      expect.stringContaining("Cmd/Ctrl+1~4/0 직접 지정·해제"),
    );
    expect(screen.getByRole("button", { name: "clear-backend-badge" })).toHaveAttribute(
      "title",
      expect.stringContaining("Cmd/Ctrl+./, 직접 순환"),
    );
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

  it("빈 입력 도움말은 간결한 라우팅/백엔드 안내를 노출한다", () => {
    setup();
    expect(screen.getByText(/자연어는 AI · 명령어는 실행/)).toBeInTheDocument();
    expect(screen.getByText(/백엔드 @local\/@ollama\/@xllm\/@gemini/)).toBeInTheDocument();
    expect(screen.getByText(/Cmd\/Ctrl\+1~4\/0 선택·해제/)).toBeInTheDocument();
    expect(screen.getByText(/Cmd\/Ctrl\+\./)).toBeInTheDocument();
  });

  it("공백만 입력된 상태에서도 빈 입력 도움말을 유지한다", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByText(/자연어는 AI · 명령어는 실행/)).toBeInTheDocument();
  });

  it("백엔드 단독 상태일 때 백엔드 모드 안내가 표시된다", () => {
    const { input } = setup();
    act(() => {
      fireEvent.change(input, { target: { value: "@local " } });
    });
    expect(screen.getByText(/LOCAL 백엔드가 선택되어 있습니다/)).toBeInTheDocument();
    expect(screen.getByText(/Cmd\/Ctrl\+0으로 해제/)).toBeInTheDocument();
    expect(screen.getByText(/Cmd\/Ctrl\+\./)).toBeInTheDocument();
    expect(screen.getByText(/순환할 수 있습니다/)).toBeInTheDocument();
  });

  it("강제 셸 모드 단독 입력일 때 셸 모드 안내가 표시된다", () => {
    const { input } = setup();
    act(() => {
      fireEvent.change(input, { target: { value: "!" } });
    });
    expect(screen.getByText(/셸 강제 모드/)).toBeInTheDocument();
  });

  it("compactContextChips=true면 컨텍스트 칩을 핵심 + 요약으로 축약한다", () => {
    setup({
      compactContextChips: true,
      contextChips: [
        { id: "route", label: "AI" },
        { id: "backend", label: "@local" },
        { id: "term", label: "Terminal 1" },
        { id: "project", label: "Lum" },
        { id: "git", label: "main" },
      ],
    });

    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("@local")).toBeInTheDocument();
    expect(screen.getByText("Terminal 1")).toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.queryByText("Lum")).not.toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
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

  it("IME 조합 중에는 Home/End가 입력/네비게이션을 방해하지 않는다", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "안녕" } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Home" });
    fireEvent.keyDown(input, { key: "End" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("안녕");
    fireEvent.compositionEnd(input);
  });

  it("빈 입력 Ctrl+C → onInterrupt", () => {
    const { input, onInterrupt } = setup();
    fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    expect(onInterrupt).toHaveBeenCalled();
  });

  it("공백만 입력된 상태의 Ctrl+C도 onInterrupt", () => {
    const { input, onInterrupt } = setup();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    expect(onInterrupt).toHaveBeenCalled();
  });

  it("빈 입력 Ctrl+Alt+C는 onInterrupt하지 않는다", () => {
    const { input, onInterrupt } = setup();
    fireEvent.keyDown(input, { key: "c", ctrlKey: true, altKey: true });
    expect(onInterrupt).not.toHaveBeenCalled();
  });

  it("backend prefix-only 상태의 Ctrl+C도 onInterrupt", () => {
    const { input, onInterrupt } = setup();
    fireEvent.change(input, { target: { value: "@local " } });
    fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    expect(onInterrupt).toHaveBeenCalled();
  });

  it("빈 입력 Ctrl+Shift+C도 onInterrupt", () => {
    const { input, onInterrupt } = setup();
    fireEvent.keyDown(input, { key: "C", ctrlKey: true, shiftKey: true });
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

  it("Home/End → 히스토리 최신/최초 항목으로 즉시 이동", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(2);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Home" });
    expect(input).toHaveValue("first");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "End" });
    expect(input).toHaveValue("second");
  });

  it("공백만 입력된 상태에서도 Home/End 히스토리 이동", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(2);

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Home" });
    expect(input).toHaveValue("first");

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "End" });
    expect(input).toHaveValue("second");
  });

  it("backend prefix-only 상태에서도 Home/End 히스토리 이동", () => {
    const { input, onSubmit } = setup();
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(2);

    fireEvent.change(input, { target: { value: "@local " } });
    fireEvent.keyDown(input, { key: "Home" });
    expect(input).toHaveValue("first");

    fireEvent.change(input, { target: { value: "@local " } });
    fireEvent.keyDown(input, { key: "End" });
    expect(input).toHaveValue("second");
  });

  it("입력 내용이 있을 때 Home/End는 입력 유지", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "typing..." } });
    fireEvent.keyDown(input, { key: "Home" });
    fireEvent.keyDown(input, { key: "End" });
    expect(input).toHaveValue("typing...");
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

  it("선행 공백 + backend-only 입력에서 Escape는 한 번에 전체 클리어", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "   @local   " } });
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

  it("onKeyDownIntercept가 true일 때 상위 keydown 핸들러로 전파하지 않는다", () => {
    const windowHandler = vi.fn();
    window.addEventListener("keydown", windowHandler);
    const onKeyDownIntercept = vi.fn(() => true);
    const { input } = setup({ onKeyDownIntercept });

    fireEvent.keyDown(input, { key: "k", ctrlKey: true });

    expect(onKeyDownIntercept).toHaveBeenCalled();
    expect(windowHandler).not.toHaveBeenCalled();

    window.removeEventListener("keydown", windowHandler);
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
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(invokeMock).toHaveBeenCalledWith("stop_voice_recording", undefined);
    expect(input).toHaveValue("git status");
    expect(onChange).toHaveBeenLastCalledWith("git status");
  });

  it("중지 처리 대기 중에는 녹음중 라벨을 유지한다", async () => {
    let resolveStop: ((value: string) => void) | null = null;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_voice_recording") return Promise.resolve(undefined);
      if (cmd === "stop_voice_recording") {
        return new Promise<string>((resolve) => {
          resolveStop = resolve;
        });
      }
      return Promise.resolve(undefined);
    });
    const { getByLabelText } = setup();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });
    expect(getByLabelText("음성 녹음 중지")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 중지"));
    });
    // stop 대기 중엔 start로 깜빡이지 않고 중지 라벨 유지
    const pendingStopBtn = getByLabelText("음성 녹음 중지");
    expect(pendingStopBtn).toBeDisabled();

    await act(async () => {
      resolveStop?.("done");
      await Promise.resolve();
    });
  });

  it("같은 프레임 연속 클릭에서도 마이크 시작은 1회만 호출", async () => {
    let resolveStart: (() => void) | null = null;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_voice_recording") {
        return new Promise<void>((resolve) => {
          resolveStart = resolve;
        });
      }
      return Promise.resolve(undefined);
    });
    const { getByLabelText } = setup();

    await act(async () => {
      const startBtn = getByLabelText("음성 녹음 시작");
      fireEvent.click(startBtn);
      fireEvent.click(startBtn);
      await Promise.resolve();
    });

    const startCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === "start_voice_recording");
    expect(startCalls).toHaveLength(1);

    await act(async () => {
      resolveStart?.();
      await Promise.resolve();
    });
  });

  it("stop 반환값과 voice_transcript 이벤트가 동시에 와도 중복 주입하지 않음", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_voice_recording") return;
      if (cmd === "stop_voice_recording") return "git status";
      return;
    });
    const { getByLabelText, input, onChange } = setup();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 중지"));
      const cb = voiceListeners[voiceListeners.length - 1];
      cb?.({ payload: "git status" });
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(input).toHaveValue("git status");
    const sameCalls = onChange.mock.calls.filter(([v]) => v === "git status");
    expect(sameCalls).toHaveLength(1);
  });

  it("stop fallback 후 지연 도착한 동일 voice_transcript 이벤트도 중복 주입하지 않음", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_voice_recording") return;
      if (cmd === "stop_voice_recording") return "git status";
      return;
    });
    const { getByLabelText, onChange } = setup();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });
    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 중지"));
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
      const cb = voiceListeners[voiceListeners.length - 1];
      cb?.({ payload: "git status" });
    });

    const sameCalls = onChange.mock.calls.filter(([v]) => v === "git status");
    expect(sameCalls).toHaveLength(1);
  });

  it("새 녹음 세션 시작 후 이전 세션의 지연 transcript 이벤트는 무시", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_voice_recording") return;
      if (cmd === "stop_voice_recording") return "old transcript";
      if (cmd === "voice_recording_status") return false;
      return;
    });
    const { getByLabelText, onChange } = setup();

    // 세션 A: stop fallback으로 old transcript 1회 주입
    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });
    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 중지"));
      await new Promise((resolve) => setTimeout(resolve, 40));
      const stateCb = voiceStateListeners[voiceStateListeners.length - 1];
      stateCb?.({ payload: false });
    });

    // 세션 B 시작
    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });
    expect(getByLabelText("음성 녹음 중지")).toBeInTheDocument();

    // 세션 A의 늦은 이벤트 도착 가정
    await act(async () => {
      const cb = voiceListeners[voiceListeners.length - 1];
      cb?.({ payload: "old transcript" });
    });

    // 새 세션 유지 + 추가 주입 없음
    expect(getByLabelText("음성 녹음 중지")).toBeInTheDocument();
    const sameCalls = onChange.mock.calls.filter(([v]) => v === "old transcript");
    expect(sameCalls).toHaveLength(1);
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

  it("음성 입력 오류 배지를 직접 닫을 수 있다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_voice_recording") throw new Error("mic permission denied");
      return;
    });
    const { getByLabelText, findByText, queryByText } = setup();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });

    expect(await findByText(/음성 입력 오류:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "음성 입력 오류 닫기" }));
    expect(queryByText(/음성 입력 오류:/)).not.toBeInTheDocument();
  });

  it("음성 입력 오류 배지에서 바로 다시 시도할 수 있다", async () => {
    let attempts = 0;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_voice_recording") {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("mic permission denied");
        }
        return;
      }
      return;
    });
    const { getByLabelText, findByText } = setup();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });

    expect(await findByText(/음성 입력 오류:/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "음성 입력 다시 시도" }));
    });

    expect(getByLabelText("음성 녹음 중지")).toBeInTheDocument();
    const startCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === "start_voice_recording");
    expect(startCalls).toHaveLength(2);
  });

  it("수동 입력을 다시 시작하면 음성 입력 오류 배지가 사라진다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_voice_recording") throw new Error("mic permission denied");
      return;
    });
    const { getByLabelText, findByText, input, queryByText } = setup();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });

    expect(await findByText(/음성 입력 오류:/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "hello again" } });
    expect(queryByText(/음성 입력 오류:/)).not.toBeInTheDocument();
  });

  it("마이크 중지 실패 시 voice_recording_status 재조회로 상태를 동기화", async () => {
    let recording = false;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "voice_recording_status") return recording;
      if (cmd === "start_voice_recording") {
        recording = true;
        return;
      }
      if (cmd === "stop_voice_recording") {
        // 실제 백엔드는 stop 실패/IPC 실패 시에도 녹음이 유지될 수 있다.
        recording = true;
        throw new Error("transport failed");
      }
      return;
    });
    const { getByLabelText, findByText } = setup();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });
    expect(getByLabelText("음성 녹음 중지")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 중지"));
      await Promise.resolve();
    });

    expect(await findByText(/음성 입력 오류:/)).toBeInTheDocument();
    expect(getByLabelText("음성 녹음 중지")).toBeInTheDocument();
  });

  it("음성 입력 오류 배너의 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();

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
    const copyBtn = await screen.findByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyBtn);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith(
        expect.stringContaining("음성 입력 오류: 마이크 권한이 거부되었습니다"),
      );
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith(
        expect.stringContaining("음성 입력 오류: 마이크 권한이 거부되었습니다"),
      );
    }
  });

  it("마운트 시 voice_recording_status 조회", async () => {
    setup();
    expect(invokeMock).toHaveBeenCalledWith("voice_recording_status", undefined);
  });

  it("중지 처리 대기 중 unmount 되어도 비동기 정리에서 예외가 없어야 함", async () => {
    let resolveStop: ((value: string) => void) | null = null;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "start_voice_recording") return Promise.resolve(undefined);
      if (cmd === "stop_voice_recording") {
        return new Promise<string>((resolve) => {
          resolveStop = resolve;
        });
      }
      if (cmd === "voice_recording_status") return Promise.resolve(false);
      return Promise.resolve(undefined);
    });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { getByLabelText, unmount } = setup();

    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 시작"));
    });
    await act(async () => {
      fireEvent.click(getByLabelText("음성 녹음 중지"));
    });

    unmount();
    await act(async () => {
      resolveStop?.("done");
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("unmount 이후 voice_transcript 이벤트는 입력 주입을 발생시키지 않음", async () => {
    const { onChange, unmount } = setup();
    const beforeCalls = onChange.mock.calls.length;
    unmount();

    await act(async () => {
      const cb = voiceListeners[voiceListeners.length - 1];
      cb?.({ payload: "should not inject" });
    });

    expect(onChange.mock.calls.length).toBe(beforeCalls);
  });

  it("voice_transcript 이벤트 수신 시 입력창에 주입", async () => {
    const { input, onChange } = setup();
    await act(async () => {
      const cb = voiceListeners[voiceListeners.length - 1];
      cb?.({ payload: "cargo test" });
    });
    expect(input).toHaveValue("cargo test");
    expect(onChange).toHaveBeenLastCalledWith("cargo test");
    expect(screen.getByText("음성 입력 반영됨")).toBeInTheDocument();
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
