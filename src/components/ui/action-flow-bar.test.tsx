import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionFlowBar, getActionFlowBarFlowMeta } from "./action-flow-bar";

describe("ActionFlowBar", () => {
  it("배지 메타를 정규화하고 단계 수 라벨을 계산한다", () => {
    expect(
      getActionFlowBarFlowMeta([" 먼저 확인 ", "", "다음 실행", "  "], "안내 문구"),
    ).toEqual({
      badges: ["먼저 확인", "다음 실행"],
      helper: "안내 문구",
      ariaLabel: "작업 흐름 2단계",
    });
    expect(getActionFlowBarFlowMeta([], undefined)).toEqual({
      badges: [],
      helper: undefined,
      ariaLabel: "작업 흐름",
    });
  });

  it("배지 배열 기반 흐름 안내를 렌더링한다", () => {
    render(
      <ActionFlowBar
        badges={["먼저 확인", "다음 실행", "마지막 정리"]}
        helper="현재 흐름을 먼저 보고 다음 작업으로 이어갑니다."
      />,
    );

    expect(screen.getByText("먼저 확인")).toBeInTheDocument();
    expect(screen.getByText("다음 실행")).toBeInTheDocument();
    expect(screen.getByText("마지막 정리")).toBeInTheDocument();
    expect(screen.getByLabelText("작업 흐름 3단계")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByText("현재 흐름을 먼저 보고 다음 작업으로 이어갑니다."),
    ).toBeInTheDocument();
  });

  it("기존 title/description/badge 형식도 계속 지원한다", () => {
    render(
      <ActionFlowBar
        title="추천 흐름"
        description="추천 작업을 바로 실행합니다."
        badge="추천"
      />,
    );

    expect(screen.getByText("추천 흐름")).toBeInTheDocument();
    expect(screen.getByText("추천 작업을 바로 실행합니다.")).toBeInTheDocument();
    expect(screen.getByText("추천")).toBeInTheDocument();
  });
});
