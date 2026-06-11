import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorFailedBlockCard from "./InspectorFailedBlockCard";
import type { InspectorFailedBlock } from "./InspectorPanel/types";

const baseFailedBlocks: InspectorFailedBlock[] = [
  { id: "fail-1", command: "npm test", exitCode: 1, outputTail: "ERR_FAIL" },
];

function createProps(overrides: Partial<React.ComponentProps<typeof InspectorFailedBlockCard>> = {}) {
  return {
    failedBlocks: baseFailedBlocks,
    focusedFailedBlock: baseFailedBlocks[0],
    inspectorCardRegularClass: "card-regular",
    onFocusFailedBlock: vi.fn(),
    onAnalyzeFailedBlock: vi.fn(),
    onCopyFailedOutput: vi.fn(),
    onCopyAnalyzePrompt: vi.fn(),
    onLoadAnalyzePromptToAiBar: vi.fn(),
    onSelectBlock: vi.fn(),
    ...overrides,
  };
}

describe("InspectorFailedBlockCard", () => {
  it("실패 블록 정보와 개수를 렌더링한다", () => {
    render(<InspectorFailedBlockCard {...createProps()} />);

    expect(screen.getByText("Failed Block")).toBeInTheDocument();
    expect(screen.getByText("1개")).toBeInTheDocument();
    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.getByText("ERR 1")).toBeInTheDocument();
    expect(screen.getByText("ERR_FAIL")).toBeInTheDocument();
  });

  it("outputTail이 없으면 로그 텍스트를 숨긴다", () => {
    render(
      <InspectorFailedBlockCard
        {...createProps({
          focusedFailedBlock: {
            id: "fail-2",
            command: "npm run lint",
            exitCode: 2,
            outputTail: "",
          },
        })}
      />,
    );

    expect(screen.queryByText("ERR_FAIL")).not.toBeInTheDocument();
  });

  it("포커스된 실패 블록이 없으면 빈 상태 문구를 보여준다", () => {
    render(
      <InspectorFailedBlockCard
        {...createProps({
          failedBlocks: [],
          focusedFailedBlock: null,
        })}
      />,
    );

    expect(screen.getByText("실패 블록이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("NEXT FAIL")).not.toBeInTheDocument();
  });

  it("실패 블록 액션들은 각 콜백에 block id를 전달한다", () => {
    const onFocusFailedBlock = vi.fn();
    const onAnalyzeFailedBlock = vi.fn();
    const onCopyFailedOutput = vi.fn();
    const onCopyAnalyzePrompt = vi.fn();
    const onLoadAnalyzePromptToAiBar = vi.fn();
    const onSelectBlock = vi.fn();
    render(
      <InspectorFailedBlockCard
        {...createProps({
          onFocusFailedBlock,
          onAnalyzeFailedBlock,
          onCopyFailedOutput,
          onCopyAnalyzePrompt,
          onLoadAnalyzePromptToAiBar,
          onSelectBlock,
        })}
      />,
    );

    fireEvent.click(screen.getByText("NEXT FAIL"));
    fireEvent.click(screen.getByText("AI ANALYZE"));
    fireEvent.click(screen.getByText("COPY LOG"));
    fireEvent.click(screen.getByText("COPY PROMPT"));
    fireEvent.click(screen.getByText("LOAD PROMPT"));
    fireEvent.click(screen.getByText("SELECT"));

    expect(onFocusFailedBlock).toHaveBeenCalledTimes(1);
    expect(onAnalyzeFailedBlock).toHaveBeenCalledWith("fail-1");
    expect(onCopyFailedOutput).toHaveBeenCalledWith("fail-1");
    expect(onCopyAnalyzePrompt).toHaveBeenCalledWith("fail-1");
    expect(onLoadAnalyzePromptToAiBar).toHaveBeenCalledWith("fail-1");
    expect(onSelectBlock).toHaveBeenCalledWith("fail-1");
  });
});
