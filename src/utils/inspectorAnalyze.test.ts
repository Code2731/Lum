import { describe, expect, it } from "vitest";
import {
  extractInspectorAnalyzeCommands,
  getInspectorAnalyzeFlowSummary,
} from "./inspectorAnalyze";

describe("extractInspectorAnalyzeCommands", () => {
  it("bash 코드블록에서 커맨드를 우선 추출한다", () => {
    const content = [
      "원인: 의존성 누락",
      "",
      "```bash",
      "npm install",
      "npm run build",
      "```",
    ].join("\n");

    expect(extractInspectorAnalyzeCommands(content)).toEqual([
      "npm install",
      "npm run build",
    ]);
  });

  it("불릿 + 인라인 코드 포맷에서도 커맨드를 추출한다", () => {
    const content = [
      "1) `pnpm install`",
      "2) `pnpm lint --fix`",
      "3) 재시도",
    ].join("\n");

    expect(extractInspectorAnalyzeCommands(content)).toEqual([
      "pnpm install",
      "pnpm lint --fix",
    ]);
  });

  it("프롬프트($) 형식 라인도 추출한다", () => {
    const content = [
      "- $ cargo check",
      "- $ cargo test -q",
    ].join("\n");

    expect(extractInspectorAnalyzeCommands(content)).toEqual([
      "cargo check",
      "cargo test -q",
    ]);
  });

  it("중복 커맨드는 제거한다", () => {
    const content = [
      "```bash",
      "npm test",
      "npm test",
      "```",
      "1) `npm test`",
    ].join("\n");

    expect(extractInspectorAnalyzeCommands(content)).toEqual(["npm test"]);
  });

  it("커맨드가 없으면 빈 배열을 반환한다", () => {
    const content = "원인 분석: 파일 권한 오류. 체크포인트를 확인하세요.";
    expect(extractInspectorAnalyzeCommands(content)).toEqual([]);
  });

  it("코드블록 추출 시 주석 행은 건너뛴다", () => {
    const content = [
      "```bash",
      "# 빌드 환경 확인",
      "npm ci",
      "# 테스트 실행",
      "npm test",
      "```",
    ].join("\n");

    expect(extractInspectorAnalyzeCommands(content)).toEqual([
      "npm ci",
      "npm test",
    ]);
  });

  it("동일한 명령은 코드블록/라인 혼합에서도 한 번만 반환한다", () => {
    const content = [
      "```bash",
      "npm run build",
      "```",
      "",
      "- $ npm run build",
      "- $ npm run lint",
      "1) `npm run test`",
    ].join("\n");

    expect(extractInspectorAnalyzeCommands(content, 3)).toEqual([
      "npm run build",
      "npm run lint",
      "npm run test",
    ]);
  });

  it("limit가 1이면 첫 번째 추천 커맨드만 반환한다", () => {
    const content = [
      "```bash",
      "npm run build",
      "npm run test",
      "```",
      "- $ npm run lint",
    ].join("\n");

    expect(extractInspectorAnalyzeCommands(content, 1)).toEqual(["npm run build"]);
  });

  it("너무 긴 라인은 명령 후보에서 제외된다", () => {
    const veryLongCommand = `echo ${"a".repeat(241)}`;
    const content = [
      "- $ echo short",
      veryLongCommand,
      "```bash",
      veryLongCommand,
      "npm test",
      "```",
    ].join("\n");

    expect(extractInspectorAnalyzeCommands(content)).toEqual(["echo short", "npm test"]);
  });

  it("분석 상태별 흐름 요약을 반환한다", () => {
    expect(getInspectorAnalyzeFlowSummary({ status: "idle", suggestedCount: 0 })).toEqual({
      badges: ["분석 대기", "실패 원인 미확인", "실행 후 시작"],
      helper: "아직 분석을 시작하지 않은 상태라 실패 블록을 기준으로 AI 분석을 먼저 실행하면 됩니다.",
    });

    expect(getInspectorAnalyzeFlowSummary({ status: "streaming", suggestedCount: 0 })).toEqual({
      badges: ["분석 중", "응답 수집", "추천 정리 대기"],
      helper: "AI 응답을 수집하는 동안이며 완료되면 요약과 추천 커맨드가 현재 카드에 정리됩니다.",
    });

    expect(getInspectorAnalyzeFlowSummary({ status: "error", suggestedCount: 0 })).toEqual({
      badges: ["분석 오류", "응답 확인 필요", "다시 시도 가능"],
      helper: "분석 응답이 오류로 끝나 현재 결과를 확인한 뒤 다시 요청하거나 프롬프트를 조정하는 흐름입니다.",
    });

    expect(getInspectorAnalyzeFlowSummary({ status: "done", suggestedCount: 2 })).toEqual({
      badges: ["분석 완료", "추천 2개", "다음 액션 선택"],
      helper: "분석이 끝나 추천 커맨드까지 정리된 상태라 바로 실행, 복사, AI 바 로드 흐름으로 이어갈 수 있습니다.",
    });

    expect(getInspectorAnalyzeFlowSummary({ status: "done", suggestedCount: 0 })).toEqual({
      badges: ["분석 완료", "추천 0개", "수동 판단 필요"],
      helper: "분석은 끝났지만 추천 커맨드가 없어 결과 요약을 바탕으로 다음 액션을 직접 정해야 합니다.",
    });
  });
});
