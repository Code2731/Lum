import { describe, expect, it } from "vitest";
import { getAutoHealingMeta } from "./useAutoHealing";
import type { HealingResult } from "../components/HealingPanel";

describe("useAutoHealing helpers", () => {
  it("대기 상태에서는 자동 복구 시작 흐름을 안내한다", () => {
    expect(
      getAutoHealingMeta({
        healingError: null,
        healingResult: null,
        isHealingAnalyzing: false,
      }),
    ).toEqual({
      title: "자동 복구 대기 중",
      badges: ["먼저 오류 감지", "다음 AI 분석", "마지막 승인 실행"],
      helper: "실행 오류가 감지되면 최근 출력 조각을 바탕으로 복구 제안 흐름이 시작됩니다.",
    });
  });

  it("분석 중 상태에서는 진행 중 메타를 반환한다", () => {
    expect(
      getAutoHealingMeta({
        healingError: "npm ERR! missing script",
        healingResult: null,
        isHealingAnalyzing: true,
      }),
    ).toEqual({
      title: "자동 복구 분석 중",
      badges: ["먼저 오류 감지", "다음 AI 분석", "마지막 실행 제안"],
      helper: "최근 오류 출력과 문맥을 바탕으로 복구 제안과 안전도를 계산하고 있습니다.",
    });
  });

  it("복구 제안이 있으면 안전도와 실행 가능 여부를 요약한다", () => {
    const healingResult: HealingResult = {
      analysis: "package.json에 dev 스크립트가 없습니다.",
      suggestion: "npm run start",
      safetyLevel: "Safe",
    };

    expect(
      getAutoHealingMeta({
        healingError: "npm ERR! missing script: dev",
        healingResult,
        isHealingAnalyzing: false,
      }),
    ).toEqual({
      title: "자동 복구 제안 준비됨",
      badges: ["오류 감지 완료", "안전도 Safe", "바로 실행 가능"],
      helper: "package.json에 dev 스크립트가 없습니다.",
    });
  });
});
