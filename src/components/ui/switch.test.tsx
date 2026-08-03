import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getSwitchAccessibleText, Switch } from "./switch";

describe("Switch", () => {
  it("title/aria-label 기반 title 힌트를 계산한다", () => {
    expect(getSwitchAccessibleText({ ariaLabel: "자동 학습" })).toEqual({
      title: "자동 학습",
    });
    expect(
      getSwitchAccessibleText({
        title: "자동 학습 토글",
        ariaLabel: "자동 학습",
      }),
    ).toEqual({
      title: "자동 학습 토글",
    });
  });

  it("포커스와 비활성 상태 클래스를 포함한다", () => {
    render(<Switch aria-label="자동 학습" disabled />);

    const toggle = screen.getByRole("switch", { name: "자동 학습" });
    expect(toggle.className).toContain("focus-visible:ring-1");
    expect(toggle.className).toContain("disabled:pointer-events-none");
    expect(toggle.className).toContain("disabled:cursor-not-allowed");
    expect(toggle).toHaveAttribute("title", "자동 학습");
  });

  it("busy 상태 피드백 클래스를 제공한다", () => {
    render(<Switch aria-label="학습 진행" aria-busy="true" />);

    const toggle = screen.getByRole("switch", { name: "학습 진행" });
    expect(toggle.className).toContain("aria-[busy=true]:cursor-progress");
    expect(toggle.className).toContain("aria-[busy=true]:opacity-70");
  });
});
