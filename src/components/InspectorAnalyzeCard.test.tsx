import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorAnalyzeCard from "./InspectorAnalyzeCard";
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
  it("분석 캐시가 없으면 빈 상태 문구를 보여준다", () => {
    render(<InspectorAnalyzeCard {...createProps()} />);

    expect(screen.getByText("아직 실행된 분석이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("CLEAR")).not.toBeInTheDocument();
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

    expect(screen.getByText("STREAMING")).toBeInTheDocument();
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

    expect(screen.getByText("ERROR")).toBeInTheDocument();
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

    expect(screen.getByText("R 실행 · C 복사 · L 로드")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("2번 커맨드 복사 (C)"));
    fireEvent.click(screen.getByTitle("2번 커맨드 AI 입력바 로드 (L)"));
    fireEvent.click(screen.getByTitle("2번 커맨드 실행 (R)"));
    fireEvent.click(screen.getByText("RUN #1"));

    expect(onCopySuggestedCommand).toHaveBeenCalledWith(1);
    expect(onLoadSuggestedCommandToAiBar).toHaveBeenCalledWith(1);
    expect(onApplySuggestedCommand).toHaveBeenNthCalledWith(1, 1);
    expect(onApplySuggestedCommand).toHaveBeenNthCalledWith(2, 0);
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

    const moreButton = screen.getAllByText("MORE")[0].closest("button");
    expect(moreButton).toHaveAttribute("aria-controls", "inspector-command-menu-0");
    expect(moreRefs.current[0]).toBe(moreButton);
    expect(menuRefs.current[0]).toBe(screen.getByText("COPY (C)").closest("button"));
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

    fireEvent.click(screen.getAllByText("MORE")[0]);
    fireEvent.keyDown(screen.getAllByText("MORE")[1], { key: "ArrowDown" });
    fireEvent.click(screen.getByText("COPY (C)"));
    fireEvent.click(screen.getByText("LOAD (L)"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowRight" });

    expect(onCloseCommandMenu).toHaveBeenCalledWith(true);
    expect(onOpenCompactMenu).toHaveBeenCalledWith(1);
    expect(onCopySuggestedCommand).toHaveBeenCalledWith(0);
    expect(onLoadSuggestedCommandToAiBar).toHaveBeenCalledWith(0);
    expect(onCompactMenuKeyDown).toHaveBeenCalledTimes(1);
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
});
