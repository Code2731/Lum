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
      badges: ["최근 블록 1개", "후속 확인 1개", "필요 시 재실행"],
      helper: "복구와 분석이 끝난 뒤, 최근 흐름에서 다시 확인할 블록이나 재실행할 명령을 후속 후보로 고릅니다.",
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
      badges: ["최근 블록 1개", "성공 흐름 1개", "필요 시 재실행"],
      helper: "최근 성공 흐름을 훑고 필요한 명령만 후속으로 다시 실행하거나 참조할 블록을 고릅니다.",
    });
  });

  it("최근 블록 정보와 실행 시간을 렌더링한다", () => {
    render(<InspectorRecentBlocksCard {...createProps()} />);

    expect(screen.getByText("최근 흐름 재확인")).toBeInTheDocument();
    expect(screen.getByText("최근 블록 1개")).toBeInTheDocument();
    expect(screen.getByText("후속 확인 1개")).toBeInTheDocument();
    expect(screen.getByText("필요 시 재실행")).toBeInTheDocument();
    expect(screen.getByText("복구와 분석이 끝난 뒤, 최근 흐름에서 다시 확인할 블록이나 재실행할 명령을 후속 후보로 고릅니다.")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("후속 분석"));

    expect(onSelectBlock).toHaveBeenCalledWith("block-1");
    expect(onRerunBlock).toHaveBeenCalledWith("npm run build");
    expect(onLoadAnalyzePromptToAiBar).toHaveBeenCalledWith("block-1");
  });
});
