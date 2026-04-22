import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AgentStep {
  id: number;
  cmd: string;
  description: string;
  risk: "safe" | "caution" | "danger";
}

export interface CompletedStep {
  id: number;
  cmd: string;
  output: string;
  exitCode: number | null;
}

export interface AgentDecision {
  action: "continue" | "done" | "failed";
  message: string;
  nextSteps: AgentStep[] | null;
}

export type AgentStatus =
  | "idle"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "observing"
  | "done"
  | "failed"
  | "cancelled";

export interface AgentState {
  status: AgentStatus;
  task: string;
  plan: AgentStep[];
  currentStepIdx: number;
  completed: CompletedStep[];
  message: string;
}

export function useAgentLoop(model: string) {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    task: "",
    plan: [],
    currentStepIdx: 0,
    completed: [],
    message: "",
  });

  // 출력 캡처 refs
  const outputBufRef = useRef("");
  const stepResolveRef = useRef<((result: { output: string; exitCode: number | null }) => void) | null>(null);
  const abortRef = useRef(false);

  // App.tsx에서 PTY 출력 청크마다 호출됨
  const feedOutput = useCallback((data: string) => {
    if (!stepResolveRef.current) return;
    outputBufRef.current += data;
    // OSC 133 D;{exitCode} 시그널로 커맨드 완료 감지
    const match = outputBufRef.current.match(/\x1b\]133;D;(-?\d+)[\x07\x1b]/);
    if (match) {
      const exitCode = parseInt(match[1], 10);
      const output = outputBufRef.current;
      outputBufRef.current = "";
      const resolve = stepResolveRef.current;
      stepResolveRef.current = null;
      resolve({ output, exitCode });
    }
  }, []);

  // 현재 커맨드 완료 대기 (OSC 133 D 또는 타임아웃)
  const waitForStep = useCallback((timeoutMs = 20000) => {
    return new Promise<{ output: string; exitCode: number | null }>((resolve) => {
      outputBufRef.current = "";
      stepResolveRef.current = resolve;
      setTimeout(() => {
        if (stepResolveRef.current) {
          const output = outputBufRef.current;
          outputBufRef.current = "";
          stepResolveRef.current = null;
          resolve({ output, exitCode: null });
        }
      }, timeoutMs);
    });
  }, []);

  const startTask = useCallback(
    async (task: string, context: string) => {
      abortRef.current = false;
      setState({
        status: "planning",
        task,
        plan: [],
        currentStepIdx: 0,
        completed: [],
        message: "",
      });
      try {
        const plan = await invoke<AgentStep[]>("agent_plan", { task, context, model });
        setState((s) => ({ ...s, status: "awaiting_approval", plan }));
      } catch (e) {
        setState((s) => ({ ...s, status: "failed", message: String(e) }));
      }
    },
    [model],
  );

  // plan과 task를 직접 인수로 받아 상태 클로저 문제 방지
  const approve = useCallback(
    async (plan: AgentStep[], task: string, writeToPty: (cmd: string) => void) => {
      setState((s) => ({ ...s, status: "executing", currentStepIdx: 0 }));
      abortRef.current = false;

      const completedLocal: CompletedStep[] = [];
      let stepQueue: AgentStep[] = [...plan];
      let stepIdx = 0;

      while (stepQueue.length > 0 && !abortRef.current) {
        const step = stepQueue[0];
        stepQueue = stepQueue.slice(1);

        setState((s) => ({ ...s, status: "executing", currentStepIdx: stepIdx }));

        // PTY에 커맨드 전송 (\r 포함)
        writeToPty(step.cmd + "\r");

        // 완료 대기
        const { output, exitCode } = await waitForStep();

        const completed: CompletedStep = {
          id: step.id,
          cmd: step.cmd,
          output: output.slice(0, 2000),
          exitCode,
        };
        completedLocal.push(completed);
        setState((s) => ({ ...s, completed: [...completedLocal] }));

        if (abortRef.current) break;

        // AI에게 다음 액션 결정 요청
        setState((s) => ({ ...s, status: "observing" }));
        try {
          const decision = await invoke<AgentDecision>("agent_observe", {
            task,
            completedSteps: completedLocal.map((c) => ({
              id: c.id,
              cmd: c.cmd,
              output: c.output,
              exit_code: c.exitCode,
            })),
            model,
          });

          if (decision.action === "done" || abortRef.current) {
            setState((s) => ({ ...s, status: "done", message: decision.message }));
            return;
          } else if (decision.action === "failed") {
            setState((s) => ({ ...s, status: "failed", message: decision.message }));
            return;
          } else if (decision.action === "continue" && decision.nextSteps) {
            // 다음 단계를 큐 앞에 추가
            stepQueue = [...(decision.nextSteps ?? []), ...stepQueue];
          }
        } catch {
          // observe 실패 시 남은 계획 계속 진행
        }

        stepIdx++;
        if (stepIdx >= 10) {
          // 안전 제한: 최대 10단계
          setState((s) => ({
            ...s,
            status: "done",
            message: "최대 단계 수(10)에 도달했습니다.",
          }));
          return;
        }
      }

      if (!abortRef.current) {
        setState((s) => ({ ...s, status: "done", message: "태스크가 완료되었습니다." }));
      }
    },
    [model, waitForStep],
  );

  const cancel = useCallback(() => {
    abortRef.current = true;
    stepResolveRef.current = null;
    setState((s) => ({ ...s, status: "cancelled", message: "취소되었습니다." }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    stepResolveRef.current = null;
    setState({
      status: "idle",
      task: "",
      plan: [],
      currentStepIdx: 0,
      completed: [],
      message: "",
    });
  }, []);

  return { state, startTask, approve, cancel, reset, feedOutput };
}
