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
  onRetrySelectedWithDiff?: (blocks: CommandBlock[]) => void;
  retryCompareQueueDepth?: number;
  retryCompareQueueWaiting?: number;
  retryCompareInFlight?: boolean;
  retryCompareCurrentCommand?: string | null;
  retryCompareCompletedCount?: number;
  onResetRetryCompareCompletedCount?: () => void;
  retryCompareQueuePaused?: boolean;
  onToggleRetryCompareQueuePaused?: () => void;
  canUndoRetryCompareQueueChange?: boolean;
  onUndoRetryCompareQueueChange?: () => void;
  canRedoRetryCompareQueueChange?: boolean;
  onRedoRetryCompareQueueChange?: () => void;
  retryCompareQueueItems?: Array<{ id: string; command: string }>;
  onPromoteRetryCompareQueueItem?: (id: string) => void;
  onDemoteRetryCompareQueueItem?: (id: string) => void;
  onMoveUpRetryCompareQueueItem?: (id: string) => void;
  onMoveDownRetryCompareQueueItem?: (id: string) => void;
  onPrioritizeRetryCompareQueueItem?: (id: string) => void;
  onPrioritizeFilteredRetryCompareQueueItems?: (ids: string[]) => void;
  onRemoveRetryCompareQueueItem?: (id: string) => void;
  onPromoteFilteredRetryCompareQueueItems?: (ids: string[]) => void;
  onDemoteFilteredRetryCompareQueueItems?: (ids: string[]) => void;
  onRemoveFilteredRetryCompareQueueItems?: (ids: string[]) => void;
  onClearRetryCompareQueue?: () => void;
  onExplainDiff?: (text: string) => void;
  onExplainAllDiffs?: (text: string) => void;
  onClearCompareResults?: () => void;
  compareResultByBlock?: Record<string, {
    added: number;
    removed: number;
    preview: string;
    addedLines: string[];
    removedLines: string[];
    comparedAt: number;
  }>;
}
type CompareResult = NonNullable<Props["compareResultByBlock"]>[string];
type TimelineRisk = "high" | "medium" | "low";

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
function classifyTimelineRisk(command: string): TimelineRisk {
  const c = command.toLowerCase();
  if (/(rm\s+-rf|sudo\s+|chmod\s+|chown\s+|git\s+reset\s+--hard|dd\s+if=|mkfs|shutdown|reboot)/.test(c)) {
    return "high";
  }
  if (/(npm\s+install|pnpm\s+install|yarn\s+install|git\s+pull|git\s+merge|docker\s+|kubectl\s+)/.test(c)) {
    return "medium";
  }
  return "low";
}

const WarpListView: React.FC<Props> = ({
  blocks,
  onExecute,
  onAskAIForFix,
  onRetryWithDiff,
  onRetrySelectedWithDiff,
  retryCompareQueueDepth = 0,
  retryCompareQueueWaiting = 0,
  retryCompareInFlight = false,
  retryCompareCurrentCommand = null,
  retryCompareCompletedCount = 0,
  onResetRetryCompareCompletedCount,
  retryCompareQueuePaused = false,
  onToggleRetryCompareQueuePaused,
  canUndoRetryCompareQueueChange = false,
  onUndoRetryCompareQueueChange,
  canRedoRetryCompareQueueChange = false,
  onRedoRetryCompareQueueChange,
  retryCompareQueueItems = [],
  onPromoteRetryCompareQueueItem,
  onDemoteRetryCompareQueueItem,
  onMoveUpRetryCompareQueueItem,
  onMoveDownRetryCompareQueueItem,
  onPrioritizeRetryCompareQueueItem,
  onPrioritizeFilteredRetryCompareQueueItems,
  onRemoveRetryCompareQueueItem,
  onPromoteFilteredRetryCompareQueueItems,
  onDemoteFilteredRetryCompareQueueItems,
  onRemoveFilteredRetryCompareQueueItems,
  onClearRetryCompareQueue,
  onExplainDiff,
  onExplainAllDiffs,
  onClearCompareResults,
  compareResultByBlock = {},
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "failed" | "success" | "compared">("all");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [blockSearch, setBlockSearch] = useState<Record<string, string>>({});
  const [blockSearchCursor, setBlockSearchCursor] = useState<Record<string, number>>({});
  const [activeSearchBlockId, setActiveSearchBlockId] = useState<string | null>(null);
  const [deltaOpenId, setDeltaOpenId] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineQuery, setTimelineQuery] = useState("");
  const [queueQuery, setQueueQuery] = useState("");
  const [queuePanelCollapsed, setQueuePanelCollapsed] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [timelineSortMode, setTimelineSortMode] = useState<"recent" | "delta">("recent");
  const [timelineSelectedIds, setTimelineSelectedIds] = useState<Set<string>>(new Set());
  const [timelinePinnedIds, setTimelinePinnedIds] = useState<Set<string>>(new Set());
  const [timelinePinnedOnly, setTimelinePinnedOnly] = useState(false);
  const [timelineSelectedOnly, setTimelineSelectedOnly] = useState(false);
  const [timelineRiskFilter, setTimelineRiskFilter] = useState<"all" | TimelineRisk>("all");
  const outputRefs = useRef<Record<string, HTMLPreElement | null>>({});
  const blockRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const deltaButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const deltaPopoverRef = useRef<HTMLDivElement | null>(null);
  const timelineButtonRef = useRef<HTMLButtonElement | null>(null);
  const timelinePanelRef = useRef<HTMLDivElement | null>(null);
  const timelineSearchInputRef = useRef<HTMLInputElement | null>(null);
  const queueSearchInputRef = useRef<HTMLInputElement | null>(null);

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
  const comparedTimeline = useMemo(
    () =>
      blocks
        .filter((b) => !!compareResultByBlock[b.id])
        .map((b) => ({ block: b, compare: compareResultByBlock[b.id] as CompareResult }))
        .sort((a, b) => {
          const aPinned = timelinePinnedIds.has(a.block.id);
          const bPinned = timelinePinnedIds.has(b.block.id);
          if (aPinned !== bPinned) return aPinned ? -1 : 1;
          if (timelineSortMode === "delta") {
            const aDelta = a.compare.added + a.compare.removed;
            const bDelta = b.compare.added + b.compare.removed;
            if (aDelta !== bDelta) return bDelta - aDelta;
          }
          return b.compare.comparedAt - a.compare.comparedAt;
        }),
    [blocks, compareResultByBlock, timelinePinnedIds, timelineSortMode],
  );
  const timelineFiltered = useMemo(() => {
    const q = timelineQuery.trim().toLowerCase();
    const pinnedFiltered = timelinePinnedOnly
      ? comparedTimeline.filter(({ block }) => timelinePinnedIds.has(block.id))
      : comparedTimeline;
    const selectedFiltered = timelineSelectedOnly
      ? pinnedFiltered.filter(({ block }) => timelineSelectedIds.has(block.id))
      : pinnedFiltered;
    const riskFiltered = timelineRiskFilter === "all"
      ? selectedFiltered
      : selectedFiltered.filter(({ block }) => classifyTimelineRisk(block.command) === timelineRiskFilter);
    if (!q) return riskFiltered;
    return riskFiltered.filter(({ block, compare }) =>
      block.command.toLowerCase().includes(q) || (compare.preview ?? "").toLowerCase().includes(q),
    );
  }, [comparedTimeline, timelinePinnedOnly, timelinePinnedIds, timelineSelectedOnly, timelineSelectedIds, timelineRiskFilter, timelineQuery]);
  const riskCounts = useMemo(
    () =>
      comparedTimeline.reduce(
        (acc, item) => {
          const risk = classifyTimelineRisk(item.block.command);
          acc[risk] += 1;
          return acc;
        },
        { high: 0, medium: 0, low: 0 },
      ),
    [comparedTimeline],
  );
  const comparedTotals = useMemo(
    () =>
      comparedTimeline.reduce(
        (acc, item) => ({
          added: acc.added + item.compare.added,
          removed: acc.removed + item.compare.removed,
        }),
        { added: 0, removed: 0 },
      ),
    [comparedTimeline],
  );
  const selectedTimelineItems = useMemo(
    () => comparedTimeline.filter(({ block }) => timelineSelectedIds.has(block.id)),
    [comparedTimeline, timelineSelectedIds],
  );
  const selectedTimelineIds = useMemo(
    () => selectedTimelineItems.map((item) => item.block.id),
    [selectedTimelineItems],
  );
  const timelineViewCustomized = useMemo(
    () =>
      timelineQuery.trim() !== ""
      || timelineRiskFilter !== "all"
      || timelinePinnedOnly
      || timelineSelectedOnly
      || timelineSortMode !== "recent",
    [timelineQuery, timelineRiskFilter, timelinePinnedOnly, timelineSelectedOnly, timelineSortMode],
  );
  const filteredQueueItems = useMemo(() => {
    const q = queueQuery.trim().toLowerCase();
    if (!q) return retryCompareQueueItems;
    return retryCompareQueueItems.filter((item) => item.command.toLowerCase().includes(q));
  }, [retryCompareQueueItems, queueQuery]);
  const timelineRiskLabel = timelineRiskFilter === "high"
    ? "High"
    : timelineRiskFilter === "medium"
      ? "Med"
      : timelineRiskFilter === "low"
        ? "Low"
        : "All";

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

  useEffect(() => {
    if (!deltaOpenId) return;
    if (!filtered.some((b) => b.id === deltaOpenId)) {
      setDeltaOpenId(null);
    }
  }, [deltaOpenId, filtered]);
  useEffect(() => {
    if (comparedCount > 0) return;
    setTimelineOpen(false);
    setTimelineSelectedIds(new Set());
    setTimelinePinnedIds(new Set());
    setTimelinePinnedOnly(false);
    setTimelineSelectedOnly(false);
    setTimelineRiskFilter("all");
  }, [comparedCount]);
  useEffect(() => {
    setTimelineSelectedIds((prev) => {
      const next = new Set(
        [...prev].filter((id) => comparedTimeline.some((item) => item.block.id === id)),
      );
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [comparedTimeline]);
  useEffect(() => {
    if (!timelineSelectedOnly) return;
    if (timelineSelectedIds.size > 0) return;
    setTimelineSelectedOnly(false);
  }, [timelineSelectedOnly, timelineSelectedIds]);
  useEffect(() => {
    setTimelinePinnedIds((prev) => {
      const next = new Set(
        [...prev].filter((id) => comparedTimeline.some((item) => item.block.id === id)),
      );
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [comparedTimeline]);

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
  const isTypingTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  };
  const buildDiffText = (command: string, compare: CompareResult) => {
    const lines = [
      `command: ${command}`,
      `delta: +${compare.added} / -${compare.removed}`,
      compare.preview ? `preview: ${compare.preview}` : "",
      "",
      "added:",
      ...compare.addedLines.map((l) => `+ ${l}`),
      "",
      "removed:",
      ...compare.removedLines.map((l) => `- ${l}`),
    ].filter((line) => line !== "");
    return lines.join("\n");
  };
  const buildAllDiffsText = (items: Array<{ block: CommandBlock; compare: CompareResult }>) =>
    items
      .map(({ block, compare }, idx) => {
        const head = `## ${idx + 1}. ${block.command}`;
        return [head, buildDiffText(block.command, compare)].join("\n");
      })
      .join("\n\n");
  const toggleTimelineSelection = (id: string) => {
    setTimelineSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllTimelineFiltered = () => {
    setTimelineSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of timelineFiltered) {
        next.add(item.block.id);
      }
      return next;
    });
  };
  const clearTimelineSelection = () => {
    setTimelineSelectedIds(new Set());
    setTimelineSelectedOnly(false);
  };
  const invertTimelineFilteredSelection = () => {
    if (timelineFiltered.length === 0) return;
    setTimelineSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of timelineFiltered) {
        if (next.has(item.block.id)) next.delete(item.block.id);
        else next.add(item.block.id);
      }
      return next;
    });
  };
  const toggleTimelineSelectedOnly = () => {
    if (selectedTimelineIds.length === 0) return;
    setTimelineSelectedOnly((prev) => !prev);
  };
  const selectHighRiskTimelineFiltered = () => {
    if (timelineFiltered.length === 0) return;
    setTimelineSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of timelineFiltered) {
        if (classifyTimelineRisk(item.block.command) === "high") next.add(item.block.id);
      }
      return next;
    });
  };
  const resetTimelineViewFilters = () => {
    setTimelineQuery("");
    setTimelineRiskFilter("all");
    setTimelinePinnedOnly(false);
    setTimelineSelectedOnly(false);
    setTimelineSortMode("recent");
  };
  const pinSelectedTimeline = () => {
    setTimelinePinnedIds((prev) => {
      const next = new Set(prev);
      for (const id of timelineSelectedIds) next.add(id);
      return next;
    });
  };
  const unpinSelectedTimeline = () => {
    setTimelinePinnedIds((prev) => {
      const next = new Set(prev);
      for (const id of timelineSelectedIds) next.delete(id);
      return next;
    });
  };
  const clearPinnedTimeline = () => {
    if (timelinePinnedIds.size === 0) return;
    setTimelinePinnedIds(new Set());
    setTimelinePinnedOnly(false);
  };
  const navigateSelectedTimeline = (dir: 1 | -1) => {
    if (selectedTimelineIds.length === 0) return;
    const currentIdx = deltaOpenId ? selectedTimelineIds.indexOf(deltaOpenId) : -1;
    const nextIdx = currentIdx < 0
      ? (dir > 0 ? 0 : selectedTimelineIds.length - 1)
      : (currentIdx + dir + selectedTimelineIds.length) % selectedTimelineIds.length;
    const id = selectedTimelineIds[nextIdx];
    if (!id) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setDeltaOpenId(id);
  };

  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key !== "[" && e.key !== "]") return;
      if (isTypingTarget(e.target)) return;
      if (filteredComparedIds.length === 0) return;
      e.preventDefault();
      navigateCompared(e.key === "]" ? 1 : -1);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [filteredComparedIds, deltaOpenId]);
  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key.toLowerCase() !== "c") return;
      if (isTypingTarget(e.target)) return;
      if (comparedCount === 0) return;
      e.preventDefault();
      setStatusFilter((prev) => (prev === "compared" ? "all" : "compared"));
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [comparedCount]);
  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key.toLowerCase() !== "y") return;
      if (isTypingTarget(e.target)) return;
      if (comparedCount === 0) return;
      e.preventDefault();
      setTimelineOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [comparedCount]);

  useEffect(() => {
    if (!deltaOpenId) return;
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDeltaOpenId(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (deltaPopoverRef.current?.contains(target)) return;
      if (deltaButtonRefs.current[deltaOpenId]?.contains(target)) return;
      setDeltaOpenId(null);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [deltaOpenId]);
  useEffect(() => {
    if (!timelineOpen) return;
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const isRedoKey = (e.altKey && e.shiftKey) || (mod && e.shiftKey);
      const isUndoKey = e.altKey || mod;
      if (isRedoKey && (e.key === "z" || e.key === "Z")) {
        if (onRedoRetryCompareQueueChange && canRedoRetryCompareQueueChange) {
          e.preventDefault();
          onRedoRetryCompareQueueChange();
        }
        return;
      }
      if (isUndoKey && (e.key === "z" || e.key === "Z")) {
        if (onUndoRetryCompareQueueChange && canUndoRetryCompareQueueChange) {
          e.preventDefault();
          onUndoRetryCompareQueueChange();
        }
        return;
      }
      if (e.altKey && e.shiftKey && e.key === "Enter") {
        if (onPrioritizeFilteredRetryCompareQueueItems && filteredQueueItems.length > 0) {
          e.preventDefault();
          onPrioritizeFilteredRetryCompareQueueItems(filteredQueueItems.map((x) => x.id));
        }
        return;
      }
      if (e.altKey && e.shiftKey && e.key === "ArrowUp") {
        if (onPromoteFilteredRetryCompareQueueItems && filteredQueueItems.length > 0) {
          e.preventDefault();
          onPromoteFilteredRetryCompareQueueItems(filteredQueueItems.map((x) => x.id));
        }
        return;
      }
      if (e.altKey && e.shiftKey && e.key === "ArrowDown") {
        if (onDemoteFilteredRetryCompareQueueItems && filteredQueueItems.length > 0) {
          e.preventDefault();
          onDemoteFilteredRetryCompareQueueItems(filteredQueueItems.map((x) => x.id));
        }
        return;
      }
      if (e.altKey && (e.key === "Backspace" || e.key === "Delete")) {
        if (onRemoveFilteredRetryCompareQueueItems && filteredQueueItems.length > 0) {
          e.preventDefault();
          onRemoveFilteredRetryCompareQueueItems(filteredQueueItems.map((x) => x.id));
        }
        return;
      }
      if (e.altKey && (e.key === "q" || e.key === "Q")) {
        if (queueSearchInputRef.current) {
          e.preventDefault();
          queueSearchInputRef.current.focus();
        }
        return;
      }
      if (e.altKey && (e.key === "f" || e.key === "F")) {
        if (timelineSearchInputRef.current) {
          e.preventDefault();
          timelineSearchInputRef.current.focus();
        }
        return;
      }
      if (mod && (e.key === "f" || e.key === "F")) {
        if (timelineSearchInputRef.current) {
          e.preventDefault();
          timelineSearchInputRef.current.focus();
        }
        return;
      }
      if (e.altKey && (e.key === "k" || e.key === "K")) {
        if (retryCompareQueueItems.length > 0) {
          e.preventDefault();
          setQueuePanelCollapsed((prev) => !prev);
        }
        return;
      }
      if (e.altKey && (e.key === "r" || e.key === "R")) {
        if (timelineViewCustomized) {
          e.preventDefault();
          resetTimelineViewFilters();
        }
        return;
      }
      if (e.altKey && (e.key === "a" || e.key === "A")) {
        if (e.shiftKey) {
          if (selectedTimelineIds.length > 0) {
            e.preventDefault();
            clearTimelineSelection();
          }
          return;
        }
        if (timelineFiltered.length > 0) {
          e.preventDefault();
          selectAllTimelineFiltered();
        }
        return;
      }
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        if (comparedTimeline.length > 0) {
          e.preventDefault();
          setTimelineSortMode((prev) => (prev === "recent" ? "delta" : "recent"));
        }
        return;
      }
      if (
        e.altKey
        && (e.key === "0" || e.key === "1" || e.key === "2" || e.key === "3"
          || e.code === "Digit0" || e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3")
      ) {
        e.preventDefault();
        if (e.key === "1" || e.code === "Digit1") setTimelineRiskFilter("high");
        else if (e.key === "2" || e.code === "Digit2") setTimelineRiskFilter("medium");
        else if (e.key === "3" || e.code === "Digit3") setTimelineRiskFilter("low");
        else setTimelineRiskFilter("all");
        return;
      }
      if (e.altKey && (e.key === "i" || e.key === "I")) {
        if (timelineFiltered.length > 0) {
          e.preventDefault();
          invertTimelineFilteredSelection();
        }
        return;
      }
      if (e.altKey && (e.key === "o" || e.key === "O" || e.code === "KeyO")) {
        if (selectedTimelineIds.length > 0) {
          e.preventDefault();
          toggleTimelineSelectedOnly();
        }
        return;
      }
      if (e.altKey && (e.key === "h" || e.key === "H")) {
        if (timelineFiltered.length > 0) {
          e.preventDefault();
          selectHighRiskTimelineFiltered();
        }
        return;
      }
      if (e.altKey && e.shiftKey && (e.key === "u" || e.key === "U")) {
        if (timelinePinnedIds.size > 0) {
          e.preventDefault();
          clearPinnedTimeline();
        }
        return;
      }
      if (e.altKey && (e.key === "d" || e.key === "D")) {
        if (onResetRetryCompareCompletedCount) {
          e.preventDefault();
          onResetRetryCompareCompletedCount();
        }
        return;
      }
      if (e.altKey && (e.key === "p" || e.key === "P")) {
        if (onToggleRetryCompareQueuePaused) {
          e.preventDefault();
          onToggleRetryCompareQueuePaused();
        }
        return;
      }
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        navigateSelectedTimeline(-1);
        return;
      }
      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        navigateSelectedTimeline(1);
        return;
      }
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        navigateSelectedTimeline(1);
        return;
      }
      if (e.key !== "Escape") return;
      setTimelineOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (timelinePanelRef.current?.contains(target)) return;
      if (timelineButtonRef.current?.contains(target)) return;
      setTimelineOpen(false);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [
    timelineOpen,
    selectedTimelineIds,
    deltaOpenId,
    filteredQueueItems,
    onPrioritizeFilteredRetryCompareQueueItems,
    onPromoteFilteredRetryCompareQueueItems,
    onDemoteFilteredRetryCompareQueueItems,
    onRemoveFilteredRetryCompareQueueItems,
    onResetRetryCompareCompletedCount,
    onToggleRetryCompareQueuePaused,
    onRedoRetryCompareQueueChange,
    canRedoRetryCompareQueueChange,
    onUndoRetryCompareQueueChange,
    canUndoRetryCompareQueueChange,
    retryCompareQueueItems.length,
    comparedTimeline.length,
    timelineViewCustomized,
    timelineFiltered.length,
    timelineSelectedIds.length,
    selectAllTimelineFiltered,
    clearTimelineSelection,
    invertTimelineFilteredSelection,
    toggleTimelineSelectedOnly,
    selectHighRiskTimelineFiltered,
    resetTimelineViewFilters,
    timelinePinnedIds.size,
    clearPinnedTimeline,
  ]);

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
          <FilterChip active={statusFilter === "compared"} onClick={() => setStatusFilter("compared")} label={`비교 ${comparedCount}`} title="Cmd/Ctrl+Shift+C" tone="info" />
          {comparedCount > 0 && (
            <>
              <span
                className="text-[10px] px-2 py-0.5 rounded border border-cyan-400/20 bg-cyan-400/10 text-cyan-100/90 tabular-nums"
                title="현재 표시 중인 비교 블록의 누적 변화량"
              >
                Σ +{comparedTotals.added}/-{comparedTotals.removed}
              </span>
              {retryCompareQueueDepth > 0 && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded border border-emerald-300/30 bg-emerald-300/12 text-emerald-100 tabular-nums"
                  title="Retry+Compare 진행 대기/실행 건수"
                >
                  Queue {retryCompareQueueDepth}
                </span>
              )}
              {(retryCompareInFlight || retryCompareQueueWaiting > 0) && (
                <span className="text-[10px] text-white/45 tabular-nums">
                  {retryCompareInFlight ? "실행 중" : "대기"} · wait {retryCompareQueueWaiting}
                </span>
              )}
              {onToggleRetryCompareQueuePaused && (
                <button
                  type="button"
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    retryCompareQueuePaused
                      ? "border-amber-300/40 bg-amber-300/14 text-amber-100"
                      : "border-white/15 text-white/70 hover:bg-white/[0.08]"
                  }`}
                  onClick={onToggleRetryCompareQueuePaused}
                  title="Alt+P"
                >
                  {retryCompareQueuePaused ? "큐 재개" : "큐 일시정지"}
                </button>
              )}
              {retryCompareCompletedCount > 0 && (
                <button
                  type="button"
                  className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/60 hover:bg-white/[0.08] tabular-nums"
                  onClick={() => onResetRetryCompareCompletedCount?.()}
                  title="완료 카운트 리셋 (Alt+D)"
                >
                  done {retryCompareCompletedCount}
                </button>
              )}
              {retryCompareInFlight && retryCompareCurrentCommand && (
                <span
                  className="max-w-[220px] truncate text-[10px] text-emerald-100/90"
                  title={retryCompareCurrentCommand}
                >
                  {retryCompareCurrentCommand}
                </span>
              )}
              <div className="relative">
                <button
                  ref={timelineButtonRef}
                  type="button"
                  onClick={() => setTimelineOpen((prev) => !prev)}
                  title="Cmd/Ctrl+Shift+Y"
                  className="text-[10px] px-2 py-0.5 rounded border border-cyan-400/30 text-cyan-200/90 hover:bg-cyan-400/15"
                >
                  Δ Timeline ({comparedCount})
                </button>
                {timelineOpen && (
                  <div
                    ref={timelinePanelRef}
                    className="absolute left-0 top-6 z-30 w-[440px] rounded-lg border border-cyan-300/25 bg-[#0b131d]/97 shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-2.5 py-1.5 border-b border-white/10 text-[10px] text-cyan-200">
                      최근 비교 히스토리
                    </div>
                    <div className="px-2 py-1.5 border-b border-white/10 space-y-1.5">
                      <input
                        ref={timelineSearchInputRef}
                        value={timelineQuery}
                        onChange={(e) => setTimelineQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Escape") return;
                          if (!timelineQuery.trim()) return;
                          e.preventDefault();
                          setTimelineQuery("");
                        }}
                        placeholder="타임라인 검색 (command/preview)"
                        className="w-full bg-[#0f151f] border border-white/10 rounded px-2 py-1 text-[10px] text-white/80 placeholder:text-white/30 outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/45"
                      />
                      <div className="flex items-center gap-1.5">
                        <RiskChip
                          label={`All ${comparedTimeline.length}`}
                          active={timelineRiskFilter === "all"}
                          onClick={() => setTimelineRiskFilter("all")}
                          tone="all"
                          title="Alt+0"
                        />
                        <RiskChip
                          label={`High ${riskCounts.high}`}
                          active={timelineRiskFilter === "high"}
                          onClick={() => setTimelineRiskFilter("high")}
                          tone="high"
                          title="Alt+1"
                        />
                        <RiskChip
                          label={`Med ${riskCounts.medium}`}
                          active={timelineRiskFilter === "medium"}
                          onClick={() => setTimelineRiskFilter("medium")}
                          tone="medium"
                          title="Alt+2"
                        />
                        <RiskChip
                          label={`Low ${riskCounts.low}`}
                          active={timelineRiskFilter === "low"}
                          onClick={() => setTimelineRiskFilter("low")}
                          tone="low"
                          title="Alt+3"
                        />
                      </div>
                      {timelineViewCustomized && (
                        <div className="flex flex-wrap items-center gap-1">
                          {timelineQuery.trim() !== "" && (
                            <button
                              type="button"
                              className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-300/30 bg-cyan-300/12 text-cyan-100 hover:bg-cyan-300/20"
                              onClick={() => setTimelineQuery("")}
                              title="검색 필터 해제"
                            >
                              상태 검색: {timelineQuery.trim()}
                            </button>
                          )}
                          {timelineRiskFilter !== "all" && (
                            <button
                              type="button"
                              className="text-[10px] px-1.5 py-0.5 rounded border border-rose-300/30 bg-rose-300/12 text-rose-100 hover:bg-rose-300/20"
                              onClick={() => setTimelineRiskFilter("all")}
                              title="위험도 필터 해제"
                            >
                              상태 Risk: {timelineRiskLabel}
                            </button>
                          )}
                          {timelinePinnedOnly && (
                            <button
                              type="button"
                              className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300/30 bg-amber-300/12 text-amber-100 hover:bg-amber-300/20"
                              onClick={() => setTimelinePinnedOnly(false)}
                              title="핀만 해제"
                            >
                              상태 핀만
                            </button>
                          )}
                          {timelineSelectedOnly && (
                            <button
                              type="button"
                              className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-300/30 bg-cyan-300/12 text-cyan-100 hover:bg-cyan-300/20"
                              onClick={() => setTimelineSelectedOnly(false)}
                              title="선택만 해제"
                            >
                              상태 선택만
                            </button>
                          )}
                          {timelineSortMode !== "recent" && (
                            <button
                              type="button"
                              className="text-[10px] px-1.5 py-0.5 rounded border border-white/20 bg-white/[0.08] text-white/80 hover:bg-white/[0.14]"
                              onClick={() => setTimelineSortMode("recent")}
                              title="정렬 초기화"
                            >
                              상태 정렬: 변화량순
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white/48 tabular-nums">
                          선택 {selectedTimelineIds.length}
                        </span>
                        <button
                          type="button"
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                            showShortcutHelp
                              ? "border-cyan-300/40 bg-cyan-300/14 text-cyan-100"
                              : "border-white/15 text-white/70 hover:bg-white/[0.08]"
                          }`}
                          onClick={() => setShowShortcutHelp((prev) => !prev)}
                        >
                          Shortcuts
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
                          onClick={resetTimelineViewFilters}
                          disabled={!timelineViewCustomized}
                          title="Alt+R"
                        >
                          필터 리셋
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
                          onClick={selectAllTimelineFiltered}
                          disabled={timelineFiltered.length === 0}
                          title="Alt+A"
                        >
                          선택 전체
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
                          onClick={clearTimelineSelection}
                          disabled={timelineSelectedIds.size === 0}
                          title="Alt+Shift+A"
                        >
                          선택 해제
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
                          onClick={invertTimelineFilteredSelection}
                          disabled={timelineFiltered.length === 0}
                          title="Alt+I"
                        >
                          선택 반전
                        </button>
                        <button
                          type="button"
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                            timelineSelectedOnly
                              ? "border-cyan-300/45 bg-cyan-300/18 text-cyan-100"
                              : "border-white/15 text-white/70 hover:bg-white/[0.08]"
                          } disabled:opacity-40`}
                          onClick={toggleTimelineSelectedOnly}
                          disabled={selectedTimelineIds.length === 0}
                          title="Alt+O"
                        >
                          선택만
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-rose-300/30 text-rose-200 hover:bg-rose-300/12 disabled:opacity-40"
                          onClick={selectHighRiskTimelineFiltered}
                          disabled={timelineFiltered.length === 0}
                          title="Alt+H"
                        >
                          고위험 선택
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
                          onClick={() => {
                            navigator.clipboard.writeText(buildAllDiffsText(selectedTimelineItems)).catch(() => {});
                          }}
                          disabled={selectedTimelineItems.length === 0}
                        >
                          Copy Selected
                        </button>
                        {onRetrySelectedWithDiff && (
                          <button
                            type="button"
                            className="text-[10px] px-2 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12 disabled:opacity-40"
                            onClick={() => {
                              onRetrySelectedWithDiff(selectedTimelineItems.map((item) => item.block));
                            }}
                            disabled={selectedTimelineItems.length === 0}
                          >
                            선택 Retry+Compare
                          </button>
                        )}
                        {onClearRetryCompareQueue && (
                          <button
                            type="button"
                            className="text-[10px] px-2 py-0.5 rounded border border-rose-300/30 text-rose-200 hover:bg-rose-300/12 disabled:opacity-40"
                            onClick={onClearRetryCompareQueue}
                            disabled={retryCompareQueueWaiting === 0}
                          >
                            큐 비우기
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/12 disabled:opacity-40"
                          onClick={pinSelectedTimeline}
                          disabled={timelineSelectedIds.size === 0}
                        >
                          핀 선택
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/12 disabled:opacity-40"
                          onClick={unpinSelectedTimeline}
                          disabled={timelineSelectedIds.size === 0}
                        >
                          핀 해제
                        </button>
                        <button
                          type="button"
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                            timelinePinnedOnly
                              ? "border-amber-300/45 bg-amber-300/18 text-amber-100"
                              : "border-white/15 text-white/70 hover:bg-white/[0.08]"
                          }`}
                          onClick={() => setTimelinePinnedOnly((prev) => !prev)}
                          disabled={timelinePinnedIds.size === 0}
                        >
                          핀만
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/12 disabled:opacity-40"
                          onClick={clearPinnedTimeline}
                          title="Alt+Shift+U"
                          disabled={timelinePinnedIds.size === 0}
                        >
                          핀 전체 해제
                        </button>
                        <button
                          type="button"
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                            timelineSortMode === "delta"
                              ? "border-cyan-300/45 bg-cyan-300/18 text-cyan-100"
                              : "border-white/15 text-white/70 hover:bg-white/[0.08]"
                          }`}
                          onClick={() => setTimelineSortMode((prev) => (prev === "recent" ? "delta" : "recent"))}
                          title="Alt+S"
                        >
                          정렬: {timelineSortMode === "recent" ? "최근순" : "변화량순"}
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
                          onClick={() => navigateSelectedTimeline(1)}
                          title="Alt+Enter"
                          disabled={selectedTimelineIds.length === 0}
                        >
                          Jump Selected
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
                          onClick={() => navigateSelectedTimeline(-1)}
                          title="Alt+↑"
                          disabled={selectedTimelineIds.length === 0}
                        >
                          Prev Selected
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
                          onClick={() => navigateSelectedTimeline(1)}
                          title="Alt+↓"
                          disabled={selectedTimelineIds.length === 0}
                        >
                          Next Selected
                        </button>
                        {onExplainAllDiffs && (
                          <button
                            type="button"
                            className="text-[10px] px-2 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12 disabled:opacity-40"
                            onClick={() => {
                              onExplainAllDiffs(buildAllDiffsText(selectedTimelineItems));
                              setTimelineOpen(false);
                            }}
                            disabled={selectedTimelineItems.length === 0}
                          >
                            AI 선택요약
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08]"
                          onClick={() => {
                            navigator.clipboard.writeText(buildAllDiffsText(timelineFiltered)).catch(() => {});
                          }}
                          disabled={timelineFiltered.length === 0}
                        >
                          Copy All
                        </button>
                        {onExplainAllDiffs && (
                          <button
                            type="button"
                            className="text-[10px] px-2 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12 disabled:opacity-40"
                            onClick={() => {
                              onExplainAllDiffs(buildAllDiffsText(timelineFiltered));
                              setTimelineOpen(false);
                            }}
                            disabled={timelineFiltered.length === 0}
                          >
                            AI 요약
                          </button>
                        )}
                        {onClearCompareResults && (
                          <button
                            type="button"
                            className="ml-auto text-[10px] px-2 py-0.5 rounded border border-rose-300/30 text-rose-200 hover:bg-rose-300/12"
                            onClick={() => {
                              onClearCompareResults();
                              setDeltaOpenId(null);
                              setTimelineSelectedIds(new Set());
                              setTimelineOpen(false);
                            }}
                          >
                            비교 초기화
                          </button>
                        )}
                      </div>
                      {showShortcutHelp && (
                        <div className="rounded border border-cyan-300/20 bg-cyan-400/[0.08] px-2 py-1.5 text-[10px] text-cyan-100/90 space-y-0.5">
                          <div><span className="text-cyan-50">Cmd/Ctrl+Shift+Y</span> 타임라인 열기/닫기</div>
                          <div><span className="text-cyan-50">Alt+Enter / Alt+↑ / Alt+↓</span> 선택 Jump/이동</div>
                          <div><span className="text-cyan-50">Alt+F / Cmd/Ctrl+F</span> 타임라인 검색창 포커스</div>
                          <div><span className="text-cyan-50">Alt+R</span> 타임라인 필터 상태 리셋</div>
                          <div><span className="text-cyan-50">Alt+A</span> 현재 목록 선택 전체</div>
                          <div><span className="text-cyan-50">Alt+Shift+A</span> 선택 항목 전체 해제</div>
                          <div><span className="text-cyan-50">Alt+I</span> 현재 목록 선택 반전</div>
                          <div><span className="text-cyan-50">Alt+O</span> 선택 항목만 보기 토글</div>
                          <div><span className="text-cyan-50">Alt+H</span> 고위험 항목 빠른 선택</div>
                          <div><span className="text-cyan-50">Alt+1/2/3/0</span> 위험도 필터 High/Med/Low/All</div>
                          <div><span className="text-cyan-50">Alt+S</span> 타임라인 정렬 토글</div>
                          <div><span className="text-cyan-50">Alt+Shift+U</span> 핀 전체 해제</div>
                          <div><span className="text-cyan-50">Alt+Q / Alt+K / Alt+P / Alt+D</span> 큐 검색/접기/일시정지/완료리셋</div>
                          <div><span className="text-cyan-50">Alt+Z / Cmd/Ctrl+Z</span> 큐 변경 되돌리기</div>
                          <div><span className="text-cyan-50">Alt+Shift+Z / Cmd/Ctrl+Shift+Z</span> 큐 변경 다시실행</div>
                          <div><span className="text-cyan-50">Alt+Shift+Enter/↑/↓, Alt+Delete</span> 필터 배치 액션</div>
                        </div>
                      )}
                    </div>
                    {retryCompareQueueItems.length > 0 && (
                      <div className="px-2 py-1.5 border-b border-white/10 space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-white/55">
                          <span>Retry+Compare Queue</span>
                          <span className="tabular-nums">표시 {filteredQueueItems.length}/{retryCompareQueueItems.length}</span>
                          <button
                            type="button"
                            className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08]"
                            onClick={() => setQueuePanelCollapsed((prev) => !prev)}
                            title="Alt+K"
                          >
                            {queuePanelCollapsed ? "펼치기" : "접기"}
                          </button>
                        </div>
                        {!queuePanelCollapsed && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <input
                                ref={queueSearchInputRef}
                                value={queueQuery}
                                onChange={(e) => setQueueQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key !== "Escape") return;
                                  if (!queueQuery.trim()) return;
                                  e.preventDefault();
                                  setQueueQuery("");
                                }}
                                placeholder="큐 검색 (command)"
                                className="flex-1 bg-[#0f151f] border border-white/10 rounded px-2 py-1 text-[10px] text-white/80 placeholder:text-white/30 outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/45"
                              />
                              {queueQuery.trim() !== "" && (
                                <button
                                  type="button"
                                  className="text-[10px] px-1.5 py-1 rounded border border-white/15 text-white/70 hover:bg-white/[0.08]"
                                  onClick={() => setQueueQuery("")}
                                >
                                  지우기
                                </button>
                              )}
                              {onUndoRetryCompareQueueChange && (
                                <button
                                  type="button"
                                  className="text-[10px] px-1.5 py-1 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/12 disabled:opacity-40"
                                  onClick={onUndoRetryCompareQueueChange}
                                  title="Alt+Z / Cmd/Ctrl+Z"
                                  disabled={!canUndoRetryCompareQueueChange}
                                >
                                  큐 변경 되돌리기
                                </button>
                              )}
                              {onRedoRetryCompareQueueChange && (
                                <button
                                  type="button"
                                  className="text-[10px] px-1.5 py-1 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12 disabled:opacity-40"
                                  onClick={onRedoRetryCompareQueueChange}
                                  title="Alt+Shift+Z / Cmd/Ctrl+Shift+Z"
                                  disabled={!canRedoRetryCompareQueueChange}
                                >
                                  큐 변경 다시실행
                                </button>
                              )}
                              {onRemoveFilteredRetryCompareQueueItems && (
                                <button
                                  type="button"
                                  className="text-[10px] px-1.5 py-1 rounded border border-rose-300/30 text-rose-200 hover:bg-rose-300/12 disabled:opacity-40"
                                  onClick={() => {
                                    onRemoveFilteredRetryCompareQueueItems(filteredQueueItems.map((x) => x.id));
                                  }}
                                  title="Alt+Delete"
                                  disabled={filteredQueueItems.length === 0}
                                >
                                  필터 제거
                                </button>
                              )}
                              {onPrioritizeFilteredRetryCompareQueueItems && (
                                <button
                                  type="button"
                                  className="text-[10px] px-1.5 py-1 rounded border border-emerald-300/30 text-emerald-200 hover:bg-emerald-300/12 disabled:opacity-40"
                                  onClick={() => {
                                    onPrioritizeFilteredRetryCompareQueueItems(filteredQueueItems.map((x) => x.id));
                                  }}
                                  title="Alt+Shift+Enter"
                                  disabled={filteredQueueItems.length === 0}
                                >
                                  필터 다음실행
                                </button>
                              )}
                              {onPromoteFilteredRetryCompareQueueItems && (
                                <button
                                  type="button"
                                  className="text-[10px] px-1.5 py-1 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12 disabled:opacity-40"
                                  onClick={() => {
                                    onPromoteFilteredRetryCompareQueueItems(filteredQueueItems.map((x) => x.id));
                                  }}
                                  title="Alt+Shift+↑"
                                  disabled={filteredQueueItems.length === 0}
                                >
                                  필터 맨앞
                                </button>
                              )}
                              {onDemoteFilteredRetryCompareQueueItems && (
                                <button
                                  type="button"
                                  className="text-[10px] px-1.5 py-1 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12 disabled:opacity-40"
                                  onClick={() => {
                                    onDemoteFilteredRetryCompareQueueItems(filteredQueueItems.map((x) => x.id));
                                  }}
                                  title="Alt+Shift+↓"
                                  disabled={filteredQueueItems.length === 0}
                                >
                                  필터 맨뒤
                                </button>
                              )}
                            </div>
                            <div className="space-y-1 max-h-24 overflow-y-auto">
                              {filteredQueueItems.map((item, idx) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-1.5 py-1"
                                >
                                  <span className="text-[10px] text-white/45 tabular-nums shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="text-[10px] text-white/75 font-mono truncate flex-1" title={item.command}>
                                    {item.command}
                                  </span>
                                  {onPrioritizeRetryCompareQueueItem && (
                                    <button
                                      type="button"
                                      aria-label={`queue-next-${idx + 1}`}
                                      className="text-[10px] px-1 py-0.5 rounded border border-emerald-300/30 text-emerald-200 hover:bg-emerald-300/12"
                                      onClick={() => onPrioritizeRetryCompareQueueItem(item.id)}
                                    >
                                      다음
                                    </button>
                                  )}
                                  {onPromoteRetryCompareQueueItem && (
                                    <button
                                      type="button"
                                      aria-label={`queue-promote-${idx + 1}`}
                                      className="text-[10px] px-1 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12"
                                      onClick={() => onPromoteRetryCompareQueueItem(item.id)}
                                    >
                                      맨앞
                                    </button>
                                  )}
                                  {onMoveUpRetryCompareQueueItem && (
                                    <button
                                      type="button"
                                      aria-label={`queue-up-${idx + 1}`}
                                      className="text-[10px] px-1 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12"
                                      onClick={() => onMoveUpRetryCompareQueueItem(item.id)}
                                    >
                                      ↑
                                    </button>
                                  )}
                                  {onMoveDownRetryCompareQueueItem && (
                                    <button
                                      type="button"
                                      aria-label={`queue-down-${idx + 1}`}
                                      className="text-[10px] px-1 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12"
                                      onClick={() => onMoveDownRetryCompareQueueItem(item.id)}
                                    >
                                      ↓
                                    </button>
                                  )}
                                  {onDemoteRetryCompareQueueItem && (
                                    <button
                                      type="button"
                                      aria-label={`queue-demote-${idx + 1}`}
                                      className="text-[10px] px-1 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12"
                                      onClick={() => onDemoteRetryCompareQueueItem(item.id)}
                                    >
                                      맨뒤
                                    </button>
                                  )}
                                  {onRemoveRetryCompareQueueItem && (
                                    <button
                                      type="button"
                                      aria-label={`queue-remove-${idx + 1}`}
                                      className="text-[10px] px-1 py-0.5 rounded border border-rose-300/30 text-rose-200 hover:bg-rose-300/12"
                                      onClick={() => onRemoveRetryCompareQueueItem(item.id)}
                                    >
                                      제거
                                    </button>
                                  )}
                                </div>
                              ))}
                              {filteredQueueItems.length === 0 && (
                                <div className="text-[10px] text-white/45 px-1 py-1">큐 검색 결과가 없습니다.</div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <div className="max-h-72 overflow-y-auto p-2 space-y-1.5">
                      {timelineFiltered.map(({ block, compare }) => (
                        <div
                          key={block.id}
                          className="rounded border border-white/10 bg-white/[0.02] px-2 py-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              aria-label={`${block.command} 선택`}
                              checked={timelineSelectedIds.has(block.id)}
                              onChange={() => toggleTimelineSelection(block.id)}
                              className="size-3 accent-cyan-300"
                            />
                            <div className="text-[10px] text-white/80 font-mono truncate">
                              $ {block.command}
                            </div>
                            {timelinePinnedIds.has(block.id) && (
                              <span className="text-[9px] px-1 py-0.5 rounded border border-amber-300/30 bg-amber-300/14 text-amber-100">
                                PIN
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] text-cyan-200/90 tabular-nums">
                            Δ +{compare.added}/-{compare.removed}
                            <span className="ml-1.5 text-white/45">
                              {new Date(compare.comparedAt).toLocaleTimeString()}
                            </span>
                            <span className="ml-1.5">
                              <RiskBadge risk={classifyTimelineRisk(block.command)} />
                            </span>
                          </div>
                          {compare.preview && (
                            <div className="mt-0.5 text-[10px] text-white/50 truncate">{compare.preview}</div>
                          )}
                          <div className="mt-1 flex items-center gap-1.5">
                            <button
                              type="button"
                              className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08]"
                              onClick={() => {
                                setExpanded((prev) => {
                                  const next = new Set(prev);
                                  next.add(block.id);
                                  return next;
                                });
                                setDeltaOpenId(block.id);
                                setTimelineOpen(false);
                              }}
                            >
                              Jump
                            </button>
                            {onExecute && block.command.trim() && (
                              <button
                                type="button"
                                className="text-[10px] px-2 py-0.5 rounded border border-emerald-300/30 text-emerald-200 hover:bg-emerald-300/12"
                                onClick={() => {
                                  onExecute(block.command + "\r");
                                  setTimelineOpen(false);
                                }}
                              >
                                Run
                              </button>
                            )}
                            {onRetryWithDiff && (
                              <button
                                type="button"
                                className="text-[10px] px-2 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12"
                                onClick={() => {
                                  onRetryWithDiff(block);
                                  setTimelineOpen(false);
                                }}
                              >
                                Retry+Compare
                              </button>
                            )}
                            <button
                              type="button"
                              className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08]"
                              onClick={() => {
                                navigator.clipboard.writeText(buildDiffText(block.command, compare)).catch(() => {});
                              }}
                            >
                              Copy
                            </button>
                            {onExplainDiff && (
                              <button
                                type="button"
                                className="text-[10px] px-2 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12"
                                onClick={() => {
                                  onExplainDiff(buildDiffText(block.command, compare));
                                }}
                              >
                                AI 해석
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {timelineFiltered.length === 0 && (
                        <div className="text-[10px] text-white/50 px-1 py-1">검색 결과가 없습니다.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigateCompared(-1)}
                title="Cmd/Ctrl+Shift+["
                className="text-[10px] px-2 py-0.5 rounded border border-cyan-400/30 text-cyan-200/90 hover:bg-cyan-400/15"
              >
                Prev Δ
              </button>
              <button
                type="button"
                onClick={() => navigateCompared(1)}
                title="Cmd/Ctrl+Shift+]"
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
                    ref={(el) => { deltaButtonRefs.current[b.id] = el; }}
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
                      ref={deltaPopoverRef}
                      className="absolute right-0 top-6 z-30 w-[360px] rounded-lg border border-cyan-300/25 bg-[#0b131d]/97 shadow-2xl overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-2.5 py-1.5 border-b border-white/10 text-[10px] text-cyan-200 tabular-nums">
                        Retry Compare · +{compare.added} / -{compare.removed}
                      </div>
                      <div className="px-2 py-1.5 border-b border-white/10 flex items-center gap-1.5">
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/75 hover:bg-white/[0.08]"
                          onClick={() => {
                            navigator.clipboard.writeText(buildDiffText(b.command, compare)).catch(() => {});
                          }}
                        >
                          Copy Diff
                        </button>
                        {onExplainDiff && (
                          <button
                            type="button"
                            className="text-[10px] px-2 py-0.5 rounded border border-cyan-300/30 text-cyan-200 hover:bg-cyan-300/12"
                            onClick={() => {
                              onExplainDiff(buildDiffText(b.command, compare));
                            }}
                          >
                            AI 해석
                          </button>
                        )}
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
  title?: string;
  tone?: "neutral" | "danger" | "success" | "info";
}> = ({ active, onClick, label, title, tone = "neutral" }) => {
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
      title={title}
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

const RiskChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  tone: "all" | TimelineRisk;
  title?: string;
}> = ({ active, onClick, label, tone, title }) => {
  const activeClass =
    tone === "high"
      ? "bg-rose-400/20 border-rose-400/40 text-rose-200"
      : tone === "medium"
        ? "bg-amber-400/20 border-amber-400/40 text-amber-200"
        : tone === "low"
          ? "bg-emerald-400/20 border-emerald-400/40 text-emerald-200"
          : "bg-white/15 border-white/35 text-white/88";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-0.5 rounded text-[10px] border ${active ? activeClass : "border-white/14 text-white/50 hover:bg-white/[0.08]"}`}
    >
      {label}
    </button>
  );
};

const RiskBadge: React.FC<{ risk: TimelineRisk }> = ({ risk }) => {
  const cls = risk === "high"
    ? "border-rose-400/35 bg-rose-400/14 text-rose-100"
    : risk === "medium"
      ? "border-amber-400/35 bg-amber-400/14 text-amber-100"
      : "border-emerald-400/35 bg-emerald-400/14 text-emerald-100";
  const label = risk === "high" ? "HIGH" : risk === "medium" ? "MED" : "LOW";
  return <span className={`text-[9px] px-1 py-0.5 rounded border ${cls}`}>{label}</span>;
};

export default WarpListView;
