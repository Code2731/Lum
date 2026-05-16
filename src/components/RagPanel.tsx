import React, { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Search, FolderOpen, Loader2, Database, Share2, FileCode, X } from "lucide-react";

interface SearchResult {
  content: string;
  score: number;
}

interface SwarmRagResult {
  query_id: string;
  peer_id: string;
  results: string[];
}

type IndexStatus =
  | { ok: true; files: number; chunks: number }
  | { ok: false; error: string };

interface Props {
  model: string;
  onClose: () => void;
  compact?: boolean;
}

const RagPanel: React.FC<Props> = ({ model, onClose, compact = false }) => {
  const [indexPath, setIndexPath] = useState("");
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [swarmResults, setSwarmResults] = useState<SwarmRagResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [swarmQueryId, setSwarmQueryId] = useState<string | null>(null);

  // 스웜 리스너를 useEffect로 관리 — 컴포넌트 언마운트 시 자동 해제
  const unlistenRef = useRef<(() => void) | null>(null);
  const swarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!swarmQueryId) return;

    let cancelled = false;
    listen<SwarmRagResult>("swarm-rag-result", (event) => {
      if (event.payload.query_id === swarmQueryId && !cancelled) {
        setSwarmResults((prev) => [...prev, event.payload]);
      }
    }).then((fn) => {
      if (cancelled) fn(); else unlistenRef.current = fn;
    });

    swarmTimerRef.current = setTimeout(() => {
      setSwarmQueryId(null);
    }, 2000);

    return () => {
      cancelled = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
      if (swarmTimerRef.current) clearTimeout(swarmTimerRef.current);
    };
  }, [swarmQueryId]);

  const handleIndex = useCallback(async () => {
    if (!indexPath.trim()) return;
    setIsIndexing(true);
    setIndexStatus(null);
    try {
      const result = await invoke<{ files: number; chunks: number }>("index_project", {
        rootPath: indexPath.trim(),
        model,
      });
      setIndexStatus({ ok: true, ...result });
    } catch (e) {
      setIndexStatus({ ok: false, error: String(e) });
    } finally {
      setIsIndexing(false);
    }
  }, [indexPath, model]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setResults([]);
    try {
      const res = await invoke<SearchResult[]>("search_codebase", {
        query: query.trim(),
        model,
        limit: 5,
      });
      setResults(res);
    } finally {
      setIsSearching(false);
    }
  }, [query, model]);

  const handleSwarmSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSwarmResults([]);

    let embedding: number[];
    try {
      embedding = await invoke<number[]>("generate_embedding", {
        text: query.trim(),
        model,
      });
    } catch {
      return;
    }

    const queryId = `rag-${Date.now()}`;
    try {
      await invoke("send_swarm_task", {
        peerIdStr: "broadcast",
        task: JSON.stringify({ type: "RagQuery", query_id: queryId, embedding, limit: 5 }),
      });
    } catch {
      // 스웜 미연결 시 무시
    }
    setSwarmQueryId(queryId);
  }, [query, model]);

  const swarmSearching = swarmQueryId !== null;
  const panelTextClass = compact ? "text-[10px]" : "text-xs";
  const headerPadClass = compact ? "px-2.5 py-1.5" : "px-3 py-2";
  const bodyPadClass = compact ? "flex-1 overflow-y-auto p-2 space-y-3" : "flex-1 overflow-y-auto p-3 space-y-4";
  const sectionGapClass = compact ? "space-y-1.5" : "space-y-2";
  const titleSizeClass = compact ? "text-[10px]" : "text-[11px]";
  const bodyInputTextClass = compact ? "text-[10px]" : "text-[11px]";

  return (
    <div className={`lum-sidepanel flex flex-col h-full text-white ${panelTextClass}`}>
      {/* 헤더 */}
      <div className={`flex items-center justify-between ${headerPadClass} border-b border-white/10 shrink-0 bg-white/[0.02]`}>
        <div className="flex items-center gap-2">
          <Database size={12} className="text-accent" />
          <span className={`font-semibold ${titleSizeClass} text-white/85`}>RAG 코드 검색</span>
        </div>
        <button
          onClick={onClose}
          aria-label="RAG 패널 닫기"
          className="p-1 rounded border border-white/[0.1] text-white/40 hover:text-white/75 hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X size={12} />
        </button>
      </div>

      <div className={bodyPadClass}>
        {/* 인덱싱 섹션 */}
        <section className={sectionGapClass}>
          <p className="text-[10px] text-white/45 font-semibold uppercase tracking-wider">프로젝트 인덱싱</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <FolderOpen size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                className={`w-full bg-white/[0.05] border border-white/[0.12] rounded-md px-2 py-1.5 pl-6 ${bodyInputTextClass} outline-none focus:border-accent/55 text-white/80 placeholder:text-white/28 font-mono`}
                placeholder="/path/to/project"
                value={indexPath}
                onChange={(e) => setIndexPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleIndex();
                  }
                }}
              />
            </div>
            <button
              onClick={handleIndex}
              disabled={isIndexing || !indexPath.trim()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-accent/35 bg-accent/18 text-accent hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {isIndexing ? <Loader2 size={11} className="animate-spin" /> : <Database size={11} />}
              인덱싱
            </button>
          </div>
          {indexStatus && (
            <p className={`text-[10px] ${indexStatus.ok ? "text-green-400" : "text-red-400"}`}>
              {indexStatus.ok
                ? `${indexStatus.files}개 파일 · ${indexStatus.chunks}개 청크 인덱싱 완료`
                : `인덱싱 실패 — ${indexStatus.error}`}
            </p>
          )}
        </section>

        {/* 검색 섹션 */}
        <section className={sectionGapClass}>
          <p className="text-[10px] text-white/45 font-semibold uppercase tracking-wider">코드베이스 검색</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                className={`w-full bg-white/[0.05] border border-white/[0.12] rounded-md px-2 py-1.5 pl-6 ${bodyInputTextClass} outline-none focus:border-accent/55 text-white/80 placeholder:text-white/28`}
                placeholder="PTY 채널 아키텍처는 어떻게 구현되어 있나요?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSearch();
                  }
                }}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/[0.12] bg-white/[0.07] text-white/74 hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {isSearching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
              검색
            </button>
            <button
              onClick={handleSwarmSearch}
              disabled={swarmSearching || !query.trim()}
              title="연결된 피어 노드에도 검색 브로드캐스트"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-purple-400/35 bg-purple-500/18 text-purple-200 hover:bg-purple-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {swarmSearching ? <Loader2 size={11} className="animate-spin" /> : <Share2 size={11} />}
              스웜
            </button>
          </div>
        </section>

        {/* 로컬 검색 결과 */}
        {results.length > 0 && (
          <section className={compact ? "space-y-1" : "space-y-1.5"}>
            <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">로컬 결과</p>
            {results.map((r, i) => (
              <ResultCard key={i} content={r.content} score={r.score} />
            ))}
          </section>
        )}

        {/* 스웜 검색 결과 */}
        {swarmResults.length > 0 && (
          <section className={compact ? "space-y-1" : "space-y-1.5"}>
            <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">
              스웜 결과 ({swarmResults.length}개 피어)
            </p>
            {swarmResults.map((peer, i) => (
              <div key={i} className="space-y-1">
                <p className="text-[10px] text-purple-300/70 font-mono truncate">{peer.peer_id.slice(0, 20)}…</p>
                {peer.results.map((r, j) => (
                  <ResultCard key={j} content={r} score={0} swarm />
                ))}
              </div>
            ))}
          </section>
        )}

        {results.length === 0 && swarmResults.length === 0 && !isSearching && query && (
          <p className="text-[10px] text-white/24 text-center py-4">검색 결과가 없습니다.</p>
        )}
      </div>
    </div>
  );
};

const ResultCard: React.FC<{ content: string; score: number; swarm?: boolean }> = ({
  content,
  score,
  swarm,
}) => {
  const lines = content.split("\n");
  const header = lines[0] ?? "";
  const body = lines.slice(1, 6).join("\n");

  return (
    <div className={`rounded-md border p-2 space-y-1 ${swarm ? "border-purple-400/25 bg-purple-500/8" : "border-white/[0.1] bg-white/[0.03]"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileCode size={10} className={swarm ? "text-purple-400 shrink-0" : "text-accent shrink-0"} />
          <span className="font-mono text-[10px] text-white/66 truncate">{header}</span>
        </div>
        {score > 0 && (
          <span className="text-[9px] text-white/38 shrink-0">{(score * 100).toFixed(0)}%</span>
        )}
      </div>
      <pre className="text-[10px] text-white/56 leading-relaxed line-clamp-3 whitespace-pre-wrap font-mono">
        {body}
      </pre>
    </div>
  );
};

export default RagPanel;
