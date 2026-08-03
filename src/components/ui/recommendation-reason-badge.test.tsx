import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  getRecommendationReasonBadgeAccessibleText,
  RecommendationReasonBadge,
} from "./recommendation-reason-badge";

describe("RecommendationReasonBadge", () => {
  it("추천 이유 배지 접근성 텍스트를 계산한다", () => {
    expect(getRecommendationReasonBadgeAccessibleText("추천 이유")).toEqual({
      ariaLabel: "추천 이유",
      title: "추천 이유",
    });

    expect(getRecommendationReasonBadgeAccessibleText("보조 이유", true)).toEqual({
      title: "보조 이유",
      ariaHidden: true,
    });
  });

  it("기본적으로 라벨 의미와 title 힌트를 노출한다", () => {
    render(<RecommendationReasonBadge label="추천 이유" tone="cyan" />);

    const badge = screen.getByText("추천 이유");
    expect(badge).toHaveAttribute("aria-label", "추천 이유");
    expect(badge).toHaveAttribute("title", "추천 이유");
    expect(badge).not.toHaveAttribute("aria-hidden");
  });

  it("장식용 배지일 때는 스크린리더에서 숨긴다", () => {
    render(<RecommendationReasonBadge label="보조 이유" decorative />);

    expect(screen.getByText("보조 이유")).toHaveAttribute("aria-hidden", "true");
  });
});
