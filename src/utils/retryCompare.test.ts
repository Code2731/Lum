import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRetryCompareRuntimeSummary,
  loadRetryCompareCache,
  loadRetryCompareRuntimeCache,
  saveRetryCompareCache,
  saveRetryCompareRuntimeCache,
  type RetryCompareResult,
} from "./retryCompare";

describe("retryCompare cache parser", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const storage: Storage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: (key) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    };
    vi.stubGlobal("localStorage", storage);
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("loadRetryCompareCache는 유효한 항목만 복원한다", () => {
    const valid: RetryCompareResult = {
      added: 3,
      removed: 1,
      preview: "ok",
      addedLines: ["+a"],
      removedLines: ["-b"],
      comparedAt: 123,
    };

    localStorage.setItem(
      "lum.retryCompareByBlock.v1",
      JSON.stringify({
        byBlock: {
          good: valid,
          bad: { added: "x", removed: 1 },
        },
      }),
    );

    expect(loadRetryCompareCache()).toEqual({ good: valid });
  });

  it("loadRetryCompareCache는 깨진 JSON이면 빈 객체를 반환한다", () => {
    localStorage.setItem("lum.retryCompareByBlock.v1", "{broken");
    expect(loadRetryCompareCache()).toEqual({});
  });

  it("loadRetryCompareRuntimeCache는 큐와 카운트를 정규화한다", () => {
    localStorage.setItem(
      "lum.retryCompareRuntime.v1",
      JSON.stringify({
        queue: [
          { id: "a", command: "npm test", baselineOutput: "ok" },
          { id: 1, command: "bad", baselineOutput: "bad" },
        ],
        paused: true,
        completedCount: 2.8,
      }),
    );

    expect(loadRetryCompareRuntimeCache()).toEqual({
      queue: [{ id: "a", command: "npm test", baselineOutput: "ok" }],
      paused: true,
      completedCount: 2,
    });
  });

  it("save 함수로 저장한 값은 load 함수로 동일하게 복원된다", () => {
    const byBlock: Record<string, RetryCompareResult> = {
      one: {
        added: 1,
        removed: 0,
        preview: "p",
        addedLines: ["+x"],
        removedLines: [],
        comparedAt: 10,
      },
    };
    saveRetryCompareCache(byBlock);
    expect(loadRetryCompareCache()).toEqual(byBlock);

    const runtime = {
      queue: [{ id: "q1", command: "ls", baselineOutput: "out" }],
      paused: false,
      completedCount: 5,
    };
    saveRetryCompareRuntimeCache(runtime);
    expect(loadRetryCompareRuntimeCache()).toEqual(runtime);
  });

  it("runtime summary는 대기열이 없을 때 유휴 상태를 반환한다", () => {
    expect(
      getRetryCompareRuntimeSummary({
        queue: [],
        paused: false,
        completedCount: 0,
      }),
    ).toEqual({
      badges: ["재시도+비교", "큐 유휴", "비교 대기 없음"],
      helper: "아직 비교 대기열이 없어 새 비교를 추가하면 여기서부터 흐름이 시작됩니다.",
    });
  });

  it("runtime summary는 대기열이 있으면 진행 상태를 반환한다", () => {
    expect(
      getRetryCompareRuntimeSummary({
        queue: [{ id: "q1", command: "npm test", baselineOutput: "before" }],
        paused: false,
        completedCount: 2,
      }),
    ).toEqual({
      badges: ["재시도+비교", "자동 비교 진행", "대기 1건"],
      helper: "실패나 재실행 결과를 순서대로 비교하면서 변화량을 누적합니다.",
    });
  });

  it("runtime summary는 pause 상태를 우선 반영한다", () => {
    expect(
      getRetryCompareRuntimeSummary({
        queue: [{ id: "q1", command: "npm test", baselineOutput: "before" }],
        paused: true,
        completedCount: 5,
      }),
    ).toEqual({
      badges: ["재시도+비교", "큐 일시정지", "대기 1건"],
      helper: "대기열은 유지되고 있으며 재개하면 다음 비교부터 순차적으로 이어집니다.",
    });
  });
});
