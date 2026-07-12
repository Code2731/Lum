import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { getUpdateProgressMeta, useUpdateCheck } from "./useUpdateCheck";

const invokeMock = vi.fn();
const listenMock = vi.fn();
const progressListeners: Array<(event: { payload: { downloaded: number; total: number } }) => void> = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: Parameters<typeof listenMock>) => listenMock(...args),
}));

describe("useUpdateCheck", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    progressListeners.splice(0, progressListeners.length);

    listenMock.mockImplementation(async (_event: string, cb: (event: { payload: { downloaded: number; total: number } }) => void) => {
      progressListeners.push(cb);
      return () => {
        const index = progressListeners.indexOf(cb);
        if (index >= 0) progressListeners.splice(index, 1);
      };
    });
  });

  it("진행 메타는 다운로드 퍼센트를 계산한다", () => {
    expect(getUpdateProgressMeta(null)).toBeNull();
    expect(getUpdateProgressMeta({ downloaded: 25, total: 100 })).toEqual({
      percent: 25,
      label: "25% · 25/100",
    });
  });

  it("업데이트 확인 성공 시 checking을 종료하고 updateInfo를 채운다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "check_for_update") {
        return {
          has_update: true,
          latest: "1.2.3",
          release_url: "https://example.com/release",
          release_name: "v1.2.3",
        };
      }
      return undefined;
    });

    const { result } = renderHook(() => useUpdateCheck());
    expect(result.current.checking).toBe(true);

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.updateInfo).toEqual({
      latest: "1.2.3",
      releaseUrl: "https://example.com/release",
      releaseName: "v1.2.3",
    });
    expect(result.current.checkError).toBeNull();
  });

  it("업데이트 확인 실패 시 checkError를 남긴다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "check_for_update") {
        throw new Error("network down");
      }
      return undefined;
    });

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.checkError).toContain("network down");
    expect(result.current.updateInfo).toBeNull();
  });

  it("설치 중 progress 이벤트를 받아 저장한다", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "check_for_update") {
        return {
          has_update: false,
          latest: "",
          release_url: "",
          release_name: "",
        };
      }
      if (cmd === "install_update") {
        progressListeners.forEach((listener) => listener({ payload: { downloaded: 50, total: 100 } }));
        throw new Error("install failed");
      }
      return undefined;
    });

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    await act(async () => {
      await result.current.installUpdate();
    });

    expect(result.current.installError).toContain("install failed");
    expect(result.current.progress).toBeNull();
  });
});
