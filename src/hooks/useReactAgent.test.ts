import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReactAgent, type ReactStep } from "./useReactAgent";

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

  it("runPlan → plannedTools 수집 후 runAct에 whitelist 전달", async () => {
    const { result } = renderHook(() => useReactAgent());

    await act(async () => {
      await result.current.runPlan("utils.rs 함수 수정 계획", "/tmp/lum");
    });
    expect(result.current.state.mode).toBe("plan");
    expect(result.current.state.status).toBe("done");
    expect(result.current.state.plannedTools).toEqual(["read_file", "run_tests"]);
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
        result.current.state.plannedTools,
      );
    });
    expect(result.current.state.mode).toBe("act");
    expect(result.current.state.status).toBe("done");
    expect(result.current.state.answer).toContain("실행 완료");

    const runCalls = invokeMock.mock.calls.filter((c) => c[0] === "react_agent_run");
    expect(runCalls).toHaveLength(2);
    expect(runCalls[1]?.[1]).toMatchObject({
      mode: "act",
      toolWhitelist: ["read_file", "run_tests"],
      planId: expect.any(String),
      applyConfigWhitelist: true,
    });
  });

  it("runAct에서 whitelist 미전달이면 config whitelist 사용을 끈다", async () => {
    const { result } = renderHook(() => useReactAgent());
    await act(async () => {
      await result.current.runAct("goal", "/tmp/lum", "plan-1", null, false);
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
});
