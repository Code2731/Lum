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

const InspectorStageDivider: React.FC<{ label: string; tone?: "amber" | "cyan" | "neutral" }> = ({
  label,
  tone = "neutral",
}) => (
  <div className="flex items-center gap-2 px-0.5 py-1">
    <span
      className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] ${
        tone === "amber"
          ? "text-amber-200/52"
          : tone === "cyan"
            ? "text-cyan-200/52"
            : "text-white/28"
      }`}
    >
      {label}
    </span>
    <div
      className={`h-px flex-1 ${
        tone === "amber"
          ? "bg-gradient-to-r from-amber-300/22 via-amber-200/10 to-transparent"
          : tone === "cyan"
            ? "bg-gradient-to-r from-cyan-300/22 via-cyan-200/10 to-transparent"
            : "bg-gradient-to-r from-white/12 via-white/6 to-transparent"
      }`}
    />
  </div>
);

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
      {!noActivity && failedBlocks.length > 0 && (
        <div className={`${inspectorCardRegularClass} border-amber-300/16 bg-amber-400/[0.08]`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone="warn">복구 우선</StatusBadge>
            <StatusBadge tone="neutral">실패 {failedBlocks.length}건</StatusBadge>
            <StatusBadge tone="neutral">
              {analyzeCache ? "분석 결과 있음" : "분석 대기"}
            </StatusBadge>
          </div>
          <div className="mt-2 rounded-xl border border-amber-300/14 bg-black/10 px-2 py-1.5">
            <ActionFlowBar
              badges={[
                "실패 복구",
                focusedFailedBlock ? "선택 블록 준비" : "실패 블록 확인",
                analyzeCache ? "추천 명령 확인" : "즉시 분석 가능",
              ]}
              helper={analyzeCache
                ? "이미 분석된 결과와 추천 명령이 있어 바로 검토하거나 적용 흐름으로 넘어갈 수 있습니다."
                : "실패 블록을 먼저 확인한 뒤 바로 분석을 시작하는 흐름이 현재 우선순위입니다."}
              tone="amber"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleActivePrimaryAction}
              className="inline-flex items-center rounded-lg border border-amber-200/18 bg-amber-300/12 px-3 py-1.5 text-xs font-medium text-amber-50 transition-colors hover:bg-amber-300/18 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {activePrimaryAction.label}
            </button>
            <p className="text-[11px] leading-relaxed text-amber-50/72">
              {activePrimaryAction.helper}
            </p>
          </div>
        </div>
      )}
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
      {!noActivity && failedBlocks.length > 0 && (
        <InspectorStageDivider label="1단계 복구 확인" tone="amber" />
      )}
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
          {failedBlocks.length === 0 && (
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
          )}
        </div>
      )}
      {!noActivity && (
        <>
        <InspectorStageDivider label="실패 블록" tone="amber" />
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
        </>
      )}
      {!noActivity && (
        <>
        <InspectorStageDivider label="2단계 분석 결과" tone="cyan" />
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
        </>
      )}
      {!noActivity && recentBlocks.length > 0 && (
        <>
        <InspectorStageDivider label="3단계 후속 확인" tone="neutral" />
        <InspectorRecentBlocksCard
          recentBlocks={recentBlocks}
          inspectorCardRegularClass={inspectorCardRegularClass}
          onSelectBlock={onSelectBlock}
          onRerunBlock={onRerunBlock}
          onLoadAnalyzePromptToAiBar={onLoadAnalyzePromptToAiBar}
        />
        </>
      )}
      {!noActivity && <InspectorStageDivider label="4단계 운영 이동" tone="neutral" />}
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
