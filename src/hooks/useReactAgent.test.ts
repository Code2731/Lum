import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { getReactAgentMeta, useReactAgent, type ReactStep } from "./useReactAgent";

const invokeMock = vi.fn();
const listeners: Array<(event: { payload: ReactStep }) => void> = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, cb: (event: { payload: ReactStep }) => void) => {
    listeners.push(cb);
    return () => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }),
}));

function emit(step: ReactStep) {
  const cb = listeners[listeners.length - 1];
  cb?.({ payload: step });
}

describe("useReactAgent — Phase 129 Plan/Act", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listeners.splice(0, listeners.length);
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === "react_agent_run") {
        const a = args as {
          mode?: "plan" | "act";
          toolWhitelist?: string[] | null;
          planId?: string | null;
        };
        if (a?.mode === "plan") {
          emit({
            kind: "action",
            content: "read_file({\"path\":\"src/main.rs\"})",
            tool: "read_file",
          });
          emit({
            kind: "action",
            content: "run_tests({\"cwd\":\".\"})",
            tool: "run_tests",
          });
          emit({ kind: "answer", content: "계획 수립 완료" });
        } else {
          emit({ kind: "status", content: `act whitelist=${(a?.toolWhitelist ?? []).length}` });
          emit({ kind: "answer", content: "실행 완료" });
        }
        return;
      }
      if (cmd === "react_agent_changes") return [];
      if (cmd === "react_agent_cancel") return;
      if (cmd === "react_agent_undo") return { restored: [], removed: [], errors: [] };
      return;
    });
  });

  it("idle/실행 상태를 메타로 요약한다", () => {
    expect(getReactAgentMeta({
      status: "idle",
      mode: "plan",
      goal: "",
      cwd: "",
      planId: null,
      backend: null,
      model: null,
      plannedTools: [],
      steps: [],
      answer: "",
      changes: [],
      undoing: false,
      undoReport: null,
    })).toEqual({
      title: "React Agent 대기 중",
      badges: ["먼저 goal 입력", "다음 계획/실행", "마지막 변경 검토"],
      helper: "코드 작업 goal을 시작하면 계획 수립, 실행, 변경 검토, 되돌리기 흐름으로 이어집니다.",
    });

    expect(getReactAgentMeta({
      status: "running",
      mode: "act",
      goal: "버그 수정",
      cwd: "/tmp/lum",
      planId: "plan-1",
      backend: null,
      model: null,
      plannedTools: ["read_file"],
      steps: [{ kind: "action", content: "run", tool: "shell" }],
      answer: "",
      changes: [
        { path: "/tmp/lum/a.ts", rel_path: "a.ts", kind: "modified", risk: "medium" },
      ],
      undoing: false,
      undoReport: null,
    })).toEqual({
      title: "React Agent running",
      badges: ["모드 act", "스텝 1개", "변경 1개"],
      helper: "계획, 실행, 변경 추적 결과를 바탕으로 다음 승인이나 되돌리기 결정을 이어갈 수 있습니다.",
    });
  });

  it("runPlan → 읽기 도구만 수집하고 runAct는 whitelist 없이 실행", async () => {
    const { result } = renderHook(() => useReactAgent());

    await act(async () => {
      await result.current.runPlan("utils.rs 함수 수정 계획", "/tmp/lum");
    });
    expect(result.current.state.mode).toBe("plan");
    expect(result.current.state.status).toBe("done");
    expect(result.current.state.plannedTools).toEqual(["read_file"]);
    expect(result.current.state.planId).toBeTruthy();

    const firstCall = invokeMock.mock.calls.find((c) => c[0] === "react_agent_run");
    expect(firstCall?.[1]).toMatchObject({
      mode: "plan",
      goal: "utils.rs 함수 수정 계획",
      cwd: "/tmp/lum",
      applyConfigWhitelist: false,
    });

    await act(async () => {
      await result.current.runAct(
        result.current.state.goal,
        result.current.state.cwd,
        result.current.state.planId,
        result.current.state.backend,
        result.current.state.model,
        null,
      );
    });
    expect(result.current.state.mode).toBe("act");
    expect(result.current.state.status).toBe("done");
    expect(result.current.state.answer).toContain("실행 완료");

    const runCalls = invokeMock.mock.calls.filter((c) => c[0] === "react_agent_run");
    expect(runCalls).toHaveLength(2);
    expect(runCalls[1]?.[1]).toMatchObject({
      mode: "act",
      toolWhitelist: null,
      planId: expect.any(String),
      applyConfigWhitelist: false,
    });
  });

  it("runAct에서 whitelist 미전달이면 config whitelist 사용을 끈다", async () => {
    const { result } = renderHook(() => useReactAgent());
    await act(async () => {
      await result.current.runAct("goal", "/tmp/lum", "plan-1", null, null, null, false);
    });
    const runCalls = invokeMock.mock.calls.filter((c) => c[0] === "react_agent_run");
    const last = runCalls[runCalls.length - 1];
    expect(last?.[1]).toMatchObject({
      mode: "act",
      toolWhitelist: null,
      applyConfigWhitelist: false,
      planId: "plan-1",
    });
  });

  it("runAct에서 applyConfigWhitelist를 생략해도 config whitelist를 쓰지 않는다", async () => {
    const { result } = renderHook(() => useReactAgent());
    await act(async () => {
      await result.current.runAct("goal", "/tmp/lum", "plan-1", null, null, null);
    });
    const runCalls = invokeMock.mock.calls.filter((c) => c[0] === "react_agent_run");
    const last = runCalls[runCalls.length - 1];
    expect(last?.[1]).toMatchObject({
      mode: "act",
      toolWhitelist: null,
      applyConfigWhitelist: false,
      planId: "plan-1",
    });
  });

  it("start에 backend/model 전달 시 react_agent_run payload로 전달", async () => {
    const { result } = renderHook(() => useReactAgent());
    await act(async () => {
      await result.current.start("로그인 버그 수정", "/tmp/lum", "local", "Qwen2.5-Coder-7B");
    });
    const runCalls = invokeMock.mock.calls.filter((c) => c[0] === "react_agent_run");
    const first = runCalls[0];
    expect(first?.[1]).toMatchObject({
      mode: "plan",
      backend: "local",
      model: "Qwen2.5-Coder-7B",
      applyConfigWhitelist: false,
    });
  });
});
