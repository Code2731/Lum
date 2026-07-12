import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface QuickAction {
  id: string;
  label: string;
  command: string;
  shortcut?: number; // 1-9
}

export interface QuickActionsMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getQuickActionsMeta(actions: QuickAction[]): QuickActionsMeta {
  const actionCount = actions.length;
  const shortcutCount = actions.filter((action) => typeof action.shortcut === "number").length;

  return {
    title: actionCount > 0 ? `빠른 액션 ${actionCount}개 준비됨` : "빠른 액션이 비어 있습니다",
    badges: [
      `액션 ${actionCount}개`,
      `단축키 ${shortcutCount}개`,
      actionCount > 0 ? "즉시 실행 가능" : "새 액션 추가",
    ],
    helper: actionCount > 0
      ? "자주 쓰는 명령을 저장해 두고 단축키까지 연결하면 현재 터미널에서 바로 실행할 수 있습니다."
      : "반복 명령을 빠른 액션으로 저장하면 다음부터는 검색이나 타이핑 없이 바로 실행할 수 있습니다.",
  };
}

const SAVE_DEBOUNCE_MS = 800;

export function useQuickActions() {
  const [actions, setActions] = useState<QuickAction[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<{ quick_actions?: QuickAction[] }>("load_app_config")
      .then(cfg => setActions(cfg.quick_actions ?? []))
      .catch(() => {});
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  const persist = useCallback((next: QuickAction[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
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
