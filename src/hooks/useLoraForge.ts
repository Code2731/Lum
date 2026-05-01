// Phase 119 — LoRA Forge 훅. 백엔드 commands::lora_forge 1:1 매핑.
// 라이브 진행률은 `lora_forge_progress` / `lora_forge_status` 이벤트 구독.

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ForgeStatus = "running" | "completed" | "failed" | "cancelled";

export interface ForgeRun {
  id: string;
  task: string;
  runtime: "mlx-lm" | "axolotl" | string;
  base_model: string;
  dataset_path: string;
  output_dir: string;
  iters: number;
  lora_rank: number;
  learning_rate: number;
  ts_started_ms: number;
  ts_ended_ms: number | null;
  status: ForgeStatus;
  exit_code: number | null;
  log_tail: string[];
}

export interface RuntimeStatus {
  mlx_lm: boolean;
  axolotl: boolean;
  hint: string;
}

export interface ForgeStartOpts {
  task: string;
  runtime: "mlx-lm" | "axolotl";
  baseModel: string;
  datasetPath?: string | null;
  iters: number;
  loraRank: number;
  learningRate: number;
}

interface ProgressEvent {
  run_id: string;
  stream: "stdout" | "stderr";
  line: string;
  ts_ms: number;
}

interface StatusEvent {
  run_id: string;
  status: ForgeStatus;
  exit_code: number | null;
  ts_ms: number;
}

const LIVE_LOG_CAP = 200;

export function useLoraForge() {
  const [runs, setRuns] = useState<ForgeRun[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // run_id → 누적 라이브 로그(라인). 진행 중인 run의 UI 출력에만 사용.
  const [liveLogs, setLiveLogs] = useState<Record<string, string[]>>({});
  const liveLogsRef = useRef(liveLogs);
  liveLogsRef.current = liveLogs;

  const reload = useCallback(async () => {
    setError(null);
    try {
      const rows = await invoke<ForgeRun[]>("lora_forge_list");
      setRuns(rows);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshRuntimes = useCallback(async () => {
    try {
      const r = await invoke<RuntimeStatus>("lora_forge_runtimes");
      setRuntimes(r);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    reload();
    refreshRuntimes();
  }, [reload, refreshRuntimes]);

  // 이벤트 구독.
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    listen<ProgressEvent>("lora_forge_progress", (e) => {
      const { run_id, line } = e.payload;
      setLiveLogs((prev) => {
        const arr = prev[run_id] ?? [];
        const next = arr.length >= LIVE_LOG_CAP ? arr.slice(arr.length - LIVE_LOG_CAP + 1) : arr.slice();
        next.push(line);
        return { ...prev, [run_id]: next };
      });
    }).then((u) => unsubs.push(u));

    listen<StatusEvent>("lora_forge_status", () => {
      // 상태 전이 — 영속 store에서 다시 로드.
      reload();
    }).then((u) => unsubs.push(u));

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [reload]);

  const start = useCallback(
    async (opts: ForgeStartOpts): Promise<ForgeRun> => {
      setError(null);
      try {
        const run = await invoke<ForgeRun>("lora_forge_start", {
          opts: {
            task: opts.task,
            runtime: opts.runtime,
            base_model: opts.baseModel,
            dataset_path: opts.datasetPath ?? null,
            iters: opts.iters,
            lora_rank: opts.loraRank,
            learning_rate: opts.learningRate,
          },
        });
        setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
        // 새 run 라이브 로그 초기화.
        setLiveLogs((prev) => ({ ...prev, [run.id]: [] }));
        return run;
      } catch (e) {
        const msg = String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [],
  );

  const cancel = useCallback(async (runId: string): Promise<boolean> => {
    setError(null);
    try {
      return await invoke<boolean>("lora_forge_cancel", { runId });
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, []);

  const remove = useCallback(async (runId: string) => {
    setError(null);
    try {
      await invoke("lora_forge_remove", { runId });
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      setLiveLogs((prev) => {
        const next = { ...prev };
        delete next[runId];
        return next;
      });
    } catch (e) {
      const msg = String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const canLoad = useCallback(async (runId: string): Promise<boolean> => {
    try {
      return await invoke<boolean>("lora_forge_can_load", { runId });
    } catch {
      return false;
    }
  }, []);

  return {
    runs,
    runtimes,
    liveLogs,
    error,
    start,
    cancel,
    remove,
    canLoad,
    reload,
    refreshRuntimes,
  };
}
