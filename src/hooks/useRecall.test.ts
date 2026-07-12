import { describe, expect, it } from "vitest";
import { getRecallMeta, type RecallEntry, type RecallStats } from "./useRecall";

describe("useRecall helpers", () => {
  it("로딩 중에는 기억 검색 진행 메타를 반환한다", () => {
    expect(
      getRecallMeta({
        results: [],
        stats: null,
        loading: true,
      }),
    ).toEqual({
      title: "Recall 검색 중",
      badges: ["먼저 질의 해석", "다음 소스 검색", "마지막 결과 정렬"],
      helper: "history, healing, memory 소스를 함께 검색해 관련 기억을 정리하고 있습니다.",
    });
  });

  it("결과 수와 인덱스 수를 함께 요약한다", () => {
    const stats: RecallStats = {
      history: { count: 10, oldest_ms: 1, newest_ms: 10 },
      healing: { count: 5, oldest_ms: 2, newest_ms: 11 },
      memory: { count: 7, oldest_ms: 3, newest_ms: 12 },
      now_ms: 20,
    };
    const results: RecallEntry[] = [
      {
        id: "history:1",
        source: "history",
        ts_ms: 10,
        title: "docker build fix",
        snippet: "npm ci 후 해결",
        score: 0.88,
        metadata: {},
      },
      {
        id: "healing:2",
        source: "healing",
        ts_ms: 11,
        title: "permission denied",
        snippet: "chmod +x",
        score: 0.77,
        metadata: {},
      },
    ];

    expect(
      getRecallMeta({
        results,
        stats,
        loading: false,
      }),
    ).toEqual({
      title: "Recall 결과 2건",
      badges: ["결과 2건", "인덱스 22건", "소스 3종 준비"],
      helper: "최근 기억 검색 결과를 바탕으로 과거 명령, 복구, 메모 흐름을 현재 작업에 다시 연결할 수 있습니다.",
    });
  });

  it("결과가 없으면 검색 안내 메타를 반환한다", () => {
    expect(
      getRecallMeta({
        results: [],
        stats: null,
        loading: false,
      }),
    ).toEqual({
      title: "Recall 결과가 없습니다",
      badges: ["결과 0건", "인덱스 0건", "통계 대기"],
      helper: "질문을 입력하면 history, healing, memory 전반에서 관련 기억을 찾아 현재 작업에 다시 연결합니다.",
    });
  });
});
