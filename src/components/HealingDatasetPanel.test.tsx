import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import HealingDatasetPanel, {
  getHealingDatasetEmptyMeta,
  getHealingDatasetFlowMeta,
} from "./HealingDatasetPanel";

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

  it("상단 흐름과 빈 상태 메타를 계산한다", () => {
    expect(getHealingDatasetFlowMeta()).toEqual({
      badges: ["먼저 검토", "다음 사유 확인", "마지막 export 정리"],
      helper: "승인·거부 기록을 먼저 보고, reject 사유를 확인한 뒤 학습용으로 내보내거나 정리합니다.",
    });
    expect(getHealingDatasetEmptyMeta()).toEqual({
      badges: ["제안 대기", "승인·거부 누적", "학습 준비"],
      title: "아직 수집된 결정이 없습니다.",
      description: "자동치유 제안을 승인/거부할 때마다 여기에 누적됩니다.",
    });
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

    expect(screen.getByText("먼저 검토")).toBeInTheDocument();
    expect(screen.getByText("다음 사유 확인")).toBeInTheDocument();
    expect(screen.getByText("마지막 export 정리")).toBeInTheDocument();
    expect(screen.getByText("제안 대기")).toBeInTheDocument();
    expect(screen.getByText("승인·거부 누적")).toBeInTheDocument();
    expect(screen.getByText("학습 준비")).toBeInTheDocument();
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
