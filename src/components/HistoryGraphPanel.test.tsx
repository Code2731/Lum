import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HistoryGraphPanel,
  getHistoryGraphPanelErrorMeta,
  getHistoryGraphPanelFlowMeta,
} from "./HistoryGraphPanel";

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

describe("HistoryGraphPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("그래프 안내와 오류 메타를 계산한다", () => {
    expect(getHistoryGraphPanelFlowMeta()).toEqual({
      badges: ["먼저 새로고침", "다음 노드 선택", "마지막 라벨 확인"],
      helper: "그래프를 갱신한 뒤 관심 노드를 눌러 의미 묶음을 확인합니다.",
    });
    expect(getHistoryGraphPanelErrorMeta()).toEqual({
      badges: ["오류 확인", "텍스트 복사", "다시 계산"],
      copyTooltip: "오류 텍스트 복사",
    });
  });

  it("그래프 로드 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    invokeMock.mockRejectedValue(new Error("그래프 계산 실패"));

    render(<HistoryGraphPanel onClose={vi.fn()} />);

    expect(screen.getByText("먼저 새로고침")).toBeInTheDocument();
    expect(screen.getByText("다음 노드 선택")).toBeInTheDocument();
    expect(screen.getByText("마지막 라벨 확인")).toBeInTheDocument();
    expect(screen.getByText("그래프를 갱신한 뒤 관심 노드를 눌러 의미 묶음을 확인합니다.")).toBeInTheDocument();
    const errorText = await screen.findByText("Error: 그래프 계산 실패");
    expect(errorText).toBeInTheDocument();
    expect(screen.getByText("오류 확인")).toBeInTheDocument();
    expect(screen.getByText("텍스트 복사")).toBeInTheDocument();
    expect(screen.getByText("다시 계산")).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("Error: 그래프 계산 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("Error: 그래프 계산 실패");
    }
  });
});
