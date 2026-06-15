import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import InspectorPanelHeader from "./InspectorPanelHeader";
import InspectorPanelSummary from "./InspectorPanelSummary";
import InspectorTabPanel from "./InspectorTabPanel";
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

export interface InspectorPanelProps {
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
  const summaryData = {
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
  };
  const summaryLayout = {
    quickActionsExpanded,
    isInspectorCompact,
    inspectorSummaryWrapClass,
    inspectorCardTightClass,
    inspectorCardRegularClass,
    inspectorQuickGridClass,
  };
  const summaryRefs = {
    inspectorMoreButtonRefs,
    inspectorMenuFirstActionRefs,
    inspectorQuickActionsToggleRef,
    inspectorQuickActionsAdvancedRef,
  };
  const summaryActions = {
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
  };
  const inspectorContentByTab: Record<InspectorTab, React.ReactNode> = {
    summary: (
      <InspectorPanelSummary
        data={summaryData}
        layout={summaryLayout}
        refs={summaryRefs}
        actions={summaryActions}
      />
    ),
    rag: (
      <InspectorTabPanel
        id="inspector-tabpanel-rag"
        tabId="inspector-tab-rag"
        label="RAG"
      >
        <RagPanel
          model={selectedModel}
          onClose={onClose}
          compact={isInspectorCompact}
        />
      </InspectorTabPanel>
    ),
    scripts: (
      <InspectorTabPanel
        id="inspector-tabpanel-scripts"
        tabId="inspector-tab-scripts"
        label="스크립트 라이브러리"
      >
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
      </InspectorTabPanel>
    ),
    sysmon: (
      <InspectorTabPanel
        id="inspector-tabpanel-sysmon"
        tabId="inspector-tab-sysmon"
        label="시스템 모니터"
      >
        <SystemMonitorPanel
          onClose={onClose}
          compact={isInspectorCompact}
        />
      </InspectorTabPanel>
    ),
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
            <InspectorPanelHeader
              inspectorDensity={inspectorDensity}
              inspectorTab={inspectorTab}
              inspectorTabs={inspectorTabs}
              inspectorTabRefs={inspectorTabRefs}
              onDensityToggle={onDensityToggle}
              onClose={onClose}
              onTabSelect={onTabSelect}
              onTabKeyDown={onTabKeyDown}
            />

            <div className="flex-1 min-h-0 overflow-hidden">
              {inspectorContentByTab[inspectorTab]}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InspectorPanel;
