import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CodeReviewDashboard, { getCodeReviewDashboardFlowSummary } from "./CodeReviewDashboard";

describe("CodeReviewDashboard", () => {
  it("요약 함수는 리뷰 항목 상태를 반환한다", () => {
    expect(
      getCodeReviewDashboardFlowSummary({
        summary: "2 issues",
        items: [{ file: "src/app.ts", severity: "high" }],
      }),
    ).toEqual({
      primary: "리뷰 결과 확인",
      secondary: "1개 항목",
      detail: "src/app.ts부터 확인하고 필요한 수정 작업으로 바로 이어갈 수 있습니다.",
    });
  });

  it("리뷰 대시보드 흐름 안내를 보여준다", () => {
    render(
      <CodeReviewDashboard
        report={{ summary: "2 issues", items: [{ file: "src/app.ts", severity: "high" }] }}
      />,
    );

    expect(screen.getByText("리뷰 결과 확인")).toBeInTheDocument();
    expect(screen.getByText("1개 항목")).toBeInTheDocument();
    expect(screen.getByText("마지막 수정 연결")).toBeInTheDocument();
    expect(
      screen.getByText("src/app.ts부터 확인하고 필요한 수정 작업으로 바로 이어갈 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 issues/)).toBeInTheDocument();
  });
});
