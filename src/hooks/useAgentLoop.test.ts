import { describe, expect, it } from "vitest";
import { getAgentLoopMeta, type AgentState } from "./useAgentLoop";

describe("useAgentLoop helpers", () => {
  it("idle 상태는 에이전트 시작 흐름을 안내한다", () => {
    const state: AgentState = {
      status: "idle",
      task: "",
      plan: [],
      currentStepIdx: 0,
      completed: [],
      message: "",
    };

    expect(getAgentLoopMeta(state)).toEqual({
      title: "에이전트 대기 중",
      badges: ["먼저 작업 입력", "다음 계획 생성", "마지막 실행 승인"],
      helper: "작업을 시작하면 계획 생성, 승인, 실행, 관찰 순서로 진행됩니다.",
    });
  });

  it("진행 중 상태는 계획/완료/남은 단계를 요약한다", () => {
    const state: AgentState = {
      status: "executing",
      task: "테스트 실패 원인 찾기",
      plan: [
        { id: 1, cmd: "npm test", description: "테스트 실행", risk: "safe" },
        { id: 2, cmd: "cat log.txt", description: "로그 확인", risk: "safe" },
        { id: 3, cmd: "rg error src", description: "에러 검색", risk: "caution" },
      ],
      currentStepIdx: 1,
      completed: [
        { id: 1, cmd: "npm test", output: "failed", exitCode: 1 },
      ],
      message: "다음 단계를 실행 중입니다.",
    };

    expect(getAgentLoopMeta(state)).toEqual({
      title: "에이전트 executing",
      badges: ["계획 3단계", "완료 1단계", "남은 2단계"],
      helper: "다음 단계를 실행 중입니다.",
    });
  });
});
