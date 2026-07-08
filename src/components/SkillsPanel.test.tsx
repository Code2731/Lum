import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Skill, SkillDraft } from "../hooks/useSkills";
import SkillsPanel from "./SkillsPanel";

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

const useSkillsMock = vi.fn();

vi.mock("../hooks/useSkills", () => ({
  useSkills: () => useSkillsMock(),
}));

const createHookState = () => ({
  skills: [] as Skill[],
  loading: false,
  error: null as string | null,
  save: vi.fn(async (_draft: SkillDraft) => ({
    id: "1",
    name: "",
    description: "",
    triggers: [],
    procedure: "",
    when_to_use: null,
    quick_reference: null,
    pitfalls: null,
    verification: null,
    created_ms: Date.now(),
    last_used_ms: null,
    success_count: 0,
  })),
  remove: vi.fn(),
  search: vi.fn(),
  importFromUrl: vi.fn(),
});

describe("SkillsPanel", () => {
  beforeEach(() => {
    useSkillsMock.mockReturnValue(createHookState());
  });

  it("목록 조회 실패 시 오류 텍스트를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    useSkillsMock.mockReturnValue({
      ...createHookState(),
      error: "스킬 목록을 읽지 못했습니다",
    });

    render(
      <TooltipProvider>
        <SkillsPanel onClose={vi.fn()} />
      </TooltipProvider>,
    );

    expect(await screen.findByText("스킬 목록을 읽지 못했습니다")).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("스킬 목록을 읽지 못했습니다");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("스킬 목록을 읽지 못했습니다");
    }
  });

  it("필수 입력 오류 메시지를 복사할 수 있다", async () => {
    const clipboardMock = setupClipboardWriteMock();
    render(
      <TooltipProvider>
        <SkillsPanel onClose={vi.fn()} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "새 스킬" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    const errorText = await screen.findByText("이름은 필수입니다.");
    expect(errorText).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "오류 텍스트 복사" });
    fireEvent.click(copyButton);

    if (clipboardMock.restore) {
      expect(clipboardMock.restore).toHaveBeenCalledWith("이름은 필수입니다.");
      clipboardMock.restore.mockRestore();
    } else {
      expect(clipboardMock.writeText).toHaveBeenCalledWith("이름은 필수입니다.");
    }
  });
});
