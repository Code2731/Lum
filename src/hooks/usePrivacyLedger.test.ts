import { describe, expect, it } from "vitest";
import { getPrivacyLedgerMeta, type LedgerState } from "./usePrivacyLedger";

describe("usePrivacyLedger helpers", () => {
  it("호출이 없으면 빈 세션 메타를 반환한다", () => {
    const state: LedgerState = {
      total: 0,
      onlineCalls: 0,
      perBackend: {
        embedded: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
        ollama: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
        xllm: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
        gemini: { count: 0, totalPromptChars: 0, totalLatencyMs: 0, lastTs: 0 },
      },
      last: null,
    };

    expect(getPrivacyLedgerMeta(state)).toEqual({
      title: "아직 AI 호출이 없습니다",
      badges: ["온디바이스 0회", "클라우드 0회", "마지막 기록 없음"],
      helper: "AI 호출이 시작되면 세션 단위로 온디바이스/클라우드 흐름이 누적됩니다.",
    });
  });

  it("라우팅 상태를 온디바이스 비율과 마지막 백엔드 중심으로 요약한다", () => {
    const state: LedgerState = {
      total: 5,
      onlineCalls: 2,
      perBackend: {
        embedded: { count: 2, totalPromptChars: 500, totalLatencyMs: 240, lastTs: 10 },
        ollama: { count: 1, totalPromptChars: 120, totalLatencyMs: 90, lastTs: 20 },
        xllm: { count: 1, totalPromptChars: 140, totalLatencyMs: 110, lastTs: 30 },
        gemini: { count: 1, totalPromptChars: 180, totalLatencyMs: 300, lastTs: 40 },
      },
      last: {
        backend: "gemini",
        online: true,
        model: "gemini-2.5-pro",
        prompt_chars: 180,
        latency_ms: 300,
        ts_ms: 40,
      },
    };

    expect(getPrivacyLedgerMeta(state)).toEqual({
      title: "온디바이스 60% · 호출 5회",
      badges: ["온디바이스 3회", "클라우드 2회", "마지막 GEMINI"],
      helper: "이번 세션에서 어떤 백엔드로 라우팅됐는지와 온디바이스 비중을 빠르게 확인할 수 있습니다.",
    });
  });
});
