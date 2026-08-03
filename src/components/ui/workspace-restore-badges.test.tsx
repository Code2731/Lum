import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  getWorkspaceRestoreBadgeSummary,
  WorkspaceRestoreBadges,
} from "./workspace-restore-badges";

describe("WorkspaceRestoreBadges", () => {
  it("복원 배지 조합 요약을 계산한다", () => {
    expect(
      getWorkspaceRestoreBadgeSummary({
        recommended: true,
        latest: true,
        frequent: true,
      }),
    ).toBe("복원 상태 배지: 바로 복귀, 최근 복원, 자주 복원");

    expect(getWorkspaceRestoreBadgeSummary({ latest: true })).toBe(
      "복원 상태 배지: 최근 복원",
    );
  });

  it("복원 배지별 제목 힌트를 제공한다", () => {
    render(
      <WorkspaceRestoreBadges
        recommended
        latest
        frequent
      />,
    );

    expect(
      screen.getByRole("list", {
        name: "복원 상태 배지: 바로 복귀, 최근 복원, 자주 복원",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("바로 복귀")).toHaveAttribute("title", "지금 가장 바로 복귀하기 좋은 작업공간");
    expect(screen.getByText("최근 복원")).toHaveAttribute("title", "가장 최근에 복원한 작업공간");
    expect(screen.getByText("자주 복원")).toHaveAttribute("title", "반복적으로 자주 복원한 작업공간");
  });

  it("활성화된 배지만 렌더링한다", () => {
    render(<WorkspaceRestoreBadges latest compact />);

    expect(screen.getByText("최근 복원")).toBeInTheDocument();
    expect(screen.queryByText("바로 복귀")).not.toBeInTheDocument();
    expect(screen.queryByText("자주 복원")).not.toBeInTheDocument();
  });
});
