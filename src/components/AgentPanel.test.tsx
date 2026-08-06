import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AgentPanel, {
  getAgentPanelApprovalFlowSummary,
  getAgentPanelHeaderFlowSummary,
} from "./AgentPanel";
import type { AgentState } from "../hooks/useAgentLoop";

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

describe("AgentPanel", () => {
  it("에이전트 상태별 흐름 요약을 계산한다", () => {
    expect(getAgentPanelHeaderFlowSummary("awaiting_approval")).toEqual({
      badges: ["먼저 계획 확인", "다음 승인", "마지막 관찰"],
      helper: "계획과 위험도를 먼저 보고, 승인 후 실행 흐름으로 넘기면 관찰 결과가 아래에 이어집니다.",
    });

    expect(getAgentPanelHeaderFlowSummary("failed")).toEqual({
      badges: ["현재 결과", "다음 기록 확인", "마지막 닫기"],
      helper: "오류를 복사해 공유하거나, 아래에서 어디까지 실행됐는지 확인한 뒤 같은 작업을 다시 정리할 수 있습니다.",
    });

    expect(getAgentPanelApprovalFlowSummary(2, 0, 1)).toEqual({
      badges: ["총 2단계", "위험 1개", "실행 대기"],
      helper: "실행 전에 단계 수와 위험도를 먼저 보고, 승인 후 같은 순서대로 실행이 진행됩니다.",
    });
  });

  it("승인 대기 상태에서 실행 흐름 요약을 보여준다", () => {
    const state: AgentState = {
      status: "awaiting_approval",
      task: "배포 준비",
      plan: [
        {
          id: 1,
          cmd: "npm run build",
          description: "프론트엔드 빌드",
          risk: "safe",
        },
        {
          id: 2,
          cmd: "git push",
          description: "원격 저장소로 푸시",
          risk: "danger",
        },
      ],
      currentStepIdx: 0,
      completed: [],
      message: "",
    };

    render(
      <AgentPanel
        state={state}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("먼저 계획 확인")).toBeInTheDocument();
    expect(screen.getByText("다음 승인")).toBeInTheDocument();
    expect(screen.getByText("총 2단계")).toBeInTheDocument();
    expect(screen.getByText("위험 1개")).toBeInTheDocument();
    expect(
      screen.getByText("실행 전에 단계 수와 위험도를 먼저 보고, 승인 후 같은 순서대로 실행이 진행됩니다."),
    ).toBeInTheDocument();
  });

  it("실패 메시지를 복사할 수 있다", () => {
    const clipboardMock = setupClipboardWriteMock();

    const state: AgentState = {
      status: "failed",
      task: "테스트 작업",
      plan: [],
      currentStepIdx: 0,
      completed: [],
      message: "에이전트 실행 실패",
    };

    render(
      <AgentPanel
        state={state}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("현재 결과")).toBeInTheDocument();
    expect(screen.getByText("다음 기록 확인")).toBeInTheDocument();
    expect(
      screen.getAllByText("오류를 복사해 공유하거나, 아래에서 어디까지 실행됐는지 확인한 뒤 같은 작업을 다시 정리할 수 있습니다.").length,
    ).toBeGreaterThan(0);

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("에이전트 실행 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("에이전트 실행 실패");
    }
  });
});
