import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  getWorkspaceTabChipAccessibleLabel,
  WorkspaceTabChip,
} from "./workspace-tab-chip";

describe("WorkspaceTabChip", () => {
  it("탭 칩 접근성 라벨을 계산한다", () => {
    expect(getWorkspaceTabChipAccessibleLabel("백엔드", "/Users/test/project/backend")).toBe(
      "작업공간 탭: 백엔드, ~/project/backend",
    );
    expect(getWorkspaceTabChipAccessibleLabel("프론트엔드", undefined, true)).toBe(
      "현재 작업공간 탭: 프론트엔드",
    );
  });

  it("제목과 경로를 title 힌트로 연결한다", () => {
    render(
      <WorkspaceTabChip
        title="백엔드"
        cwd="/Users/test/project/backend"
      />,
    );

    const chip = screen.getByRole("status", { name: "작업공간 탭: 백엔드, ~/project/backend" });
    expect(chip).toHaveAttribute("title", "백엔드 · ~/project/backend");
    expect(screen.getByText("백엔드")).toBeInTheDocument();
    expect(screen.getByText("~/project/backend")).toBeInTheDocument();
  });

  it("활성 상태는 별도 라벨로 노출한다", () => {
    render(<WorkspaceTabChip title="프론트엔드" active compact />);

    const chip = screen.getByRole("status", { name: "현재 작업공간 탭: 프론트엔드" });
    expect(chip).toHaveAttribute("title", "프론트엔드");
    expect(screen.getByText("프론트엔드")).toBeInTheDocument();
  });
});
