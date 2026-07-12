import React from "react";
import InspectorAnalyzeCard from "./InspectorAnalyzeCard";
import InspectorFailedBlockCard from "./InspectorFailedBlockCard";
import InspectorQuickActionsCard from "./InspectorQuickActionsCard";
import InspectorRecentBlocksCard from "./InspectorRecentBlocksCard";
import InspectorSummaryOverviewCard from "./InspectorSummaryOverviewCard";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getInspectorActiveFlow,
  getInspectorActivePrimaryAction,
  getInspectorIdleContextFlow,
  getInspectorIdlePrimaryFlow,
} from "./InspectorPanelSummary/utils";
import type { InspectorPanelSummaryProps } from "./InspectorPanelSummary/types";

export interface InspectorPanelSummaryFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getInspectorPanelSummaryEmptyStateFlow(
  activeTabTitle?: string,
): InspectorPanelSummaryFlowSummary {
  const tabLabel = activeTabTitle || "터미널";

  return {
    badges: ["현재 탭", tabLabel, "실행 대기"],
    helper: activeTabTitle
      ? "이 탭에서 첫 명령을 실행하면 이후 실패 분석과 최근 기록이 같은 문맥으로 쌓입니다."
      : "첫 명령을 실행하면 이후 실패 분석과 최근 기록이 현재 터미널 문맥으로 쌓입니다.",
  };
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
    onOpenRag,
    onTabSelect,
  } = actions;
  const idlePrimaryFlow = getInspectorIdlePrimaryFlow();
  const idleContextFlow = getInspectorIdleContextFlow(activeTabTitle);
  const emptyStateFlow = getInspectorPanelSummaryEmptyStateFlow(activeTabTitle);
  const activeFlow = getInspectorActiveFlow({
    failedBlockCount: failedBlocks.length,
    hasAnalyzeCache: analyzeCache !== null,
    hasRecentBlocks: recentBlocks.length > 0,
  });
  const activePrimaryAction = getInspectorActivePrimaryAction({
    failedBlockCount: failedBlocks.length,
    hasFocusedFailedBlock: focusedFailedBlock !== null,
    hasAnalyzeCache: analyzeCache !== null,
    hasRecentBlocks: recentBlocks.length > 0,
  });

  const handleActivePrimaryAction = () => {
    switch (activePrimaryAction.action) {
      case "analyze-failure":
        if (focusedFailedBlock) onAnalyzeFailedBlock(focusedFailedBlock.id);
        return;
      case "focus-failure":
        if (focusedFailedBlock) onSelectBlock(focusedFailedBlock.id);
        return;
      case "open-recent":
        if (recentBlocks[0]) onSelectBlock(recentBlocks[0].id);
        return;
      case "open-quick-actions":
        onQuickActionsToggle();
        return;
    }
  };

  return (
    <section
      id="inspector-tabpanel-summary"
      role="tabpanel"
      aria-labelledby="inspector-tab-summary"
      tabIndex={0}
      className={`${inspectorSummaryWrapClass} text-white/72`}
    >
      <InspectorSummaryOverviewCard
        selectedModel={selectedModel}
        activeTabTitle={activeTabTitle}
        activeTabPath={activeTabPath}
        activeTabBranch={activeTabBranch}
        activeTabChanged={activeTabChanged}
        failedBlockCount={failedBlocks.length}
        inspectorCardTightClass={inspectorCardTightClass}
        onOpenWorkspace={onOpenWorkspace}
        onOpenDiffReview={onOpenDiffReview}
        onOpenFailedBlock={onOpenFailedBlock}
        onOpenRag={onOpenRag}
      />
      {noActivity && (
        <div className={inspectorCardRegularClass}>
          <p className="text-white/45 uppercase tracking-[0.06em] text-xs">인스펙터</p>
          <div className="mt-2 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
            <ActionFlowBar
              badges={idlePrimaryFlow.badges}
              helper={idlePrimaryFlow.helper}
              tone="neutral"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
            <StatusBadge tone="neutral">현재 탭</StatusBadge>
            <StatusBadge tone="neutral">{activeTabTitle || "터미널"}</StatusBadge>
            <StatusBadge tone="neutral">실행 대기</StatusBadge>
            <div className="w-full">
              <ActionFlowBar
                badges={emptyStateFlow.badges}
                helper={emptyStateFlow.helper}
                tone="neutral"
              />
            </div>
          </div>
          <p className="text-white/72">
            터미널에서 최근 명령을 실행하면 여기에서 실패 블록·추천 커맨드·최근 기록을 확인할 수 있습니다.
          </p>
          <p className="text-[11px] leading-relaxed text-white/42">
            먼저 한 번 실행해 두면 복구, 재실행, 기록 확인 흐름이 모두 현재 탭 기준으로 이어집니다.
          </p>
        </div>
      )}
      {!noActivity && (
        <div className={inspectorCardRegularClass}>
          <ActionFlowBar
            badges={activeFlow.badges}
            helper={activeFlow.helper}
            tone={activeFlow.tone}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleActivePrimaryAction}
              className="inline-flex items-center rounded-lg border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/88 transition-colors hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {activePrimaryAction.label}
            </button>
            <p className="text-[11px] leading-relaxed text-white/48">
              {activePrimaryAction.helper}
            </p>
          </div>
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
        <InspectorRecentBlocksCard
          recentBlocks={recentBlocks}
          inspectorCardRegularClass={inspectorCardRegularClass}
          onSelectBlock={onSelectBlock}
          onRerunBlock={onRerunBlock}
          onLoadAnalyzePromptToAiBar={onLoadAnalyzePromptToAiBar}
        />
      )}
      <InspectorQuickActionsCard
        quickActionsExpanded={quickActionsExpanded}
        inspectorCardRegularClass={inspectorCardRegularClass}
        inspectorQuickGridClass={inspectorQuickGridClass}
        inspectorQuickActionsToggleRef={inspectorQuickActionsToggleRef}
        inspectorQuickActionsAdvancedRef={inspectorQuickActionsAdvancedRef}
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
    </section>
  );
};

export default InspectorPanelSummary;
