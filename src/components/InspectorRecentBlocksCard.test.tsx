import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorRecentBlocksCard, {
  getInspectorRecentBlocksFlowSummary,
} from "./InspectorRecentBlocksCard";
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
  it("최근 블록 흐름 요약을 계산한다", () => {
    expect(getInspectorRecentBlocksFlowSummary(failedRecentBlocks)).toEqual({
      badges: ["최근 블록 1개", "분석 가능 1개", "마지막 블록 선택"],
      helper: "방금 실행한 흐름을 먼저 읽고, 실패한 명령은 다시 실행하거나 분석한 뒤 필요한 블록을 작업 대상으로 고릅니다.",
    });

    expect(
      getInspectorRecentBlocksFlowSummary([
        {
          id: "block-2",
          command: "echo ok",
          exitCode: 0,
          durationMs: 120,
          outputTail: "ok",
        },
      ]),
    ).toEqual({
      badges: ["최근 블록 1개", "성공 흐름 1개", "마지막 블록 선택"],
      helper: "최근 성공 흐름을 빠르게 훑고 필요한 명령을 다시 실행한 뒤, 이어서 볼 블록을 선택합니다.",
    });
  });

  it("최근 블록 정보와 실행 시간을 렌더링한다", () => {
    render(<InspectorRecentBlocksCard {...createProps()} />);

    expect(screen.getByText("최근 블록")).toBeInTheDocument();
    expect(screen.getByText("최근 블록 1개")).toBeInTheDocument();
    expect(screen.getByText("분석 가능 1개")).toBeInTheDocument();
    expect(screen.getByText("마지막 블록 선택")).toBeInTheDocument();
    expect(screen.getByText("방금 실행한 흐름을 먼저 읽고, 실패한 명령은 다시 실행하거나 분석한 뒤 필요한 블록을 작업 대상으로 고릅니다.")).toBeInTheDocument();
    expect(screen.getByText("npm run build")).toBeInTheDocument();
    expect(screen.getByText("실패 1")).toBeInTheDocument();
    expect(screen.getByText("2.3s")).toBeInTheDocument();
    expect(screen.getByText("build failed")).toBeInTheDocument();
  });

  it("성공한 블록은 성공 배지를 보이고 분석 열기 버튼을 숨긴다", () => {
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

    expect(screen.getByText("성공 흐름")).toBeInTheDocument();
    expect(screen.getByText("120ms")).toBeInTheDocument();
    expect(screen.queryByText("분석 열기")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByText("블록 선택"));
    fireEvent.click(screen.getByText("다시 실행"));
    fireEvent.click(screen.getByText("분석 열기"));

    expect(onSelectBlock).toHaveBeenCalledWith("block-1");
    expect(onRerunBlock).toHaveBeenCalledWith("npm run build");
    expect(onLoadAnalyzePromptToAiBar).toHaveBeenCalledWith("block-1");
  });
});
