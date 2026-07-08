import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DynamicUIRenderer from "./DynamicUIRenderer";

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

  it("렌더 오류가 발생하면 오류 텍스트 복사 버튼을 통해 클립보드로 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    const invalidCode = `const invalid = ;`;

    render(<DynamicUIRenderer code={invalidCode} />);

    const errorText = await screen.findByText((content) =>
      content.includes("Unexpected token") || content.length > 0,
    );
    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(clipboardMock.writeText).toHaveBeenCalledTimes(1);
    });
    expect(clipboardMock.writeText).toHaveBeenCalledWith(errorText.textContent ?? "");

    clipboardMock.restore();
  });
});

