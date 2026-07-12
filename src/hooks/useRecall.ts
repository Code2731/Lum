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

export interface RecallMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getRecallMeta(input: {
  results: RecallEntry[];
  stats: RecallStats | null;
  loading: boolean;
}): RecallMeta {
  if (input.loading) {
    return {
      title: "Recall 검색 중",
      badges: ["먼저 질의 해석", "다음 소스 검색", "마지막 결과 정렬"],
      helper: "history, healing, memory 소스를 함께 검색해 관련 기억을 정리하고 있습니다.",
    };
  }

  const totalIndexed = input.stats
    ? input.stats.history.count + input.stats.healing.count + input.stats.memory.count
    : 0;

  return {
    title: input.results.length > 0 ? `Recall 결과 ${input.results.length}건` : "Recall 결과가 없습니다",
    badges: [
      `결과 ${input.results.length}건`,
      `인덱스 ${totalIndexed}건`,
      input.stats ? "소스 3종 준비" : "통계 대기",
    ],
    helper: input.results.length > 0
      ? "최근 기억 검색 결과를 바탕으로 과거 명령, 복구, 메모 흐름을 현재 작업에 다시 연결할 수 있습니다."
      : "질문을 입력하면 history, healing, memory 전반에서 관련 기억을 찾아 현재 작업에 다시 연결합니다.",
  };
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
