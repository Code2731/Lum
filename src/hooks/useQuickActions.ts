import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface QuickAction {
  id: string;
  label: string;
  command: string;
  shortcut?: number; // 1-9
}

const SAVE_DEBOUNCE_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function useQuickActions() {
  const [actions, setActions] = useState<QuickAction[]>([]);

  useEffect(() => {
    invoke<{ quick_actions?: QuickAction[] }>("load_app_config")
      .then(cfg => setActions(cfg.quick_actions ?? []))
      .catch(() => {});
  }, []);

  const persist = useCallback((next: QuickAction[]) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      invoke("save_quick_actions", { actions: next }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const addAction = useCallback((a: Omit<QuickAction, "id">) => {
    const next: QuickAction = { ...a, id: `qa-${Date.now()}` };
    setActions(prev => {
      const updated = [...prev, next];
      persist(updated);
      return updated;
    });
  }, [persist]);

  const updateAction = useCallback((id: string, patch: Partial<Omit<QuickAction, "id">>) => {
    setActions(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, ...patch } : a);
      persist(updated);
      return updated;
    });
  }, [persist]);

  const deleteAction = useCallback((id: string) => {
    setActions(prev => {
      const updated = prev.filter(a => a.id !== id);
      persist(updated);
      return updated;
    });
  }, [persist]);

  const moveAction = useCallback((id: string, dir: -1 | 1) => {
    setActions(prev => {
      const idx = prev.findIndex(a => a.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      persist(next);
      return next;
    });
  }, [persist]);

  return { actions, addAction, updateAction, deleteAction, moveAction };
}
