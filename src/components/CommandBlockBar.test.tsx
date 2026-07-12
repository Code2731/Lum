import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CommandBlockBar, { getCommandBlockBarFlowSummary } from "./CommandBlockBar";
import type { CommandBlock } from "../hooks/useCommandBlocks";

const baseBlock: CommandBlock = {
  id: "b1",
  command: "npm test",
  output: "ok",
  exitCode: 0,
  startedAt: Date.now(),
  endedAt: Date.now(),
};

describe("CommandBlockBar", () => {
  it("요약 함수는 성공/실패 블록 상태를 반환한다", () => {
    expect(
      getCommandBlockBarFlowSummary({
        exitCode: 0,
        blockIndex: 0,
        blockTotal: 2,
        command: "npm test",
      }),
    ).toEqual({
      primary: "성공 블록 탐색",
      secondary: "1/2",
      detail: "npm test 결과를 확인한 뒤 복사하거나 다시 실행할 수 있습니다.",
    });
    expect(
      getCommandBlockBarFlowSummary({
        exitCode: 1,
        blockIndex: 1,
        blockTotal: 2,
        command: "npm test",
      }),
    ).toEqual({
      primary: "실패 블록 확인",
      secondary: "2/2",
      detail: "npm test 실패 출력을 확인하고 필요한 경우 다시 실행할 수 있습니다.",
    });
  });

  it("이전/다음 툴팁 라벨은 Cmd/Ctrl 기반 단축키로 표시된다", () => {
    render(
      <CommandBlockBar
        block={baseBlock}
        blockIndex={0}
        blockTotal={2}
        canPrev={false}
        canNext={true}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onRerun={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("성공 블록 탐색")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("마지막 복사·재실행")).toBeInTheDocument();
    expect(screen.getByText("npm test 결과를 확인한 뒤 복사하거나 다시 실행할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("이전 블록 (Cmd/Ctrl+Shift+↑)")).toBeInTheDocument();
    expect(screen.getByLabelText("다음 블록 (Cmd/Ctrl+Shift+↓)")).toBeInTheDocument();
  });

  it("다음 버튼 클릭 시 onNext를 호출한다", () => {
    const onNext = vi.fn();
    render(
      <CommandBlockBar
        block={baseBlock}
        blockIndex={0}
        blockTotal={2}
        canPrev={true}
        canNext={true}
        onPrev={vi.fn()}
        onNext={onNext}
        onRerun={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("다음 블록 (Cmd/Ctrl+Shift+↓)"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
