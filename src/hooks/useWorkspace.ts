import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface WorkspaceTab {
  id: string;
  title: string;
  cwd: string;
  split_dir?: string;
  split_cwd?: string;
}

export interface Workspace {
  id: string;
  name: string;
  tabs: WorkspaceTab[];
  active_tab_id: string;
  created_at: number;
}

export function useWorkspace() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<Workspace[]>("list_workspaces");
      setWorkspaces(list.slice().reverse()); // 최신순
    } catch {
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveWorkspace = useCallback(async (
    name: string,
    tabs: WorkspaceTab[],
    activeTabId: string,
  ) => {
    const ws = await invoke<Workspace>("save_workspace", {
      name,
      tabs,
      activeTabId,
    });
    setWorkspaces(prev => [ws, ...prev]);
    return ws;
  }, []);

  const deleteWorkspace = useCallback(async (id: string) => {
    await invoke("delete_workspace", { id });
    setWorkspaces(prev => prev.filter(w => w.id !== id));
  }, []);

  return { workspaces, loading, loadWorkspaces, saveWorkspace, deleteWorkspace };
}
