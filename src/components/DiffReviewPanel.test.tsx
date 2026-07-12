import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import DiffReviewPanel, {
  getDiffReviewEmptyFlowSummary,
  getDiffReviewPrimaryFlowSummary,
  getDiffReviewResultFlowSummary,
} from "./DiffReviewPanel";

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

describe("DiffReviewPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("diff 리뷰 단계별 흐름 요약을 계산한다", () => {
    expect(getDiffReviewPrimaryFlowSummary(true)).toEqual({
      badges: ["먼저 범위 선택", "다음 스테이징 분석", "마지막 위험 확인"],
      helper: "스테이징과 워킹 트리 중 범위를 먼저 고르고, 분석 후 파일별 위험도를 펼쳐서 확인합니다.",
    });

    expect(getDiffReviewEmptyFlowSummary(false)).toEqual({
      badges: ["현재 범위", "워킹 트리 diff", "AI 파일별 검토"],
      helper: "범위를 확인한 뒤 분석을 누르면 파일별 요약과 위험도가 같은 순서로 정리됩니다.",
    });

    expect(getDiffReviewResultFlowSummary([
      { path: "src/app.ts", risk: "risk", summary: "설정 분기 영향 가능성" },
      { path: "src/ui.tsx", risk: "caution", summary: "UI 회귀 확인 필요" },
    ])).toEqual({
      badges: ["검토 2개", "위험 1개", "요약 펼치기"],
      helper: "위험 파일부터 먼저 열고, 주의 파일을 이어서 확인한 뒤 각 요약으로 수정 우선순위를 정합니다.",
    });
  });

  it("초기 상태에서 diff 리뷰 흐름 안내를 보여준다", () => {
    render(
      <TooltipProvider>
        <DiffReviewPanel model="local" onClose={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByText("먼저 범위 선택")).toBeInTheDocument();
    expect(screen.getByText("다음 스테이징 분석")).toBeInTheDocument();
    expect(screen.getByText("마지막 위험 확인")).toBeInTheDocument();
    expect(
      screen.getByText("스테이징과 워킹 트리 중 범위를 먼저 고르고, 분석 후 파일별 위험도를 펼쳐서 확인합니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("현재 범위")).toBeInTheDocument();
    expect(screen.getByText("AI 파일별 검토")).toBeInTheDocument();
  });

  it("분석 결과가 있으면 위험 확인 흐름 안내를 보여준다", async () => {
    invokeMock.mockResolvedValue([
      { path: "src/app.ts", risk: "risk", summary: "설정 분기 영향 가능성" },
      { path: "src/ui.tsx", risk: "caution", summary: "UI 회귀 확인 필요" },
    ]);

    render(
      <TooltipProvider>
        <DiffReviewPanel model="local" onClose={vi.fn()} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    expect(await screen.findByText("검토 2개")).toBeInTheDocument();
    expect(screen.getByText("위험 1개")).toBeInTheDocument();
    expect(screen.getByText("요약 펼치기")).toBeInTheDocument();
    expect(
      screen.getByText("위험 파일부터 먼저 열고, 주의 파일을 이어서 확인한 뒤 각 요약으로 수정 우선순위를 정합니다."),
    ).toBeInTheDocument();
  });

  it("분석 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    invokeMock.mockRejectedValue(new Error("Diff 분석 실패"));

    render(
      <TooltipProvider>
        <DiffReviewPanel model="local" onClose={vi.fn()} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "분석" }));

    const errorText = await screen.findByText("Error: Diff 분석 실패");
    expect(errorText).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("Error: Diff 분석 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("Error: Diff 분석 실패");
    }
  });
});
