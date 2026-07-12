import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RecallEntry, RecallStats } from "../hooks/useRecall";
import RecallPanel, {
  getRecallPanelEmptyMeta,
  getRecallPanelFlowMeta,
} from "./RecallPanel";

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

  it("상단 흐름과 빈 상태 메타를 계산한다", () => {
    expect(getRecallPanelFlowMeta()).toEqual({
      badges: ["먼저 검색", "다음 주입", "마지막 잊기"],
      helper: "자연어로 지난 흐름을 찾고, 필요한 기록만 AI로 다시 넣은 뒤 오래된 데이터는 정리합니다.",
    });
    expect(getRecallPanelEmptyMeta(false)).toEqual({
      badges: ["자연어 검색", "과거 흐름", "AI 주입"],
      title: "쿼리를 입력하세요",
      description: "자연어로 과거 명령·치유·메모리를 검색합니다.",
    });
    expect(getRecallPanelEmptyMeta(true)).toEqual({
      badges: ["검색 조정", "필터 완화", "다시 찾기"],
      title: "결과 없음",
      description: "검색어를 줄이거나 소스·시간 필터를 넓혀 다시 찾습니다.",
    });
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

    expect(screen.getByText("먼저 검색")).toBeInTheDocument();
    expect(screen.getByText("다음 주입")).toBeInTheDocument();
    expect(screen.getByText("마지막 잊기")).toBeInTheDocument();
    expect(screen.getByText("자연어 질문")).toBeInTheDocument();
    expect(screen.getByText("쿼리를 입력하세요")).toBeInTheDocument();
    expect(screen.getByText("자연어로 과거 명령·치유·메모리를 검색합니다.")).toBeInTheDocument();
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
