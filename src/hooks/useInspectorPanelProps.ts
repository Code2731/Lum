import { useMemo } from "react";
import type {
  InspectorPanelActionProps,
  InspectorPanelDataProps,
  InspectorPanelProps,
} from "../components/InspectorPanel/types";

export interface InspectorPanelPropsMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

export function getInspectorPanelPropsMeta(props: InspectorPanelProps): InspectorPanelPropsMeta {
  return {
    title: props.showInspector ? `${props.activeTabTitle} 인스펙터` : "인스펙터 숨김",
    badges: [
      `탭 ${props.inspectorTab}`,
      `실패 ${props.failedBlocks.length}개`,
      props.quickActionsExpanded ? "빠른 액션 펼침" : "빠른 액션 접힘",
    ],
    helper: props.showInspector
      ? "현재 탭의 실패 블록, 최근 실행, 빠른 액션, 분석 흐름을 하나의 인스펙터 패널로 묶어 보여줍니다."
      : "인스펙터를 열면 현재 탭의 실행 흐름과 복구 단서를 한 번에 확인할 수 있습니다.",
  };
}

export function useInspectorPanelProps(
  props: InspectorPanelProps,
): InspectorPanelProps {
  const dataProps = useMemo<InspectorPanelDataProps>(() => ({
    showInspector: props.showInspector,
    selectedModel: props.selectedModel,
    inspectorTab: props.inspectorTab,
    inspectorDensity: props.inspectorDensity,
    inspectorTabs: props.inspectorTabs,
    inspectorTabRefs: props.inspectorTabRefs,
    activeTabTitle: props.activeTabTitle,
    activeTabPath: props.activeTabPath,
    activeTabBranch: props.activeTabBranch,
    activeTabChanged: props.activeTabChanged,
    noActivity: props.noActivity,
    failedBlocks: props.failedBlocks,
    focusedFailedBlock: props.focusedFailedBlock,
    analyzeCache: props.analyzeCache,
    recentBlocks: props.recentBlocks,
    commandMenuIndex: props.commandMenuIndex,
    quickActionsExpanded: props.quickActionsExpanded,
    inspectorMoreButtonRefs: props.inspectorMoreButtonRefs,
    inspectorMenuFirstActionRefs: props.inspectorMenuFirstActionRefs,
    inspectorQuickActionsToggleRef: props.inspectorQuickActionsToggleRef,
    inspectorQuickActionsAdvancedRef: props.inspectorQuickActionsAdvancedRef,
    scriptLibrary: props.scriptLibrary,
  }), [
    props.showInspector,
    props.selectedModel,
    props.inspectorTab,
    props.inspectorDensity,
    props.inspectorTabs,
    props.inspectorTabRefs,
    props.activeTabTitle,
    props.activeTabPath,
    props.activeTabBranch,
    props.activeTabChanged,
    props.noActivity,
    props.failedBlocks,
    props.focusedFailedBlock,
    props.analyzeCache,
    props.recentBlocks,
    props.commandMenuIndex,
    props.quickActionsExpanded,
    props.inspectorMoreButtonRefs,
    props.inspectorMenuFirstActionRefs,
    props.inspectorQuickActionsToggleRef,
    props.inspectorQuickActionsAdvancedRef,
    props.scriptLibrary,
  ]);

  const actionProps = useMemo<InspectorPanelActionProps>(() => ({
    onDensityToggle: props.onDensityToggle,
    onClose: props.onClose,
    onTabSelect: props.onTabSelect,
    onTabKeyDown: props.onTabKeyDown,
    onFocusFailedBlock: props.onFocusFailedBlock,
    onAnalyzeFailedBlock: props.onAnalyzeFailedBlock,
    onCopyFailedOutput: props.onCopyFailedOutput,
    onCopyAnalyzePrompt: props.onCopyAnalyzePrompt,
    onLoadAnalyzePromptToAiBar: props.onLoadAnalyzePromptToAiBar,
    onSelectBlock: props.onSelectBlock,
    onCopyAnalyzeResult: props.onCopyAnalyzeResult,
    onClearAnalyzeCache: props.onClearAnalyzeCache,
    onCopySuggestedCommand: props.onCopySuggestedCommand,
    onLoadSuggestedCommandToAiBar: props.onLoadSuggestedCommandToAiBar,
    onApplySuggestedCommand: props.onApplySuggestedCommand,
    onRerunBlock: props.onRerunBlock,
    onCommandMenuRowBlurCapture: props.onCommandMenuRowBlurCapture,
    onSuggestedCommandRowKeyDown: props.onSuggestedCommandRowKeyDown,
    onCompactMenuKeyDown: props.onCompactMenuKeyDown,
    onOpenCompactMenu: props.onOpenCompactMenu,
    onCloseCommandMenu: props.onCloseCommandMenu,
    onQuickActionsToggle: props.onQuickActionsToggle,
    onQuickActionsToggleKeyDown: props.onQuickActionsToggleKeyDown,
    onQuickActionsAdvancedKeyDown: props.onQuickActionsAdvancedKeyDown,
    onToggleProjectBin: props.onToggleProjectBin,
    onOpenWorkspace: props.onOpenWorkspace,
    onOpenHistory: props.onOpenHistory,
    onOpenDiffReview: props.onOpenDiffReview,
    onOpenFailedBlock: props.onOpenFailedBlock,
  }), [
    props.onDensityToggle,
    props.onClose,
    props.onTabSelect,
    props.onTabKeyDown,
    props.onFocusFailedBlock,
    props.onAnalyzeFailedBlock,
    props.onCopyFailedOutput,
    props.onCopyAnalyzePrompt,
    props.onLoadAnalyzePromptToAiBar,
    props.onSelectBlock,
    props.onCopyAnalyzeResult,
    props.onClearAnalyzeCache,
    props.onCopySuggestedCommand,
    props.onLoadSuggestedCommandToAiBar,
    props.onApplySuggestedCommand,
    props.onRerunBlock,
    props.onCommandMenuRowBlurCapture,
    props.onSuggestedCommandRowKeyDown,
    props.onCompactMenuKeyDown,
    props.onOpenCompactMenu,
    props.onCloseCommandMenu,
    props.onQuickActionsToggle,
    props.onQuickActionsToggleKeyDown,
    props.onQuickActionsAdvancedKeyDown,
    props.onToggleProjectBin,
    props.onOpenWorkspace,
    props.onOpenHistory,
    props.onOpenDiffReview,
    props.onOpenFailedBlock,
  ]);

  return useMemo(
    () => ({
      ...dataProps,
      ...actionProps,
    }),
    [dataProps, actionProps],
  );
}
