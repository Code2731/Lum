import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { getRecommendationCardAccessibleText, RecommendationCard } from "./recommendation-card";

describe("RecommendationCard", () => {
  it("접근성 라벨과 title 텍스트를 계산한다", () => {
    expect(
      getRecommendationCardAccessibleText(
        "RAG",
        "코드 맥락 검색으로 바로 분석 흐름을 시작합니다.",
      ),
    ).toEqual({
      label: "RAG · 코드 맥락 검색으로 바로 분석 흐름을 시작합니다.",
      title: "RAG · 코드 맥락 검색으로 바로 분석 흐름을 시작합니다.",
    });

    expect(
      getRecommendationCardAccessibleText(
        "작업공간",
        "최근 세션과 복귀 지점을 빠르게 이어갑니다.",
        <span>추천</span>,
      ),
    ).toEqual({
      label: "작업공간 · 최근 세션과 복귀 지점을 빠르게 이어갑니다. · 추천 흐름 포함",
      title: "작업공간 · 최근 세션과 복귀 지점을 빠르게 이어갑니다.",
    });
  });

  it("클릭 가능한 카드는 라벨과 title 힌트를 함께 노출한다", () => {
    const onClick = vi.fn();
    render(
      <RecommendationCard
        title="RAG"
        description="코드 맥락 검색으로 바로 분석 흐름을 시작합니다."
        icon={<span>아이콘</span>}
        onClick={onClick}
      />,
    );

    const card = screen.getByRole("button", {
      name: "RAG · 코드 맥락 검색으로 바로 분석 흐름을 시작합니다.",
    });
    expect(card).toHaveAttribute("title", "RAG · 코드 맥락 검색으로 바로 분석 흐름을 시작합니다.");
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("정적 카드는 그룹 구조와 제목/설명 title을 제공한다", () => {
    render(
      <RecommendationCard
        title="작업공간"
        description="최근 세션과 복귀 지점을 빠르게 이어갑니다."
        icon={<span>아이콘</span>}
      />,
    );

    expect(
      screen.getByRole("group", {
        name: "작업공간 · 최근 세션과 복귀 지점을 빠르게 이어갑니다.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("작업공간")).toHaveAttribute("title", "작업공간");
    expect(screen.getByText("최근 세션과 복귀 지점을 빠르게 이어갑니다.")).toHaveAttribute(
      "title",
      "최근 세션과 복귀 지점을 빠르게 이어갑니다.",
    );
  });
});
