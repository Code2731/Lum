import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Copy, TerminalSquare, Search, MoreHorizontal, Share2, RotateCcw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { tokenizeShell, TOKEN_COLORS } from "../utils/shellSyntax";
import { isTextInputTarget } from "../utils/event";
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
  const MENU_WIDTH = 224;
  const MENU_ITEM_HEIGHT = 34;
  const MENU_VERTICAL_GAP = 8;
  const VIEWPORT_GAP = 8;
  const getViewportSize = () => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 720 : window.innerHeight,
  });
  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "failed" | "success" | "compared">("all");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuActiveIndex, setMenuActiveIndex] = useState(0);
  const [menuPlacement, setMenuPlacement] = useState<"down" | "up">("down");
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [timelinePanelPosition, setTimelinePanelPosition] = useState({ x: 0, y: 0 });
  const [timelinePanelPlacement, setTimelinePanelPlacement] = useState<"down" | "up">("down");
  const [deltaPanelPosition, setDeltaPanelPosition] = useState({ x: 0, y: 0 });
  const [deltaPanelPlacement, setDeltaPanelPlacement] = useState<"down" | "up">("down");
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
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const menuItemRefs = useRef<Record<string, (HTMLButtonElement | null)[]>>({});
  const menuResizeObserverRef = useRef<ResizeObserver | null>(null);
  const deltaPopoverRef = useRef<HTMLDivElement | null>(null);
  const timelineButtonRef = useRef<HTMLButtonElement | null>(null);
  const timelinePanelRef = useRef<HTMLDivElement | null>(null);
  const timelineSearchInputRef = useRef<HTMLInputElement | null>(null);
  const queueSearchInputRef = useRef<HTMLInputElement | null>(null);
  const timelineRestoreFocusRef = useRef(false);
  const deltaRestoreFocusRef = useRef(false);
  const deltaRestoreFocusIdRef = useRef<string | null>(null);

  const getMenuItemCount = () => (onRetryWithDiff ? 4 : 3);
  const updateMenuPosition = React.useCallback((id: string) => {
    const trigger = menuButtonRefs.current[id];
    const triggerRect = trigger?.getBoundingClientRect();
    if (!triggerRect) return;

    const menuRect = menuContainerRefs.current[id]?.getBoundingClientRect();
    const menuHeight = menuRect?.height && Number.isFinite(menuRect.height) && menuRect.height > 0
      ? menuRect.height
      : MENU_ITEM_HEIGHT * getMenuItemCount();
    const menuWidth = menuRect?.width && Number.isFinite(menuRect.width) && menuRect.width > 0
      ? menuRect.width
      : MENU_WIDTH;

    const viewport = getViewportSize();
    const spaceBelow = viewport.height - triggerRect.bottom - MENU_VERTICAL_GAP - VIEWPORT_GAP;
    const spaceAbove = triggerRect.top - MENU_VERTICAL_GAP - VIEWPORT_GAP;
    const canOpenBelow = spaceBelow >= menuHeight;
    const canOpenAbove = spaceAbove >= menuHeight;

    const nextPlacement: "down" | "up" = canOpenBelow && canOpenAbove
      ? (spaceBelow >= spaceAbove ? "down" : "up")
      : canOpenAbove
        ? "up"
        : canOpenBelow
          ? "down"
          : spaceBelow >= spaceAbove ? "down" : "up";

    const nextY = nextPlacement === "down"
      ? triggerRect.bottom + MENU_VERTICAL_GAP
      : triggerRect.top - menuHeight - MENU_VERTICAL_GAP;
    const nextX = triggerRect.right - menuWidth;
    const maxTop = Math.max(VIEWPORT_GAP, viewport.height - menuHeight - VIEWPORT_GAP);
    const maxLeft = Math.max(VIEWPORT_GAP, viewport.width - menuWidth - VIEWPORT_GAP);

    const nextPosition = {
      x: clamp(nextX, VIEWPORT_GAP, maxLeft),
      y: clamp(nextY, VIEWPORT_GAP, maxTop),
    };
    setMenuPosition((prev) =>
      prev.x === nextPosition.x && prev.y === nextPosition.y ? prev : nextPosition,
    );
    setMenuPlacement((prev) => (prev === nextPlacement ? prev : nextPlacement));
  }, [MENU_ITEM_HEIGHT, MENU_WIDTH, MENU_VERTICAL_GAP, VIEWPORT_GAP, getMenuItemCount]);

  const TIMELINE_PANEL_WIDTH = 440;
  const DELTA_PANEL_WIDTH = 360;
  const DELTA_PANEL_FALLBACK_HEIGHT = 240;
  const updateTimelinePanelPosition = React.useCallback(() => {
    if (!timelineOpen) return;

    const timelineButtonRect = timelineButtonRef.current?.getBoundingClientRect();
    if (!timelineButtonRect) return;

    const timelinePanelRect = timelinePanelRef.current?.getBoundingClientRect();
    const timelinePanelHeight = timelinePanelRect?.height && Number.isFinite(timelinePanelRect.height) && timelinePanelRect.height > 0
      ? timelinePanelRect.height
      : DELTA_PANEL_FALLBACK_HEIGHT;
    const timelinePanelWidth = timelinePanelRect?.width && Number.isFinite(timelinePanelRect.width) && timelinePanelRect.width > 0
      ? timelinePanelRect.width
      : TIMELINE_PANEL_WIDTH;

    const viewport = getViewportSize();
    const spaceBelow = viewport.height - timelineButtonRect.bottom - MENU_VERTICAL_GAP - VIEWPORT_GAP;
    const spaceAbove = timelineButtonRect.top - MENU_VERTICAL_GAP - VIEWPORT_GAP;
    const canOpenBelow = spaceBelow >= timelinePanelHeight;
    const canOpenAbove = spaceAbove >= timelinePanelHeight;

    const nextPlacement: "down" | "up" = canOpenBelow && canOpenAbove
      ? (spaceBelow >= spaceAbove ? "down" : "up")
      : canOpenAbove
        ? "up"
        : canOpenBelow
          ? "down"
          : spaceBelow >= spaceAbove ? "down" : "up";

    const nextY = nextPlacement === "down"
      ? timelineButtonRect.bottom + MENU_VERTICAL_GAP
      : timelineButtonRect.top - timelinePanelHeight - MENU_VERTICAL_GAP;
    const nextX = timelineButtonRect.left;
    const maxTop = Math.max(VIEWPORT_GAP, viewport.height - timelinePanelHeight - VIEWPORT_GAP);
    const maxLeft = Math.max(VIEWPORT_GAP, viewport.width - timelinePanelWidth - VIEWPORT_GAP);

    const nextPosition = {
      x: clamp(nextX, VIEWPORT_GAP, maxLeft),
      y: clamp(nextY, VIEWPORT_GAP, maxTop),
    };

    setTimelinePanelPosition((prev) => (
      prev.x === nextPosition.x && prev.y === nextPosition.y ? prev : nextPosition
    ));
    setTimelinePanelPlacement((prev) => (prev === nextPlacement ? prev : nextPlacement));
  }, [DELTA_PANEL_FALLBACK_HEIGHT, TIMELINE_PANEL_WIDTH, MENU_VERTICAL_GAP, VIEWPORT_GAP, getViewportSize, clamp, timelineOpen]);

  const updateDeltaPanelPosition = React.useCallback(() => {
    if (!deltaOpenId) return;

    const deltaButtonRect = deltaButtonRefs.current[deltaOpenId]?.getBoundingClientRect();
    if (!deltaButtonRect) return;

    const deltaPanelRect = deltaPopoverRef.current?.getBoundingClientRect();
    const deltaPanelHeight = deltaPanelRect?.height && Number.isFinite(deltaPanelRect.height) && deltaPanelRect.height > 0
      ? deltaPanelRect.height
      : DELTA_PANEL_FALLBACK_HEIGHT;
    const deltaPanelWidth = deltaPanelRect?.width && Number.isFinite(deltaPanelRect.width) && deltaPanelRect.width > 0
      ? deltaPanelRect.width
      : DELTA_PANEL_WIDTH;

    const viewport = getViewportSize();
    const spaceBelow = viewport.height - deltaButtonRect.bottom - MENU_VERTICAL_GAP - VIEWPORT_GAP;
    const spaceAbove = deltaButtonRect.top - MENU_VERTICAL_GAP - VIEWPORT_GAP;
    const canOpenBelow = spaceBelow >= deltaPanelHeight;
    const canOpenAbove = spaceAbove >= deltaPanelHeight;

    const nextPlacement: "down" | "up" = canOpenBelow && canOpenAbove
      ? (spaceBelow >= spaceAbove ? "down" : "up")
      : canOpenAbove
        ? "up"
        : canOpenBelow
          ? "down"
          : spaceBelow >= spaceAbove ? "down" : "up";

    const nextY = nextPlacement === "down"
      ? deltaButtonRect.bottom + MENU_VERTICAL_GAP
      : deltaButtonRect.top - deltaPanelHeight - MENU_VERTICAL_GAP;
    const nextX = deltaButtonRect.right - deltaPanelWidth;
    const maxTop = Math.max(VIEWPORT_GAP, viewport.height - deltaPanelHeight - VIEWPORT_GAP);
    const maxLeft = Math.max(VIEWPORT_GAP, viewport.width - deltaPanelWidth - VIEWPORT_GAP);

    const nextPosition = {
      x: clamp(nextX, VIEWPORT_GAP, maxLeft),
      y: clamp(nextY, VIEWPORT_GAP, maxTop),
    };

    setDeltaPanelPosition((prev) => (
      prev.x === nextPosition.x && prev.y === nextPosition.y ? prev : nextPosition
    ));
    setDeltaPanelPlacement((prev) => (prev === nextPlacement ? prev : nextPlacement));
  }, [DELTA_PANEL_WIDTH, DELTA_PANEL_FALLBACK_HEIGHT, MENU_VERTICAL_GAP, VIEWPORT_GAP, getViewportSize, clamp, deltaOpenId]);

  const closeTimelinePanel = (restoreFocus: boolean) => {
    timelineRestoreFocusRef.current = restoreFocus;
    setTimelineOpen(false);
  };
  const closeDeltaPopover = (restoreFocus: boolean, id?: string | null) => {
    if (restoreFocus) {
      deltaRestoreFocusRef.current = true;
      if (id || deltaOpenId) {
        deltaRestoreFocusIdRef.current = id ?? deltaOpenId;
      } else {
        deltaRestoreFocusIdRef.current = null;
      }
    } else {
      deltaRestoreFocusRef.current = false;
      deltaRestoreFocusIdRef.current = null;
    }
    setDeltaOpenId(null);
  };
  const toggleDeltaPopover = (id: string) => {
    setDeltaOpenId((prev) => {
      if (prev === id) {
        closeDeltaPopover(true, id);
        return null;
      }
      deltaRestoreFocusRef.current = false;
      deltaRestoreFocusIdRef.current = null;
      return id;
    });
  };
  const toggleTimelinePanel = () => {
    setTimelineOpen((prev) => {
      if (prev) {
        timelineRestoreFocusRef.current = true;
        return false;
      }
      timelineRestoreFocusRef.current = false;
      return true;
    });
  };

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
    if (deltaOpenId) return;
    if (!deltaRestoreFocusRef.current) return;
    const timer = setTimeout(() => {
      const id = deltaRestoreFocusIdRef.current;
      if (id) {
        deltaButtonRefs.current[id]?.focus();
      }
      deltaRestoreFocusRef.current = false;
      deltaRestoreFocusIdRef.current = null;
    }, 0);
    return () => clearTimeout(timer);
  }, [deltaOpenId]);

  useEffect(() => {
    if (!deltaOpenId) return;
    if (!filtered.some((b) => b.id === deltaOpenId)) {
      closeDeltaPopover(false, deltaOpenId);
    }
  }, [deltaOpenId, filtered]);
  useEffect(() => {
    if (comparedCount > 0) return;
    closeTimelinePanel(false);
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

  const closeMenuById = (id: string | null, restoreFocus: boolean) => {
    setMenuOpenId(null);
    setMenuActiveIndex(0);
    if (id) {
      menuItemRefs.current[id] = [];
    }
    if (!restoreFocus || !id) return;
    setTimeout(() => {
      menuButtonRefs.current[id]?.focus();
    }, 0);
  };

  const setMenuItemRef = (id: string, index: number, el: HTMLButtonElement | null) => {
    const expectedCount = getMenuItemCount();
    const arr = menuItemRefs.current[id] ?? [];
    if (arr.length > expectedCount) {
      arr.length = expectedCount;
    }
    arr[index] = el;
    while (arr.length < expectedCount) arr.push(null);
    menuItemRefs.current[id] = arr;
  };

  const triggerMenuShortcut = (id: string, index: number) => {
    const item = menuItemRefs.current[id]?.[index];
    if (!item) return false;
    item.click();
    return true;
  };

  const openFindWithin = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    closeMenuById(id, false);
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
  const isTypingTarget = isTextInputTarget;
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
  useEffect(() => {
    if (!menuOpenId) return;
    const arr = menuItemRefs.current[menuOpenId] ?? [];
    const expectedCount = getMenuItemCount();
    if (arr.length > expectedCount) {
      arr.length = expectedCount;
    }
    while (arr.length < expectedCount) arr.push(null);
    menuItemRefs.current[menuOpenId] = arr;
  }, [menuOpenId, onRetryWithDiff]);

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
  const pinFilteredTimeline = () => {
    if (timelineFiltered.length === 0) return;
    setTimelinePinnedIds((prev) => {
      const next = new Set(prev);
      for (const item of timelineFiltered) next.add(item.block.id);
      return next;
    });
  };
  const unpinFilteredTimeline = () => {
    if (timelineFiltered.length === 0) return;
    setTimelinePinnedIds((prev) => {
      const next = new Set(prev);
      for (const item of timelineFiltered) next.delete(item.block.id);
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
      if (!mod || !e.shiftKey || e.altKey) return;
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
      if (!mod || !e.shiftKey || e.altKey) return;
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
      if (!mod || !e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "y") return;
      if (isTypingTarget(e.target)) return;
      if (comparedCount === 0) return;
      e.preventDefault();
      toggleTimelinePanel();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [comparedCount]);

  useEffect(() => {
    if (!deltaOpenId) return;
    const updatePosition = () => updateDeltaPanelPosition();
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      closeDeltaPopover(true, deltaOpenId);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (deltaPopoverRef.current?.contains(target)) return;
      if (deltaButtonRefs.current[deltaOpenId]?.contains(target)) return;
      closeDeltaPopover(false, deltaOpenId);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { capture: true });
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, { capture: true });
    };
  }, [deltaOpenId, updateDeltaPanelPosition]);

  React.useLayoutEffect(() => {
    if (!deltaOpenId) return;
    updateDeltaPanelPosition();
  }, [deltaOpenId, updateDeltaPanelPosition]);

  useEffect(() => {
    if (!menuOpenId) return;
    const updatePosition = () => updateMenuPosition(menuOpenId);

    const onWindowKeyDown = (e: KeyboardEvent) => {
      const currentMenuItems = menuItemRefs.current[menuOpenId] ?? [];
      const last = Math.max(0, currentMenuItems.length - 1);
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenuById(menuOpenId, true);
        return;
      }
      if (e.altKey) {
        const key = e.key.toLowerCase();
        let handled = false;
        if (key === "c") handled = triggerMenuShortcut(menuOpenId, 0);
        if (key === "f") handled = triggerMenuShortcut(menuOpenId, 1);
        if (key === "s") handled = triggerMenuShortcut(menuOpenId, 2);
        if (key === "r" && onRetryWithDiff) handled = triggerMenuShortcut(menuOpenId, 3);
        if (handled) {
          e.preventDefault();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuActiveIndex((prev) => {
          const next = prev >= last ? 0 : prev + 1;
          currentMenuItems[next]?.focus();
          return next;
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuActiveIndex((prev) => {
          const next = prev <= 0 ? last : prev - 1;
          currentMenuItems[next]?.focus();
          return next;
        });
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        currentMenuItems[0]?.focus();
        setMenuActiveIndex(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        currentMenuItems[last]?.focus();
        setMenuActiveIndex(last);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        currentMenuItems[menuActiveIndex]?.click();
        return;
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const menuButton = menuButtonRefs.current[menuOpenId];
      const menuContainer = menuContainerRefs.current[menuOpenId];
      if (menuButton?.contains(target)) return;
      if (menuContainer?.contains(target)) return;
      closeMenuById(menuOpenId, false);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { capture: true });
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, { capture: true });
    };
  }, [menuOpenId, onRetryWithDiff, updateMenuPosition]);

  React.useLayoutEffect(() => {
    if (!menuOpenId) return;
    updateMenuPosition(menuOpenId);
    requestAnimationFrame(() => {
      updateMenuPosition(menuOpenId);
    });
  }, [menuOpenId, updateMenuPosition]);

  useEffect(() => {
    const menuEl = menuOpenId ? menuContainerRefs.current[menuOpenId] : null;
    const observer = menuResizeObserverRef.current;
    observer?.disconnect();
    menuResizeObserverRef.current = null;

    if (!menuOpenId || !menuEl || typeof ResizeObserver === "undefined") {
      return;
    }

    const next = new ResizeObserver(() => {
      updateMenuPosition(menuOpenId);
    });
    next.observe(menuEl);
    menuResizeObserverRef.current = next;

    return () => {
      next.disconnect();
      if (menuResizeObserverRef.current === next) {
        menuResizeObserverRef.current = null;
      }
    };
  }, [menuOpenId, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpenId) {
      setMenuActiveIndex(0);
      return;
    }
    const activeItem = menuItemRefs.current[menuOpenId]?.[0];
    setMenuActiveIndex(0);
    activeItem?.focus();
  }, [menuOpenId]);

  useEffect(() => {
    if (!menuOpenId) return;
    if (!filtered.some((b) => b.id === menuOpenId)) {
      closeMenuById(menuOpenId, false);
    }
  }, [menuOpenId, filtered]);
  useEffect(() => {
    if (timelineOpen) {
      timelineRestoreFocusRef.current = false;
      const timer = setTimeout(() => {
        timelineSearchInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!timelineRestoreFocusRef.current) return;
    const timer = setTimeout(() => {
      timelineButtonRef.current?.focus();
      timelineRestoreFocusRef.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [timelineOpen]);
  useEffect(() => {
    if (!timelineOpen) return;
    const updatePosition = () => updateTimelinePanelPosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { capture: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, { capture: true });
    };
  }, [timelineOpen, updateTimelinePanelPosition]);
  React.useLayoutEffect(() => {
    if (!timelineOpen) return;
    updateTimelinePanelPosition();
  }, [timelineOpen, updateTimelinePanelPosition]);
  useEffect(() => {
    if (!timelineOpen) return;
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const isRedoKey = (e.altKey && e.shiftKey && !mod) || (mod && e.shiftKey && !e.altKey);
      const isUndoKey = (e.altKey && !mod) || (mod && !e.altKey);
      if (isRedoKey && key === "z") {
        if (onRedoRetryCompareQueueChange && canRedoRetryCompareQueueChange) {
          e.preventDefault();
          onRedoRetryCompareQueueChange();
        }
        return;
      }
      if (isUndoKey && key === "z") {
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
      if (e.altKey && !mod && key === "q") {
        if (queueSearchInputRef.current) {
          e.preventDefault();
          queueSearchInputRef.current.focus();
        }
        return;
      }
      if (mod && !e.altKey && (e.key === "/" || e.code === "Slash")) {
        e.preventDefault();
        setShowShortcutHelp((prev) => !prev);
        return;
      }
      if (e.altKey && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        setShowShortcutHelp((prev) => !prev);
        return;
      }
      if (e.altKey && key === "f") {
        if (timelineSearchInputRef.current) {
          e.preventDefault();
          timelineSearchInputRef.current.focus();
        }
        return;
      }
      if (mod && !e.shiftKey && key === "f") {
        if (timelineSearchInputRef.current) {
          e.preventDefault();
          timelineSearchInputRef.current.focus();
        }
        return;
      }
      if (e.altKey && !mod && key === "k") {
        if (retryCompareQueueItems.length > 0) {
          e.preventDefault();
          setQueuePanelCollapsed((prev) => !prev);
        }
        return;
      }
      if (e.altKey && !mod && key === "r") {
        if (timelineViewCustomized) {
          e.preventDefault();
          resetTimelineViewFilters();
        }
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && key === "r") {
        if (timelineViewCustomized) {
          e.preventDefault();
          resetTimelineViewFilters();
        }
        return;
      }
      if (e.altKey && !mod && key === "a") {
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
      if (mod && !e.altKey && key === "a") {
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
      if (e.altKey && !mod && key === "c") {
        if (e.shiftKey) {
          if (timelineFiltered.length > 0) {
            e.preventDefault();
            navigator.clipboard.writeText(buildAllDiffsText(timelineFiltered)).catch(() => {});
          }
          return;
        }
        if (selectedTimelineItems.length > 0) {
          e.preventDefault();
          navigator.clipboard.writeText(buildAllDiffsText(selectedTimelineItems)).catch(() => {});
        }
        return;
      }
      if (mod && !e.altKey && key === "c") {
        if (e.shiftKey) {
          if (timelineFiltered.length > 0) {
            e.preventDefault();
            navigator.clipboard.writeText(buildAllDiffsText(timelineFiltered)).catch(() => {});
          }
          return;
        }
        if (selectedTimelineItems.length > 0) {
          e.preventDefault();
          navigator.clipboard.writeText(buildAllDiffsText(selectedTimelineItems)).catch(() => {});
        }
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && key === "k") {
        if (onClearCompareResults) {
          e.preventDefault();
          onClearCompareResults();
          closeDeltaPopover(false);
          setTimelineSelectedIds(new Set());
          closeTimelinePanel(true);
        }
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && key === "l") {
        if (timelineQuery.trim() !== "") {
          e.preventDefault();
          setTimelineQuery("");
          return;
        }
        if (timelineSearchInputRef.current) {
          e.preventDefault();
          timelineSearchInputRef.current.focus();
        }
        return;
      }
      if (mod && !e.altKey && e.key === "Enter") {
        if (selectedTimelineIds.length > 0) {
          e.preventDefault();
          navigateSelectedTimeline(e.shiftKey ? -1 : 1);
        }
        return;
      }
      if (e.altKey && key === "s") {
        if (comparedTimeline.length > 0) {
          e.preventDefault();
          setTimelineSortMode((prev) => (prev === "recent" ? "delta" : "recent"));
        }
        return;
      }
      if (
        ((e.altKey && !mod) || (mod && !e.altKey))
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
      if (e.altKey && !mod && key === "i") {
        if (timelineFiltered.length > 0) {
          e.preventDefault();
          invertTimelineFilteredSelection();
        }
        return;
      }
      if (e.altKey && !e.shiftKey && (key === "o" || e.code === "KeyO")) {
        if (selectedTimelineIds.length > 0) {
          e.preventDefault();
          toggleTimelineSelectedOnly();
        }
        return;
      }
      if (e.altKey && key === "h") {
        if (timelineFiltered.length > 0) {
          e.preventDefault();
          selectHighRiskTimelineFiltered();
        }
        return;
      }
      if (e.altKey && !mod && key === "j") {
        if (e.shiftKey) {
          if (selectedTimelineIds.length > 0) {
            e.preventDefault();
            unpinSelectedTimeline();
          }
          return;
        }
        if (selectedTimelineIds.length > 0) {
          e.preventDefault();
          pinSelectedTimeline();
        }
        return;
      }
      if (mod && !e.altKey && key === "j") {
        if (e.shiftKey) {
          if (selectedTimelineIds.length > 0) {
            e.preventDefault();
            unpinSelectedTimeline();
          }
          return;
        }
        if (selectedTimelineIds.length > 0) {
          e.preventDefault();
          pinSelectedTimeline();
        }
        return;
      }
      if (e.altKey && !mod && e.shiftKey && key === "u") {
        if (timelinePinnedIds.size > 0) {
          e.preventDefault();
          clearPinnedTimeline();
        }
        return;
      }
      if (mod && !e.altKey && e.shiftKey && key === "u") {
        if (timelinePinnedIds.size > 0) {
          e.preventDefault();
          clearPinnedTimeline();
        }
        return;
      }
      if (e.altKey && !mod && key === "m") {
        if (timelinePinnedIds.size > 0) {
          e.preventDefault();
          setTimelinePinnedOnly((prev) => !prev);
        }
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && key === "m") {
        if (timelinePinnedIds.size > 0) {
          e.preventDefault();
          setTimelinePinnedOnly((prev) => !prev);
        }
        return;
      }
      if (e.altKey && !mod && e.shiftKey && key === "p") {
        if (timelineFiltered.length > 0) {
          e.preventDefault();
          pinFilteredTimeline();
        }
        return;
      }
      if (e.altKey && !mod && e.shiftKey && key === "o") {
        if (timelineFiltered.length > 0) {
          e.preventDefault();
          unpinFilteredTimeline();
        }
        return;
      }
      if (mod && !e.altKey && e.shiftKey && key === "p") {
        if (timelineFiltered.length > 0) {
          e.preventDefault();
          pinFilteredTimeline();
        }
        return;
      }
      if (mod && !e.altKey && e.shiftKey && key === "o") {
        if (timelineFiltered.length > 0) {
          e.preventDefault();
          unpinFilteredTimeline();
        }
        return;
      }
      if (e.altKey && !mod && key === "d") {
        if (onResetRetryCompareCompletedCount) {
          e.preventDefault();
          onResetRetryCompareCompletedCount();
        }
        return;
      }
      if (e.altKey && !mod && key === "p") {
        if (onToggleRetryCompareQueuePaused) {
          e.preventDefault();
          onToggleRetryCompareQueuePaused();
        }
        return;
      }
      if (e.altKey && !mod && e.key === "ArrowUp") {
        e.preventDefault();
        navigateSelectedTimeline(-1);
        return;
      }
      if (e.altKey && !mod && e.key === "ArrowDown") {
        e.preventDefault();
        navigateSelectedTimeline(1);
        return;
      }
      if (e.altKey && !mod && e.key === "Enter") {
        e.preventDefault();
        navigateSelectedTimeline(1);
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      closeTimelinePanel(true);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (timelinePanelRef.current?.contains(target)) return;
      if (timelineButtonRef.current?.contains(target)) return;
      closeTimelinePanel(false);
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
    timelineSelectedIds.size,
    timelineQuery,
    timelineFiltered,
    selectedTimelineItems,
    selectAllTimelineFiltered,
    clearTimelineSelection,
    invertTimelineFilteredSelection,
    toggleTimelineSelectedOnly,
    selectHighRiskTimelineFiltered,
    resetTimelineViewFilters,
    timelinePinnedIds.size,
    clearPinnedTimeline,
    pinSelectedTimeline,
    unpinSelectedTimeline,
    pinFilteredTimeline,
    unpinFilteredTimeline,
    onClearCompareResults,
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
                  onClick={toggleTimelinePanel}
                  title="Cmd/Ctrl+Shift+Y"
                  className="text-[10px] px-2 py-0.5 rounded border border-cyan-400/30 text-cyan-200/90 hover:bg-cyan-400/15"
                >
                  Δ Timeline ({comparedCount})
                </button>
                {timelineOpen && (
                  (typeof document === "undefined"
                    ? null
                    : createPortal(
                        <div
                          ref={timelinePanelRef}
                          className={`fixed z-30 w-[440px] rounded-lg border border-cyan-300/25 bg-[#0b131d]/97 shadow-2xl overflow-hidden ${
                            timelinePanelPlacement === "up" ? "origin-bottom-right" : "origin-top-right"
                          }`}
                          style={{
                            left: timelinePanelPosition.x,
                            top: timelinePanelPosition.y,
                          }}
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
                          title="Alt+/ / Cmd/Ctrl+/"
                        >
                          Shortcuts
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-white/15 text-white/70 hover:bg-white/[0.08] disabled:opacity-40"
                          onClick={resetTimelineViewFilters}
                          disabled={!timelineViewCustomized}
                          title="Alt+R / Cmd/Ctrl+R"
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
                          title="Alt+J"
                        >
                          핀 선택
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/12 disabled:opacity-40"
                          onClick={unpinSelectedTimeline}
                          disabled={timelineSelectedIds.size === 0}
                          title="Alt+Shift+J"
                        >
                          핀 해제
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/12 disabled:opacity-40"
                          onClick={pinFilteredTimeline}
                          title="Alt+Shift+P / Cmd/Ctrl+Shift+P"
                          disabled={timelineFiltered.length === 0}
                        >
                          필터 핀
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/12 disabled:opacity-40"
                          onClick={unpinFilteredTimeline}
                          title="Alt+Shift+O / Cmd/Ctrl+Shift+O"
                          disabled={timelineFiltered.length === 0}
                        >
                          필터 핀해제
                        </button>
                        <button
                          type="button"
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                            timelinePinnedOnly
                              ? "border-amber-300/45 bg-amber-300/18 text-amber-100"
                              : "border-white/15 text-white/70 hover:bg-white/[0.08]"
                          }`}
                          onClick={() => setTimelinePinnedOnly((prev) => !prev)}
                          title="Alt+M / Cmd/Ctrl+M"
                          disabled={timelinePinnedIds.size === 0}
                        >
                          핀만
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/12 disabled:opacity-40"
                          onClick={clearPinnedTimeline}
                          title="Alt+Shift+U / Cmd/Ctrl+Shift+U"
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
                              closeTimelinePanel(false);
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
                              closeTimelinePanel(false);
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
                              closeDeltaPopover(false);
                              setTimelineSelectedIds(new Set());
                              closeTimelinePanel(true);
                            }}
                            title="Cmd/Ctrl+K"
                          >
                            비교 초기화
                          </button>
                        )}
                      </div>
                      {showShortcutHelp && (
                        <div className="rounded border border-cyan-300/20 bg-cyan-400/[0.08] px-2 py-1.5 text-[10px] text-cyan-100/90 space-y-0.5">
                          <div><span className="text-cyan-50">Cmd/Ctrl+Shift+Y</span> 타임라인 열기/닫기</div>
                          <div><span className="text-cyan-50">Alt+Enter / Alt+↑ / Alt+↓</span> 선택 Jump/이동</div>
                          <div><span className="text-cyan-50">Alt+/ / Cmd/Ctrl+/</span> 단축키 도움말 토글</div>
                          <div><span className="text-cyan-50">Alt+F / Cmd/Ctrl+F</span> 타임라인 검색창 포커스</div>
                          <div><span className="text-cyan-50">Cmd/Ctrl+Enter / Cmd/Ctrl+Shift+Enter</span> 선택 항목 다음/이전 Jump</div>
                          <div><span className="text-cyan-50">Cmd/Ctrl+L</span> 타임라인 검색어 초기화/포커스</div>
                          <div><span className="text-cyan-50">Alt+R / Cmd/Ctrl+R</span> 타임라인 필터 상태 리셋</div>
                          <div><span className="text-cyan-50">Alt+A</span> 현재 목록 선택 전체</div>
                          <div><span className="text-cyan-50">Alt+Shift+A</span> 선택 항목 전체 해제</div>
                          <div><span className="text-cyan-50">Cmd/Ctrl+A / Cmd/Ctrl+Shift+A</span> 선택 전체/해제</div>
                          <div><span className="text-cyan-50">Alt+C / Alt+Shift+C</span> 선택/전체 diff 복사</div>
                          <div><span className="text-cyan-50">Cmd/Ctrl+C / Cmd/Ctrl+Shift+C</span> 선택/전체 diff 복사</div>
                          <div><span className="text-cyan-50">Cmd/Ctrl+K</span> 비교 결과 전체 초기화</div>
                          <div><span className="text-cyan-50">Alt+I</span> 현재 목록 선택 반전</div>
                          <div><span className="text-cyan-50">Alt+O</span> 선택 항목만 보기 토글</div>
                          <div><span className="text-cyan-50">Alt+H</span> 고위험 항목 빠른 선택</div>
                          <div><span className="text-cyan-50">Alt+1/2/3/0 / Cmd/Ctrl+1/2/3/0</span> 위험도 필터 High/Med/Low/All</div>
                          <div><span className="text-cyan-50">Alt+S</span> 타임라인 정렬 토글</div>
                          <div><span className="text-cyan-50">Alt+Shift+P/O / Cmd/Ctrl+Shift+P/O</span> 현재 목록 일괄 핀/핀해제</div>
                          <div><span className="text-cyan-50">Alt+M / Cmd/Ctrl+M</span> 핀만 보기 토글</div>
                          <div><span className="text-cyan-50">Alt+J / Alt+Shift+J / Cmd/Ctrl+J / Cmd/Ctrl+Shift+J</span> 선택 항목 핀/핀해제</div>
                          <div><span className="text-cyan-50">Alt+Shift+U / Cmd/Ctrl+Shift+U</span> 핀 전체 해제</div>
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
                                closeTimelinePanel(false);
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
                                  closeTimelinePanel(false);
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
                                  closeTimelinePanel(false);
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
                        </div>,
                        document.body,
                      ))
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
            className={`relative rounded-xl border ${
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
                      toggleDeltaPopover(b.id);
                    }}
                  >
                    Δ +{compare.added}/-{compare.removed}
                  </button>
                  {deltaOpenId === b.id && (
                    (typeof document === "undefined"
                      ? null
                      : createPortal(
                          <div
                            ref={deltaPopoverRef}
                            className={`fixed z-30 w-[360px] rounded-lg border border-cyan-300/25 bg-[#0b131d]/97 shadow-2xl overflow-hidden ${
                              deltaPanelPlacement === "up" ? "origin-bottom-right" : "origin-top-right"
                            }`}
                            style={{
                              left: deltaPanelPosition.x,
                              top: deltaPanelPosition.y,
                            }}
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
                          </div>,
                          document.body,
                        ))
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
                  ref={(el) => { menuButtonRefs.current[b.id] = el; }}
                  tooltip="블록 액션"
                  aria-label="블록 액션"
                  aria-haspopup="menu"
                  aria-expanded={menuOpenId === b.id}
                  aria-controls={`block-action-menu-${b.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId((prev) => (prev === b.id ? null : b.id));
                  }}
                  className={`opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${
                    menuOpenId === b.id ? "opacity-100" : ""
                  } p-0.5 rounded text-white/30 hover:text-white/70 focus-visible:ring-1 focus-visible:ring-cyan-300/55 transition-all shrink-0`}
                >
                  <MoreHorizontal size={10} />
                </IconButton>
                {menuOpenId === b.id && (
                  (typeof document === "undefined"
                    ? null
                    : createPortal(
                        <div
                          id={`block-action-menu-${b.id}`}
                          ref={(el) => { menuContainerRefs.current[b.id] = el; }}
                          role="menu"
                          aria-label="블록 액션 메뉴"
                          className={`fixed z-30 w-56 rounded-lg border border-white/10 bg-[#0f151f]/96 backdrop-blur-sm shadow-2xl overflow-hidden ${
                            menuPlacement === "up" ? "bottom-full mb-1" : "top-full mt-1"
                          }`}
                          style={{
                            left: menuPosition.x,
                            top: menuPosition.y,
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onBlurCapture={(e) => {
                            const next = e.relatedTarget as Node | null;
                            const menuContainer = menuContainerRefs.current[b.id];
                            const menuButton = menuButtonRefs.current[b.id];
                            if (next && (menuContainer?.contains(next) || menuButton?.contains(next))) return;
                            closeMenuById(b.id, false);
                          }}
                          onKeyDown={(e) => {
                            const currentMenuItems = menuItemRefs.current[b.id] ?? [];
                            const last = Math.max(0, currentMenuItems.length - 1);
                            if (e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              closeMenuById(b.id, true);
                              return;
                            }
                            if (e.key === "Tab") {
                              closeMenuById(b.id, false);
                              return;
                            }
                            if (e.altKey) {
                              const key = e.key.toLowerCase();
                              let handled = false;
                              if (key === "c") handled = triggerMenuShortcut(b.id, 0);
                              if (key === "f") handled = triggerMenuShortcut(b.id, 1);
                              if (key === "s") handled = triggerMenuShortcut(b.id, 2);
                              if (key === "r" && onRetryWithDiff) handled = triggerMenuShortcut(b.id, 3);
                              if (handled) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                              return;
                            }
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              e.stopPropagation();
                              const next = menuActiveIndex >= last ? 0 : menuActiveIndex + 1;
                              currentMenuItems[next]?.focus();
                              setMenuActiveIndex(next);
                              return;
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              e.stopPropagation();
                              const next = menuActiveIndex <= 0 ? last : menuActiveIndex - 1;
                              currentMenuItems[next]?.focus();
                              setMenuActiveIndex(next);
                              return;
                            }
                            if (e.key === "Home") {
                              e.preventDefault();
                              e.stopPropagation();
                              currentMenuItems[0]?.focus();
                              setMenuActiveIndex(0);
                              return;
                            }
                            if (e.key === "End") {
                              e.preventDefault();
                              e.stopPropagation();
                              currentMenuItems[last]?.focus();
                              setMenuActiveIndex(last);
                              return;
                            }
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              currentMenuItems[menuActiveIndex]?.click();
                              return;
                            }
                          }}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            aria-label="Copy Both (Alt+C)"
                            aria-keyshortcuts="Alt+C"
                            title="Alt+C"
                            className="w-full px-2.5 py-1.5 text-left text-[11px] text-white/78 hover:bg-white/[0.08] flex items-center justify-between gap-2"
                            tabIndex={menuOpenId === b.id && menuActiveIndex === 0 ? 0 : -1}
                            ref={(el) => {
                              setMenuItemRef(b.id, 0, el);
                            }}
                            onFocus={() => setMenuActiveIndex(0)}
                            onClick={() => {
                              navigator.clipboard.writeText(`$ ${b.command}\n${b.output.trim()}`).catch(() => {});
                              closeMenuById(b.id, false);
                            }}
                          >
                            <span>Copy Both</span>
                            <span className="text-[10px] text-white/35 tabular-nums">Alt+C</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            aria-label="Find Within Block (Alt+F)"
                            aria-keyshortcuts="Alt+F"
                            title="Alt+F"
                            className="w-full px-2.5 py-1.5 text-left text-[11px] text-white/78 hover:bg-white/[0.08] flex items-center justify-between gap-2"
                            tabIndex={menuOpenId === b.id && menuActiveIndex === 1 ? 0 : -1}
                            ref={(el) => {
                              setMenuItemRef(b.id, 1, el);
                            }}
                            onFocus={() => setMenuActiveIndex(1)}
                            onClick={() => openFindWithin(b.id)}
                          >
                            <span>Find Within Block</span>
                            <span className="text-[10px] text-white/35 tabular-nums">Alt+F</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            aria-label="Share Snapshot (Alt+S)"
                            aria-keyshortcuts="Alt+S"
                            title="Alt+S"
                            className="w-full px-2.5 py-1.5 text-left text-[11px] text-white/78 hover:bg-white/[0.08] flex items-center justify-between gap-2"
                            tabIndex={menuOpenId === b.id && menuActiveIndex === 2 ? 0 : -1}
                            ref={(el) => {
                              setMenuItemRef(b.id, 2, el);
                            }}
                            onFocus={() => setMenuActiveIndex(2)}
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
                              closeMenuById(b.id, false);
                            }}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Share2 size={11} />
                              Share Snapshot
                            </span>
                            <span className="text-[10px] text-white/35 tabular-nums">Alt+S</span>
                          </button>
                          {onRetryWithDiff && (
                            <button
                              type="button"
                              role="menuitem"
                              aria-label="Retry and Compare (Alt+R)"
                              aria-keyshortcuts="Alt+R"
                              title="Alt+R"
                              className="w-full px-2.5 py-1.5 text-left text-[11px] text-white/78 hover:bg-white/[0.08] flex items-center justify-between gap-2"
                              tabIndex={menuOpenId === b.id && menuActiveIndex === 3 ? 0 : -1}
                              ref={(el) => {
                                setMenuItemRef(b.id, 3, el);
                              }}
                              onFocus={() => setMenuActiveIndex(3)}
                              onClick={() => {
                                onRetryWithDiff(b);
                                closeMenuById(b.id, false);
                              }}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <RotateCcw size={11} />
                                Retry + Compare
                              </span>
                              <span className="text-[10px] text-white/35 tabular-nums">Alt+R</span>
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
                          <div className="px-2.5 py-1 border-t border-white/10 text-[10px] text-white/35">
                            ↑/↓ 이동 · Enter 실행 · Esc 닫기
                          </div>
                        </div>,
                        document.body,
                      ))
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
