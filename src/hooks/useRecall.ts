// Phase 118 — Persistent Memory Vault 훅. 백엔드 commands::recall 1:1 매핑.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type RecallSource = "history" | "healing" | "memory";

export interface RecallEntry {
  id: string;
  source: RecallSource;
  ts_ms: number;
  title: string;
  snippet: string;
  score: number;
  metadata: unknown;
}

export interface SourceStats {
  count: number;
  oldest_ms: number;
  newest_ms: number;
}

export interface RecallStats {
  history: SourceStats;
  healing: SourceStats;
  memory: SourceStats;
  now_ms: number;
}

interface SearchOpts {
  sources?: RecallSource[];
  sinceMs?: number;
  untilMs?: number;
  limit?: number;
}

export function useRecall(model: string) {
  const [results, setResults] = useState<RecallEntry[]>([]);
  const [stats, setStats] = useState<RecallStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const s = await invoke<RecallStats>("recall_stats");
      setStats(s);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const search = useCallback(async (query: string, opts: SearchOpts = {}) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await invoke<RecallEntry[]>("recall_search", {
        query,
        sources: opts.sources && opts.sources.length > 0 ? opts.sources : null,
        sinceMs: opts.sinceMs ?? null,
        untilMs: opts.untilMs ?? null,
        model,
        limit: opts.limit ?? 30,
      });
      setResults(rows);
    } catch (e) {
      setError(String(e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [model]);

  const forget = useCallback(async (ids: string[]): Promise<number> => {
    setError(null);
    try {
      const n = await invoke<number>("recall_forget", { ids });
      setResults((prev) => prev.filter((r) => !ids.includes(r.id)));
      loadStats();
      return n;
    } catch (e) {
      setError(String(e));
      return 0;
    }
  }, [loadStats]);

  const forgetBefore = useCallback(async (tsMs: number) => {
    setError(null);
    try {
      const report = await invoke<{ history: number; healing: number; memory: number }>(
        "recall_forget_before",
        { tsMs },
      );
      loadStats();
      return report;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, [loadStats]);

  return { results, stats, loading, error, search, forget, forgetBefore };
}
