import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HistorySearch, { getHistorySearchFlowSummary } from "./HistorySearch";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

describe("HistorySearch", () => {
  it("요약 함수는 최근/검색중/결과없음 상태를 반환한다", () => {
    expect(
      getHistorySearchFlowSummary({
        query: "",
        isSearching: false,
        resultsCount: 0,
        recentCount: 3,
      }),
    ).toEqual({
      primary: "최근 기록 탐색",
      secondary: "3개 최근 항목",
      detail: "최근 실행한 명령을 먼저 훑은 뒤 필요한 커맨드를 다시 불러올 수 있습니다.",
    });
    expect(
      getHistorySearchFlowSummary({
        query: "build",
        isSearching: true,
        resultsCount: 0,
        recentCount: 3,
      }),
    ).toEqual({
      primary: "히스토리 검색 중",
      secondary: "build",
      detail: "자연어 질문을 바탕으로 이전 명령 기록을 찾고 있습니다.",
    });
    expect(
      getHistorySearchFlowSummary({
        query: "deploy",
        isSearching: false,
        resultsCount: 0,
        recentCount: 3,
      }),
    ).toEqual({
      primary: "검색 결과 없음",
      secondary: "deploy",
      detail: "질문 표현을 조금 넓히거나 최근 기록을 함께 확인하면 원하는 명령을 더 빨리 찾을 수 있습니다.",
    });
  });

  it("히스토리 검색 흐름 안내를 보여준다", async () => {
    invokeMock.mockResolvedValue([]);

    render(
      <HistorySearch
        model="local"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("최근 기록 탐색")).toBeInTheDocument();
    expect(screen.getByText("0개 최근 항목")).toBeInTheDocument();
    expect(screen.getByText("마지막 재실행")).toBeInTheDocument();
    expect(
      screen.getByText("최근 실행한 명령을 먼저 훑은 뒤 필요한 커맨드를 다시 불러올 수 있습니다."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("실행한 커맨드가 없습니다")).toBeInTheDocument();
    });

    expect(screen.getByText("첫 실행 대기")).toBeInTheDocument();
    expect(screen.getByText("최근 기록 누적")).toBeInTheDocument();
    expect(screen.getByText("다음 검색 준비")).toBeInTheDocument();
  });
});
