import { describe, expect, it } from "vitest";
import { extractInspectorAnalyzeCommands } from "./inspectorAnalyze";

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
});
