// Phase 118 — Persistent Memory Vault 패널.
// history(명령) / healing(자동치유) / memory(일반)을 단일 임베딩 검색 facade로 묶음.
// "지난 달 docker 빌드 실패 어떻게 고쳤지?" 같은 시간+의미 결합 쿼리 지원.

import React, { useCallback, useState } from "react";
import {
  Library, Search, Loader2, Trash2, Wrench, TerminalSquare, BrainCircuit, ArrowUpRight, Clock,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { useRecall, type RecallEntry, type RecallSource } from "../hooks/useRecall";
import { fmtShortDate } from "../utils";
import { cn } from "@/lib/utils";

interface Props {
  model: string;
  onInjectToChat?: (text: string) => void;
  onClose: () => void;
}

const SOURCE_META: Record<RecallSource, { label: string; icon: React.ReactNode; tone: string }> = {
  history: { label: "명령", icon: <TerminalSquare size={11} />, tone: "text-blue-300 bg-blue-400/10 border-blue-400/25" },
  healing: { label: "치유", icon: <Wrench size={11} />, tone: "text-amber-300 bg-amber-400/10 border-amber-400/25" },
  memory: { label: "메모리", icon: <BrainCircuit size={11} />, tone: "text-emerald-300 bg-emerald-400/10 border-emerald-400/25" },
};

const TIME_RANGES: { label: string; sinceFromNow: number | null }[] = [
  { label: "전체", sinceFromNow: null },
  { label: "오늘", sinceFromNow: 24 * 60 * 60 * 1000 },
  { label: "1주", sinceFromNow: 7 * 24 * 60 * 60 * 1000 },
  { label: "1달", sinceFromNow: 30 * 24 * 60 * 60 * 1000 },
];

const RecallPanel: React.FC<Props> = ({ model, onInjectToChat, onClose }) => {
  const { results, stats, loading, error, search, forget, forgetBefore } = useRecall(model);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<Set<RecallSource>>(new Set());
  const [timeIdx, setTimeIdx] = useState(0);

  const submit = useCallback(() => {
    if (!query.trim()) return;
    const range = TIME_RANGES[timeIdx];
    const sinceMs = range.sinceFromNow ? Date.now() - range.sinceFromNow : undefined;
    search(query, {
      sources: Array.from(sourceFilter),
      sinceMs,
    });
  }, [query, sourceFilter, timeIdx, search]);

  const toggleSource = (src: RecallSource) => {
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const totalEntries = stats
    ? stats.history.count + stats.healing.count + stats.memory.count
    : 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[680px] max-h-[82vh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8 shrink-0">
          <Library size={15} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">메모리 검색</DialogTitle>
          <span className="text-xs text-white/35 ml-1">로컬 영구 저장 — 클라우드 전송 없음</span>
          {stats && (
            <span className="ml-auto text-xs text-white/40 tabular-nums">총 {totalEntries.toLocaleString()}건</span>
          )}
        </div>

        {/* 검색 입력 */}
        <div className="px-5 py-3 border-b border-white/8 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <Search size={13} className="text-white/40 shrink-0" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  submit();
                }
              }}
              placeholder='예: "지난 달 docker 빌드 실패 때 뭐 고쳤지?"'
              className="h-8 text-xs"
            />
            <Button
              onClick={submit}
              disabled={loading || !query.trim()}
              size="sm"
              className="h-8 shrink-0"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : "검색"}
            </Button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* 소스 필터 */}
            {(Object.keys(SOURCE_META) as RecallSource[]).map((src) => {
              const active = sourceFilter.has(src);
              const meta = SOURCE_META[src];
              const count = stats?.[src].count ?? 0;
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => toggleSource(src)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    active
                      ? meta.tone
                      : "text-white/40 border-white/10 hover:text-white/70 hover:border-white/20",
                  )}
                >
                  {meta.icon}
                  {meta.label}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}

            <span className="mx-1 h-3 w-px bg-white/10" />

            {/* 시간 필터 */}
            {TIME_RANGES.map((r, i) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setTimeIdx(i)}
                aria-pressed={timeIdx === i}
                className={cn(
                  "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  timeIdx === i
                    ? "text-accent bg-accent/10 border-accent/30"
                    : "text-white/40 border-white/10 hover:text-white/70 hover:border-white/20",
                )}
              >
                <Clock size={9} />
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-5 py-2 text-sm text-rose-300 bg-rose-500/10 border-b border-rose-400/20 shrink-0">
            {error}
          </div>
        )}

        {/* 결과 리스트 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0 space-y-1.5">
          {results.length === 0 && !loading && (
            <div className="text-center py-12 text-xs text-white/35 space-y-1.5">
              <Library size={20} className="mx-auto text-white/20" />
              <p>{query.trim() ? "결과 없음" : "쿼리를 입력하세요"}</p>
              {!query.trim() && (
                <p className="text-xs text-white/25">자연어로 과거 명령·치유·메모리를 검색합니다.</p>
              )}
            </div>
          )}
          {results.map((r) => (
            <RecallRow
              key={r.id}
              entry={r}
              onForget={() => forget([r.id])}
              onInject={onInjectToChat ? () => onInjectToChat(r.snippet) : undefined}
            />
          ))}
        </div>

        {/* 잊혀질 권리 풋터 */}
        {stats && totalEntries > 0 && (
          <div className="px-5 py-2.5 border-t border-white/8 shrink-0 flex items-center justify-between text-xs text-white/40">
            <span>오래된 데이터를 잊을 수 있습니다 (GDPR-style 잊혀질 권리)</span>
            <ConfirmDeleteDialog
              itemName="1달 이전 데이터"
              itemType="메모리"
              description="history/healing/memory 모든 소스에서 30일 이상 된 항목이 영구 삭제됩니다. 되돌릴 수 없습니다."
              onConfirm={async () => {
                const before = Date.now() - 30 * 24 * 60 * 60 * 1000;
                await forgetBefore(before);
              }}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200 transition-colors rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Trash2 size={10} />
                30일 이전 잊기
              </button>
            </ConfirmDeleteDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const RecallRow: React.FC<{
  entry: RecallEntry;
  onForget: () => void;
  onInject?: () => void;
}> = ({ entry, onForget, onInject }) => {
  const meta = SOURCE_META[entry.source];
  return (
    <details className="group rounded-lg bg-white/3 border border-white/7 overflow-hidden">
      <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 text-xs hover:bg-white/3">
        <span className={cn("inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border shrink-0", meta.tone)}>
          {meta.icon}
          {meta.label}
        </span>
        <span className="truncate flex-1 text-white/85 font-mono">{entry.title}</span>
        <span className="text-xs text-emerald-300 tabular-nums shrink-0" title={`유사도 ${(entry.score * 100).toFixed(0)}%`}>
          {(entry.score * 100).toFixed(0)}%
        </span>
        <span className="text-xs text-white/30 tabular-nums shrink-0">{fmtShortDate(entry.ts_ms, "ms")}</span>
      </summary>
      <div className="px-3 pb-2.5 pt-0.5 space-y-1.5 text-sm border-t border-white/5">
        <pre className="text-white/70 font-mono whitespace-pre-wrap text-[10.5px] bg-black/20 rounded px-2 py-1.5 max-h-32 overflow-y-auto">{entry.snippet}</pre>
        {entry.metadata !== null && typeof entry.metadata === "object" && Object.keys(entry.metadata as object).length > 0 && (
          <pre className="text-white/40 font-mono text-xs bg-white/3 rounded px-2 py-1 overflow-x-auto">{JSON.stringify(entry.metadata, null, 2)}</pre>
        )}
        <div className="flex items-center gap-2 pt-1">
          {onInject && (
            <button
              type="button"
              onClick={onInject}
              className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <ArrowUpRight size={10} />
              AI 챗에 주입
            </button>
          )}
          <ConfirmDeleteDialog
            itemName={entry.title}
            itemType={meta.label}
            onConfirm={onForget}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-rose-300 rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Trash2 size={10} />
              잊기
            </button>
          </ConfirmDeleteDialog>
        </div>
      </div>
    </details>
  );
};

export default RecallPanel;
