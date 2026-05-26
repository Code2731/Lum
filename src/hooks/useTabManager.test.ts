import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useTabManager, splitId } from "./useTabManager";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === "load_session") return Promise.reject("no session");
    return Promise.resolve(null);
  }),
}));

describe("useTabManager", () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_session") return Promise.reject("no session");
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("초기 상태 — 탭 1개, 활성 탭 설정됨", () => {
    const { result } = renderHook(() => useTabManager());
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe(result.current.tabs[0].id);
  });

  it("addTab — 탭 추가 및 새 탭이 활성화됨", () => {
    const { result } = renderHook(() => useTabManager());
    act(() => result.current.addTab());
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeTabId).toBe(result.current.tabs[1].id);
  });

  it("addTab — onTabChange 콜백 호출", () => {
    const onTabChange = vi.fn();
    const { result } = renderHook(() => useTabManager(onTabChange));
    act(() => result.current.addTab());
    expect(onTabChange).toHaveBeenCalledOnce();
  });

  it("closeTab — 유일한 탭은 닫히지 않음", () => {
    const { result } = renderHook(() => useTabManager());
    const id = result.current.tabs[0].id;
    act(() => result.current.closeTab(id, { stopPropagation: vi.fn() } as any));
    expect(result.current.tabs).toHaveLength(1);
  });

  it("closeTab — 2개일 때 활성 탭 닫으면 남은 탭이 활성화됨", () => {
    const { result } = renderHook(() => useTabManager());
    act(() => result.current.addTab());
    const firstId = result.current.tabs[0].id;
    act(() => result.current.switchTab(firstId));
    act(() => result.current.closeTab(firstId, { stopPropagation: vi.fn() } as any));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).not.toBe(firstId);
  });

  it("switchTab — 지정한 탭이 활성화됨", () => {
    const { result } = renderHook(() => useTabManager());
    act(() => result.current.addTab());
    const firstId = result.current.tabs[0].id;
    act(() => result.current.switchTab(firstId));
    expect(result.current.activeTabId).toBe(firstId);
    expect(result.current.activePaneId).toBe(firstId);
  });

  it("toggleSplit — 수평 분할 설정", () => {
    const { result } = renderHook(() => useTabManager());
    act(() => result.current.toggleSplit("h"));
    expect(result.current.tabs[0].splitDir).toBe("h");
  });

  it("toggleSplit — 같은 방향 재클릭 시 분할 해제", () => {
    const { result } = renderHook(() => useTabManager());
    act(() => result.current.toggleSplit("h"));
    act(() => result.current.toggleSplit("h"));
    expect(result.current.tabs[0].splitDir).toBeUndefined();
  });

  it("toggleSplit — 방향 전환 (h → v)", () => {
    const { result } = renderHook(() => useTabManager());
    act(() => result.current.toggleSplit("h"));
    act(() => result.current.toggleSplit("v"));
    expect(result.current.tabs[0].splitDir).toBe("v");
  });

  it("탭 제목이 순차적으로 Shell N 형식", () => {
    const { result } = renderHook(() => useTabManager());
    act(() => result.current.addTab());
    const titles = result.current.tabs.map((t) => t.title);
    expect(titles.every((t) => /^Shell \d+$/.test(t))).toBe(true);
  });

  it("split pane CWD는 splitId 경로로 별도 저장된다", () => {
    const { result } = renderHook(() => useTabManager());
    const baseId = result.current.tabs[0].id;

    act(() => result.current.updateTabCwd(baseId, "/repo/main"));
    act(() => result.current.toggleSplit("h"));
    act(() => result.current.updateTabCwd(splitId(baseId), "/repo/split"));

    expect(result.current.tabs[0].cwd).toBe("/repo/main");
    expect(result.current.tabs[0].splitCwd).toBe("/repo/split");
  });

  it("split 해제 시 splitCwd는 정리된다", () => {
    const { result } = renderHook(() => useTabManager());
    const baseId = result.current.tabs[0].id;

    act(() => result.current.toggleSplit("h"));
    act(() => result.current.updateTabCwd(splitId(baseId), "/repo/split"));
    expect(result.current.tabs[0].splitCwd).toBe("/repo/split");

    act(() => result.current.toggleSplit("h"));
    expect(result.current.tabs[0].splitDir).toBeUndefined();
    expect(result.current.tabs[0].splitCwd).toBeUndefined();
  });

  it("save_session payload에 cwd/split_cwd/ssh_profile이 포함된다", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTabManager());
    const baseId = result.current.tabs[0].id;

    await act(async () => {
      await Promise.resolve();
    });

    act(() => result.current.updateTabCwd(baseId, "/repo/main"));
    act(() => result.current.toggleSplit("h"));
    act(() => result.current.updateTabCwd(splitId(baseId), "/repo/split"));
    act(() => {
      result.current.createSshTab({
        host: "example.com",
        port: 22,
        username: "dev",
        keyPath: "~/.ssh/id_ed25519",
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });

    const saveCall = invokeMock.mock.calls.find(([cmd]) => cmd === "save_session");
    expect(saveCall).toBeDefined();
    const payload = (saveCall?.[1] as { data: { tabs: Array<Record<string, unknown>> } }).data;
    const mainTab = payload.tabs.find((t) => t.id === baseId);
    const sshTab = payload.tabs.find((t) => t.id !== baseId);

    expect(mainTab?.cwd).toBe("/repo/main");
    expect(mainTab?.split_cwd).toBe("/repo/split");
    expect(mainTab?.split_dir).toBe("h");
    expect(sshTab?.ssh_profile).toEqual({
      host: "example.com",
      port: 22,
      username: "dev",
      keyPath: "~/.ssh/id_ed25519",
    });
  });

  it("load_session 복원 시 cwd/split_cwd/ssh_profile을 복원한다", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_session") {
        return Promise.resolve({
          version: 1,
          active_tab_id: "tab-1",
          tabs: [
            {
              id: "tab-1",
              title: "Shell 1",
              split_dir: "h",
              cwd: "/repo/main",
              split_cwd: "/repo/split",
              ssh_profile: {
                host: "example.com",
                port: 22,
                username: "dev",
                keyPath: "~/.ssh/id_ed25519",
              },
            },
          ],
        });
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useTabManager());

    await waitFor(() => {
      expect(result.current.tabs[0]?.cwd).toBe("/repo/main");
    });

    expect(result.current.tabs[0]?.splitDir).toBe("h");
    expect(result.current.tabs[0]?.splitCwd).toBe("/repo/split");
    expect(result.current.tabs[0]?.sshProfile).toEqual({
      host: "example.com",
      port: 22,
      username: "dev",
      keyPath: "~/.ssh/id_ed25519",
    });
  });
});
