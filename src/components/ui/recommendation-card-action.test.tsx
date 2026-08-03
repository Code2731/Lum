import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  getRecommendationCardActionAccessibleText,
  RecommendationCardAction,
} from "./recommendation-card-action";
import {
  getRecommendationCardActionsAccessibleLabel,
  RecommendationCardActions,
} from "./recommendation-card-actions";

describe("RecommendationCardAction", () => {
  it("액션 버튼 접근성 텍스트를 계산한다", () => {
    expect(getRecommendationCardActionAccessibleText("바로 열기")).toBe("바로 열기");
    expect(getRecommendationCardActionAccessibleText("바로 열기", "즉시 복귀")).toBe("즉시 복귀");
    expect(
      getRecommendationCardActionAccessibleText(<span>아이콘</span>, undefined, "실행"),
    ).toBe("실행");
    expect(getRecommendationCardActionsAccessibleLabel()).toBe("추천 카드 작업");
    expect(getRecommendationCardActionsAccessibleLabel(2)).toBe("추천 카드 작업 2개");
  });

  it("기본 포커스와 비활성 상태 클래스를 포함한다", () => {
    render(<RecommendationCardAction disabled>바로 열기</RecommendationCardAction>);

    const button = screen.getByRole("button", { name: "바로 열기" });
    expect(button).toHaveAttribute("title", "바로 열기");
    expect(button).toHaveAttribute("aria-label", "바로 열기");
    expect(button.className).toContain("focus-visible:ring-1");
    expect(button.className).toContain("disabled:pointer-events-none");
    expect(button.className).toContain("disabled:cursor-not-allowed");
  });

  it("액션 그룹에 의미 구조를 제공한다", () => {
    render(
      <RecommendationCardActions compact>
        <RecommendationCardAction>실행</RecommendationCardAction>
        <RecommendationCardAction>복사</RecommendationCardAction>
      </RecommendationCardActions>,
    );

    expect(screen.getByRole("group", { name: "추천 카드 작업 2개" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "복사" })).toBeInTheDocument();
  });
});
