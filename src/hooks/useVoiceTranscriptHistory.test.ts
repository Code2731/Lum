import { describe, expect, it } from "vitest";
import {
  getVoiceTranscriptHistoryFlowSummary,
  getVoiceTranscriptScopeSearchSummary,
} from "./useVoiceTranscriptHistory";

describe("getVoiceTranscriptHistoryFlowSummary", () => {
  it("기록이 없으면 빈 상태를 반환한다", () => {
    expect(
      getVoiceTranscriptHistoryFlowSummary({
        scopeKey: "__global__",
        pinnedCount: 0,
        recentCount: 0,
        historyCount: 0,
        showHistory: false,
      }),
    ).toEqual({
      primary: "음성 기록 비어 있음",
      secondary: "전역",
      detail: "아직 저장된 음성 전사 기록이 없어 새 입력을 기다리고 있습니다.",
    });
  });

  it("기록이 펼쳐져 있으면 상세 상태를 반환한다", () => {
    expect(
      getVoiceTranscriptHistoryFlowSummary({
        scopeKey: "/repo",
        pinnedCount: 2,
        recentCount: 3,
        historyCount: 5,
        showHistory: true,
      }),
    ).toEqual({
      primary: "음성 기록 펼침",
      secondary: "/repo · 고정 2 · 최근 3 · 기록 5",
      detail: "현재 스코프의 고정 항목과 최근 전사 기록을 함께 검토할 수 있습니다.",
    });
  });

  it("기록이 있으면 준비 상태를 반환한다", () => {
    expect(
      getVoiceTranscriptHistoryFlowSummary({
        scopeKey: "/repo",
        pinnedCount: 1,
        recentCount: 1,
        historyCount: 2,
        showHistory: false,
      }),
    ).toEqual({
      primary: "음성 기록 준비됨",
      secondary: "/repo · 총 4개",
      detail: "필요할 때 기록 패널을 열어 이전 전사와 고정 항목을 다시 사용할 수 있습니다.",
    });
  });
});

describe("getVoiceTranscriptScopeSearchSummary", () => {
  it("검색어가 없으면 대기 상태를 반환한다", () => {
    expect(
      getVoiceTranscriptScopeSearchSummary({
        query: "   ",
        matches: [],
      }),
    ).toEqual({
      primary: "스코프 검색 대기",
      secondary: "검색어 없음",
      detail: "음성 기록 스코프를 찾으려면 검색어를 입력하세요.",
    });
  });

  it("검색 결과가 없으면 없음 상태를 반환한다", () => {
    expect(
      getVoiceTranscriptScopeSearchSummary({
        query: "git status",
        matches: [],
      }),
    ).toEqual({
      primary: "검색 결과 없음",
      secondary: "git status",
      detail: "현재 저장된 음성 기록 스코프에서 일치하는 전사를 찾지 못했습니다.",
    });
  });

  it("검색 결과가 있으면 첫 스코프 기준 요약을 반환한다", () => {
    expect(
      getVoiceTranscriptScopeSearchSummary({
        query: "git status",
        matches: [
          { scopeKey: "__global__", matchedCount: 3 },
          { scopeKey: "/repo", matchedCount: 1 },
        ],
      }),
    ).toEqual({
      primary: "2개 스코프 일치",
      secondary: "전역 · 3개 매치",
      detail: "일치한 스코프부터 순서대로 이동해 관련 전사를 다시 사용할 수 있습니다.",
    });
  });
});
