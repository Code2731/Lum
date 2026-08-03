import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary, getErrorBoundaryFlowSummary } from "./ErrorBoundary";

type WriteSpy = ReturnType<typeof vi.fn>;
type RestoreSpy = ReturnType<typeof vi.spyOn>;

function setupClipboardWriteMock() {
  const writeText = vi.fn().mockResolvedValue(undefined);
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

function ThrowingChild(): never {
  throw new Error("컴포넌트 렌더링 실패");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("요약 함수는 라벨과 오류 메시지를 반영한다", () => {
    expect(
      getErrorBoundaryFlowSummary({
        label: "테스트 패널",
        errorMessage: "컴포넌트 렌더링 실패",
      }),
    ).toEqual({
      primary: "렌더링 오류 감지",
      secondary: "테스트 패널",
      detail: "컴포넌트 렌더링 실패 오류 내용을 확인하고 필요하면 복사해 공유한 뒤 다시 시도할 수 있습니다.",
    });
  });

  it("오류 메시지를 렌더링하고 복사할 수 있다", () => {
    const clipboardMock = setupClipboardWriteMock();
    render(
      <ErrorBoundary label="테스트 패널">
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText("테스트 패널 렌더링 오류")).toBeInTheDocument();
    expect(screen.getByText("컴포넌트 렌더링 실패")).toBeInTheDocument();
    expect(screen.getByText("렌더링 오류 감지")).toBeInTheDocument();
    expect(screen.getByText("테스트 패널")).toBeInTheDocument();
    expect(screen.getByText("마지막 다시 시도")).toBeInTheDocument();
    expect(
      screen.getByText("컴포넌트 렌더링 실패 오류 내용을 확인하고 필요하면 복사해 공유한 뒤 다시 시도할 수 있습니다."),
    ).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("컴포넌트 렌더링 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("컴포넌트 렌더링 실패");
    }
  });
});
