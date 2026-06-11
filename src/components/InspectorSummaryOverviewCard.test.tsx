import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import InspectorSummaryOverviewCard from "./InspectorSummaryOverviewCard";

function createProps(overrides: Partial<React.ComponentProps<typeof InspectorSummaryOverviewCard>> = {}) {
  return {
    selectedModel: "qwen2.5",
    activeTabTitle: "main",
    activeTabPath: "/Users/dev/project",
    activeTabBranch: undefined,
    activeTabChanged: undefined,
    inspectorCardTightClass: "card-tight",
    ...overrides,
  };
}

describe("InspectorSummaryOverviewCard", () => {
  it("workspace와 model 기본 정보를 렌더링한다", () => {
    render(<InspectorSummaryOverviewCard {...createProps()} />);

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("/Users/dev/project")).toBeInTheDocument();
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("qwen2.5")).toBeInTheDocument();
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
  });
});
