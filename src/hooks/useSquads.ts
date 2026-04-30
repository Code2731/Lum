// Phase 116 — Worktree Squad 훅.
// 백엔드 commands::squad와 1:1 매핑. 영속은 ~/.lum_squads.json (백엔드가 관리).

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Squad {
  id: string;
  task: string;
  worktree_path: string;
  branch: string;
  base_branch: string;
  repo_root: string;
  created_at: number;
}

export function useSquads() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await invoke<Squad[]>("squad_list");
      setSquads(rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(async (task: string, cwd: string, baseBranch?: string): Promise<Squad> => {
    setError(null);
    try {
      const squad = await invoke<Squad>("squad_create", {
        task,
        cwd,
        baseBranch: baseBranch && baseBranch.trim() ? baseBranch : null,
      });
      setSquads((prev) => [...prev, squad]);
      return squad;
    } catch (e) {
      const msg = String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      await invoke("squad_remove", { id });
      setSquads((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      const msg = String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  return { squads, loading, error, load, create, remove };
}
