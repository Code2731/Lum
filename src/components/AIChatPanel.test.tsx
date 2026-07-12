import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AIChatPanel, { getAIChatFlowSummary } from "./AIChatPanel";

const createProps = () => ({
  messages: [],
  streaming: false,
  error: null as string | null,
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onClear: vi.fn(),
  onClose: vi.fn(),
  onExecute: vi.fn(),
});

describe("AIChatPanel", () => {
  it("요약 함수는 초기/스트리밍/오류 상태를 반환한다", () => {
    expect(getAIChatFlowSummary({ messages: [], streaming: false, error: null })).toEqual({
      primary: "질문 준비",
      secondary: "대화 시작 전",
      detail: "터미널 문맥에 맞는 질문이나 명령 초안을 먼저 보내 작업 흐름을 시작할 수 있습니다.",
    });
    expect(getAIChatFlowSummary({ messages: [{ id: "1", role: "user", content: "hi" } as any], streaming: true, error: null })).toEqual({
      primary: "응답 생성 중",
      secondary: "1개 메시지",
      detail: "생성 중인 응답을 기다리거나 필요하면 중단한 뒤 다음 질문으로 이어갈 수 있습니다.",
    });
    expect(getAIChatFlowSummary({ messages: [], streaming: false, error: "oops" })).toEqual({
      primary: "채팅 오류 확인",
      secondary: "설정 또는 재시도 필요",
      detail: "오류 내용을 읽고 설정 복구 또는 재질문으로 이어갈 수 있습니다.",
    });
  });

  it("초기 상태에서 대화 흐름 안내를 보여준다", () => {
    const props = createProps();
    render(<AIChatPanel {...props} />);

    expect(screen.getByText("질문 준비")).toBeInTheDocument();
    expect(screen.getByText("대화 시작 전")).toBeInTheDocument();
    expect(screen.getByText("마지막 실행 연결")).toBeInTheDocument();
    expect(
      screen.getByText("터미널 문맥에 맞는 질문이나 명령 초안을 먼저 보내 작업 흐름을 시작할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("현재 컨텍스트")).toBeInTheDocument();
    expect(screen.getByText("질문·명령 정리")).toBeInTheDocument();
    expect(screen.getByText("터미널 작업 연결")).toBeInTheDocument();
  });

  it("입력창 Esc 키로 패널 닫기를 호출한다", () => {
    const props = createProps();
    render(<AIChatPanel {...props} />);

    const input = screen.getByPlaceholderText("질문하세요… (Enter 전송 · Shift+Enter 줄바꿈)");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("닫기 안내 문구는 Esc 기준으로 표시된다", () => {
    const props = createProps();
    render(<AIChatPanel {...props} />);

    expect(
      screen.getByText("Enter 전송 · Shift+Enter 줄바꿈 · Esc 로 닫기"),
    ).toBeInTheDocument();
  });

  it("라우팅 에러면 xLLM 설정 버튼이 표시되고 동작한다", () => {
    const onOpenXllmPanel = vi.fn();
    render(
      <AIChatPanel
        {...createProps()}
        error="라우팅 실패: 임베디드 모델이 로드되지 않았습니다"
        onOpenXllmPanel={onOpenXllmPanel}
      />,
    );

    fireEvent.click(screen.getByLabelText("xLLM/모델 설정 열기"));
    expect(onOpenXllmPanel).toHaveBeenCalledTimes(1);
  });

  it("에러 배너에서 오류 텍스트를 복사할 수 있다", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = (globalThis.navigator as Navigator & { clipboard?: { writeText: typeof writeText } }).clipboard;
    let spyWriteText: ReturnType<typeof vi.fn> | null = null;
    if (originalClipboard) {
      spyWriteText = vi.spyOn(originalClipboard, "writeText").mockResolvedValue(undefined);
    } else {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
    }

    render(
      <AIChatPanel
        {...createProps()}
        error="임시 에러"
      />,
    );

    fireEvent.click(screen.getByLabelText("오류 텍스트 복사"));
    if (spyWriteText) {
      expect(spyWriteText).toHaveBeenCalledWith("임시 에러");
    } else {
      expect(writeText).toHaveBeenCalledWith("임시 에러");
    }
  });
});
