import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AgentPanel from "./AgentPanel";
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
