import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import HealingPanel, {
  getHealingDetailFlowSummary,
  getHealingPrimaryFlowSummary,
} from "./HealingPanel";

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

describe("HealingPanel", () => {
  it("자동 복구 단계별 흐름 요약을 계산한다", () => {
    expect(getHealingPrimaryFlowSummary(null, false)).toEqual({
      badges: ["먼저 분석", "다음 제안 확인", "마지막 실행·차단"],
      helper: "오류를 먼저 분석하고, 제안 커맨드와 안전도를 확인한 뒤 실행하거나 직접 판단합니다.",
    });

    expect(getHealingDetailFlowSummary(null, true)).toEqual({
      badges: ["분석 진행 중", "제안 생성", "안전도 계산"],
      helper: "현재 오류 패턴을 읽고 제안 명령과 안전도를 계산하는 중입니다.",
    });

    expect(getHealingPrimaryFlowSummary({
      analysis: "권한 문제입니다.",
      suggestion: "chmod +x script.sh",
      safetyLevel: "Warning",
    }, false)).toEqual({
      badges: ["분석 완료", "주의 등급 확인", "마지막 실행 결정"],
      helper: "오류 분석과 안전도 계산이 끝났습니다. 제안 내용을 읽고 자동 실행할지 직접 처리할지 결정합니다.",
    });
  });

  it("초기 상태에서 자동 복구 흐름 안내를 보여준다", () => {
    render(
      <HealingPanel
        errorSnippet={`failed to execute
line2`}
        result={null}
        isAnalyzing={false}
        onAnalyze={vi.fn()}
        onExecute={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("먼저 분석")).toBeInTheDocument();
    expect(screen.getByText("다음 제안 확인")).toBeInTheDocument();
    expect(screen.getByText("마지막 실행·차단")).toBeInTheDocument();
    expect(
      screen.getByText("오류를 먼저 분석하고, 제안 커맨드와 안전도를 확인한 뒤 실행하거나 직접 판단합니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("오류 감지")).toBeInTheDocument();
    expect(screen.getByText("AI 분석 대기")).toBeInTheDocument();
    expect(screen.getByText("실행 전 확인")).toBeInTheDocument();
  });

  it("오류 스니펫을 클립보드에 복사할 수 있다", () => {
    const clipboardMock = setupClipboardWriteMock();

    const snippet = ["failed to execute", "line2"].join("\n");

    render(
      <HealingPanel
        errorSnippet={snippet}
        result={null}
        isAnalyzing={false}
        onAnalyze={vi.fn()}
        onExecute={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith(snippet);
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith(snippet);
    }
  });
});
