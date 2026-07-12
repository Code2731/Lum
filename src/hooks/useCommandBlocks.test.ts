import { describe, expect, it } from "vitest";
import { getCommandBlocksMeta, type CommandBlock } from "./useCommandBlocks";

describe("useCommandBlocks helpers", () => {
  it("블록이 없으면 실행 대기 메타를 반환한다", () => {
    expect(getCommandBlocksMeta([])).toEqual({
      title: "커맨드 블록이 없습니다",
      badges: ["전체 0개", "실패 0개", "최근 실행 대기"],
      helper: "터미널 실행이 시작되면 커맨드 블록이 쌓이고 이후 실패 분석이나 비교 흐름으로 이어집니다.",
    });
  });

  it("성공/실패 블록 수와 최근 상태를 함께 요약한다", () => {
    const blocks: CommandBlock[] = [
      {
        id: "1",
        command: "npm test",
        output: "ok",
        exitCode: 0,
        startedAt: 1,
        endedAt: 2,
      },
      {
        id: "2",
        command: "npm run build",
        output: "failed",
        exitCode: 1,
        startedAt: 3,
        endedAt: 4,
      },
    ];

    expect(getCommandBlocksMeta(blocks)).toEqual({
      title: "커맨드 블록 2개",
      badges: ["전체 2개", "실패 1개", "최근 실패"],
      helper: "최근 실행 히스토리를 기반으로 성공/실패 흐름과 후속 비교 작업을 이어갈 수 있습니다.",
    });
  });
});
