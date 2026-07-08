import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RecallEntry, RecallStats } from "../hooks/useRecall";
import RecallPanel from "./RecallPanel";

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

const useRecallMock = vi.fn();

vi.mock("../hooks/useRecall", () => ({
  useRecall: () => useRecallMock(),
}));

describe("RecallPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("에러 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    const stats: RecallStats = {
      now_ms: Date.now(),
      history: { count: 0, oldest_ms: 0, newest_ms: 0 },
      healing: { count: 0, oldest_ms: 0, newest_ms: 0 },
      memory: { count: 0, oldest_ms: 0, newest_ms: 0 },
    };
    const entries: RecallEntry[] = [] as RecallEntry[];
    useRecallMock.mockReturnValue({
      results: entries,
      stats,
      loading: false,
      error: "메모리 검색 실패",
      search: vi.fn(),
      forget: vi.fn(async () => {}),
      forgetBefore: vi.fn(async () => {}),
    });

    render(
      <TooltipProvider>
        <RecallPanel model="local" onClose={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByText("메모리 검색 실패")).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("메모리 검색 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("메모리 검색 실패");
    }
  });
});
