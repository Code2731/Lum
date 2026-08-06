import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InspectorSummaryOverviewCard from "./InspectorSummaryOverviewCard";

function createProps(overrides: Partial<React.ComponentProps<typeof InspectorSummaryOverviewCard>> = {}) {
  return {
    selectedModel: "qwen2.5",
    activeTabTitle: "main",
    activeTabPath: "/Users/dev/project",
    activeTabBranch: undefined,
    activeTabChanged: undefined,
    failedBlockCount: 0,
    inspectorCardTightClass: "card-tight",
    onOpenWorkspace: () => undefined,
    onOpenDiffReview: () => undefined,
    onOpenFailedBlock: () => undefined,
    onOpenRag: () => undefined,
    ...overrides,
  };
}

describe("InspectorSummaryOverviewCard", () => {
  it("workspace와 model 기본 정보를 렌더링한다", () => {
    render(<InspectorSummaryOverviewCard {...createProps()} />);

    expect(screen.getByText("현재 작업공간")).toBeInTheDocument();
    expect(screen.getByText("프로젝트")).toBeInTheDocument();
    expect(screen.getByText("project")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("/Users/dev/project")).toBeInTheDocument();
    expect(screen.getByText("이어서 작업 가능")).toBeInTheDocument();
    expect(screen.getByText("문맥 확인")).toBeInTheDocument();
    expect(screen.getByText("현재 탭")).toBeInTheDocument();
    expect(screen.getAllByText("RAG 분석").length).toBeGreaterThan(0);
    expect(screen.getByText("현재 모델")).toBeInTheDocument();
    expect(screen.getByText("qwen2.5")).toBeInTheDocument();
    expect(screen.getByText("준비됨")).toBeInTheDocument();
    expect(screen.getByText("모델 준비")).toBeInTheDocument();
    expect(screen.getByText("즉시 분석")).toBeInTheDocument();
    expect(screen.getByText("분석 시작")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RAG 분석" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "문맥 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모델로 분석 시작" })).toBeInTheDocument();
    expect(screen.getByText("⌘⇧S")).toBeInTheDocument();
    expect(screen.getByText("브랜치 없이 열린 탭이라 현재 작업 문맥을 먼저 읽습니다.")).toBeInTheDocument();
    expect(screen.getByText("선택된 모델과 현재 프로젝트 문맥으로 바로 분석을 시작합니다.")).toBeInTheDocument();
    expect(screen.getByText("현재 코드 문맥을 기반으로 바로 분석을 시작합니다.")).toBeInTheDocument();
    expect(screen.getByText("현재 탭 기준으로 작업 문맥을 다시 확인합니다.")).toBeInTheDocument();
    expect(screen.getByText("선택된 모델로 현재 프로젝트 맥락 분석을 바로 이어갑니다.")).toBeInTheDocument();
  });

  it("실패 블록이 있으면 복구 우선 상태와 실패 확인 액션을 노출한다", () => {
    render(
      <InspectorSummaryOverviewCard
        {...createProps({
          failedBlockCount: 2,
          activeTabChanged: 1,
        })}
      />,
    );

    expect(screen.getByText("복구 우선")).toBeInTheDocument();
    expect(screen.getByText("우선 복구")).toBeInTheDocument();
    expect(screen.getAllByText("복구 시작").length).toBeGreaterThan(0);
    expect(screen.getByText("실패 블록 2건이 있어 복구 흐름이 우선입니다.")).toBeInTheDocument();
    expect(screen.getByText("실패 블록을 먼저 열고, 이어서 분석과 첫 제안 실행 흐름으로 복구를 시작합니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "복구 시작" })).toBeInTheDocument();
    expect(screen.getByText("실패 카드를 열어 분석과 첫 제안 실행 흐름으로 바로 이어가는 복구 시작점입니다.")).toBeInTheDocument();
  });

  it("브랜치와 변경 개수가 있으면 배지를 함께 보여준다", () => {
    render(
      <InspectorSummaryOverviewCard
        {...createProps({
          activeTabBranch: "feature/inspector",
          activeTabChanged: 3,
        })}
      />,
    );

    expect(screen.getByText("feature/inspector")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("검토 필요")).toBeInTheDocument();
    expect(screen.getByText("다음 검토")).toBeInTheDocument();
    expect(screen.getAllByText("변경 검토").length).toBeGreaterThan(0);
    expect(screen.getByText("변경 3건이 있어 검토 흐름이 우선입니다.")).toBeInTheDocument();
    expect(screen.getByText("변경 내용을 먼저 검토하고 다음 수정을 결정합니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "변경 검토" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "작업공간" })).toBeInTheDocument();
    expect(screen.getByText("⌘⇧R")).toBeInTheDocument();
    expect(screen.getByText("⌘⇧S")).toBeInTheDocument();
    expect(screen.getByText("바뀐 내용을 먼저 검토하고 다음 수정을 결정합니다.")).toBeInTheDocument();
    expect(screen.getByText("저장된 세션과 열린 탭 묶음으로 바로 복귀합니다.")).toBeInTheDocument();
  });

  it("변경 개수가 0이면 숫자 배지를 숨긴다", () => {
    render(
      <InspectorSummaryOverviewCard
        {...createProps({
          activeTabBranch: "feature/inspector",
          activeTabChanged: 0,
        })}
      />,
    );

    expect(screen.getByText("feature/inspector")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("브랜치가 없으면 브랜치 배지를 숨긴다", () => {
    render(
      <InspectorSummaryOverviewCard
        {...createProps({
          activeTabBranch: undefined,
          activeTabChanged: 5,
        })}
      />,
    );

    expect(screen.queryByText("feature/inspector")).not.toBeInTheDocument();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
    expect(screen.getByText("다음 검토")).toBeInTheDocument();
    expect(screen.getByText("변경 내용을 먼저 검토하고 다음 수정을 결정합니다.")).toBeInTheDocument();
    expect(screen.getByText("변경 5건이 있어 검토 흐름이 우선입니다.")).toBeInTheDocument();
  });

  it("추천 다음 액션 버튼은 각 콜백을 호출한다", () => {
    const onOpenWorkspace = vi.fn();
    const onOpenDiffReview = vi.fn();
    const onOpenFailedBlock = vi.fn();
    const onOpenRag = vi.fn();

    render(
      <InspectorSummaryOverviewCard
        {...createProps({
          failedBlockCount: 2,
          onOpenWorkspace,
          onOpenDiffReview,
          onOpenFailedBlock,
          onOpenRag,
        })}
      />,
    );

    screen.getByRole("button", { name: "복구 시작" }).click();
    screen.getByRole("button", { name: "문맥 열기" }).click();
    screen.getByRole("button", { name: "모델로 분석 시작" }).click();

    expect(onOpenFailedBlock).toHaveBeenCalledTimes(1);
    expect(onOpenDiffReview).toHaveBeenCalledTimes(0);
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
    expect(onOpenRag).toHaveBeenCalledTimes(1);
  });
});
