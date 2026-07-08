import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Squad } from "../hooks/useSquads";
import SquadPanel from "./SquadPanel";

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

function createSquad(): Squad {
  return {
    id: "s-1",
    task: "login bug",
    branch: "squads/login-fix",
    worktree_path: "/tmp/squads/login-fix",
    base_branch: null,
    created_at: Date.now(),
  };
}

describe("SquadPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("생성 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    const onCreate = vi.fn(async () => {
      throw new Error("Squad 생성 실패");
    });

    render(
      <TooltipProvider>
        <SquadPanel
          squads={[]}
          loading={false}
          error={null}
          currentCwd="/repo"
          onCreate={onCreate}
          onRemove={vi.fn()}
          onOpenInTab={vi.fn()}
          onClose={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("작업 설명 (예: fix login bug)"), {
      target: { value: "fix bug" },
    });
    fireEvent.click(screen.getByRole("button", { name: "생성 + 새 탭" }));

    const errorText = await screen.findByText("Error: Squad 생성 실패");
    expect(errorText).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("Error: Squad 생성 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("Error: Squad 생성 실패");
    }
  });

  it("목록 조회 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();

    render(
      <TooltipProvider>
        <SquadPanel
          squads={[]}
          loading={false}
          error="워크트리 목록 조회 실패"
          currentCwd="/repo"
          onCreate={vi.fn(async () => createSquad())}
          onRemove={vi.fn()}
          onOpenInTab={vi.fn()}
          onClose={vi.fn()}
        />
      </TooltipProvider>,
    );

    const errorText = await screen.findByText("워크트리 목록 조회 실패");
    expect(errorText).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("워크트리 목록 조회 실패");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("워크트리 목록 조회 실패");
    }
  });
});
