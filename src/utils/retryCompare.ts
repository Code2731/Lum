export interface RetryCompareResult {
  added: number;
  removed: number;
  preview: string;
  addedLines: string[];
  removedLines: string[];
  comparedAt: number;
}

export interface RetryCompareTask {
  id: string;
  command: string;
  baselineOutput: string;
}

export interface RetryCompareRuntimeCache {
  queue: RetryCompareTask[];
  paused: boolean;
  completedCount: number;
}

const RETRY_COMPARE_STORAGE_KEY = "lum.retryCompareByBlock.v1";
const RETRY_COMPARE_RUNTIME_STORAGE_KEY = "lum.retryCompareRuntime.v1";

export function loadRetryCompareCache(): Record<string, RetryCompareResult> {
  try {
    const raw = localStorage.getItem(RETRY_COMPARE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const byBlock = (parsed as { byBlock?: unknown }).byBlock;
    if (!byBlock || typeof byBlock !== "object") return {};
    return byBlock as Record<string, RetryCompareResult>;
  } catch {
    return {};
  }
}

export function saveRetryCompareCache(byBlock: Record<string, RetryCompareResult>): void {
  try {
    localStorage.setItem(RETRY_COMPARE_STORAGE_KEY, JSON.stringify({ byBlock }));
  } catch {
    // noop
  }
}

export function loadRetryCompareRuntimeCache(): RetryCompareRuntimeCache {
  try {
    const raw = localStorage.getItem(RETRY_COMPARE_RUNTIME_STORAGE_KEY);
    if (!raw) return { queue: [], paused: false, completedCount: 0 };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { queue: [], paused: false, completedCount: 0 };
    const obj = parsed as { queue?: unknown; paused?: unknown; completedCount?: unknown };
    const queue = Array.isArray(obj.queue)
      ? obj.queue.filter((x): x is RetryCompareTask => {
        if (!x || typeof x !== "object") return false;
        const v = x as Partial<RetryCompareTask>;
        return typeof v.id === "string" && typeof v.command === "string" && typeof v.baselineOutput === "string";
      })
      : [];
    const paused = typeof obj.paused === "boolean" ? obj.paused : false;
    const completedCount = typeof obj.completedCount === "number" && Number.isFinite(obj.completedCount)
      ? Math.max(0, Math.floor(obj.completedCount))
      : 0;
    return { queue, paused, completedCount };
  } catch {
    return { queue: [], paused: false, completedCount: 0 };
  }
}

export function saveRetryCompareRuntimeCache(cache: RetryCompareRuntimeCache): void {
  try {
    localStorage.setItem(RETRY_COMPARE_RUNTIME_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // noop
  }
}
