import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";

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

export interface HistorySearchFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

function relativeTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export function getHistorySearchFlowSummary(input: {
  query: string;
  isSearching: boolean;
  resultsCount: number;
  recentCount: number;
}): HistorySearchFlowSummary {
  const trimmedQuery = input.query.trim();
  if (input.isSearching) {
    return {
      primary: "히스토리 검색 중",
      secondary: trimmedQuery || "질문 분석",
      detail: "자연어 질문을 바탕으로 이전 명령 기록을 찾고 있습니다.",
    };
  }

  if (!trimmedQuery) {
    return {
      primary: "최근 기록 탐색",
      secondary: `${input.recentCount}개 최근 항목`,
      detail: "최근 실행한 명령을 먼저 훑은 뒤 필요한 커맨드를 다시 불러올 수 있습니다.",
    };
  }

  if (input.resultsCount === 0) {
    return {
      primary: "검색 결과 없음",
      secondary: trimmedQuery,
      detail: "질문 표현을 조금 넓히거나 최근 기록을 함께 확인하면 원하는 명령을 더 빨리 찾을 수 있습니다.",
    };
  }

  return {
    primary: "검색 결과 준비",
    secondary: `${input.resultsCount}개 일치`,
    detail: "찾은 명령을 확인한 뒤 필요한 커맨드만 다시 실행 흐름으로 이어갈 수 있습니다.",
  };
}

const HistorySearch: React.FC<Props> = ({ model, onSelect, onClose }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HistoryEntry[]>([]);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<HistoryEntry[]>("get_recent_history", { limit: 15 })
      .then(setRecent)
      .catch(() => {});
  }, []);

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
          e.command.toLowerCase().includes(query.toLowerCase()),
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
  const flowSummary = getHistorySearchFlowSummary({
    query,
    isSearching,
    resultsCount: results.length,
    recentCount: recent.length,
  });

  const handleSelect = (cmd: string) => {
    if (cmd.trim()) {
      onSelect(cmd);
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl overflow-hidden p-0 gap-0 border-white/10">
        <DialogTitle className="sr-only">히스토리 검색</DialogTitle>
        <DialogDescription className="sr-only">이전에 실행한 터미널 명령을 검색하고 다시 실행합니다.</DialogDescription>
        <Command shouldFilter={false}>
          <div className="px-3 py-2 border-b border-white/8 bg-white/[0.02]">
            <ActionFlowBar
              badges={[flowSummary.primary, flowSummary.secondary, "마지막 재실행"]}
              helper={flowSummary.detail}
            />
          </div>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={isSearching ? "검색 중..." : "자연어로 검색: '지난번에 빌드 어떻게 했더라…'"}
          />
          <CommandList className="max-h-80">
            {displayList.length === 0 && !isSearching ? (
              <CommandEmpty>
                <div className="space-y-2 py-2">
                  <div>{query ? "결과 없음" : "실행한 커맨드가 없습니다"}</div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left">
                    <ActionFlowBar
                      badges={query ? ["질문 조정", "최근 기록 확인", "다시 검색"] : ["첫 실행 대기", "최근 기록 누적", "다음 검색 준비"]}
                      helper={
                        query
                          ? "검색어를 조금 넓히거나 최근 기록을 확인한 뒤 다시 찾으면 원하는 명령을 더 빨리 찾을 수 있습니다."
                          : "명령을 몇 번 실행해 두면 최근 기록과 자연어 검색 흐름이 바로 이어집니다."
                      }
                    />
                  </div>
                </div>
              </CommandEmpty>
            ) : (
              <CommandGroup heading={query.trim() ? "시맨틱 검색 결과" : "최근 커맨드"}>
                {displayList.map((entry) => {
                  const success = entry.exit_code === 0;
                  return (
                    <CommandItem
                      key={entry.id}
                      value={entry.id}
                      onSelect={() => handleSelect(entry.command)}
                    >
                      {success ? (
                        <CheckCircle2 size={11} className="text-green-400/70 shrink-0" />
                      ) : (
                        <XCircle size={11} className="text-red-400/70 shrink-0" />
                      )}
                      <span className="font-mono text-sm text-white/80 truncate flex-1">
                        {entry.command}
                      </span>
                      <span className="text-xs text-white/25 shrink-0 tabular-nums">
                        {relativeTime(entry.timestamp)}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};

export default HistorySearch;
