import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  GitBranch,
  FolderTree,
  Clock3,
  Search,
  GitCompareArrows,
  Library,
  Activity,
  Layers,
  AlertTriangle,
  RotateCcw,
  Copy,
  MoreHorizontal,
  TerminalSquare,
  Loader2,
  X,
} from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import RagPanel from "./RagPanel";
import ScriptLibraryPanel from "./ScriptLibraryPanel";
import SystemMonitorPanel from "./SystemMonitorPanel";
import type {
  InspectorAnalyzeCache,
  InspectorDensity,
  InspectorFailedBlock,
  InspectorRecentBlock,
  InspectorTab,
  InspectorTabItem,
  ScriptLibraryLike,
} from "./InspectorPanel/types";

interface InspectorPanelProps {
  showInspector: boolean;
  selectedModel: string;
  inspectorTab: InspectorTab;
  inspectorDensity: InspectorDensity;
  inspectorTabs: readonly InspectorTabItem[];
  inspectorTabRefs: React.MutableRefObject<Record<InspectorTab, HTMLButtonElement | null>>;

  activeTabTitle: string;
  activeTabPath: string;
  activeTabBranch?: string;
  activeTabChanged?: number;

  noActivity: boolean;
  failedBlocks: readonly InspectorFailedBlock[];
  focusedFailedBlock: InspectorFailedBlock | null;
  analyzeCache: InspectorAnalyzeCache | null;
  recentBlocks: readonly InspectorRecentBlock[];

  commandMenuIndex: number | null;
  quickActionsExpanded: boolean;
  inspectorMoreButtonRefs: React.MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorMenuFirstActionRefs: React.MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorQuickActionsToggleRef: React.RefObject<HTMLButtonElement>;
  inspectorQuickActionsAdvancedRef: React.RefObject<HTMLDivElement>;

  onDensityToggle: () => void;
  onClose: () => void;
  onTabSelect: (tab: InspectorTab) => void;
  onTabKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;

  onFocusFailedBlock: () => void;
  onAnalyzeFailedBlock: (blockId?: string) => void;
  onCopyFailedOutput: (blockId?: string) => void;
  onCopyAnalyzePrompt: (blockId?: string) => void;
  onLoadAnalyzePromptToAiBar: (blockId?: string) => void;
  onSelectBlock: (blockId: string) => void;
  onCopyAnalyzeResult: () => void;
  onClearAnalyzeCache: () => void;
  onCopySuggestedCommand: (commandIndex: number) => void;
  onLoadSuggestedCommandToAiBar: (commandIndex: number) => void;
  onApplySuggestedCommand: (commandIndex: number) => void;
  onRerunBlock: (command: string) => void;
  onCommandMenuRowBlurCapture: (e: React.FocusEvent<HTMLDivElement>, rowIndex: number) => void;
  onSuggestedCommandRowKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, rowIndex: number) => void;
  onCompactMenuKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, rowIndex: number) => void;
  onOpenCompactMenu: (index: number) => void;
  onCloseCommandMenu: (restoreFocus?: boolean) => void;

  onQuickActionsToggle: () => void;
  onQuickActionsToggleKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onQuickActionsAdvancedKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onToggleProjectBin: () => void;
  onOpenWorkspace: () => void;
  onOpenHistory: () => void;
  onOpenDiffReview: () => void;
  onOpenFailedBlock: () => void;

  scriptLibrary: ScriptLibraryLike;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({
  showInspector,
  selectedModel,
  inspectorTab,
  inspectorDensity,
  inspectorTabs,
  inspectorTabRefs,

  activeTabTitle,
  activeTabPath,
  activeTabBranch,
  activeTabChanged,

  noActivity,
  failedBlocks,
  focusedFailedBlock,
  analyzeCache,
  recentBlocks,

  commandMenuIndex,
  quickActionsExpanded,
  inspectorMoreButtonRefs,
  inspectorMenuFirstActionRefs,
  inspectorQuickActionsToggleRef,
  inspectorQuickActionsAdvancedRef,

  onDensityToggle,
  onClose,
  onTabSelect,
  onTabKeyDown,

  onFocusFailedBlock,
  onAnalyzeFailedBlock,
  onCopyFailedOutput,
  onCopyAnalyzePrompt,
  onLoadAnalyzePromptToAiBar,
  onSelectBlock,
  onCopyAnalyzeResult,
  onClearAnalyzeCache,
  onCopySuggestedCommand,
  onLoadSuggestedCommandToAiBar,
  onApplySuggestedCommand,
  onRerunBlock,
  onCommandMenuRowBlurCapture,
  onSuggestedCommandRowKeyDown,
  onCompactMenuKeyDown,
  onOpenCompactMenu,
  onCloseCommandMenu,

  onQuickActionsToggle,
  onQuickActionsToggleKeyDown,
  onQuickActionsAdvancedKeyDown,
  onToggleProjectBin,
  onOpenWorkspace,
  onOpenHistory,
  onOpenDiffReview,
  onOpenFailedBlock,

  scriptLibrary,
}) => {
  const isInspectorCompact = inspectorDensity === "compact";
  const inspectorSummaryWrapClass = isInspectorCompact
    ? "h-full overflow-y-auto p-2 space-y-1.5 text-xs"
    : "h-full overflow-y-auto p-3 space-y-2 text-sm";
  const inspectorCardPadClass = isInspectorCompact ? "px-2 py-1.5" : "px-2.5 py-2";
  const inspectorCardTightClass = `rounded-lg border border-white/10 bg-white/[0.03] ${inspectorCardPadClass} space-y-1`;
  const inspectorCardRegularClass = `rounded-lg border border-white/10 bg-white/[0.03] ${inspectorCardPadClass} ${isInspectorCompact ? "space-y-1" : "space-y-1.5"}`;
  const inspectorQuickGridClass = isInspectorCompact ? "grid grid-cols-2 gap-1" : "grid grid-cols-2 gap-1.5";

  const formatDurationMs = (ms: number | null): string => {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return "-";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return `${mins}m ${secs}s`;
  };

  return (
    <AnimatePresence initial={false}>
      {showInspector && (
        <motion.div
          key="inspector-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: isInspectorCompact ? 304 : 336, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="border-l border-white/8 shrink-0 overflow-hidden bg-[#0e141d]/88"
        >
          <div className="h-full flex flex-col">
            <div className="px-2.5 py-2 border-b border-white/10 bg-white/[0.02] shrink-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm tracking-[0.06em] uppercase text-white/65 font-semibold">Inspector</span>
                <button
                  onClick={onDensityToggle}
                  className={`px-1.5 py-0.5 rounded border text-xs transition-colors ${
                    isInspectorCompact
                      ? "border-cyan-300/35 bg-cyan-400/16 text-cyan-100"
                      : "border-white/[0.1] bg-white/[0.05] text-white/58 hover:text-white/80"
                  }`}
                  aria-label="Inspector 밀도 토글"
                  title={isInspectorCompact ? "Cozy 보기" : "Compact 보기"}
                >
                  {isInspectorCompact ? "COMPACT" : "COZY"}
                </button>
                <button
                  onClick={onClose}
                  className="p-1 rounded border border-white/[0.1] text-white/42 hover:text-white/78 hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Inspector 닫기"
                >
                  <X size={12} />
                </button>
              </div>
              <div
                className="flex items-center gap-1"
                role="tablist"
                aria-label="Inspector 탭"
                onKeyDown={onTabKeyDown}
              >
                {inspectorTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    ref={(el) => {
                      inspectorTabRefs.current[tab.id] = el;
                    }}
                    role="tab"
                    id={`inspector-tab-${tab.id}`}
                    aria-selected={inspectorTab === tab.id}
                    aria-controls={`inspector-tabpanel-${tab.id}`}
                    aria-keyshortcuts={`Alt+${tab.shortcut}`}
                    tabIndex={inspectorTab === tab.id ? 0 : -1}
                    onClick={() => onTabSelect(tab.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onTabSelect(tab.id);
                      }
                    }}
                    className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                      inspectorTab === tab.id
                        ? "border-cyan-300/35 bg-cyan-400/16 text-cyan-100"
                        : "border-white/10 bg-white/[0.04] text-white/58 hover:text-white/82"
                    } focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
                    title={`Alt+${tab.shortcut} : ${tab.label}`}
                  >
                    <span>{tab.label}</span>
                    <span className="ml-1 inline-flex text-xs text-white/35">({tab.shortcut})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {inspectorTab === "summary" && (
                <section
                  id="inspector-tabpanel-summary"
                  role="tabpanel"
                  aria-labelledby="inspector-tab-summary"
                  tabIndex={0}
                  className={`${inspectorSummaryWrapClass} text-white/72`}
                >
                  <div className={inspectorCardTightClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Workspace</p>
                      {activeTabBranch && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-cyan-300/30 bg-cyan-400/12 text-cyan-100 text-xs">
                          <GitBranch size={10} />
                          {activeTabBranch}
                          {activeTabChanged != null && activeTabChanged > 0 && (
                            <span className="px-1 rounded bg-amber-400/22 text-amber-200 text-xs">
                              {activeTabChanged}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="text-white/82 truncate">{activeTabTitle}</p>
                    <p className="text-white/55 font-mono break-all">{activeTabPath}</p>
                  </div>
                  <div className={inspectorCardTightClass}>
                    <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Model</p>
                    <p className="text-white/82 break-all">{selectedModel}</p>
                  </div>
                  {noActivity && (
                    <div className={inspectorCardRegularClass}>
                      <p className="text-white/45 uppercase tracking-[0.06em] text-xs">INSPECTOR</p>
                      <p className="text-white/72">
                        터미널에서 최근 명령을 실행하면 여기에서 실패 블록·추천 커맨드·최근 기록을 확인할 수 있습니다.
                      </p>
                    </div>
                  )}
                  {!noActivity && (
                    <div className={inspectorCardRegularClass}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Failed Block</p>
                        <span className="text-xs text-rose-200/80">{failedBlocks.length}개</span>
                      </div>
                      {focusedFailedBlock ? (
                        <div className="rounded-md border border-rose-300/25 bg-rose-400/8 px-2 py-1.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-rose-100/90 truncate">{focusedFailedBlock.command}</p>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-rose-400/20 text-rose-100">
                              ERR {focusedFailedBlock.exitCode}
                            </span>
                          </div>
                          {focusedFailedBlock.outputTail && (
                            <p className="text-xs text-rose-100/75 font-mono break-words">
                              {focusedFailedBlock.outputTail}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={onFocusFailedBlock}
                              className="inline-flex w-[84px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-rose-300/35 bg-rose-400/14 text-xs text-rose-100 hover:bg-rose-400/22 transition-colors"
                            >
                              <AlertTriangle size={9} />
                              NEXT FAIL
                            </button>
                            <button
                              onClick={() => onAnalyzeFailedBlock(focusedFailedBlock.id)}
                              className="inline-flex w-[88px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-300/35 bg-cyan-400/14 text-xs text-cyan-100 hover:bg-cyan-400/24 transition-colors"
                            >
                              <Search size={9} />
                              AI ANALYZE
                            </button>
                            <button
                              onClick={() => onCopyFailedOutput(focusedFailedBlock.id)}
                              className="inline-flex w-[76px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/20 bg-white/[0.05] text-xs text-white/75 hover:text-white hover:bg-white/[0.12] transition-colors"
                            >
                              <Copy size={9} />
                              COPY LOG
                            </button>
                            <button
                              onClick={() => onCopyAnalyzePrompt(focusedFailedBlock.id)}
                              className="inline-flex w-[92px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-300/30 bg-cyan-400/10 text-xs text-cyan-100 hover:bg-cyan-400/20 transition-colors"
                            >
                              <Copy size={9} />
                              COPY PROMPT
                            </button>
                            <button
                              onClick={() => onLoadAnalyzePromptToAiBar(focusedFailedBlock.id)}
                              className="inline-flex w-[92px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-accent/35 bg-accent/14 text-xs text-accent hover:bg-accent/24 transition-colors"
                            >
                              <Search size={9} />
                              LOAD PROMPT
                            </button>
                            <button
                              onClick={() => onSelectBlock(focusedFailedBlock.id)}
                              className="inline-flex w-[60px] justify-center items-center px-1.5 py-0.5 rounded border border-white/18 bg-white/[0.05] text-xs text-white/75 hover:text-white hover:bg-white/[0.11] transition-colors"
                            >
                              SELECT
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-white/40">실패 블록이 없습니다.</p>
                      )}
                    </div>
                  )}
                  {!noActivity && (
                    <div className={inspectorCardRegularClass}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Last AI Analyze</p>
                        {analyzeCache && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={onCopyAnalyzeResult}
                              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-white/18 bg-white/[0.05] text-white/72 hover:text-white hover:bg-white/[0.1] transition-colors"
                            >
                              <Copy size={9} />
                              COPY
                            </button>
                            <button
                              onClick={onClearAnalyzeCache}
                              className="text-xs px-1.5 py-0.5 rounded border border-white/18 bg-white/[0.05] text-white/70 hover:text-white hover:bg-white/[0.1] transition-colors"
                            >
                              CLEAR
                            </button>
                          </div>
                        )}
                      </div>
                      {!analyzeCache && (
                        <p className="text-white/40">아직 실행된 분석이 없습니다.</p>
                      )}
                      {analyzeCache && (
                        <div className={`rounded-md border px-2 py-1.5 space-y-1 ${
                          analyzeCache.status === "error"
                            ? "border-rose-300/25 bg-rose-400/8"
                            : "border-cyan-300/20 bg-cyan-400/8"
                        }`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-white/82 truncate">{analyzeCache.command}</p>
                            {analyzeCache.status === "streaming" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-cyan-100">
                                <Loader2 size={9} className="animate-spin" />
                                STREAMING
                              </span>
                            ) : analyzeCache.status === "error" ? (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-rose-400/20 text-rose-100">
                                ERROR
                              </span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-100">
                                DONE
                              </span>
                            )}
                          </div>
                          <p className={`text-xs font-mono break-words ${
                            analyzeCache.status === "error" ? "text-rose-100/80" : "text-cyan-100/78"
                          }`}>
                            {analyzeCache.result || "응답을 기다리는 중..."}
                          </p>
                          {analyzeCache.status === "done" && analyzeCache.suggestedCommands.length > 0 && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs uppercase tracking-[0.06em] text-cyan-100/70">Suggested Commands</p>
                                <p className="text-xs text-cyan-100/62">
                                  {isInspectorCompact ? "R 실행 · MORE→C/L" : "R 실행 · C 복사 · L 로드"}
                                </p>
                              </div>
                              <div className="space-y-1">
                                {analyzeCache.suggestedCommands.map((cmd, idx) => (
                                  <div
                                    key={`${cmd}-${idx}`}
                                    data-inspector-command-menu-row="1"
                                    tabIndex={isInspectorCompact ? 0 : -1}
                                    className="rounded border border-cyan-300/18 bg-cyan-400/[0.06] px-1.5 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/45"
                                    onBlurCapture={(e) => onCommandMenuRowBlurCapture(e, idx)}
                                    onKeyDown={(e) => onSuggestedCommandRowKeyDown(e, idx)}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="inline-flex items-center justify-center min-w-4 h-4 rounded bg-cyan-400/20 text-xs text-cyan-100">
                                        {idx + 1}
                                      </span>
                                      <p className="min-w-0 flex-1 text-xs font-mono text-cyan-100/92 truncate" title={cmd}>
                                        {cmd}
                                      </p>
                                      {isInspectorCompact ? (
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={() => onApplySuggestedCommand(idx)}
                                            className="inline-flex w-[68px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300/35 bg-emerald-400/16 text-xs text-emerald-100 hover:bg-emerald-400/26 transition-colors"
                                            title={`${idx + 1}번 커맨드 실행 (R)`}
                                          >
                                            <TerminalSquare size={9} />
                                            RUN (R)
                                          </button>
                                          <button
                                            ref={(el) => { inspectorMoreButtonRefs.current[idx] = el; }}
                                            onClick={() => {
                                              if (commandMenuIndex === idx) {
                                                onCloseCommandMenu();
                                                return;
                                              }
                                              onOpenCompactMenu(idx);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key !== "ArrowDown" && e.key !== "Enter" && e.key !== " ") return;
                                              e.preventDefault();
                                              onOpenCompactMenu(idx);
                                            }}
                                            aria-expanded={commandMenuIndex === idx}
                                            aria-controls={`inspector-command-menu-${idx}`}
                                            className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/20 bg-white/[0.05] text-xs text-white/75 hover:text-white hover:bg-white/[0.12] transition-colors"
                                            title={`${idx + 1}번 추가 액션 (C/L 단축키 활성화)`}
                                          >
                                            <MoreHorizontal size={9} />
                                            MORE
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={() => onCopySuggestedCommand(idx)}
                                            className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/22 bg-white/[0.05] text-xs text-white/76 hover:text-white hover:bg-white/[0.12] transition-colors"
                                            title={`${idx + 1}번 커맨드 복사 (C)`}
                                          >
                                            <Copy size={9} />
                                            COPY
                                          </button>
                                          <button
                                            onClick={() => onLoadSuggestedCommandToAiBar(idx)}
                                            className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-accent/35 bg-accent/14 text-xs text-accent hover:bg-accent/24 transition-colors"
                                            title={`${idx + 1}번 커맨드 AI 입력바 로드 (L)`}
                                          >
                                            <Search size={9} />
                                            LOAD
                                          </button>
                                          <button
                                            onClick={() => onApplySuggestedCommand(idx)}
                                            className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300/35 bg-emerald-400/16 text-xs text-emerald-100 hover:bg-emerald-400/26 transition-colors"
                                            title={`${idx + 1}번 커맨드 실행 (R)`}
                                          >
                                            <TerminalSquare size={9} />
                                            RUN
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    {isInspectorCompact && commandMenuIndex === idx && (
                                      <div
                                        id={`inspector-command-menu-${idx}`}
                                        data-inspector-command-menu="compact"
                                        role="menu"
                                        onKeyDown={(e) => onCompactMenuKeyDown(e, idx)}
                                        className="mt-1.5 ml-5 flex items-center gap-1"
                                      >
                                        <button
                                          ref={(el) => { inspectorMenuFirstActionRefs.current[idx] = el; }}
                                          role="menuitem"
                                          onClick={() => onCopySuggestedCommand(idx)}
                                          className="inline-flex w-[72px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/22 bg-white/[0.05] text-xs text-white/76 hover:text-white hover:bg-white/[0.12] transition-colors"
                                          title={`${idx + 1}번 커맨드 복사 (C)`}
                                        >
                                          <Copy size={9} />
                                          COPY (C)
                                        </button>
                                        <button
                                          role="menuitem"
                                          onClick={() => onLoadSuggestedCommandToAiBar(idx)}
                                          className="inline-flex w-[72px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-accent/35 bg-accent/14 text-xs text-accent hover:bg-accent/24 transition-colors"
                                          title={`${idx + 1}번 커맨드 AI 입력바 로드 (L)`}
                                        >
                                          <Search size={9} />
                                          LOAD (L)
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {analyzeCache.status === "done" && !isInspectorCompact && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => onApplySuggestedCommand(0)}
                                title="첫 번째 추천 커맨드 실행 (R)"
                                className="inline-flex w-[74px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300/35 bg-emerald-400/16 text-xs text-emerald-100 hover:bg-emerald-400/26 transition-colors"
                              >
                                <TerminalSquare size={9} />
                                RUN #1
                              </button>
                              <button
                                onClick={onCopyAnalyzeResult}
                                title="분석 결과 전체 복사"
                                className="inline-flex w-[64px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/20 bg-white/[0.05] text-xs text-white/76 hover:text-white hover:bg-white/[0.12] transition-colors"
                              >
                                <Copy size={9} />
                                COPY
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {!noActivity && recentBlocks.length > 0 && (
                    <div className={inspectorCardRegularClass}>
                      <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Recent Blocks</p>
                      {recentBlocks.map((block) => (
                        <div key={block.id} className="flex items-start gap-2 rounded-md border border-white/[0.08] bg-black/20 px-2 py-1.5">
                          <span className={`mt-0.5 inline-flex items-center justify-center text-xs px-1.5 py-0.5 rounded ${
                            block.exitCode === 0 || block.exitCode == null
                              ? "bg-emerald-400/16 text-emerald-200"
                              : "bg-rose-400/18 text-rose-200"
                          }`}>
                            {block.exitCode === 0 || block.exitCode == null ? "OK" : `ERR ${block.exitCode}`}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-white/80 truncate">{block.command}</p>
                            <p className="text-white/44 text-xs inline-flex items-center gap-1 mt-0.5">
                              <Clock3 size={10} />
                              {formatDurationMs(block.durationMs)}
                            </p>
                            {block.outputTail && (
                              <p className="text-xs text-white/36 font-mono truncate mt-0.5">{block.outputTail}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => onSelectBlock(block.id)}
                              className="inline-flex w-[56px] justify-center items-center px-1.5 py-0.5 rounded border border-white/12 bg-white/[0.05] text-xs text-white/68 hover:text-white hover:bg-white/[0.11] transition-colors"
                              title="이 블록 선택"
                            >
                              SEL
                            </button>
                            <button
                              onClick={() => onRerunBlock(block.command)}
                              className="inline-flex w-[64px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-300/30 bg-cyan-400/14 text-xs text-cyan-100 hover:bg-cyan-400/24 transition-colors"
                              title="명령 재실행"
                            >
                              <RotateCcw size={9} />
                              RUN
                            </button>
                            {block.exitCode !== 0 && block.exitCode != null && (
                              <button
                                onClick={() => onLoadAnalyzePromptToAiBar(block.id)}
                                className="inline-flex w-[68px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-accent/35 bg-accent/14 text-xs text-accent hover:bg-accent/24 transition-colors"
                                title="실패 분석 프롬프트 로드"
                              >
                                <Search size={9} />
                                LOAD
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={inspectorCardRegularClass}>
                    <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Quick Actions</p>
                    <div className={inspectorQuickGridClass}>
                      <button
                        type="button"
                        onClick={onToggleProjectBin}
                        className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
                      >
                        <FolderTree size={11} />
                        Project Bin
                      </button>
                      <button
                        type="button"
                        onClick={onOpenWorkspace}
                        className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
                      >
                        <Layers size={11} />
                        Workspace
                      </button>
                      <button
                        type="button"
                        onClick={() => onTabSelect("rag")}
                        className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
                      >
                        <Library size={11} />
                        RAG
                      </button>
                      <button
                        type="button"
                        data-inspector-quick-actions-toggle
                        aria-controls="inspector-quick-actions-advanced"
                        aria-expanded={quickActionsExpanded}
                        ref={inspectorQuickActionsToggleRef}
                        onKeyDown={onQuickActionsToggleKeyDown}
                        onClick={onQuickActionsToggle}
                        className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
                      >
                        {quickActionsExpanded ? "축소" : "더보기"}
                      </button>
                      <AnimatePresence initial={false}>
                        {quickActionsExpanded && (
                          <motion.div
                            id="inspector-quick-actions-advanced"
                            data-inspector-quick-actions-advanced
                            key="inspector-quick-actions-advanced"
                            className="col-span-2"
                            ref={inspectorQuickActionsAdvancedRef}
                            onKeyDown={onQuickActionsAdvancedKeyDown}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                            style={{ overflow: "hidden" }}
                          >
                            <div className={inspectorQuickGridClass}>
                              <button
                                type="button"
                                onClick={onOpenHistory}
                                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
                              >
                                <Search size={11} />
                                History
                              </button>
                              <button
                                type="button"
                                onClick={onOpenDiffReview}
                                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
                              >
                                <GitCompareArrows size={11} />
                                Diff
                              </button>
                              <button
                                type="button"
                                onClick={onOpenFailedBlock}
                                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-rose-300/30 bg-rose-400/12 text-rose-100 hover:bg-rose-400/20 transition-colors"
                              >
                                <AlertTriangle size={11} />
                                Failed
                              </button>
                              <button
                                type="button"
                                onClick={() => onTabSelect("scripts")}
                                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
                              >
                                Scripts
                              </button>
                              <button
                                type="button"
                                onClick={() => onTabSelect("sysmon")}
                                className="inline-flex w-full h-7 items-center gap-1.5 px-2 rounded-md text-xs border border-white/12 bg-white/[0.05] text-white/74 hover:text-white hover:bg-white/[0.1] transition-colors"
                              >
                                <Activity size={11} />
                                System
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </section>
              )}

              {inspectorTab === "rag" && (
                <section id="inspector-tabpanel-rag" role="tabpanel" aria-labelledby="inspector-tab-rag" tabIndex={0}>
                  <ErrorBoundary label="RAG">
                    <RagPanel
                      model={selectedModel}
                      onClose={onClose}
                      compact={isInspectorCompact}
                    />
                  </ErrorBoundary>
                </section>
              )}

              {inspectorTab === "scripts" && (
                <section
                  id="inspector-tabpanel-scripts"
                  role="tabpanel"
                  aria-labelledby="inspector-tab-scripts"
                  tabIndex={0}
                >
                  <ErrorBoundary label="스크립트 라이브러리">
                    <ScriptLibraryPanel
                      scripts={scriptLibrary.scripts}
                      loading={scriptLibrary.loading}
                      onLoad={scriptLibrary.onLoad}
                      onRun={scriptLibrary.onRun}
                      onDelete={scriptLibrary.onDelete}
                      onSave={scriptLibrary.onSave}
                      onClose={onClose}
                      compact={isInspectorCompact}
                    />
                  </ErrorBoundary>
                </section>
              )}

              {inspectorTab === "sysmon" && (
                <section
                  id="inspector-tabpanel-sysmon"
                  role="tabpanel"
                  aria-labelledby="inspector-tab-sysmon"
                  tabIndex={0}
                >
                  <ErrorBoundary label="시스템 모니터">
                    <SystemMonitorPanel
                      onClose={onClose}
                      compact={isInspectorCompact}
                    />
                  </ErrorBoundary>
                </section>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InspectorPanel;
