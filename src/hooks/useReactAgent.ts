import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface ReactStep {
  kind: "thought" | "action" | "observation" | "answer" | "error" | "status";
  content: string;
  tool?: string;
  step?: number;
}

export type ReactStatus = "idle" | "running" | "done" | "error" | "cancelled";

export interface ReactAgentState {
  status: ReactStatus;
  goal: string;
  steps: ReactStep[];
  answer: string;
}

export function useReactAgent() {
  const [state, setState] = useState<ReactAgentState>({
    status: "idle",
    goal: "",
    steps: [],
    answer: "",
  });

  const unlistenRef = useRef<UnlistenFn | null>(null);

  const start = useCallback(async (goal: string, cwd: string) => {
    // 이전 리스너 정리
    unlistenRef.current?.();
    unlistenRef.current = null;

    setState({ status: "running", goal, steps: [], answer: "" });

    // react_event 리스너 등록
    const unlisten = await listen<ReactStep>("react_event", (event) => {
      const step = event.payload;
      setState((prev) => {
        if (step.kind === "answer") {
          return { ...prev, status: "done", answer: step.content, steps: [...prev.steps, step] };
        }
        if (step.kind === "error") {
          return { ...prev, status: "error", steps: [...prev.steps, step] };
        }
        return { ...prev, steps: [...prev.steps, step] };
      });
    });
    unlistenRef.current = unlisten;

    try {
      await invoke("react_agent_run", { goal, cwd });
      setState((prev) => {
        if (prev.status === "running") {
          return { ...prev, status: "done" };
        }
        return prev;
      });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        status: "error",
        steps: [...prev.steps, { kind: "error", content: String(e) }],
      }));
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    invoke("react_agent_cancel").catch(() => {});
    setState((prev) => ({ ...prev, status: "cancelled" }));
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  const reset = useCallback(() => {
    invoke("react_agent_cancel").catch(() => {});
    unlistenRef.current?.();
    unlistenRef.current = null;
    setState({ status: "idle", goal: "", steps: [], answer: "" });
  }, []);

  return { state, start, cancel, reset };
}
