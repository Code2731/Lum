import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import InspectorPanelHeader from "./InspectorPanelHeader";
import InspectorPanelSummary from "./InspectorPanelSummary";
import InspectorTabPanel from "./InspectorTabPanel";
import RagPanel from "./RagPanel";
import ScriptLibraryPanel from "./ScriptLibraryPanel";
import SystemMonitorPanel from "./SystemMonitorPanel";
import { ActionFlowBar } from "./ui/action-flow-bar";
import { getInspectorPanelFlowSummary } from "../hooks/useInspectorPanelData";
import type {
  InspectorPanelProps,
  InspectorTab,
} from "./InspectorPanel/types";

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
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
  const inspectorPanelWidth = viewportWidth < 1180
    ? (isInspectorCompact ? 280 : 304)
    : viewportWidth < 1440
      ? (isInspectorCompact ? 292 : 320)
      : (isInspectorCompact ? 308 : 344);
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
  const currentTabLabel = inspectorTabs.find((tab) => tab.id === inspectorTab)?.label ?? "요약";
  const panelFlowSummary = getInspectorPanelFlowSummary({
    activeTabTitle,
    noActivity,
    failedBlockCount: failedBlocks.length,
    recentBlockCount: recentBlocks.length,
  });
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
    onOpenRag: () => onTabSelect("rag"),
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
          animate={{ width: inspectorPanelWidth, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="border-l border-white/8 shrink-0 overflow-hidden bg-[#0e141d]/88 backdrop-blur-sm"
          aria-label="인스펙터 패널"
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

            <div className={isInspectorCompact
              ? "border-b border-white/8 bg-white/[0.02] px-2.5 py-1.5"
              : "border-b border-white/8 bg-white/[0.02] px-3 py-2"}
            >
              <ActionFlowBar
                badges={[currentTabLabel, panelFlowSummary.badges[1], panelFlowSummary.badges[2]]}
                helper={panelFlowSummary.helper}
                tone={noActivity ? "neutral" : failedBlocks.length > 0 ? "amber" : "cyan"}
              />
            </div>

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
