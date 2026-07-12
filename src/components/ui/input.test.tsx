import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getInputAccessibleText, Input } from "./input";

describe("Input", () => {
  it("title/placeholder/aria-label 기반 title 힌트를 계산한다", () => {
    expect(getInputAccessibleText({ placeholder: "저장소 경로" })).toEqual({
      title: "저장소 경로",
    });
    expect(
      getInputAccessibleText({
        placeholder: "저장소 경로",
        ariaLabel: "프로젝트 경로",
      }),
    ).toEqual({
      title: "저장소 경로",
    });
    expect(
      getInputAccessibleText({
        title: "프로젝트 저장소 경로",
        placeholder: "저장소 경로",
      }),
    ).toEqual({
      title: "프로젝트 저장소 경로",
    });
  });

  it("기본 포커스와 비활성 스타일을 포함한다", () => {
    render(<Input aria-label="저장소 경로" disabled />);

    const input = screen.getByRole("textbox", { name: "저장소 경로" });
    expect(input.className).toContain("focus-visible:ring-1");
    expect(input.className).toContain("disabled:cursor-not-allowed");
    expect(input.className).toContain("disabled:bg-white/[0.03]");
    expect(input).toHaveAttribute("title", "저장소 경로");
  });

  it("aria-invalid 상태 스타일을 제공한다", () => {
    render(<Input aria-label="오류 입력" aria-invalid="true" />);

    const input = screen.getByRole("textbox", { name: "오류 입력" });
    expect(input.className).toContain("aria-[invalid=true]:border-red-400/45");
    expect(input.className).toContain("aria-[invalid=true]:bg-red-500/[0.06]");
  });
});
