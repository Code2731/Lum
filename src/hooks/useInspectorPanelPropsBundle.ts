import type { CommandBlock } from "./useCommandBlocks";
import type { ScriptLibraryLike, InspectorPanelProps } from "../components/InspectorPanel/types";
import { useInspectorPanelData } from "./useInspectorPanelData";
import { useInspectorPanelProps } from "./useInspectorPanelProps";

export type InspectorPanelActionHandlerProps = Pick<
  InspectorPanelProps,
  | "onDensityToggle"
  | "onClose"
  | "onTabSelect"
  | "onTabKeyDown"
  | "onFocusFailedBlock"
  | "onAnalyzeFailedBlock"
  | "onCopyFailedOutput"
  | "onCopyAnalyzePrompt"
  | "onLoadAnalyzePromptToAiBar"
  | "onSelectBlock"
  | "onCopyAnalyzeResult"
  | "onClearAnalyzeCache"
  | "onCopySuggestedCommand"
  | "onLoadSuggestedCommandToAiBar"
  | "onApplySuggestedCommand"
  | "onRerunBlock"
  | "onCommandMenuRowBlurCapture"
  | "onSuggestedCommandRowKeyDown"
  | "onCompactMenuKeyDown"
  | "onOpenCompactMenu"
  | "onCloseCommandMenu"
  | "onQuickActionsToggle"
  | "onQuickActionsToggleKeyDown"
  | "onQuickActionsAdvancedKeyDown"
  | "onToggleProjectBin"
  | "onOpenWorkspace"
  | "onOpenHistory"
  | "onOpenDiffReview"
  | "onOpenFailedBlock"
>;

interface UseInspectorPanelPropsBundleOptions {
  showInspector: boolean;
  selectedModel: string;
  inspectorTab: InspectorPanelProps["inspectorTab"];
  inspectorDensity: InspectorPanelProps["inspectorDensity"];
  inspectorTabs: InspectorPanelProps["inspectorTabs"];
  inspectorTabRefs: InspectorPanelProps["inspectorTabRefs"];

  activeTab: {
    title: string;
    cwd: string;
  } | null;
  activeTabGitInfo: {
    branch?: string;
    changed?: number;
  } | null;
  cmdBlocks: readonly CommandBlock[];
  selectedBlockId: string | null;
  inspectorAnalyzeCache: InspectorPanelProps["analyzeCache"];
  commandMenuIndex: number | null;
  showInspectorQuickActionsExpanded: boolean;
  inspectorMoreButtonRefs: InspectorPanelProps["inspectorMoreButtonRefs"];
  inspectorMenuFirstActionRefs: InspectorPanelProps["inspectorMenuFirstActionRefs"];
  inspectorQuickActionsToggleRef: InspectorPanelProps["inspectorQuickActionsToggleRef"];
  inspectorQuickActionsAdvancedRef: InspectorPanelProps["inspectorQuickActionsAdvancedRef"];
  scriptLibrary: ScriptLibraryLike;

  handlers: InspectorPanelActionHandlerProps;
}

export function useInspectorPanelPropsBundle({
  showInspector,
  selectedModel,
  inspectorTab,
  inspectorDensity,
  inspectorTabs,
  inspectorTabRefs,
  activeTab,
  activeTabGitInfo,
  cmdBlocks,
  selectedBlockId,
  inspectorAnalyzeCache,
  commandMenuIndex,
  showInspectorQuickActionsExpanded,
  inspectorMoreButtonRefs,
  inspectorMenuFirstActionRefs,
  inspectorQuickActionsToggleRef,
  inspectorQuickActionsAdvancedRef,
  scriptLibrary,
  handlers,
}: UseInspectorPanelPropsBundleOptions): InspectorPanelProps {
  const data = useInspectorPanelData({
    showInspector,
    selectedModel,
    inspectorTab,
    inspectorDensity,
    inspectorTabs,
    inspectorTabRefs,
    activeTab,
    activeTabGitInfo,
    cmdBlocks,
    selectedBlockId,
    inspectorAnalyzeCache,
    inspectorCommandMenuIndex: commandMenuIndex,
    quickActionsExpanded: showInspectorQuickActionsExpanded,
    inspectorMoreButtonRefs,
    inspectorMenuFirstActionRefs,
    inspectorQuickActionsToggleRef,
    inspectorQuickActionsAdvancedRef,
    scriptLibrary,
  });

  return useInspectorPanelProps({
    ...data,
    ...handlers,
  });
}
