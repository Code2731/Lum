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
} from "lucide-react";
import InspectorAnalyzeCard from "./InspectorAnalyzeCard";
import InspectorFailedBlockCard from "./InspectorFailedBlockCard";
import type {
  InspectorAnalyzeCache,
  InspectorFailedBlock,
  InspectorRecentBlock,
} from "./InspectorPanel/types";

interface InspectorPanelSummaryData {
  selectedModel: string;
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
}

interface InspectorPanelSummaryLayout {
  quickActionsExpanded: boolean;
  isInspectorCompact: boolean;
  inspectorSummaryWrapClass: string;
  inspectorCardTightClass: string;
  inspectorCardRegularClass: string;
  inspectorQuickGridClass: string;
}

interface InspectorPanelSummaryRefs {
  inspectorMoreButtonRefs: React.MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorMenuFirstActionRefs: React.MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorQuickActionsToggleRef: React.RefObject<HTMLButtonElement>;
  inspectorQuickActionsAdvancedRef: React.RefObject<HTMLDivElement>;
}

interface InspectorPanelSummaryActions {
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
  onTabSelect: (tab: "summary" | "rag" | "scripts" | "sysmon") => void;
}

interface InspectorPanelSummaryProps {
  data: InspectorPanelSummaryData;
  layout: InspectorPanelSummaryLayout;
  refs: InspectorPanelSummaryRefs;
  actions: InspectorPanelSummaryActions;
}

function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

const InspectorPanelSummary: React.FC<InspectorPanelSummaryProps> = ({ data, layout, refs, actions }) => {
  const {
    selectedModel,
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
  } = data;
  const {
    quickActionsExpanded,
    isInspectorCompact,
    inspectorSummaryWrapClass,
    inspectorCardTightClass,
    inspectorCardRegularClass,
    inspectorQuickGridClass,
  } = layout;
  const {
    inspectorMoreButtonRefs,
    inspectorMenuFirstActionRefs,
    inspectorQuickActionsToggleRef,
    inspectorQuickActionsAdvancedRef,
  } = refs;
  const {
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
    onTabSelect,
  } = actions;

  return (
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
        <InspectorFailedBlockCard
          failedBlocks={failedBlocks}
          focusedFailedBlock={focusedFailedBlock}
          inspectorCardRegularClass={inspectorCardRegularClass}
          onFocusFailedBlock={onFocusFailedBlock}
          onAnalyzeFailedBlock={onAnalyzeFailedBlock}
          onCopyFailedOutput={onCopyFailedOutput}
          onCopyAnalyzePrompt={onCopyAnalyzePrompt}
          onLoadAnalyzePromptToAiBar={onLoadAnalyzePromptToAiBar}
          onSelectBlock={onSelectBlock}
        />
      )}
      {!noActivity && (
        <InspectorAnalyzeCard
          analyzeCache={analyzeCache}
          commandMenuIndex={commandMenuIndex}
          isInspectorCompact={isInspectorCompact}
          inspectorCardRegularClass={inspectorCardRegularClass}
          inspectorMoreButtonRefs={inspectorMoreButtonRefs}
          inspectorMenuFirstActionRefs={inspectorMenuFirstActionRefs}
          onCopyAnalyzeResult={onCopyAnalyzeResult}
          onClearAnalyzeCache={onClearAnalyzeCache}
          onCopySuggestedCommand={onCopySuggestedCommand}
          onLoadSuggestedCommandToAiBar={onLoadSuggestedCommandToAiBar}
          onApplySuggestedCommand={onApplySuggestedCommand}
          onCommandMenuRowBlurCapture={onCommandMenuRowBlurCapture}
          onSuggestedCommandRowKeyDown={onSuggestedCommandRowKeyDown}
          onCompactMenuKeyDown={onCompactMenuKeyDown}
          onOpenCompactMenu={onOpenCompactMenu}
          onCloseCommandMenu={onCloseCommandMenu}
        />
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
  );
};

export default InspectorPanelSummary;
