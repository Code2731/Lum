import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import HealingDatasetPanel from "./HealingDatasetPanel";

const invokeMock = vi.fn();

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

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

describe("HealingDatasetPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("목록 조회 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_healing_dataset") {
        return Promise.reject(new Error("치유 데이터 조회 실패"));
      }
      return Promise.resolve([]);
    });

    render(
      <TooltipProvider>
        <HealingDatasetPanel onClose={vi.fn()} />
      </TooltipProvider>,
    );

    const errorText = await screen.findByText("Error: 치유 데이터 조회 실패");
    expect(errorText).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("Error: 치유 데이터 조회 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("Error: 치유 데이터 조회 실패");
    }
  });
});
