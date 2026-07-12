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

export interface RetryCompareRuntimeSummary {
  badges: [string, string, string];
  helper: string;
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

export function getRetryCompareRuntimeSummary(cache: RetryCompareRuntimeCache): RetryCompareRuntimeSummary {
  const queuedCount = cache.queue.length;
  const progressBadge = queuedCount > 0
    ? `대기 ${queuedCount}건`
    : cache.completedCount > 0
      ? `완료 ${cache.completedCount}건`
      : "비교 대기 없음";
  const stateBadge = cache.paused
    ? "큐 일시정지"
    : queuedCount > 0
      ? "자동 비교 진행"
      : "큐 유휴";
  const helper = cache.paused
    ? "대기열은 유지되고 있으며 재개하면 다음 비교부터 순차적으로 이어집니다."
    : queuedCount > 0
      ? "실패나 재실행 결과를 순서대로 비교하면서 변화량을 누적합니다."
      : cache.completedCount > 0
        ? "직전 비교 결과를 유지한 채 다음 비교를 기다리는 상태입니다."
        : "아직 비교 대기열이 없어 새 비교를 추가하면 여기서부터 흐름이 시작됩니다.";

  return {
    badges: ["재시도+비교", stateBadge, progressBadge],
    helper,
  };
}
