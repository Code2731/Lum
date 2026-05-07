import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Copy, TerminalSquare, Search, MoreHorizontal, Share2, RotateCcw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { tokenizeShell, TOKEN_COLORS } from "../utils/shellSyntax";
import type { CommandBlock } from "../hooks/useCommandBlocks";

interface Props {
  blocks: CommandBlock[];
  onExecute?: (cmd: string) => void;
  onAskAIForFix?: (text: string) => void;
  onRetryWithDiff?: (block: CommandBlock) => void;
  compareResultByBlock?: Record<string, {
    added: number;
    removed: number;
    preview: string;
    addedLines: string[];
    removedLines: string[];
    comparedAt: number;
  }>;
}

const SyntaxCmd: React.FC<{ cmd: string }> = ({ cmd }) => (
  <>
    {tokenizeShell(cmd).map((t, i) => (
      <span key={i} style={{ color: TOKEN_COLORS[t.type] }}>{t.text}</span>
    ))}
  </>
);

function fmtDuration(block: CommandBlock): string {
  if (!block.endedAt) return "";
  const ms = block.endedAt - block.startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const WarpListView: React.FC<Props> = ({ blocks, onExecute, onAskAIForFix, onRetryWithDiff, compareResultByBlock = {} }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "failed" | "success" | "compared">("all");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [blockSearch, setBlockSearch] = useState<Record<string, string>>({});
  const [blockSearchCursor, setBlockSearchCursor] = useState<Record<string, number>>({});
  const [activeSearchBlockId, setActiveSearchBlockId] = useState<string | null>(null);
  const [deltaOpenId, setDeltaOpenId] = useState<string | null>(null);
  const outputRefs = useRef<Record<string, HTMLPreElement | null>>({});
  const blockRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20 select-none">
        <TerminalSquare size={32} />
        <p className="text-xs text-center leading-relaxed">
          명령어를 실행하면<br />블록으로 표시됩니다.
        </p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = [...blocks]
    .reverse()
    .filter((b) => {
      const ok = b.exitCode === 0 || b.exitCode === null;
      if (statusFilter === "failed" && ok) return false;
      if (statusFilter === "success" && !ok) return false;
      if (statusFilter === "compared" && !compareResultByBlock[b.id]) return false;
      if (!q) return true;
      const compare = compareResultByBlock[b.id];
      return (
        b.command.toLowerCase().includes(q)
        || b.output.toLowerCase().includes(q)
        || (compare?.preview?.toLowerCase().includes(q) ?? false)
      );
    });

  const failedCount = blocks.filter((b) => b.exitCode !== 0 && b.exitCode !== null).length;
  const successCount = blocks.length - failedCount;
  const comparedCount = blocks.filter((b) => !!compareResultByBlock[b.id]).length;
  const filteredComparedIds = useMemo(
    () => filtered.filter((b) => !!compareResultByBlock[b.id]).map((b) => b.id),
    [filtered, compareResultByBlock],
  );

  useEffect(() => {
    for (const id of Object.keys(blockSearch)) {
      const q = blockSearch[id]?.trim();
      if (!q) continue;
      const root = outputRefs.current[id];
      if (!root) continue;
      const active = root.querySelector<HTMLElement>(".lum-match-active");
      if (!active) continue;
      if (typeof active.scrollIntoView === "function") {
        active.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }, [blockSearchCursor, blockSearch, expanded]);

  useEffect(() => {
    if (!deltaOpenId) return;
    const row = blockRowRefs.current[deltaOpenId];
    if (!row) return;
    if (typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [deltaOpenId]);

  const moveBlockSearchCursor = (blockId: string, dir: 1 | -1) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const q = blockSearch[blockId] ?? "";
    const matchCount = countMatches(block.output, q);
    if (matchCount <= 0) return;
    setBlockSearchCursor((prev) => ({
      ...prev,
      [blockId]: ((prev[blockId] ?? 0) + dir + matchCount) % matchCount,
    }));
  };

  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "F3") return;
      if (!activeSearchBlockId) return;
      const q = (blockSearch[activeSearchBlockId] ?? "").trim();
      if (!q) return;
      e.preventDefault();
      moveBlockSearchCursor(activeSearchBlockId, e.shiftKey ? -1 : 1);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [activeSearchBlockId, blockSearch, blocks]);

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const countMatches = (text: string, needle: string) => {
    if (!needle.trim()) return 0;
    const m = text.match(new RegExp(escapeRegExp(needle), "gi"));
    return m ? m.length : 0;
  };
  const findMatchRanges = (text: string, needle: string): Array<{ start: number; end: number }> => {
    if (!needle.trim()) return [];
    const re = new RegExp(escapeRegExp(needle), "gi");
    const ranges: Array<{ start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return ranges;
  };
  const renderHighlightedWithCursor = (text: string, needle: string, cursor: number) => {
    if (!needle.trim()) return text;
    const ranges = findMatchRanges(text, needle);
    if (ranges.length === 0) return text;
    const nodes: React.ReactNode[] = [];
    let last = 0;
    ranges.forEach((r, i) => {
      if (r.start > last) {
        nodes.push(<React.Fragment key={`t-${i}-${last}`}>{text.slice(last, r.start)}</React.Fragment>);
      }
      const isActive = i === cursor;
      nodes.push(
          <mark
            key={`m-${i}`}
            className={
              isActive
              ? "lum-match-active bg-amber-300/70 text-black px-[1px] rounded-[2px]"
              : "bg-amber-300/30 text-amber-100 px-[1px] rounded-[2px]"
            }
          >
            {text.slice(r.start, r.end)}
          </mark>,
      );
      last = r.end;
    });
    if (last < text.length) {
      nodes.push(<React.Fragment key={`tail-${last}`}>{text.slice(last)}</React.Fragment>);
    }
    return nodes;
  };

  const openFindWithin = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setMenuOpenId(null);
    setBlockSearch((prev) => (prev[id] != null ? prev : { ...prev, [id]: "" }));
    setBlockSearchCursor((prev) => ({ ...prev, [id]: 0 }));
    setActiveSearchBlockId(id);
  };

  const navigateCompared = (dir: 1 | -1) => {
    if (filteredComparedIds.length === 0) return;
    const currentIdx = deltaOpenId ? filteredComparedIds.indexOf(deltaOpenId) : -1;
    const nextIdx = currentIdx < 0
      ? (dir > 0 ? 0 : filteredComparedIds.length - 1)
      : (currentIdx + dir + filteredComparedIds.length) % filteredComparedIds.length;
    const id = filteredComparedIds[nextIdx];
    if (!id) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setDeltaOpenId(id);
  };

  return (
    <div className="p-3 space-y-1.5 overflow-y-auto h-full">
      <div className="sticky top-0 z-10 mb-2 rounded-xl border border-white/10 bg-[#0f151f]/92 backdrop-blur-sm p-2 space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Search size={12} className="text-white/35 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="블록 검색 (명령/출력)"
            className="w-full bg-transparent border-none outline-none text-xs text-white/82 placeholder:text-white/30"
          />
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label={`전체 ${blocks.length}`} />
          <FilterChip active={statusFilter === "failed"} onClick={() => setStatusFilter("failed")} label={`실패 ${failedCount}`} tone="danger" />
          <FilterChip active={statusFilter === "success"} onClick={() => setStatusFilter("success")} label={`성공 ${successCount}`} tone="success" />
          <FilterChip active={statusFilter === "compared"} onClick={() => setStatusFilter("compared")} label={`비교 ${comparedCount}`} tone="info" />
          {comparedCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => navigateCompared(-1)}
                className="text-[10px] px-2 py-0.5 rounded border border-cyan-400/30 text-cyan-200/90 hover:bg-cyan-400/15"
              >
                Prev Δ
              </button>
              <button
                type="button"
                onClick={() => navigateCompared(1)}
                className="text-[10px] px-2 py-0.5 rounded border border-cyan-400/30 text-cyan-200/90 hover:bg-cyan-400/15"
              >
                Next Δ
              </button>
            </>
          )}
          <span className="ml-auto text-[10px] text-white/34 tabular-nums">
            표시 {filtered.length}
          </span>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-4">
          <p className="text-[11px] text-white/55">
            현재 조건에 맞는 블록이 없습니다.
          </p>
          <div className="mt-2 flex items-center gap-2">
            {statusFilter !== "all" && (
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="text-[10px] px-2 py-1 rounded border border-white/15 text-white/70 hover:bg-white/[0.08]"
              >
                필터 초기화
              </button>
            )}
            {query.trim() !== "" && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-[10px] px-2 py-1 rounded border border-white/15 text-white/70 hover:bg-white/[0.08]"
              >
                검색 지우기
              </button>
            )}
          </div>
        </div>
      )}

      {filtered.map((b) => {
        const ok         = b.exitCode === 0 || b.exitCode === null;
        const isExpanded = expanded.has(b.id);
        const dur        = fmtDuration(b);
        const hasOutput  = b.output.trim().length > 0;
        const localQuery = blockSearch[b.id] ?? "";
        const matchCount = hasOutput ? countMatches(b.output, localQuery) : 0;
        const cursor = Math.min(blockSearchCursor[b.id] ?? 0, Math.max(0, matchCount - 1));
        const moveCursor = (dir: 1 | -1) => moveBlockSearchCursor(b.id, dir);
        const compare = compareResultByBlock[b.id];

        return (
          <div
            key={b.id}
            ref={(el) => { blockRowRefs.current[b.id] = el; }}
            className={`rounded-xl border overflow-hidden ${
              ok ? "border-white/8 bg-white/[0.018]" : "border-red-500/20 bg-red-500/[0.03]"
            }`}
          >
            {/* header */}
            <div
              className={`flex items-center gap-2 px-3 py-2 ${hasOutput ? "cursor-pointer hover:bg-white/3" : ""} group select-none`}
              onClick={() => hasOutput && toggle(b.id)}
            >
              {ok ? (
                <CheckCircle2 size={11} className="text-green-400 shrink-0" />
              ) : (
                <XCircle size={11} className="text-red-400 shrink-0" />
              )}

              <span className="flex-1 min-w-0 text-[11px] font-mono truncate">
                <span className="text-white/25 mr-1">$</span>
                {b.command ? <SyntaxCmd cmd={b.command} /> : <span className="text-white/30">…</span>}
              </span>

              {dur && (
                <span className="flex items-center gap-0.5 text-[9px] text-white/20 shrink-0 tabular-nums">
                  <Clock size={8} />
                  {dur}
                </span>
              )}
              {compare && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    className="text-[9px] tabular-nums px-1 py-0.5 rounded border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 hover:bg-cyan-300/20"
                    title={compare.preview || "출력 변경 요약"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeltaOpenId((prev) => (prev === b.id ? null : b.id));
                    }}
                  >
                    Δ +{compare.added}/-{compare.removed}
                  </button>
                  {deltaOpenId === b.id && (
                    <div
                      className="absolute right-0 top-6 z-30 w-[360px] rounded-lg border border-cyan-300/25 bg-[#0b131d]/97 shadow-2xl overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-2.5 py-1.5 border-b border-white/10 text-[10px] text-cyan-200 tabular-nums">
                        Retry Compare · +{compare.added} / -{compare.removed}
                      </div>
                      <div className="max-h-56 overflow-y-auto p-2 space-y-2">
                        {compare.addedLines.length > 0 && (
                          <div>
                            <div className="text-[10px] text-emerald-300 mb-1">Added</div>
                            <pre className="text-[10px] font-mono whitespace-pre-wrap text-emerald-100/90 bg-emerald-500/[0.08] border border-emerald-400/20 rounded p-1.5">
                              {compare.addedLines.map((l) => `+ ${l}`).join("\n")}
                            </pre>
                          </div>
                        )}
                        {compare.removedLines.length > 0 && (
                          <div>
                            <div className="text-[10px] text-rose-300 mb-1">Removed</div>
                            <pre className="text-[10px] font-mono whitespace-pre-wrap text-rose-100/90 bg-rose-500/[0.08] border border-rose-400/20 rounded p-1.5">
                              {compare.removedLines.map((l) => `- ${l}`).join("\n")}
                            </pre>
                          </div>
                        )}
                        {compare.addedLines.length === 0 && compare.removedLines.length === 0 && (
                          <div className="text-[10px] text-white/55">라인 변화가 감지되지 않았습니다.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {b.endedAt && (
                <span className="text-[9px] text-white/15 shrink-0 tabular-nums">
                  {new Date(b.endedAt).toLocaleTimeString()}
                </span>
              )}

              <IconButton
                tooltip="명령어 복사"
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(b.command).catch(() => {}); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-white/70 transition-all shrink-0"
              >
                <Copy size={9} />
              </IconButton>

              {onExecute && b.command && (
                <IconButton
                  tooltip="다시 실행"
                  onClick={(e) => { e.stopPropagation(); onExecute(b.command + "\r"); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-accent transition-all shrink-0"
                >
                  <TerminalSquare size={9} />
                </IconButton>
              )}
              {!ok && onAskAIForFix && (
                <IconButton
                  tooltip="AI로 실패 분석"
                  onClick={(e) => {
                    e.stopPropagation();
                    const payload = [
                      `command: ${b.command}`,
                      `exit: ${b.exitCode ?? "?"}`,
                      b.output.trim().slice(-4000),
                    ].join("\n\n");
                    onAskAIForFix(payload);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-amber-300 transition-all shrink-0"
                >
                  <Search size={9} />
                </IconButton>
              )}

              <div className="relative shrink-0">
                <IconButton
                  tooltip="블록 액션"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId((prev) => (prev === b.id ? null : b.id));
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-white/70 transition-all shrink-0"
                >
                  <MoreHorizontal size={10} />
                </IconButton>
                {menuOpenId === b.id && (
                  <div
                    className="absolute right-0 top-5 z-20 w-44 rounded-lg border border-white/10 bg-[#0f151f]/96 backdrop-blur-sm shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="w-full px-2.5 py-1.5 text-left text-[11px] text-white/78 hover:bg-white/[0.08]"
                      onClick={() => {
                        navigator.clipboard.writeText(`$ ${b.command}\n${b.output.trim()}`).catch(() => {});
                        setMenuOpenId(null);
                      }}
                    >
                      Copy Both
                    </button>
                    <button
                      type="button"
                      className="w-full px-2.5 py-1.5 text-left text-[11px] text-white/78 hover:bg-white/[0.08]"
                      onClick={() => openFindWithin(b.id)}
                    >
                      Find Within Block
                    </button>
                    <button
                      type="button"
                      className="w-full px-2.5 py-1.5 text-left text-[11px] text-white/78 hover:bg-white/[0.08] flex items-center gap-1.5"
                      onClick={() => {
                        const snapshot = [
                          `### ${new Date(b.startedAt).toLocaleString()}`,
                          "```sh",
                          `$ ${b.command}`,
                          "```",
                          "```txt",
                          b.output.trim(),
                          "```",
                        ].join("\n");
                        navigator.clipboard.writeText(snapshot).catch(() => {});
                        setMenuOpenId(null);
                      }}
                    >
                      <Share2 size={11} />
                      Share Snapshot
                    </button>
                    {onRetryWithDiff && (
                      <button
                        type="button"
                        className="w-full px-2.5 py-1.5 text-left text-[11px] text-white/78 hover:bg-white/[0.08] flex items-center gap-1.5"
                        onClick={() => {
                          onRetryWithDiff(b);
                          setMenuOpenId(null);
                        }}
                      >
                        <RotateCcw size={11} />
                        Retry + Compare
                      </button>
                    )}
                    {compare && (
                      <div className="px-2.5 py-1.5 border-t border-white/10">
                        <div className="text-[10px] text-cyan-200/90 tabular-nums">
                          Δ +{compare.added}/-{compare.removed}
                        </div>
                        {compare.preview && (
                          <div className="text-[10px] text-white/50 leading-relaxed mt-0.5 break-words">
                            {compare.preview}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {hasOutput && (
                <span className="text-white/20 shrink-0">
                  {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </span>
              )}
            </div>

            {/* output */}
            {hasOutput && isExpanded && (
              <div className="relative border-t border-white/5">
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/6 bg-white/[0.02]">
                  <Search size={10} className="text-white/35 shrink-0" />
                  <input
                    value={localQuery}
                    onChange={(e) => {
                      setBlockSearch((prev) => ({ ...prev, [b.id]: e.target.value }));
                      setBlockSearchCursor((prev) => ({ ...prev, [b.id]: 0 }));
                      setActiveSearchBlockId(b.id);
                    }}
                    onFocus={() => setActiveSearchBlockId(b.id)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== "F3") return;
                      e.preventDefault();
                      e.stopPropagation();
                      moveCursor(e.shiftKey ? -1 : 1);
                    }}
                    placeholder="블록 내 검색"
                    className="flex-1 bg-transparent border-none outline-none text-[10px] text-white/80 placeholder:text-white/30"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {localQuery.trim() && (
                    <>
                      <button
                        type="button"
                        className="text-[10px] px-1 py-0.5 rounded border border-white/14 text-white/58 hover:text-white/80 hover:bg-white/[0.08]"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCursor(-1);
                        }}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        className="text-[10px] px-1 py-0.5 rounded border border-white/14 text-white/58 hover:text-white/80 hover:bg-white/[0.08]"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCursor(1);
                        }}
                      >
                        Next
                      </button>
                      <span className="text-[10px] text-amber-200/80 tabular-nums min-w-[44px] text-right">
                        {matchCount > 0 ? `${cursor + 1}/${matchCount}` : "0/0"}
                      </span>
                    </>
                  )}
                </div>
                <pre
                  ref={(el) => { outputRefs.current[b.id] = el; }}
                  className="px-3 py-2 text-[10px] font-mono text-white/40 whitespace-pre-wrap max-h-52 overflow-y-auto leading-relaxed bg-[#0d1117]"
                >
                  {renderHighlightedWithCursor(b.output.trim(), localQuery, cursor)}
                </pre>
                <IconButton
                  tooltip="출력 복사"
                  onClick={() => navigator.clipboard.writeText(b.output.trim()).catch(() => {})}
                  className="absolute top-2 right-2 p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/5 transition-colors"
                >
                  <Copy size={9} />
                </IconButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const FilterChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "neutral" | "danger" | "success" | "info";
}> = ({ active, onClick, label, tone = "neutral" }) => {
  const activeClass =
    tone === "danger"
      ? "bg-red-400/20 border-red-400/40 text-red-200"
      : tone === "success"
        ? "bg-emerald-400/20 border-emerald-400/40 text-emerald-200"
        : tone === "info"
          ? "bg-cyan-400/20 border-cyan-400/40 text-cyan-200"
        : "bg-accent/20 border-accent/40 text-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded-md text-[10px] border transition-colors ${
        active
          ? activeClass
          : "border-white/14 text-white/48 bg-white/[0.04] hover:text-white/72 hover:bg-white/[0.08]"
      }`}
    >
      {label}
    </button>
  );
};

export default WarpListView;
