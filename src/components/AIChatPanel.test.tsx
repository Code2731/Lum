import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AIChatPanel from "./AIChatPanel";

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

    expect(screen.getByText("Esc 로 닫기")).toBeInTheDocument();
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
