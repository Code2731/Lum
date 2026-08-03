import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Squad } from "../hooks/useSquads";
import SquadPanel, {
  getSquadCreateFlowSummary,
  getSquadEmptyFlowSummary,
} from "./SquadPanel";

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
    base_branch: "main",
    repo_root: "/tmp/project",
    created_at: Date.now(),
  };
}

describe("SquadPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("생성 흐름과 빈 상태 흐름 요약을 계산한다", () => {
    expect(getSquadCreateFlowSummary("", "", 0)).toEqual({
      badges: ["먼저 작업 정의", "다음 새 탭 열기", "마지막 정리"],
      helper: "작업 설명과 베이스 브랜치를 먼저 정하고, squad를 만든 뒤 새 탭에서 이어가며 끝나면 정리합니다.",
    });

    expect(getSquadCreateFlowSummary("fix login bug", "main", 2)).toEqual({
      badges: ["작업 설명 입력됨", "다음 베이스 브랜치 고정", "마지막 기존 Squad 2개 정리"],
      helper: "작업 설명과 베이스 브랜치를 정해 squad를 만들 준비가 됐습니다. 생성 후 새 탭에서 바로 이어가고, 끝난 squad는 정리해 흐름을 유지합니다.",
    });

    expect(getSquadEmptyFlowSummary("/repo")).toEqual({
      badges: ["현재 Squad 없음", "다음 현재 저장소에서 분기", "마지막 새 탭 시작"],
      helper: "반복 작업이나 위험한 수정을 분리하고 싶을 때 squad를 만들면 현재 저장소 기준의 독립 worktree에서 바로 시작할 수 있습니다.",
    });
  });

  it("초기 상태에서 squad 생성 흐름 안내를 보여준다", () => {
    render(
      <TooltipProvider>
        <SquadPanel
          squads={[]}
          loading={false}
          error={null}
          currentCwd="/repo"
          onCreate={vi.fn(async () => createSquad())}
          onRemove={vi.fn()}
          onOpenInTab={vi.fn()}
          onClose={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("먼저 작업 정의")).toBeInTheDocument();
    expect(screen.getByText("다음 새 탭 열기")).toBeInTheDocument();
    expect(screen.getByText("마지막 정리")).toBeInTheDocument();
    expect(
      screen.getByText("작업 설명과 베이스 브랜치를 먼저 정하고, squad를 만든 뒤 새 탭에서 이어가며 끝나면 정리합니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("현재 Squad 없음")).toBeInTheDocument();
    expect(screen.getByText("다음 현재 저장소에서 분기")).toBeInTheDocument();
    expect(screen.getByText("마지막 새 탭 시작")).toBeInTheDocument();
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
