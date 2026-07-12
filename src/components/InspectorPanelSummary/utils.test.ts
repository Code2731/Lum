import { describe, expect, it } from "vitest";
import {
  formatDurationMs,
  getInspectorActiveFlow,
  getInspectorActivePrimaryAction,
  getInspectorIdleContextFlow,
  getInspectorIdlePrimaryFlow,
} from "./utils";

describe("InspectorPanelSummary utils", () => {
  it("formatDurationMs는 밀리초, 초, 분 단위를 읽기 쉽게 포맷한다", () => {
    expect(formatDurationMs(null)).toBe("-");
    expect(formatDurationMs(-1)).toBe("-");
    expect(formatDurationMs(320)).toBe("320ms");
    expect(formatDurationMs(1540)).toBe("1.5s");
    expect(formatDurationMs(61_000)).toBe("1m 1s");
  });

  it("idle primary flow는 인스펙터 첫 사용 흐름을 반환한다", () => {
    expect(getInspectorIdlePrimaryFlow()).toEqual({
      badges: ["먼저 실행", "다음 실패 확인", "마지막 기록 확인"],
      helper: "명령을 한 번 실행하면 실패 블록, 추천 커맨드, 최근 기록 흐름이 차례로 열립니다.",
    });
  });

  it("idle context flow는 현재 탭 문맥을 포함한다", () => {
    expect(getInspectorIdleContextFlow("main")).toEqual({
      badges: ["현재 탭", "main", "실행 대기"],
      helper: "이 탭에서 첫 명령을 실행하면 이후 실패 분석과 최근 기록이 같은 문맥으로 쌓입니다.",
    });
  });

  it("idle context flow는 탭 이름이 없으면 터미널로 폴백한다", () => {
    expect(getInspectorIdleContextFlow("")).toEqual({
      badges: ["현재 탭", "터미널", "실행 대기"],
      helper: "이 탭에서 첫 명령을 실행하면 이후 실패 분석과 최근 기록이 같은 문맥으로 쌓입니다.",
    });
  });

  it("active flow는 실패 블록이 있으면 복구 우선 흐름을 반환한다", () => {
    expect(
      getInspectorActiveFlow({
        failedBlockCount: 2,
        hasAnalyzeCache: false,
        hasRecentBlocks: true,
      }),
    ).toEqual({
      badges: ["실패 2건", "AI 분석 시작", "최근 기록 비교"],
      helper: "실패 블록이 감지되었습니다. 먼저 실패 분석을 열고, 그다음 최근 기록과 함께 복구 단서를 확인하는 흐름이 가장 빠릅니다.",
      tone: "amber",
    });
  });

  it("active flow는 분석 결과가 있으면 그에 맞는 후속 흐름을 반환한다", () => {
    expect(
      getInspectorActiveFlow({
        failedBlockCount: 1,
        hasAnalyzeCache: true,
        hasRecentBlocks: true,
      }),
    ).toEqual({
      badges: ["실패 1건", "분석 결과 확인", "최근 기록 비교"],
      helper: "실패 블록이 감지되었습니다. 먼저 분석 결과를 확인하고, 이어서 최근 기록과 비교하며 복구 흐름을 좁히면 됩니다.",
      tone: "amber",
    });
  });

  it("active flow는 실패가 없으면 정상 유지 흐름을 반환한다", () => {
    expect(
      getInspectorActiveFlow({
        failedBlockCount: 0,
        hasAnalyzeCache: false,
        hasRecentBlocks: true,
      }),
    ).toEqual({
      badges: ["정상 흐름 유지", "최근 기록 확인", "빠른 작업 준비"],
      helper: "현재 실패는 없습니다. 최근 기록과 빠른 작업 메뉴를 기준으로 다음 실행을 이어가면 됩니다.",
      tone: "cyan",
    });
  });

  it("primary action은 실패 분석이 가장 우선일 때 분석 액션을 반환한다", () => {
    expect(
      getInspectorActivePrimaryAction({
        failedBlockCount: 2,
        hasFocusedFailedBlock: true,
        hasAnalyzeCache: false,
        hasRecentBlocks: true,
      }),
    ).toEqual({
      label: "실패 분석 시작",
      helper: "가장 최근 실패 블록을 바로 분석해 복구 단서를 먼저 확보합니다.",
      action: "analyze-failure",
    });
  });

  it("primary action은 분석 결과가 있으면 실패 블록 재확인 액션을 반환한다", () => {
    expect(
      getInspectorActivePrimaryAction({
        failedBlockCount: 1,
        hasFocusedFailedBlock: true,
        hasAnalyzeCache: true,
        hasRecentBlocks: true,
      }),
    ).toEqual({
      label: "실패 블록 다시 보기",
      helper: "분석 결과와 함께 현재 실패 블록으로 돌아가 로그와 제안 커맨드를 맞춰 봅니다.",
      action: "focus-failure",
    });
  });

  it("primary action은 실패가 없으면 최근 기록 액션을 반환한다", () => {
    expect(
      getInspectorActivePrimaryAction({
        failedBlockCount: 0,
        hasFocusedFailedBlock: false,
        hasAnalyzeCache: false,
        hasRecentBlocks: true,
      }),
    ).toEqual({
      label: "최근 기록 열기",
      helper: "가장 최근 실행 기록을 열어 다음 작업을 현재 문맥에서 이어갑니다.",
      action: "open-recent",
    });
  });
});
