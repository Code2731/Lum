// Phase 127 — Skills 시스템 프론트 훅. CRUD wrappers + 검색.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Skill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  when_to_use?: string | null;
  quick_reference?: string | null;
  procedure: string;
  pitfalls?: string | null;
  verification?: string | null;
  created_ms: number;
  last_used_ms?: number | null;
  success_count: number;
}

export type SkillDraft = Omit<
  Skill,
  "id" | "created_ms" | "last_used_ms" | "success_count"
> & {
  id?: string;
};

export interface SkillsMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getSkillsMeta(skills: Skill[], loading: boolean): SkillsMeta {
  if (loading) {
    return {
      title: "스킬 라이브러리 불러오는 중",
      badges: ["먼저 저장 스킬", "다음 트리거 연결", "마지막 ReAct 재사용"],
      helper: "저장된 절차 스킬과 트리거 매칭 정보를 불러오고 있습니다.",
    };
  }

  const skillCount = skills.length;
  const triggerCount = skills.reduce((sum, skill) => sum + skill.triggers.length, 0);

  return {
    title: skillCount > 0 ? `스킬 ${skillCount}개 준비됨` : "저장된 스킬이 없습니다",
    badges: [
      `스킬 ${skillCount}개`,
      `트리거 ${triggerCount}개`,
      skillCount > 0 ? "즉시 재사용 가능" : "새 절차 저장",
    ],
    helper: skillCount > 0
      ? "저장된 절차와 트리거를 기반으로 다음 ReAct 흐름에서 바로 재사용할 수 있습니다."
      : "반복 작업 절차를 스킬로 저장해두면 다음부터는 자연어 goal과 자동으로 연결할 수 있습니다.",
  };
}

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await invoke<Skill[]>("skill_list");
      setSkills(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (draft: SkillDraft): Promise<Skill> => {
    const payload: Skill = {
      id: draft.id ?? "",
      name: draft.name,
      description: draft.description,
      triggers: draft.triggers,
      when_to_use: draft.when_to_use ?? null,
      quick_reference: draft.quick_reference ?? null,
      procedure: draft.procedure,
      pitfalls: draft.pitfalls ?? null,
      verification: draft.verification ?? null,
      created_ms: 0,
      last_used_ms: null,
      success_count: 0,
    };
    const saved = await invoke<Skill>("skill_save", { skill: payload });
    await reload();
    return saved;
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await invoke<number>("skill_delete", { id });
    await reload();
  }, [reload]);

  const search = useCallback(async (query: string, limit = 5): Promise<Skill[]> => {
    if (!query.trim()) return [];
    return await invoke<Skill[]>("skill_search", { query, limit });
  }, []);

  const importFromUrl = useCallback(async (url: string): Promise<Skill> => {
    const imported = await invoke<Skill>("skill_import_url", { url });
    await reload();
    return imported;
  }, [reload]);

  return { skills, loading, error, reload, save, remove, search, importFromUrl };
}
