import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
} from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import InspectorPanelSummary from "./InspectorPanelSummary";
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
                <InspectorPanelSummary
                  selectedModel={selectedModel}
                  activeTabTitle={activeTabTitle}
                  activeTabPath={activeTabPath}
                  activeTabBranch={activeTabBranch}
                  activeTabChanged={activeTabChanged}
                  noActivity={noActivity}
                  failedBlocks={failedBlocks}
                  focusedFailedBlock={focusedFailedBlock}
                  analyzeCache={analyzeCache}
                  recentBlocks={recentBlocks}
                  commandMenuIndex={commandMenuIndex}
                  quickActionsExpanded={quickActionsExpanded}
                  isInspectorCompact={isInspectorCompact}
                  inspectorSummaryWrapClass={inspectorSummaryWrapClass}
                  inspectorCardTightClass={inspectorCardTightClass}
                  inspectorCardRegularClass={inspectorCardRegularClass}
                  inspectorQuickGridClass={inspectorQuickGridClass}
                  inspectorMoreButtonRefs={inspectorMoreButtonRefs}
                  inspectorMenuFirstActionRefs={inspectorMenuFirstActionRefs}
                  inspectorQuickActionsToggleRef={inspectorQuickActionsToggleRef}
                  inspectorQuickActionsAdvancedRef={inspectorQuickActionsAdvancedRef}
                  onFocusFailedBlock={onFocusFailedBlock}
                  onAnalyzeFailedBlock={onAnalyzeFailedBlock}
                  onCopyFailedOutput={onCopyFailedOutput}
                  onCopyAnalyzePrompt={onCopyAnalyzePrompt}
                  onLoadAnalyzePromptToAiBar={onLoadAnalyzePromptToAiBar}
                  onSelectBlock={onSelectBlock}
                  onCopyAnalyzeResult={onCopyAnalyzeResult}
                  onClearAnalyzeCache={onClearAnalyzeCache}
                  onCopySuggestedCommand={onCopySuggestedCommand}
                  onLoadSuggestedCommandToAiBar={onLoadSuggestedCommandToAiBar}
                  onApplySuggestedCommand={onApplySuggestedCommand}
                  onRerunBlock={onRerunBlock}
                  onCommandMenuRowBlurCapture={onCommandMenuRowBlurCapture}
                  onSuggestedCommandRowKeyDown={onSuggestedCommandRowKeyDown}
                  onCompactMenuKeyDown={onCompactMenuKeyDown}
                  onOpenCompactMenu={onOpenCompactMenu}
                  onCloseCommandMenu={onCloseCommandMenu}
                  onQuickActionsToggle={onQuickActionsToggle}
                  onQuickActionsToggleKeyDown={onQuickActionsToggleKeyDown}
                  onQuickActionsAdvancedKeyDown={onQuickActionsAdvancedKeyDown}
                  onToggleProjectBin={onToggleProjectBin}
                  onOpenWorkspace={onOpenWorkspace}
                  onOpenHistory={onOpenHistory}
                  onOpenDiffReview={onOpenDiffReview}
                  onOpenFailedBlock={onOpenFailedBlock}
                  onTabSelect={onTabSelect}
                />
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
