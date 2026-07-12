import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { getAIProcessingPhaseMeta, useAIProcessing } from "./useAIProcessing";

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

  it("unmount 시 진행 중인 스트림을 cancel_ai_stream으로 정리한다", async () => {
    let releaseStream: (() => void) | null = null;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reset_ai_stream") return;
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }
      if (cmd === "cancel_ai_stream") {
        releaseStream?.();
        return;
      }
      return;
    });

    const { result, unmount } = renderHook(() => useAIProcessing());
    const streamPromise = act(async () => {
      await result.current.streamAICommand("안녕", "model", "", () => {});
    });

    await waitFor(() => {
      expect(invokeMock.mock.calls.some(([cmd]) => cmd === "stream_ai_command")).toBe(true);
    });
    unmount();
    await streamPromise;

    expect(invokeMock.mock.calls.some(([cmd]) => cmd === "cancel_ai_stream")).toBe(true);
  });
});

describe("useAIProcessing — JSON 응답 파싱", () => {
  it("phase meta는 각 처리 단계를 사용자 문구로 변환한다", () => {
    expect(getAIProcessingPhaseMeta("idle")).toEqual({
      label: "대기 중",
      description: "다음 AI 작업을 바로 시작할 수 있는 상태입니다.",
    });
    expect(getAIProcessingPhaseMeta("streaming")).toEqual({
      label: "응답 스트리밍 중",
      description: "AI 응답을 토큰 단위로 받아 UI에 이어 붙이고 있습니다.",
    });
  });

  it("processAICommand는 JSON 문자열을 객체로 파싱한다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "generate_ai_command") {
        return JSON.stringify({ action: "run", command: "npm test" });
      }
      return;
    });

    const { result } = renderHook(() => useAIProcessing());
    const pending = result.current.processAICommand("p", "m", "c");
    expect(result.current.phase).toBe("generating");
    const parsed = await pending;
    expect(parsed).toEqual({ action: "run", command: "npm test" });
    expect(result.current.phase).toBe("idle");
  });

  it("analyzeError는 파싱 실패 시 명확한 에러 메시지를 던진다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "analyze_error") return "not-json-response";
      return;
    });

    const { result } = renderHook(() => useAIProcessing());
    await expect(result.current.analyzeError("ls", "err", "m", "c")).rejects.toThrow(
      "analyze_error 응답 JSON 파싱 실패: not-json-response",
    );
    expect(result.current.phase).toBe("idle");
  });

  it("verifyVisionGoal은 검증 단계 동안 phase를 verifying으로 유지한다", async () => {
    let releaseVerify: (() => void) | null = null;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "verify_vision_goal") {
        return new Promise<{ achieved: boolean; reason: string; nextActions: never[] }>((resolve) => {
          releaseVerify = () => resolve({ achieved: true, reason: "ok", nextActions: [] });
        });
      }
      return;
    });

    const { result } = renderHook(() => useAIProcessing());
    const pending = result.current.verifyVisionGoal("goal", "img", "model", 1);
    expect(result.current.phase).toBe("verifying");
    releaseVerify?.();
    await expect(pending).resolves.toEqual({ achieved: true, reason: "ok", nextActions: [] });
    expect(result.current.phase).toBe("idle");
  });
});
