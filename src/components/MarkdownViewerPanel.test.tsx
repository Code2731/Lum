import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MarkdownViewerPanel from "./MarkdownViewerPanel";

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

describe("MarkdownViewerPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("에러 메시지를 복사할 수 있다", () => {
    const clipboardMock = setupClipboardWriteMock();

    render(
      <MarkdownViewerPanel
        path="/tmp/doc.md"
        title="문서"
        content="# 제목"
        loading={false}
        error="문서를 열 수 없습니다"
        onClose={vi.fn()}
      />,
    );

    const errorText = screen.getByText("문서를 열 수 없습니다");
    expect(errorText).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("문서를 열 수 없습니다");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("문서를 열 수 없습니다");
    }
  });
});
