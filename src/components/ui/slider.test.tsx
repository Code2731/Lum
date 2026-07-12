import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getSliderAccessibleText, Slider } from "./slider";

describe("Slider", () => {
  it("title/aria-label 기반 title 힌트를 계산한다", () => {
    expect(getSliderAccessibleText({ ariaLabel: "투명도" })).toEqual({
      title: "투명도",
    });
    expect(
      getSliderAccessibleText({
        title: "배경 투명도",
        ariaLabel: "투명도",
      }),
    ).toEqual({
      title: "배경 투명도",
    });
  });

  it("비활성 상태 피드백 클래스를 포함한다", () => {
    render(<Slider aria-label="투명도" defaultValue={[50]} disabled />);

    const slider = screen.getByRole("slider", { name: "투명도" });
    expect(slider.className).toContain("focus-visible:ring-1");
    expect(slider.parentElement).toHaveAttribute("title", "투명도");
    expect(slider.parentElement?.className ?? "").toContain("disabled:cursor-not-allowed");
    expect(slider.parentElement?.className ?? "").toContain("disabled:opacity-50");
  });

  it("busy 상태 피드백 클래스를 제공한다", () => {
    render(<Slider aria-label="학습 진행률" defaultValue={[25]} aria-busy="true" />);

    const slider = screen.getByRole("slider", { name: "학습 진행률" });
    expect(slider.parentElement?.className ?? "").toContain("aria-[busy=true]:cursor-progress");
    expect(slider.parentElement?.className ?? "").toContain("aria-[busy=true]:opacity-70");
  });
});
