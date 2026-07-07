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

  it("clear 호출 시 진행 중인 채팅 스트림을 cancel_ai_stream으로 중단하고 메시지를 초기화한다", async () => {
    let releaseStream: (() => void) | null = null;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reset_ai_stream") return;
      if (cmd === "cancel_ai_stream") return;
      if (cmd === "mcp_system_prompt") return "";
      if (cmd === "stream_ai_command") {
        return new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }
      return "";
    });

    const { result } = renderHook(() => useAIChat("model", () => "CWD: /tmp"));

    await act(async () => {
      const sendPromise = result.current.sendMessage("안녕");
      await waitFor(() => {
        expect(invokeMock.mock.calls.some(([cmd]) => cmd === "stream_ai_command")).toBe(true);
      });
      expect(result.current.streaming).toBe(true);
      result.current.clear();
      releaseStream?.();
      await sendPromise;
    });

    expect(invokeMock.mock.calls.some(([cmd]) => cmd === "cancel_ai_stream")).toBe(true);
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(result.current.streaming).toBe(false);
  });

  it("clear 호출 시 스트리밍이 없으면 cancel_ai_stream을 호출하지 않는다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reset_ai_stream") return;
      if (cmd === "cancel_ai_stream") return;
      if (cmd === "mcp_system_prompt") return "";
      if (cmd === "stream_ai_command") return;
      return "";
    });

    const { result } = renderHook(() => useAIChat("model", () => "CWD: /tmp"));

    await act(async () => {
      await result.current.sendMessage("안녕");
    });

    const beforeCancelCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === "cancel_ai_stream").length;

    act(() => {
      result.current.clear();
    });

    expect(result.current.streaming).toBe(false);
    expect(result.current.error).toBeNull();
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === "cancel_ai_stream")).toHaveLength(
      beforeCancelCalls,
    );
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

    expect(result.current.error).toContain("네트워크/백엔드 연결 불안정: xLLM 연결 실패");
    expect(result.current.error).toContain("재시도");
    expect(result.current.messages[result.current.messages.length - 1]?.content).toContain(
      "❌ 네트워크/백엔드 연결 불안정: xLLM 연결 실패",
    );
  });

  it("네트워크 키워드가 있는 객체 오류는 네트워크 가이드 메시지를 붙인다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reset_ai_stream") return;
      if (cmd === "cancel_ai_stream") return;
      if (cmd === "mcp_system_prompt") return "";
      if (cmd === "stream_ai_command") throw { error: "Failed to connect: socket timeout" };
      return "";
    });

    const { result } = renderHook(() => useAIChat("model", () => "CWD: /tmp"));
    await act(async () => {
      await result.current.sendMessage("안녕");
    });

    expect(result.current.error).toContain("네트워크/백엔드 연결 불안정: Failed to connect: socket timeout");
    expect(result.current.messages[result.current.messages.length - 1]?.content).toContain(
      "❌ 네트워크/백엔드 연결 불안정: Failed to connect: socket timeout",
    );
  });

  it("라우팅 강제 설정 오류는 재시도 가이드를 붙여 노출한다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reset_ai_stream") return;
      if (cmd === "cancel_ai_stream") return;
      if (cmd === "mcp_system_prompt") return "";
      if (cmd === "stream_ai_command") throw { message: "Ollama 백엔드가 미설정/미연결 상태입니다. 패널에서 모델/URL/API 키를 확인하고 다시 시도하세요." };
      return "";
    });

    const { result } = renderHook(() => useAIChat("model", () => "CWD: /tmp"));
    await act(async () => {
      await result.current.sendMessage("안녕");
    });

    expect(result.current.error).toContain("라우팅 실패");
    expect(result.current.error).toContain("해결:");
    expect(result.current.messages[result.current.messages.length - 1]?.content).toContain("❌ 라우팅 실패");
  });

  it("취소 오류는 에러 배너를 남기지 않는다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reset_ai_stream") return;
      if (cmd === "cancel_ai_stream") return;
      if (cmd === "mcp_system_prompt") return "";
      if (cmd === "stream_ai_command") throw { error: "cancelled by user" };
      return "";
    });

    const { result } = renderHook(() => useAIChat("model", () => "CWD: /tmp"));
    await act(async () => {
      await result.current.sendMessage("안녕");
    });

    expect(result.current.error).toBeNull();
    expect(result.current.messages[result.current.messages.length - 1]?.content).toBe("");
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
    expect(result.current.messages[result.current.messages.length - 1]?.content).toBe("❌ 알 수 없는 오류");
  });
});
