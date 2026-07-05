import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorRecentBlocksCard from "./InspectorRecentBlocksCard";
import type { InspectorRecentBlock } from "./InspectorPanel/types";

const failedRecentBlocks: InspectorRecentBlock[] = [
  {
    id: "block-1",
    command: "npm run build",
    exitCode: 1,
    durationMs: 2300,
    outputTail: "build failed",
  },
];

function createProps(overrides: Partial<React.ComponentProps<typeof InspectorRecentBlocksCard>> = {}) {
  return {
    recentBlocks: failedRecentBlocks,
    inspectorCardRegularClass: "card-regular",
    onSelectBlock: vi.fn(),
    onRerunBlock: vi.fn(),
    onLoadAnalyzePromptToAiBar: vi.fn(),
    ...overrides,
  };
}

describe("InspectorRecentBlocksCard", () => {
  it("최근 블록 정보와 실행 시간을 렌더링한다", () => {
    render(<InspectorRecentBlocksCard {...createProps()} />);

    expect(screen.getByText("최근 블록")).toBeInTheDocument();
    expect(screen.getByText("npm run build")).toBeInTheDocument();
    expect(screen.getByText("ERR 1")).toBeInTheDocument();
    expect(screen.getByText("2.3s")).toBeInTheDocument();
    expect(screen.getByText("build failed")).toBeInTheDocument();
  });

  it("성공한 블록은 OK 배지를 보이고 LOAD 버튼을 숨긴다", () => {
    render(
      <InspectorRecentBlocksCard
        {...createProps({
          recentBlocks: [
            {
              id: "block-2",
              command: "echo ok",
              exitCode: 0,
              durationMs: 120,
              outputTail: "ok",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("120ms")).toBeInTheDocument();
    expect(screen.queryByText("LOAD")).not.toBeInTheDocument();
  });

  it("outputTail이 없으면 로그 텍스트를 숨긴다", () => {
    render(
      <InspectorRecentBlocksCard
        {...createProps({
          recentBlocks: [
            {
              id: "block-3",
              command: "npm test",
              exitCode: 1,
              durationMs: 900,
              outputTail: "",
            },
          ],
        })}
      />,
    );

    expect(screen.queryByText("build failed")).not.toBeInTheDocument();
    expect(screen.getByText("900ms")).toBeInTheDocument();
  });

  it("최근 블록 액션들은 각 콜백에 block id와 command를 전달한다", () => {
    const onSelectBlock = vi.fn();
    const onRerunBlock = vi.fn();
    const onLoadAnalyzePromptToAiBar = vi.fn();
    render(
      <InspectorRecentBlocksCard
        {...createProps({
          onSelectBlock,
          onRerunBlock,
          onLoadAnalyzePromptToAiBar,
        })}
      />,
    );

    fireEvent.click(screen.getByText("SEL"));
    fireEvent.click(screen.getByText("RUN"));
    fireEvent.click(screen.getByText("LOAD"));

    expect(onSelectBlock).toHaveBeenCalledWith("block-1");
    expect(onRerunBlock).toHaveBeenCalledWith("npm run build");
    expect(onLoadAnalyzePromptToAiBar).toHaveBeenCalledWith("block-1");
  });
});
