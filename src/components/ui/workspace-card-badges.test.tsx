import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getWorkspaceCardBadgeSummary, WorkspaceCardBadges } from "./workspace-card-badges";

describe("WorkspaceCardBadges", () => {
  it("활성 상태 배지 요약 텍스트를 계산한다", () => {
    expect(
      getWorkspaceCardBadgeSummary({
        archived: true,
        recommended: true,
        latest: true,
        frequent: true,
      }),
    ).toBe("워크스페이스 상태 배지: 보관, 바로 복귀, 최근 복원, 자주 복원");

    expect(getWorkspaceCardBadgeSummary({ latest: true })).toBe(
      "워크스페이스 상태 배지: 최근 복원",
    );
  });

  it("워크스페이스 상태 배지를 구조적으로 렌더링한다", () => {
    render(
      <WorkspaceCardBadges
        archived
        recommended
        latest
        frequent
      />,
    );

    expect(
      screen.getByRole("list", {
        name: "워크스페이스 상태 배지: 보관, 바로 복귀, 최근 복원, 자주 복원",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("보관")).toHaveAttribute("title", "보관된 작업공간");
    expect(screen.getByText("바로 복귀")).toBeInTheDocument();
    expect(screen.getByText("최근 복원")).toBeInTheDocument();
    expect(screen.getByText("자주 복원")).toBeInTheDocument();
  });

  it("활성된 배지만 렌더링한다", () => {
    render(<WorkspaceCardBadges latest compact />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("최근 복원")).toBeInTheDocument();
    expect(screen.queryByText("보관")).not.toBeInTheDocument();
    expect(screen.queryByText("바로 복귀")).not.toBeInTheDocument();
    expect(screen.queryByText("자주 복원")).not.toBeInTheDocument();
  });
});
