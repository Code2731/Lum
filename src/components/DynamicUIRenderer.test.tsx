import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DynamicUIRenderer, { getDynamicUIRendererFlowSummary } from "./DynamicUIRenderer";

type WriteSpy = ReturnType<typeof vi.fn>;

function setupClipboardWriteMock() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const nav = globalThis.navigator as Navigator & {
    clipboard?: { writeText: WriteSpy };
  };
  const originalClipboard = nav.clipboard;

  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText,
    },
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

describe("DynamicUIRenderer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("동적 UI 렌더 흐름 요약을 계산한다", () => {
    expect(getDynamicUIRendererFlowSummary(null)).toEqual({
      badges: ["JSX 변환", "샌드박스 주입", "미리보기 확인"],
      helper: "실행 결과는 iframe 안에서만 렌더링되며 앱 외부 상태는 변경하지 않습니다.",
      tone: "cyan",
    });

    expect(getDynamicUIRendererFlowSummary("Unexpected token")).toEqual({
      badges: ["JSX 변환", "샌드박스 주입", "오류 확인"],
      helper: "오류 내용을 복사해 AI 응답이나 코드 블록으로 다시 넘길 수 있습니다.",
      tone: "amber",
    });
  });

  it("기본 렌더 상태에서 샌드박스 흐름 안내와 미리보기 iframe을 보여준다", () => {
    const validCode = "function App() { return <div>hello</div>; }";

    render(<DynamicUIRenderer code={validCode} />);

    expect(screen.getByLabelText("동적 UI 렌더러")).toBeInTheDocument();
    expect(screen.getByText("JSX 변환")).toBeInTheDocument();
    expect(screen.getByText("샌드박스 주입")).toBeInTheDocument();
    expect(screen.getByText("미리보기 확인")).toBeInTheDocument();
    expect(screen.getByTitle("AI 생성 UI 샌드박스")).toBeInTheDocument();
  });

  it("렌더 오류가 발생하면 오류 텍스트 복사 버튼을 통해 클립보드로 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    const invalidCode = `const invalid = ;`;

    render(<DynamicUIRenderer code={invalidCode} />);

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toHaveTextContent("Unexpected token");
    expect(screen.getByText("오류 확인")).toBeInTheDocument();
    const copyButton = screen.getByTitle("오류 텍스트 복사");

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(clipboardMock.writeText).toHaveBeenCalledTimes(1);
    });
    expect(clipboardMock.writeText).toHaveBeenCalledWith(errorAlert.textContent ?? "");

    clipboardMock.restore();
  });
});
