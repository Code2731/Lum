import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import CommitPanel, {
  getCommitPanelInputFlowSummary,
  getCommitPanelMessageFlowSummary,
} from "./CommitPanel";

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

  it("입력 단계와 메시지 단계 흐름 요약을 계산한다", () => {
    expect(getCommitPanelInputFlowSummary("")).toEqual({
      badges: ["먼저 저장소 경로 확인", "다음 커밋 메시지 생성", "마지막 복사·실행"],
      helper: "저장소 위치를 먼저 확인하고 AI 메시지를 만든 뒤, 내용을 다듬어 복사하거나 바로 git commit으로 이어갑니다.",
    });

    expect(getCommitPanelInputFlowSummary("/Users/you/MyProject")).toEqual({
      badges: ["저장소 경로 입력됨", "다음 커밋 메시지 생성", "마지막 복사·실행"],
      helper: "저장소 위치가 준비됐습니다. AI 메시지를 생성한 뒤 내용을 다듬어 복사하거나 바로 git commit으로 이어갈 수 있습니다.",
    });

    expect(getCommitPanelMessageFlowSummary("feat: add flow summary")).toEqual({
      badges: ["생성 문구 1줄", "다음 제목 문구 수정", "마지막 복사·실행"],
      helper: "생성된 커밋 제목을 확인했습니다. 필요하면 본문을 보강하거나 문구를 다듬은 뒤 복사 또는 실행으로 이어갑니다.",
    });

    expect(getCommitPanelMessageFlowSummary("feat: add flow summary\n\n- update panel")).toEqual({
      badges: ["생성 문구 2줄", "다음 본문까지 검토", "마지막 복사·실행"],
      helper: "생성된 제목과 본문을 먼저 읽고 필요한 문구를 수정한 뒤, 복사하거나 바로 커밋 명령으로 실행합니다.",
    });
  });

  it("생성 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    invokeMock.mockRejectedValue(new Error("커밋 메시지 생성 실패"));

    render(
      <TooltipProvider>
        <CommitPanel model="mock-model" onExecute={vi.fn()} onClose={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByText("먼저 저장소 경로 확인")).toBeInTheDocument();
    expect(screen.getByText("다음 커밋 메시지 생성")).toBeInTheDocument();
    expect(screen.getByText("마지막 복사·실행")).toBeInTheDocument();
    expect(screen.getByText("저장소 위치를 먼저 확인하고 AI 메시지를 만든 뒤, 내용을 다듬어 복사하거나 바로 git commit으로 이어갑니다.")).toBeInTheDocument();
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
