import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import WelcomeHints, { getWelcomeHintsFlowSummary } from "./WelcomeHints";

describe("WelcomeHints", () => {
  it("요약 함수는 힌트 개수 기반 안내를 반환한다", () => {
    expect(getWelcomeHintsFlowSummary(6)).toEqual({
      primary: "시작 힌트 확인",
      secondary: "6개 단축키",
      detail: "AI 입력 방식과 핵심 단축키를 먼저 훑고, 탐색·검색 기능까지 익힌 뒤 바로 터미널 흐름을 시작할 수 있습니다.",
    });
  });

  it("첫 진입 힌트 흐름 안내를 보여준다", () => {
    render(<WelcomeHints onClose={vi.fn()} />);

    expect(screen.getByText("시작 힌트 확인")).toBeInTheDocument();
    expect(screen.getByText("6개 단축키")).toBeInTheDocument();
    expect(screen.getByText("마지막 바로 시작")).toBeInTheDocument();
    expect(
      screen.getByText("AI 입력 방식과 핵심 단축키를 먼저 훑고, 탐색·검색 기능까지 익힌 뒤 바로 터미널 흐름을 시작할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("예시 확인")).toBeInTheDocument();
    expect(screen.getByText("바로 입력")).toBeInTheDocument();
    expect(screen.getByText("명령 초안 시작")).toBeInTheDocument();
  });
});
