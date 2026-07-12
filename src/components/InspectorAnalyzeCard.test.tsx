import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorAnalyzeCard, {
  getInspectorAnalyzeActionHint,
  getInspectorAnalyzePrimaryCta,
  getInspectorSuggestedCommandMeta,
  getInspectorAnalyzeStatusMeta,
} from "./InspectorAnalyzeCard";
import type { InspectorAnalyzeCache } from "./InspectorPanel/types";

const baseAnalyzeCache: InspectorAnalyzeCache = {
  blockId: "fail-1",
  command: "npm test",
  requestedAt: 1,
  status: "done",
  result: "테스트 스냅샷이 실패했습니다.",
  rawResult: "raw output",
  suggestedCommands: ["npm test -- --runInBand", "npm run lint"],
};

function createProps(overrides: Partial<React.ComponentProps<typeof InspectorAnalyzeCard>> = {}) {
  return {
    analyzeCache: null,
    commandMenuIndex: null,
    isInspectorCompact: false,
    inspectorCardRegularClass: "card-regular",
    inspectorMoreButtonRefs: { current: {} as Record<number, HTMLButtonElement | null> },
    inspectorMenuFirstActionRefs: { current: {} as Record<number, HTMLButtonElement | null> },
    onCopyAnalyzeResult: vi.fn(),
    onClearAnalyzeCache: vi.fn(),
    onCopySuggestedCommand: vi.fn(),
    onLoadSuggestedCommandToAiBar: vi.fn(),
    onApplySuggestedCommand: vi.fn(),
    onCommandMenuRowBlurCapture: vi.fn(),
    onSuggestedCommandRowKeyDown: vi.fn(),
    onCompactMenuKeyDown: vi.fn(),
    onOpenCompactMenu: vi.fn(),
    onCloseCommandMenu: vi.fn(),
    ...overrides,
  };
}

describe("InspectorAnalyzeCard", () => {
  it("상태 메타와 액션 힌트를 계산한다", () => {
    expect(getInspectorAnalyzeStatusMeta("streaming")).toEqual({
      statusLabel: "진행 중",
      statusClassName: "inline-flex items-center gap-1 text-xs text-cyan-100",
      summaryTone: "cyan",
      resultClassName: "text-xs font-mono break-words text-cyan-100/78",
    });
    expect(getInspectorAnalyzeStatusMeta("error")).toEqual({
      statusLabel: "분석 오류",
      statusClassName: "text-xs px-1.5 py-0.5 rounded bg-rose-400/20 text-rose-100",
      summaryTone: "amber",
      resultClassName: "text-xs font-mono break-words text-rose-100/80",
    });
    expect(getInspectorAnalyzeActionHint(true)).toBe("실행 · 추가 액션에서 복사/입력");
    expect(getInspectorAnalyzeActionHint(false)).toBe("실행 · 복사 · 입력");
    expect(getInspectorSuggestedCommandMeta(0, 3)).toEqual({
      badge: "먼저 실행",
      tone: "cyan",
      helper: "가장 가능성 높은 복구 커맨드입니다.",
    });
    expect(getInspectorSuggestedCommandMeta(1, 3)).toEqual({
      badge: "대안",
      tone: "amber",
      helper: "첫 제안이 맞지 않을 때 바로 전환할 후보입니다.",
    });
    expect(getInspectorSuggestedCommandMeta(2, 3)).toEqual({
      badge: "추가 점검",
      tone: "neutral",
      helper: "앞선 제안으로 충분하지 않을 때 이어서 확인합니다.",
    });
    expect(getInspectorAnalyzePrimaryCta({
      status: "done",
      suggestedCommandCount: 2,
      isInspectorCompact: false,
    })).toEqual({
      label: "첫 제안 바로 실행",
      helper: "분석이 끝났다면 가장 먼저 첫 번째 추천 커맨드부터 실행해 복구 가능성을 빠르게 확인합니다.",
      showQuickLoad: true,
      badges: ["먼저 실행", "필요시 복사", "AI 입력 전환"],
      shortcutHint: "R 실행 · C 복사 · L 입력",
      remainingHint: "대안 1개가 더 준비되어 있습니다.",
    });
    expect(getInspectorAnalyzePrimaryCta({
      status: "done",
      suggestedCommandCount: 2,
      isInspectorCompact: true,
    })).toEqual({
      label: "첫 제안 실행",
      helper: "분석이 끝났다면 가장 먼저 첫 번째 추천 커맨드부터 실행해 복구 가능성을 빠르게 확인합니다.",
      showQuickLoad: false,
      badges: ["먼저 실행", "필요시 복사", "추가 액션"],
      shortcutHint: "R 실행 · 추가 메뉴에서 C/L",
      remainingHint: "대안 1개가 더 준비되어 있습니다.",
    });
    expect(getInspectorAnalyzePrimaryCta({
      status: "streaming",
      suggestedCommandCount: 2,
      isInspectorCompact: false,
    })).toBeNull();
  });

  it("분석 캐시가 없으면 빈 상태 문구를 보여준다", () => {
    render(<InspectorAnalyzeCard {...createProps()} />);

    expect(screen.getByText("아직 실행된 분석이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("결과 지우기")).not.toBeInTheDocument();
  });

  it("streaming 상태는 진행 표시를 보여준다", () => {
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: {
            ...baseAnalyzeCache,
            status: "streaming",
            result: "",
            suggestedCommands: [],
          },
        })}
      />,
    );

    expect(screen.getByText("진행 중")).toBeInTheDocument();
    expect(screen.getByText("먼저 결과")).toBeInTheDocument();
    expect(screen.getByText("다음 제안")).toBeInTheDocument();
    expect(screen.getByText("마지막 실행")).toBeInTheDocument();
    expect(screen.getByText("분석 결과를 먼저 확인하고, 추천 커맨드를 고른 뒤 실행하거나 입력에 넣습니다.")).toBeInTheDocument();
    expect(screen.getByText("응답을 기다리는 중...")).toBeInTheDocument();
  });

  it("error 상태는 오류 표시를 보여준다", () => {
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: {
            ...baseAnalyzeCache,
            status: "error",
            result: "stderr: command failed",
            suggestedCommands: [],
          },
        })}
      />,
    );

    expect(screen.getByText("분석 오류")).toBeInTheDocument();
    expect(screen.getByText("먼저 결과")).toBeInTheDocument();
    expect(screen.getByText("stderr: command failed")).toBeInTheDocument();
  });

  it("cozy 모드에서는 추천 커맨드 액션과 RUN #1을 호출한다", () => {
    const onCopySuggestedCommand = vi.fn();
    const onLoadSuggestedCommandToAiBar = vi.fn();
    const onApplySuggestedCommand = vi.fn();
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: baseAnalyzeCache,
          isInspectorCompact: false,
          onCopySuggestedCommand,
          onLoadSuggestedCommandToAiBar,
          onApplySuggestedCommand,
        })}
      />,
    );

    expect(screen.getByText("실행 · 복사 · 입력")).toBeInTheDocument();
    expect(screen.getByText("먼저 실행")).toBeInTheDocument();
    expect(screen.getByText("대안")).toBeInTheDocument();
    expect(screen.getByText("첫 제안 바로 실행")).toBeInTheDocument();
    expect(screen.getByText("필요시 복사")).toBeInTheDocument();
    expect(screen.getByText("AI 입력 전환")).toBeInTheDocument();
    expect(screen.getByText("첫 제안 커맨드")).toBeInTheDocument();
    expect(screen.getByText("R 실행 · C 복사 · L 입력")).toBeInTheDocument();
    expect(screen.getByText("대안 1개가 더 준비되어 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("다음 대안")).toBeInTheDocument();
    expect(screen.getByText("npm run lint")).toBeInTheDocument();
    expect(screen.getByTitle("첫 번째 추천 커맨드 복사")).toBeInTheDocument();
    expect(screen.getByTitle("첫 번째 추천 커맨드 입력바 로드")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("2번 커맨드 복사 (C)"));
    fireEvent.click(screen.getByTitle("2번 커맨드 AI 입력바 로드 (L)"));
    fireEvent.click(screen.getByTitle("2번 커맨드 실행 (R)"));
    fireEvent.click(screen.getByTitle("첫 번째 추천 커맨드 복사"));
    fireEvent.click(screen.getByTitle("첫 번째 추천 커맨드 입력바 로드"));
    fireEvent.click(screen.getByTitle("첫 번째 추천 커맨드 바로 실행"));
    fireEvent.click(screen.getByText("첫 실행"));

    expect(onCopySuggestedCommand).toHaveBeenNthCalledWith(1, 1);
    expect(onCopySuggestedCommand).toHaveBeenNthCalledWith(2, 0);
    expect(onLoadSuggestedCommandToAiBar).toHaveBeenNthCalledWith(1, 1);
    expect(onLoadSuggestedCommandToAiBar).toHaveBeenNthCalledWith(2, 0);
    expect(onApplySuggestedCommand).toHaveBeenNthCalledWith(1, 1);
    expect(onApplySuggestedCommand).toHaveBeenNthCalledWith(2, 0);
    expect(onApplySuggestedCommand).toHaveBeenNthCalledWith(3, 0);
  });

  it("compact 모드에서는 MORE 버튼 ref와 메뉴 ref를 연결한다", () => {
    const moreRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const menuRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: baseAnalyzeCache,
          isInspectorCompact: true,
          commandMenuIndex: 0,
          inspectorMoreButtonRefs: moreRefs,
          inspectorMenuFirstActionRefs: menuRefs,
        })}
      />,
    );

    const moreButton = screen.getAllByText("추가")[0].closest("button");
    expect(moreButton).toHaveAttribute("aria-controls", "inspector-command-menu-0");
    expect(moreRefs.current[0]).toBe(moreButton);
    expect(menuRefs.current[0]).toBe(screen.getByText("복사 (C)").closest("button"));
  });

  it("compact 모드에서는 MORE 버튼과 메뉴 액션이 각 콜백을 호출한다", () => {
    const onOpenCompactMenu = vi.fn();
    const onCloseCommandMenu = vi.fn();
    const onCopySuggestedCommand = vi.fn();
    const onLoadSuggestedCommandToAiBar = vi.fn();
    const onCompactMenuKeyDown = vi.fn();
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: baseAnalyzeCache,
          isInspectorCompact: true,
          commandMenuIndex: 0,
          onOpenCompactMenu,
          onCloseCommandMenu,
          onCopySuggestedCommand,
          onLoadSuggestedCommandToAiBar,
          onCompactMenuKeyDown,
        })}
      />,
    );

    fireEvent.click(screen.getAllByText("추가")[0]);
    fireEvent.keyDown(screen.getAllByText("추가")[1], { key: "ArrowDown" });
    fireEvent.click(screen.getByText("복사 (C)"));
    fireEvent.click(screen.getByText("입력 (L)"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowRight" });

    expect(onCloseCommandMenu).toHaveBeenCalledWith(true);
    expect(onOpenCompactMenu).toHaveBeenCalledWith(1);
    expect(onCopySuggestedCommand).toHaveBeenCalledWith(0);
    expect(onLoadSuggestedCommandToAiBar).toHaveBeenCalledWith(0);
    expect(onCompactMenuKeyDown).toHaveBeenCalledTimes(1);
  });

  it("compact 모드에서 MORE 버튼의 비지원 키는 onOpenCompactMenu를 호출하지 않는다", () => {
    const onOpenCompactMenu = vi.fn();
    const onCloseCommandMenu = vi.fn();
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: baseAnalyzeCache,
          isInspectorCompact: true,
          commandMenuIndex: 0,
          onOpenCompactMenu,
          onCloseCommandMenu,
        })}
      />,
    );

    const moreButton = screen.getAllByText("추가")[0];
    fireEvent.keyDown(moreButton, { key: "ArrowUp" });
    fireEvent.keyDown(moreButton, { key: "Tab" });

    expect(onOpenCompactMenu).not.toHaveBeenCalled();
    expect(onCloseCommandMenu).not.toHaveBeenCalled();
  });

  it("compact 메뉴 keydown에서 Escape도 행 인덱스를 전달한다", () => {
    const onCompactMenuKeyDown = vi.fn();
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: baseAnalyzeCache,
          isInspectorCompact: true,
          commandMenuIndex: 0,
          onCompactMenuKeyDown,
        })}
      />,
    );

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(onCompactMenuKeyDown).toHaveBeenCalledTimes(1);
    expect(onCompactMenuKeyDown.mock.calls[0][1]).toBe(0);
  });

  it("추천 커맨드 행 blur와 keydown은 row index를 전달한다", () => {
    const onCommandMenuRowBlurCapture = vi.fn();
    const onSuggestedCommandRowKeyDown = vi.fn();
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: baseAnalyzeCache,
          onCommandMenuRowBlurCapture,
          onSuggestedCommandRowKeyDown,
        })}
      />,
    );

    const commandRow = document.querySelector('[data-inspector-command-menu-row="1"]') as HTMLDivElement;
    fireEvent.blur(commandRow);
    fireEvent.keyDown(commandRow, { key: "ArrowDown" });

    expect(onCommandMenuRowBlurCapture).toHaveBeenCalledTimes(1);
    expect(onCommandMenuRowBlurCapture.mock.calls[0][1]).toBe(0);
    expect(onSuggestedCommandRowKeyDown).toHaveBeenCalledTimes(1);
    expect(onSuggestedCommandRowKeyDown.mock.calls[0][1]).toBe(0);
  });

  it("추천 커맨드 행 keydown은 누른 키와 행 인덱스를 함께 전달한다", () => {
    const onSuggestedCommandRowKeyDown = vi.fn();
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: baseAnalyzeCache,
          onSuggestedCommandRowKeyDown,
        })}
      />,
    );

    const commandRow = document.querySelector('[data-inspector-command-menu-row="1"]') as HTMLDivElement;
    fireEvent.keyDown(commandRow, { key: "X" });

    expect(onSuggestedCommandRowKeyDown).toHaveBeenCalledTimes(1);
    const [eventArg, rowArg] = onSuggestedCommandRowKeyDown.mock.calls[0] ?? [];
    expect(rowArg).toBe(0);
    expect(eventArg.key).toBe("X");
  });

  it("compact 모드에서 각 추천 커맨드 행은 고유한 menu-row 태그를 가진다", () => {
    render(
      <InspectorAnalyzeCard
        {...createProps({
          analyzeCache: baseAnalyzeCache,
          isInspectorCompact: true,
        })}
      />,
    );

    const rows = Array.from(document.querySelectorAll("[data-inspector-command-menu-row]"));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-inspector-command-menu-row", "1");
    expect(rows[1]).toHaveAttribute("data-inspector-command-menu-row", "2");
  });
});
