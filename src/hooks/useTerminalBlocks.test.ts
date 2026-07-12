import { describe, expect, it } from "vitest";
import { getTerminalBlocksMeta, type TerminalBlock } from "./useTerminalBlocks";

describe("useTerminalBlocks helpers", () => {
  it("블록이 없으면 캔버스 대기 메타를 반환한다", () => {
    expect(getTerminalBlocksMeta([])).toEqual({
      title: "터미널 블록이 없습니다",
      badges: ["전체 0개", "실행 중 0개", "최근 블록 대기"],
      helper: "명령 실행이나 AI 응답이 시작되면 블록이 쌓이고 이후 캔버스에서 관계를 정리할 수 있습니다.",
    });
  });

  it("블록 수와 실행 중 수, 최근 상태를 함께 요약한다", () => {
    const blocks: TerminalBlock[] = [
      {
        id: "b1",
        command: "npm test",
        output: "ok",
        type: "shell",
        status: "completed",
        cwd: "/repo",
        gitBranch: "main",
        position: { x: 0, y: 0 },
        links: [],
      },
      {
        id: "b2",
        command: "리뷰해줘",
        output: "",
        type: "review",
        status: "executing",
        cwd: "/repo",
        gitBranch: "main",
        position: { x: 350, y: 0 },
        links: ["b1"],
      },
    ];

    expect(getTerminalBlocksMeta(blocks)).toEqual({
      title: "터미널 블록 2개",
      badges: ["전체 2개", "실행 중 1개", "최근 executing"],
      helper: "실행 블록, AI 블록, 리뷰 블록 흐름을 같은 캔버스에서 이어 보며 이동과 연결을 관리할 수 있습니다.",
    });
  });
});
