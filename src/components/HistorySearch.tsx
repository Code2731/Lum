import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
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
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={isSearching ? "검색 중..." : "자연어로 검색: '지난번에 빌드 어떻게 했더라…'"}
          />
          <CommandList className="max-h-80">
            {displayList.length === 0 && !isSearching ? (
              <CommandEmpty>
                {query ? "결과 없음" : "실행한 커맨드가 없습니다"}
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
                      <span className="font-mono text-[12px] text-white/80 truncate flex-1">
                        {entry.command}
                      </span>
                      <span className="text-[10px] text-white/25 shrink-0 tabular-nums">
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
