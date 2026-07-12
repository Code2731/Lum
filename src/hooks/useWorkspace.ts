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

export interface WorkspaceMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getWorkspaceMeta(workspaces: Workspace[], loading: boolean): WorkspaceMeta {
  if (loading) {
    return {
      title: "작업공간 불러오는 중",
      badges: ["먼저 저장된 세션", "다음 탭 구성", "마지막 복귀 흐름"],
      helper: "저장된 작업공간과 탭 구성을 읽어 현재 작업으로 빠르게 복귀할 준비를 하고 있습니다.",
    };
  }

  const workspaceCount = workspaces.length;
  const tabCount = workspaces.reduce((sum, workspace) => sum + workspace.tabs.length, 0);

  return {
    title: workspaceCount > 0 ? `작업공간 ${workspaceCount}개 준비됨` : "저장된 작업공간이 없습니다",
    badges: [
      `작업공간 ${workspaceCount}개`,
      `탭 ${tabCount}개`,
      workspaceCount > 0 ? "바로 복귀 가능" : "새 작업공간 저장",
    ],
    helper: workspaceCount > 0
      ? "이전에 저장한 탭 구성을 기준으로 같은 작업 문맥에 빠르게 돌아갈 수 있습니다."
      : "현재 탭 구성을 작업공간으로 저장해두면 다음부터는 같은 문맥으로 빠르게 복귀할 수 있습니다.",
  };
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
