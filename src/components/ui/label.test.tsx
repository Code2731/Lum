import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getLabelAccessibleText, Label } from "./label";

describe("Label", () => {
  it("children/title 기반 title 힌트를 계산한다", () => {
    expect(getLabelAccessibleText({ children: "저장소 경로" })).toEqual({
      title: "저장소 경로",
    });
    expect(
      getLabelAccessibleText({
        children: "저장소 경로",
        title: "프로젝트 저장소 경로",
      }),
    ).toEqual({
      title: "프로젝트 저장소 경로",
    });
  });

  it("기본 가독성 클래스를 포함한다", () => {
    render(<Label htmlFor="repo-path">저장소 경로</Label>);

    const label = screen.getByText("저장소 경로");
    expect(label.className).toContain("cursor-default");
    expect(label.className).toContain("select-none");
    expect(label.className).toContain("text-white/78");
    expect(label).toHaveAttribute("title", "저장소 경로");
  });
});
