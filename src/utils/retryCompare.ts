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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => typeof item === "string")) return null;
  return value;
}

function parseRetryCompareResult(value: unknown): RetryCompareResult | null {
  if (!isRecord(value)) return null;

  const added = toNonNegativeInt(value.added);
  const removed = toNonNegativeInt(value.removed);
  const comparedAt = toNonNegativeInt(value.comparedAt);
  const addedLines = toStringArray(value.addedLines);
  const removedLines = toStringArray(value.removedLines);

  if (
    added === null ||
    removed === null ||
    comparedAt === null ||
    typeof value.preview !== "string" ||
    addedLines === null ||
    removedLines === null
  ) {
    return null;
  }

  return {
    added,
    removed,
    preview: value.preview,
    addedLines,
    removedLines,
    comparedAt,
  };
}

function parseRetryCompareTask(value: unknown): RetryCompareTask | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.command !== "string" || typeof value.baselineOutput !== "string") {
    return null;
  }
  return { id: value.id, command: value.command, baselineOutput: value.baselineOutput };
}

export function loadRetryCompareCache(): Record<string, RetryCompareResult> {
  try {
    const raw = localStorage.getItem(RETRY_COMPARE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.byBlock)) return {};

    const byBlock: Record<string, RetryCompareResult> = {};
    for (const [key, value] of Object.entries(parsed.byBlock)) {
      const result = parseRetryCompareResult(value);
      if (result) byBlock[key] = result;
    }
    return byBlock;
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
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return { queue: [], paused: false, completedCount: 0 };

    const queue = Array.isArray(parsed.queue)
      ? parsed.queue
        .map(parseRetryCompareTask)
        .filter((task): task is RetryCompareTask => task !== null)
      : [];
    const paused = typeof parsed.paused === "boolean" ? parsed.paused : false;
    const completedCount = toNonNegativeInt(parsed.completedCount) ?? 0;
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
