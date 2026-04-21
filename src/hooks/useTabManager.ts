import { useState, useRef, useCallback, useEffect } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";

export type SplitDir = "h" | "v";
export type TabIcon = "terminal" | "git" | "node" | "rust" | "python" | "go" | "java" | "docker";

export interface Tab {
  id: string;
  title: string;
  splitDir?: SplitDir;
  cwd?: string;
  icon?: TabIcon;
}

interface SessionTab { id: string; title: string; split_dir?: string }
interface SessionData { version: number; tabs: SessionTab[]; active_tab_id: string }

let tabCounter = 1;
const makeTab = (): Tab => {
  const n = tabCounter++;
  return { id: `tab-${n}`, title: `Shell ${n}` };
};
export const splitId = (tabId: string) => `${tabId}-b`;

export function useTabManager(onTabChange?: () => void) {
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0]?.id ?? "");
  const [activePaneId, setActivePaneId] = useState<string>(() => tabs[0]?.id ?? "");
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const activePaneIdRef = useRef(activePaneId);
  activePaneIdRef.current = activePaneId;
  const sessionRestoredRef = useRef(false);
  const ptyWriteRefs = useRef<Map<string, (d: string) => void>>(new Map());

  useEffect(() => {
    invoke<SessionData>("load_session")
      .then((session) => {
        if (!session.tabs?.length) return;
        for (const t of session.tabs) {
          const m = t.title.match(/^Shell (\d+)$/);
          if (m) tabCounter = Math.max(tabCounter, parseInt(m[1]) + 1);
        }
        const restored: Tab[] = session.tabs.map((t) => ({
          id: t.id,
          title: t.title,
          splitDir: (t.split_dir as SplitDir | undefined) ?? undefined,
        }));
        setTabs(restored);
        const activeId =
          session.active_tab_id && restored.find((t) => t.id === session.active_tab_id)
            ? session.active_tab_id
            : restored[0].id;
        setActiveTabId(activeId);
        setActivePaneId(activeId);
        sessionRestoredRef.current = true;
      })
      .catch(() => {
        sessionRestoredRef.current = true;
      });
  }, []);

  const sessionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!sessionRestoredRef.current) return;
    if (sessionSaveTimerRef.current) clearTimeout(sessionSaveTimerRef.current);
    sessionSaveTimerRef.current = setTimeout(() => {
      const data: SessionData = {
        version: 1,
        tabs: tabs.map((t) => ({ id: t.id, title: t.title, split_dir: t.splitDir })),
        active_tab_id: activeTabId,
      };
      invoke("save_session", { data }).catch(() => {});
    }, 1000);
    return () => {
      if (sessionSaveTimerRef.current) clearTimeout(sessionSaveTimerRef.current);
    };
  }, [tabs, activeTabId]);

  const addTab = useCallback(() => {
    const tab = makeTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setActivePaneId(tab.id);
    onTabChange?.();
  }, [onTabChange]);

  const closeTab = useCallback(
    (id: string, e: Pick<React.MouseEvent, "stopPropagation">) => {
      e.stopPropagation();
      invoke("close_pty", { id }).catch(() => {});
      invoke("close_pty", { id: splitId(id) }).catch(() => {});
      ptyWriteRefs.current.delete(id);
      ptyWriteRefs.current.delete(splitId(id));

      setTabs((prev) => {
        if (prev.length === 1) return prev;
        const next = prev.filter((t) => t.id !== id);
        if (id === activeTabIdRef.current) {
          const idx = prev.findIndex((t) => t.id === id);
          if (idx >= 0 && next.length > 0) {
            const nextTab = next[Math.min(idx, next.length - 1)];
            setActiveTabId(nextTab.id);
            setActivePaneId(nextTab.id);
          }
        }
        return next;
      });
      onTabChange?.();
    },
    [onTabChange],
  );

  const switchTab = useCallback(
    (id: string) => {
      setActiveTabId(id);
      setActivePaneId(id);
      onTabChange?.();
    },
    [onTabChange],
  );

  const renameTab = useCallback((id: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title: title.trim() || t.title } : t));
  }, []);

  const updateTabCwd = useCallback((id: string, cwd: string, icon?: TabIcon) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, cwd, icon: icon ?? t.icon } : t));
  }, []);

  const toggleSplit = useCallback((dir: SplitDir) => {
    const tabId = activeTabIdRef.current;
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId);
      const nextDir = tab?.splitDir === dir ? undefined : dir;
      if (!nextDir) {
        invoke("close_pty", { id: splitId(tabId) }).catch(() => {});
        ptyWriteRefs.current.delete(splitId(tabId));
        setActivePaneId(tabId);
      }
      return prev.map((t) => (t.id === tabId ? { ...t, splitDir: nextDir } : t));
    });
  }, []);

  // 워크스페이스 복원 — 모든 PTY 닫고 새 탭 세트로 교체
  const restoreTabs = useCallback((newTabs: Tab[], newActiveId: string) => {
    // 기존 PTY 모두 종료
    for (const t of tabs) {
      invoke("close_pty", { id: t.id }).catch(() => {});
      invoke("close_pty", { id: splitId(t.id) }).catch(() => {});
    }
    ptyWriteRefs.current.clear();
    // tabCounter를 복원 탭 번호에 맞게 업데이트
    for (const t of newTabs) {
      const m = t.title.match(/^Shell (\d+)$/);
      if (m) tabCounter = Math.max(tabCounter, parseInt(m[1]) + 1);
    }
    setTabs(newTabs);
    setActiveTabId(newActiveId);
    setActivePaneId(newActiveId);
  }, [tabs]);

  return {
    tabs,
    activeTabId,
    activePaneId,
    setActivePaneId,
    activeTabIdRef,
    activePaneIdRef,
    ptyWriteRefs,
    addTab,
    closeTab,
    renameTab,
    updateTabCwd,
    switchTab,
    toggleSplit,
    restoreTabs,
  };
}
