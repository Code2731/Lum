import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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
});
