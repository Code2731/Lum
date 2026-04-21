import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabManager } from "./useTabManager";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === "load_session") return Promise.reject("no session");
    return Promise.resolve(null);
  }),
}));

describe("useTabManager", () => {
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
});
