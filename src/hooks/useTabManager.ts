import { useState, useRef, useCallback, useEffect } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";

export type SplitDir = "h" | "v";

export interface Tab {
  id: string;
  title: string;
  splitDir?: SplitDir;
}

interface SessionTab { id: string; title: string; split_dir?: string }
interface SessionData { version: number; tabs: SessionTab[]; active_tab_id: string }

let tabCounter = 1;
const makeTab = (): Tab => ({ id: `tab-${Date.now()}`, title: `Shell ${tabCounter++}` });
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
          const nextTab = next[Math.min(idx, next.length - 1)];
          setActiveTabId(nextTab.id);
          setActivePaneId(nextTab.id);
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
    switchTab,
    toggleSplit,
  };
}
