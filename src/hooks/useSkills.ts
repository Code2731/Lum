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
