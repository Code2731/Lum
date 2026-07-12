import React, { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Search, FolderOpen, Loader2, Database, Share2, FileCode, X, Copy } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";

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

export interface RagPanelFlowMeta {
  badges: [string, string, string];
  helper: string;
}

export function getRagPanelFlowMeta(): RagPanelFlowMeta {
  return {
    badges: ["먼저 인덱싱", "다음 질의", "마지막 결과 확인"],
    helper: "프로젝트를 먼저 읽어 두고, 질문을 던진 뒤 관련 코드 조각을 바로 확인합니다.",
  };
}

export function getRagPanelIndexMeta(): RagPanelFlowMeta {
  return {
    badges: ["현재 경로", "인덱싱 실행", "오류 복사"],
    helper: "경로를 확인하고 인덱싱한 뒤, 실패하면 오류를 복사해 바로 점검합니다.",
  };
}

export function getRagPanelSearchMeta(): RagPanelFlowMeta {
  return {
    badges: ["먼저 질문", "다음 로컬 검색", "스웜 확장"],
    helper: "질문을 입력하고 로컬에서 먼저 찾은 뒤, 필요하면 스웜으로 같은 질의를 넓힙니다.",
  };
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
  const panelTextClass = compact ? "text-xs" : "text-xs";
  const headerPadClass = compact ? "px-2.5 py-1.5" : "px-3 py-2";
  const bodyPadClass = compact ? "flex-1 overflow-y-auto p-2 space-y-3" : "flex-1 overflow-y-auto p-3 space-y-4";
  const sectionGapClass = compact ? "space-y-1.5" : "space-y-2";
  const titleSizeClass = compact ? "text-xs" : "text-sm";
  const bodyInputTextClass = compact ? "text-xs" : "text-sm";
  const flowMeta = getRagPanelFlowMeta();
  const indexMeta = getRagPanelIndexMeta();
  const searchMeta = getRagPanelSearchMeta();

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
        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone="neutral">{flowMeta.badges[0]}</StatusBadge>
            <StatusBadge tone="neutral">{flowMeta.badges[1]}</StatusBadge>
            <StatusBadge tone="neutral">{flowMeta.badges[2]}</StatusBadge>
            <span className="text-[10px] text-white/38">
              {flowMeta.helper}
            </span>
          </div>
        </div>

        {/* 인덱싱 섹션 */}
        <section className={sectionGapClass}>
          <p className="text-xs text-white/45 font-semibold uppercase tracking-wider">프로젝트 인덱싱</p>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
            <StatusBadge tone="neutral">{indexMeta.badges[0]}</StatusBadge>
            <StatusBadge tone="neutral">{indexMeta.badges[1]}</StatusBadge>
            <StatusBadge tone="neutral">{indexMeta.badges[2]}</StatusBadge>
            <span className="text-[10px] text-white/38">
              {indexMeta.helper}
            </span>
          </div>
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
            <div className={`text-xs ${indexStatus.ok ? "text-green-400" : "text-red-400"}`}>
              {indexStatus.ok ? (
                <p>{`${indexStatus.files}개 파일 · ${indexStatus.chunks}개 청크 인덱싱 완료`}</p>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono whitespace-pre-wrap break-all">{`인덱싱 실패 — ${indexStatus.error}`}</p>
                  <IconButton
                    tooltip="오류 텍스트 복사"
                    onClick={() => {
                      if (!indexStatus.error) return;
                      navigator.clipboard?.writeText?.(`인덱싱 실패 — ${indexStatus.error}`).catch(() => {});
                    }}
                    className="p-1 rounded text-red-200/85 hover:text-red-100 hover:bg-red-500/20 transition-colors"
                  >
                    <Copy size={11} />
                  </IconButton>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 검색 섹션 */}
        <section className={sectionGapClass}>
          <p className="text-xs text-white/45 font-semibold uppercase tracking-wider">코드베이스 검색</p>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
            <StatusBadge tone="neutral">{searchMeta.badges[0]}</StatusBadge>
            <StatusBadge tone="neutral">{searchMeta.badges[1]}</StatusBadge>
            <StatusBadge tone="neutral">{searchMeta.badges[2]}</StatusBadge>
            <span className="text-[10px] text-white/38">
              {searchMeta.helper}
            </span>
          </div>
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
            <p className="text-xs text-white/40 font-medium uppercase tracking-wider">로컬 결과</p>
            {results.map((r, i) => (
              <ResultCard key={i} content={r.content} score={r.score} />
            ))}
          </section>
        )}

        {/* 스웜 검색 결과 */}
        {swarmResults.length > 0 && (
          <section className={compact ? "space-y-1" : "space-y-1.5"}>
            <p className="text-xs text-white/40 font-medium uppercase tracking-wider">
              스웜 결과 ({swarmResults.length}개 피어)
            </p>
            {swarmResults.map((peer, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs text-purple-300/70 font-mono truncate">{peer.peer_id.slice(0, 20)}…</p>
                {peer.results.map((r, j) => (
                  <ResultCard key={j} content={r} score={0} swarm />
                ))}
              </div>
            ))}
          </section>
        )}

        {results.length === 0 && swarmResults.length === 0 && !isSearching && query && (
          <div className="py-4 text-center space-y-1.5">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <StatusBadge tone="neutral">질문 조정</StatusBadge>
              <StatusBadge tone="neutral">인덱스 확인</StatusBadge>
              <StatusBadge tone="neutral">스웜 재시도</StatusBadge>
            </div>
            <p className="text-xs text-white/24">검색 결과가 없습니다.</p>
          </div>
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
          <span className="font-mono text-xs text-white/66 truncate">{header}</span>
        </div>
        {score > 0 && (
          <span className="text-xs text-white/38 shrink-0">{(score * 100).toFixed(0)}%</span>
        )}
      </div>
      <pre className="text-xs text-white/56 leading-relaxed line-clamp-3 whitespace-pre-wrap font-mono">
        {body}
      </pre>
    </div>
  );
};

export default RagPanel;
