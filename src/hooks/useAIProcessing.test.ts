import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAIProcessing } from "./useAIProcessing";

const invokeMock = vi.fn();
const listeners: Array<(event: { payload: string }) => void> = [];
let releaseReset: (() => void) | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, cb: (event: { payload: string }) => void) => {
    listeners.push(cb);
    return () => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }),
}));

beforeEach(() => {
  invokeMock.mockReset();
  listeners.splice(0, listeners.length);
  releaseReset = null;

  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "reset_ai_stream") {
      return new Promise<void>((resolve) => {
        releaseReset = resolve;
      });
    }
    if (cmd === "cancel_ai_stream") return;
    if (cmd === "stream_ai_command") {
      throw new Error("stream should be skipped when canceled before start");
    }
    return;
  });
});

describe("useAIProcessing — 스트리밍 취소 경합 방지", () => {
  it("취소 직후 스트림이 시작되기 전이면 stream_ai_command 호출이 발생하지 않는다", async () => {
    const { result } = renderHook(() => useAIProcessing());
    let done = false;

    const run = act(async () => {
      const streamPromise = result.current.streamAICommand("안녕", "model", "", () => {
        done = true;
      });
      await waitFor(() => {
        expect(invokeMock.mock.calls.some(([cmd]) => cmd === "reset_ai_stream")).toBe(true);
      });
      result.current.cancelStreamAICommand();
      expect(releaseReset).not.toBeNull();
      releaseReset?.();
      await streamPromise;
    });
    await expect(run).resolves.toBeUndefined();
    expect(done).toBe(false);
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === "stream_ai_command")).toBe(false);
    expect(result.current.isProcessing).toBe(false);
  });
});
