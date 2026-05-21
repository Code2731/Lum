import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CommandBlockBar from "./CommandBlockBar";
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
