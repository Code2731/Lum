import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface HistoryEntry {
  id: string;
  command: string;
  exit_code: number;
  cwd: string;
  timestamp: number;
  embedding: number[];
}

interface Props {
  model: string;
  onSelect: (command: string) => void;
  onClose: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

const HistorySearch: React.FC<Props> = ({ model, onSelect, onClose }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HistoryEntry[]>([]);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 초기 최근 히스토리 로드
  useEffect(() => {
    invoke<HistoryEntry[]>("get_recent_history", { limit: 15 })
      .then(setRecent)
      .catch(() => {});
    inputRef.current?.focus();
  }, []);

  // 쿼리 변경 시 시맨틱 검색 (debounce 400ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await invoke<HistoryEntry[]>("search_history", {
          query: query.trim(),
          model,
          limit: 10,
        });
        setResults(res);
      } catch {
        // xLLM 오프라인 — 클라이언트 측 키워드 필터로 폴백
        const filtered = recent.filter((e) =>
          e.command.toLowerCase().includes(query.toLowerCase())
        );
        setResults(filtered);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, model, recent]);

  const displayList = query.trim() ? results : recent;

  // 선택 인덱스를 리스트 범위 내로 클램프
  useEffect(() => {
    setSelectedIdx(0);
  }, [displayList.length]);

  const handleSelect = useCallback(
    (cmd: string) => {
      if (cmd.trim()) {
        onSelect(cmd);
        onClose();
      }
    },
    [onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => displayList.length > 0 ? Math.min(i + 1, displayList.length - 1) : 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const entry = displayList[selectedIdx];
        if (entry) handleSelect(entry.command);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [displayList, selectedIdx, handleSelect, onClose]
  );

  return (
    // 배경 오버레이
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl mx-4 bg-[#0d1117] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* 검색 입력창 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          {isSearching ? (
            <Loader2 size={14} className="text-white/40 animate-spin shrink-0" />
          ) : (
            <Search size={14} className="text-white/40 shrink-0" />
          )}
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/25"
            placeholder="자연어로 검색: '지난번에 빌드 어떻게 했더라…'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="text-[10px] text-white/20 bg-white/5 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>

        {/* 결과 목록 */}
        <div className="max-h-80 overflow-y-auto">
          {displayList.length === 0 && !isSearching ? (
            <p className="text-xs text-white/25 text-center py-8">
              {query ? "결과 없음" : "실행한 커맨드가 없습니다"}
            </p>
          ) : (
            <>
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] text-white/30 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={9} />
                  {query.trim() ? "시맨틱 검색 결과" : "최근 커맨드"}
                </span>
              </div>
              {displayList.map((entry, idx) => {
                const success = entry.exit_code === 0;
                const active = idx === selectedIdx;
                return (
                  <button
                    key={entry.id}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      active ? "bg-white/8" : "hover:bg-white/5"
                    }`}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => handleSelect(entry.command)}
                  >
                    {success ? (
                      <CheckCircle2 size={11} className="text-green-400/70 shrink-0" />
                    ) : (
                      <XCircle size={11} className="text-red-400/70 shrink-0" />
                    )}
                    <span className="font-mono text-[12px] text-white/80 truncate flex-1 min-w-0">
                      {entry.command}
                    </span>
                    <span className="text-[10px] text-white/25 shrink-0 tabular-nums">
                      {relativeTime(entry.timestamp)}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* 하단 힌트 */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-white/5 text-[10px] text-white/20">
          <span><kbd className="bg-white/5 px-1 rounded">↑↓</kbd> 탐색</span>
          <span><kbd className="bg-white/5 px-1 rounded">Enter</kbd> 선택 (붙여넣기)</span>
          <span><kbd className="bg-white/5 px-1 rounded">Esc</kbd> 닫기</span>
        </div>
      </div>
    </div>
  );
};

export default HistorySearch;
