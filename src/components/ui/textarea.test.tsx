import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getTextareaAccessibleText, Textarea } from "./textarea";

describe("Textarea", () => {
  it("title/placeholder/aria-label 기반 title 힌트를 계산한다", () => {
    expect(getTextareaAccessibleText({ placeholder: "커밋 메시지를 입력하세요" })).toEqual({
      title: "커밋 메시지를 입력하세요",
    });
    expect(
      getTextareaAccessibleText({
        placeholder: "커밋 메시지를 입력하세요",
        ariaLabel: "커밋 메시지",
      }),
    ).toEqual({
      title: "커밋 메시지를 입력하세요",
    });
    expect(
      getTextareaAccessibleText({
        title: "커밋 설명 입력",
        placeholder: "커밋 메시지를 입력하세요",
      }),
    ).toEqual({
      title: "커밋 설명 입력",
    });
  });

  it("기본 포커스와 비활성 스타일을 포함한다", () => {
    render(<Textarea aria-label="커밋 메시지" disabled />);

    const textarea = screen.getByRole("textbox", { name: "커밋 메시지" });
    expect(textarea.className).toContain("focus-visible:ring-1");
    expect(textarea.className).toContain("disabled:cursor-not-allowed");
    expect(textarea.className).toContain("disabled:bg-white/[0.03]");
    expect(textarea).toHaveAttribute("title", "커밋 메시지");
  });

  it("aria-invalid 상태 스타일을 제공한다", () => {
    render(<Textarea aria-label="오류 메시지" aria-invalid="true" />);

    const textarea = screen.getByRole("textbox", { name: "오류 메시지" });
    expect(textarea.className).toContain("aria-[invalid=true]:border-red-400/45");
    expect(textarea.className).toContain("aria-[invalid=true]:bg-red-500/[0.06]");
  });
});
