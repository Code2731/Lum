import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InspectorFailedBlockCard, {
  getInspectorFailedBlockActionLabel,
  getInspectorFailedBlockMeta,
} from "./InspectorFailedBlockCard";
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
  it("실패 블록 메타와 액션 라벨을 계산한다", () => {
    expect(getInspectorFailedBlockMeta(baseFailedBlocks[0])).toEqual({
      exitLabel: "실패 1",
      guide: "실패 블록을 먼저 보고, 다음으로 AI 분석을 열고, 마지막에 로그나 프롬프트를 넘깁니다.",
      badges: ["먼저 실패 확인", "다음 분석 열기", "마지막 로그/프롬프트"],
      primaryActionHelper: "현재 실패 블록을 기준으로 분석을 열면 첫 제안 실행 흐름까지 가장 빠르게 이어집니다.",
    });
    expect(getInspectorFailedBlockActionLabel("focus")).toBe("다음 실패 확인");
    expect(getInspectorFailedBlockActionLabel("analyze")).toBe("실패 분석 열기");
    expect(getInspectorFailedBlockActionLabel("copyLog")).toBe("실패 로그 복사");
    expect(getInspectorFailedBlockActionLabel("copyPrompt")).toBe("분석 프롬프트 복사");
    expect(getInspectorFailedBlockActionLabel("loadPrompt")).toBe("분석 입력 불러오기");
    expect(getInspectorFailedBlockActionLabel("select")).toBe("블록 선택");
  });

  it("실패 블록 정보와 개수를 렌더링한다", () => {
    render(<InspectorFailedBlockCard {...createProps()} />);

    expect(screen.getByText("실패 블록")).toBeInTheDocument();
    expect(screen.getByText("1개")).toBeInTheDocument();
    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.getByText("실패 1")).toBeInTheDocument();
    expect(screen.getByText("먼저 실패 확인")).toBeInTheDocument();
    expect(screen.getByText("다음 분석 열기")).toBeInTheDocument();
    expect(screen.getByText("마지막 로그/프롬프트")).toBeInTheDocument();
    expect(screen.getByText("실패 블록을 먼저 보고, 다음으로 AI 분석을 열고, 마지막에 로그나 프롬프트를 넘깁니다.")).toBeInTheDocument();
    expect(screen.getByText("바로 복구 시작")).toBeInTheDocument();
    expect(screen.getByText("현재 실패 블록을 기준으로 분석을 열면 첫 제안 실행 흐름까지 가장 빠르게 이어집니다.")).toBeInTheDocument();
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
    expect(screen.queryByText("다음 실패")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByText("다음 실패"));
    fireEvent.click(screen.getByText("AI 분석"));
    fireEvent.click(screen.getByText("로그 복사"));
    fireEvent.click(screen.getByText("프롬프트 복사"));
    fireEvent.click(screen.getByText("프롬프트 불러오기"));
    fireEvent.click(screen.getByText("선택"));

    expect(onFocusFailedBlock).toHaveBeenCalledTimes(1);
    expect(onAnalyzeFailedBlock).toHaveBeenCalledWith("fail-1");
    expect(onCopyFailedOutput).toHaveBeenCalledWith("fail-1");
    expect(onCopyAnalyzePrompt).toHaveBeenCalledWith("fail-1");
    expect(onLoadAnalyzePromptToAiBar).toHaveBeenCalledWith("fail-1");
    expect(onSelectBlock).toHaveBeenCalledWith("fail-1");
  });
});
