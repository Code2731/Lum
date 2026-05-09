import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AiBackend } from "../utils/inputRouter";

export interface ReactStep {
  // file_change: 쓰기 도구 성공 시 emit — 프론트 changes 동기화 트리거.
  kind:
    | "thought"
    | "action"
    | "observation"
    | "answer"
    | "error"
    | "status"
    | "file_change";
  content: string;
  tool?: string;
  step?: number;
}

export type ReactStatus = "idle" | "running" | "done" | "error" | "cancelled";
export type ReactMode = "plan" | "act";

// 백엔드 ChangeRisk와 매칭 — serde rename_all = "lowercase".
export type ChangeRisk = "low" | "medium" | "high";
export type ChangeKind = "created" | "modified" | "deleted";

export interface ChangeInfo {
  path: string;
  rel_path: string;
  kind: ChangeKind;
  risk: ChangeRisk;
}

export interface UndoReport {
  restored: string[];
  removed: string[];
  errors: string[];
}

export interface ReactAgentState {
  status: ReactStatus;
  mode: ReactMode;
  goal: string;
  cwd: string;
  planId: string | null;
  backend: AiBackend | null;
  model: string | null;
  plannedTools: string[];
  steps: ReactStep[];
  answer: string;
  changes: ChangeInfo[];
  undoing: boolean;
  undoReport: UndoReport | null;
}

/// path/kind/risk 셋만 비교 — 백엔드가 같은 entries에서 결정적으로 같은 ChangeInfo를 반환하므로 충분.
function sameChanges(a: ChangeInfo[], b: ChangeInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].kind !== b[i].kind || a[i].risk !== b[i].risk) {
      return false;
    }
  }
  return true;
}

export function useReactAgent() {
  const [state, setState] = useState<ReactAgentState>({
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
  });

  const unlistenRef = useRef<UnlistenFn | null>(null);

  // 백엔드 react_agent_changes를 호출해 위험도 분류 포함된 최신 상태 동기화.
  // 동일 list면 setState skip — file_change 이벤트 폭주 시 패널 무의미 리렌더 차단.
  const refreshChanges = useCallback(async () => {
    try {
      const list = await invoke<ChangeInfo[]>("react_agent_changes");
      setState((prev) =>
        sameChanges(prev.changes, list) ? prev : { ...prev, changes: list }
      );
    } catch {
      // 백엔드 미응답 시 조용히 skip — 변경 사항 표시는 best-effort.
    }
  }, []);

  const runInternal = useCallback(
    async (
      goal: string,
      cwd: string,
      mode: ReactMode,
      backend?: AiBackend | null,
      model?: string | null,
      toolWhitelist?: string[] | null,
      applyConfigWhitelist?: boolean,
      planId?: string | null,
    ) => {
      // 이전 리스너 정리
      unlistenRef.current?.();
      unlistenRef.current = null;

      setState({
        status: "running",
        mode,
        goal,
        cwd,
        planId: planId ?? null,
        backend: backend ?? null,
        model: model ?? null,
        plannedTools: [],
        steps: [],
        answer: "",
        changes: [],
        undoing: false,
        undoReport: null,
      });

      // react_event 리스너 등록
      const unlisten = await listen<ReactStep>("react_event", (event) => {
        const step = event.payload;
        setState((prev) => {
          if (step.kind === "answer") {
            return {
              ...prev,
              status: "done",
              answer: step.content,
              steps: [...prev.steps, step],
            };
          }
          if (step.kind === "error") {
            return {
              ...prev,
              status: "error",
              steps: [...prev.steps, step],
            };
          }
          if (step.kind === "action" && step.tool && prev.mode === "plan") {
            const has = prev.plannedTools.includes(step.tool);
            return {
              ...prev,
              steps: [...prev.steps, step],
              plannedTools: has ? prev.plannedTools : [...prev.plannedTools, step.tool],
            };
          }
          return { ...prev, steps: [...prev.steps, step] };
        });
        // file_change 이벤트는 백엔드 changes 동기화 트리거.
        if (step.kind === "file_change") {
          refreshChanges();
        }
      });
      unlistenRef.current = unlisten;

      try {
        await invoke("react_agent_run", {
          goal,
          cwd,
          mode,
          backend: backend ?? null,
          model: model ?? null,
          toolWhitelist: toolWhitelist ?? null,
          applyConfigWhitelist: applyConfigWhitelist ?? true,
          planId: planId ?? null,
        });
        setState((prev) =>
          prev.status === "running" ? { ...prev, status: "done" } : prev
        );
      } catch (e) {
        setState((prev) => ({
          ...prev,
          status: "error",
          steps: [
            ...prev.steps,
            { kind: "error", content: String(e) },
          ],
        }));
      } finally {
        unlistenRef.current?.();
        unlistenRef.current = null;
        // 종료 시점에 changes 마지막 동기화 — file_change 이벤트 race 보강.
        await refreshChanges();
      }
    },
    [refreshChanges]
  );

  const runPlan = useCallback(
    async (goal: string, cwd: string, backend?: AiBackend, model?: string | null) => {
      const pid = `plan-${Date.now()}`;
      await runInternal(goal, cwd, "plan", backend, model, null, false, pid);
    },
    [runInternal],
  );

  const runAct = useCallback(
    async (
      goal: string,
      cwd: string,
      planId?: string | null,
      backend?: AiBackend | null,
      model?: string | null,
      toolWhitelist?: string[] | null,
      applyConfigWhitelist?: boolean,
    ) => {
      await runInternal(
        goal,
        cwd,
        "act",
        backend,
        model,
        toolWhitelist,
        applyConfigWhitelist ?? true,
        planId ?? null,
      );
    },
    [runInternal],
  );

  const start = useCallback(
    async (goal: string, cwd: string, backend?: AiBackend, model?: string | null) => {
      await runPlan(goal, cwd, backend, model);
    },
    [runPlan],
  );

  const cancel = useCallback(() => {
    invoke("react_agent_cancel").catch(() => {});
    setState((prev) => ({ ...prev, status: "cancelled" }));
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  // 호출 후 백업이 폐기되므로 changes는 빈 배열로 클리어.
  const undo = useCallback(async () => {
    setState((prev) => ({ ...prev, undoing: true }));
    try {
      const report = await invoke<UndoReport>("react_agent_undo");
      setState((prev) => ({
        ...prev,
        undoing: false,
        undoReport: report,
        changes: [],
      }));
      return report;
    } catch (e) {
      setState((prev) => ({
        ...prev,
        undoing: false,
        undoReport: { restored: [], removed: [], errors: [String(e)] },
      }));
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    invoke("react_agent_cancel").catch(() => {});
    unlistenRef.current?.();
    unlistenRef.current = null;
    setState({
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
    });
  }, []);

  return { state, start, runPlan, runAct, cancel, reset, undo };
}
