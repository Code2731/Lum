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

export interface SquadsMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getSquadsMeta(squads: Squad[], loading: boolean): SquadsMeta {
  if (loading) {
    return {
      title: "Squad 작업공간 불러오는 중",
      badges: ["먼저 분기 목록", "다음 worktree 상태", "마지막 병렬 작업 복귀"],
      helper: "분기된 작업공간과 worktree 목록을 읽어 여러 작업을 병렬로 이어갈 준비를 하고 있습니다.",
    };
  }

  const squadCount = squads.length;
  const baseBranchCount = new Set(squads.map((squad) => squad.base_branch)).size;

  return {
    title: squadCount > 0 ? `Squad ${squadCount}개 준비됨` : "활성 Squad가 없습니다",
    badges: [
      `Squad ${squadCount}개`,
      `기준 브랜치 ${baseBranchCount}개`,
      squadCount > 0 ? "바로 분업 가능" : "새 Squad 생성",
    ],
    helper: squadCount > 0
      ? "각 task를 분리된 worktree로 나눠 현재 작업을 끊지 않고 병렬로 진행할 수 있습니다."
      : "복잡한 작업을 분리해야 할 때 Squad를 만들면 별도 worktree에서 동시에 진행할 수 있습니다.",
  };
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
