import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAIChat } from "./useAIChat";

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
    if (cmd === "mcp_system_prompt") return "";
    if (cmd === "stream_ai_command") {
      throw new Error("stream should be skipped when canceled before start");
    }
    return "";
  });
});

describe("useAIChat — 스트리밍 취소 경합 방지", () => {
  it("취소 직후 스트림이 시작되기 전에는 stream_ai_command 호출이 발생하지 않는다", async () => {
    const { result } = renderHook(() => useAIChat("model", () => "CWD: /tmp"));

    await act(async () => {
      const sendPromise = result.current.sendMessage("안녕");
      await waitFor(() => {
        expect(invokeMock.mock.calls.some(([cmd]) => cmd === "reset_ai_stream")).toBe(true);
      });
      result.current.cancel();
      expect(releaseReset).not.toBeNull();
      releaseReset?.();
      await sendPromise;
    });

    expect(invokeMock.mock.calls.some(([cmd]) => cmd === "stream_ai_command")).toBe(false);
    expect(result.current.streaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("unmount 시 진행 중인 채팅 스트림을 cancel_ai_stream으로 정리한다", async () => {
    let releaseStream: (() => void) | null = null;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reset_ai_stream") return;
      if (cmd === "cancel_ai_stream") {
        releaseStream?.();
        return;
      }
      if (cmd === "mcp_system_prompt") return "";
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }
      return "";
    });

    const { result, unmount } = renderHook(() => useAIChat("model", () => "CWD: /tmp"));

    let sendPromise: Promise<void> | null = null;
    await act(async () => {
      sendPromise = result.current.sendMessage("안녕");
    });
    await waitFor(() => {
      expect(invokeMock.mock.calls.some(([cmd]) => cmd === "stream_ai_command")).toBe(true);
    });

    unmount();
    await sendPromise!;

    expect(invokeMock.mock.calls.some(([cmd]) => cmd === "cancel_ai_stream")).toBe(true);
  });
});

describe("useAIChat — 스트림 실패 메시지 처리", () => {
  it("message 필드가 있는 오류 객체는 해당 메시지를 노출한다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reset_ai_stream") return;
      if (cmd === "cancel_ai_stream") return;
      if (cmd === "mcp_system_prompt") return "";
      if (cmd === "stream_ai_command") throw { message: "xLLM 연결 실패" };
      return "";
    });

    const { result } = renderHook(() => useAIChat("model", () => "CWD: /tmp"));
    await act(async () => {
      await result.current.sendMessage("안녕");
    });

    expect(result.current.error).toBe("xLLM 연결 실패");
    expect(result.current.messages.at(-1)?.content).toBe("❌ xLLM 연결 실패");
  });

  it("순환 참조 오류도 2차 예외 없이 기본 메시지로 폴백한다", async () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reset_ai_stream") return;
      if (cmd === "cancel_ai_stream") return;
      if (cmd === "mcp_system_prompt") return "";
      if (cmd === "stream_ai_command") throw cyclic;
      return "";
    });

    const { result } = renderHook(() => useAIChat("model", () => "CWD: /tmp"));
    await act(async () => {
      await result.current.sendMessage("안녕");
    });

    expect(result.current.error).toBe("알 수 없는 오류");
    expect(result.current.messages.at(-1)?.content).toBe("❌ 알 수 없는 오류");
  });
});
