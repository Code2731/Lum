import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Skill, SkillDraft } from "../hooks/useSkills";
import {
  getSkillEditorFooterMeta,
  getSkillEditorFlowSummary,
  getSkillsListStateMeta,
  getSkillsEmptyFlowSummary,
  getSkillsLibraryFlowSummary,
} from "./SkillsPanel";
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

  it("목록 흐름 요약을 검색 상태에 맞게 계산한다", () => {
    const skills = [
      {
        id: "1",
        name: "Rebase 충돌 정리",
        description: "충돌을 단계별로 정리한다",
        triggers: ["rebase"],
        procedure: "1. status",
        when_to_use: null,
        quick_reference: null,
        pitfalls: null,
        verification: null,
        created_ms: Date.now(),
        last_used_ms: null,
        success_count: 0,
      },
    ] satisfies Skill[];

    expect(getSkillsLibraryFlowSummary(skills, skills, "")).toEqual({
      badges: ["전체 스킬 1개", "다음 URL 가져오기", "마지막 새 스킬 작성"],
      helper: "기존 스킬을 먼저 훑고, 필요하면 URL로 가져오거나 새 스킬을 작성해 라이브러리를 확장합니다.",
    });

    expect(getSkillsLibraryFlowSummary(skills, [], "https://example.com/SKILL.md")).toEqual({
      badges: ["검색 결과 0개", "가져오기 URL 준비", "마지막 새 스킬 작성"],
      helper: "검색으로 필요한 스킬 범위를 좁혔습니다. 결과를 확인한 뒤 URL 가져오기나 새 스킬 작성으로 바로 이어갈 수 있습니다.",
    });
  });

  it("빈 상태와 편집 상태 흐름 요약을 계산한다", () => {
    expect(getSkillsEmptyFlowSummary()).toEqual({
      badges: ["현재 스킬 없음", "다음 절차 저장", "마지막 ReAct 자동 호출"],
      helper: "반복 작업 절차를 스킬로 저장해두면 다음에는 자연어 goal과 매칭되어 ReAct에 자동 주입됩니다.",
    });

    expect(getSkillEditorFlowSummary({
      name: "Git rebase 충돌 정리",
      description: "",
      triggers: ["rebase", "conflict"],
      procedure: "1. git status",
      when_to_use: "",
      quick_reference: "",
      pitfalls: "",
      verification: "git status clean 확인",
    })).toEqual({
      badges: ["이름 입력 완료", "트리거 2개 연결", "마지막 검증까지 작성"],
      helper: "이름, 트리거, 검증까지 채워져 있습니다. 절차를 다듬고 저장하면 다음 ReAct 흐름에서 바로 재사용됩니다.",
    });

    expect(getSkillEditorFooterMeta(false)).toEqual({
      helper: "저장하면 검색과 자연어 매칭 흐름에 즉시 반영됩니다.",
      saveLabel: "저장",
    });
  });

  it("목록 상태 메타는 로딩/빈 상태/목록 상태를 구분한다", () => {
    expect(getSkillsListStateMeta(true, 0)).toEqual({
      ariaLabel: "스킬 라이브러리 로딩 중",
      title: "로딩 중…",
      description: "저장된 스킬 절차를 불러오고 있습니다.",
    });

    expect(getSkillsListStateMeta(false, 0)).toEqual({
      ariaLabel: "스킬 라이브러리 빈 상태",
      title: "저장된 스킬이 없습니다.",
      description: "반복적으로 풀던 문제 절차를 저장해두면 다음에 ReAct가 자연어 매칭으로 자동 호출합니다.",
    });

    expect(getSkillsListStateMeta(false, 2)).toEqual({
      ariaLabel: "스킬 라이브러리 목록 · 2개",
      title: "스킬 2개",
      description: "저장된 스킬 절차를 바로 편집하거나 삭제할 수 있습니다.",
    });
  });

  it("목록 화면에서 검색-가져오기-작성 흐름 안내를 보여준다", () => {
    render(
      <TooltipProvider>
        <SkillsPanel onClose={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByText("전체 스킬 0개")).toBeInTheDocument();
    expect(screen.getByText("다음 URL 가져오기")).toBeInTheDocument();
    expect(screen.getByText("마지막 새 스킬 작성")).toBeInTheDocument();
    expect(
      screen.getByText("기존 스킬을 먼저 훑고, 필요하면 URL로 가져오거나 새 스킬을 작성해 라이브러리를 확장합니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("현재 스킬 없음")).toBeInTheDocument();
    expect(screen.getByText("마지막 ReAct 자동 호출")).toBeInTheDocument();
    expect(screen.getByLabelText("스킬 라이브러리 빈 상태")).toBeInTheDocument();
    expect(screen.getByText("저장된 스킬이 없습니다")).toBeInTheDocument();
    expect(
      screen.getByText("반복 작업 절차를 스킬로 저장해두면 다음부터는 자연어 goal과 자동으로 연결할 수 있습니다."),
    ).toBeInTheDocument();
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
    expect(screen.getByText("먼저 이름 입력")).toBeInTheDocument();
    expect(screen.getByText("다음 트리거 정리")).toBeInTheDocument();
    expect(screen.getByText("마지막 검증 저장")).toBeInTheDocument();
    expect(
      screen.getByText("이름과 트리거로 검색 가능성을 먼저 정하고, 절차와 검증을 채운 뒤 저장하면 다음 ReAct 흐름에서 바로 재사용됩니다."),
    ).toBeInTheDocument();
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
