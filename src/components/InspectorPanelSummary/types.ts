import React from "react";
import type {
  InspectorAnalyzeCache,
  InspectorFailedBlock,
  InspectorRecentBlock,
} from "../InspectorPanel/types";

export interface InspectorPanelSummaryData {
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

export interface InspectorPanelSummaryLayout {
  quickActionsExpanded: boolean;
  isInspectorCompact: boolean;
  inspectorSummaryWrapClass: string;
  inspectorCardTightClass: string;
  inspectorCardRegularClass: string;
  inspectorQuickGridClass: string;
}

export interface InspectorPanelSummaryRefs {
  inspectorMoreButtonRefs: React.MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorMenuFirstActionRefs: React.MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorQuickActionsToggleRef: React.RefObject<HTMLButtonElement>;
  inspectorQuickActionsAdvancedRef: React.RefObject<HTMLDivElement>;
}

export interface InspectorPanelSummaryActions {
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

export interface InspectorPanelSummaryProps {
  data: InspectorPanelSummaryData;
  layout: InspectorPanelSummaryLayout;
  refs: InspectorPanelSummaryRefs;
  actions: InspectorPanelSummaryActions;
}
