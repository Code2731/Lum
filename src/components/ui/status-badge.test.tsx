import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getStatusBadgeAccessibleText, StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("children/title 기반 title 힌트를 계산한다", () => {
    expect(getStatusBadgeAccessibleText({ children: "최근 복원" })).toEqual({
      title: "최근 복원",
    });
    expect(
      getStatusBadgeAccessibleText({
        children: "최근 복원",
        title: "가장 최근에 복원한 작업공간",
      }),
    ).toEqual({
      title: "가장 최근에 복원한 작업공간",
    });
    expect(getStatusBadgeAccessibleText({ children: <span>상태</span> })).toEqual({
      title: undefined,
    });
  });

  it("문자열 children이면 title 힌트를 자동 연결한다", () => {
    render(<StatusBadge tone="emerald">최근 복원</StatusBadge>);

    const badge = screen.getByText("최근 복원");
    expect(badge).toHaveAttribute("title", "최근 복원");
    expect(badge.className).toContain("inline-flex");
    expect(badge.className).toContain("whitespace-nowrap");
    expect(badge.className).toContain("leading-none");
  });

  it("명시적 title이 있으면 우선한다", () => {
    render(<StatusBadge title="가장 최근에 복원한 작업공간">최근 복원</StatusBadge>);

    expect(screen.getByText("최근 복원")).toHaveAttribute("title", "가장 최근에 복원한 작업공간");
  });
});
