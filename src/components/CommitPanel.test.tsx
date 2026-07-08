import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import CommitPanel from "./CommitPanel";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

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

describe("CommitPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("생성 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    invokeMock.mockRejectedValue(new Error("커밋 메시지 생성 실패"));

    render(
      <TooltipProvider>
        <CommitPanel model="mock-model" onExecute={vi.fn()} onClose={vi.fn()} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    const errorText = await screen.findByText("Error: 커밋 메시지 생성 실패");
    expect(errorText).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("Error: 커밋 메시지 생성 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("Error: 커밋 메시지 생성 실패");
    }
  });
});
