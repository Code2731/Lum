import type { CommandBlock } from "./useCommandBlocks";
import type {
  InspectorPanelActionProps,
  InspectorPanelDataProps,
  InspectorPanelProps,
  ScriptLibraryLike,
} from "../components/InspectorPanel/types";
import { useInspectorPanelData } from "./useInspectorPanelData";
import { useInspectorPanelProps } from "./useInspectorPanelProps";
import { normalizeBlockId } from "../utils";

export type InspectorPanelActionHandlerProps = InspectorPanelActionProps;

interface ActiveTabInfo {
  title: string;
  cwd: string;
}

interface ActiveTabGitInfo {
  branch?: string;
  changed?: number;
}

export interface UseInspectorPanelPropsBundleOptions {
  showInspector: boolean;
  selectedModel: InspectorPanelDataProps["selectedModel"];
  inspectorTab: InspectorPanelDataProps["inspectorTab"];
  inspectorDensity: InspectorPanelDataProps["inspectorDensity"];
  inspectorTabs: InspectorPanelDataProps["inspectorTabs"];
  inspectorTabRefs: InspectorPanelDataProps["inspectorTabRefs"];

  activeTab: ActiveTabInfo | null;
  activeTabGitInfo: ActiveTabGitInfo | null;
  cmdBlocks: readonly CommandBlock[];
  selectedBlockId: string | null;
  inspectorAnalyzeCache: InspectorPanelDataProps["analyzeCache"];
  commandMenuIndex: InspectorPanelDataProps["commandMenuIndex"];
  showInspectorQuickActionsExpanded: InspectorPanelDataProps["quickActionsExpanded"];
  inspectorMoreButtonRefs: InspectorPanelDataProps["inspectorMoreButtonRefs"];
  inspectorMenuFirstActionRefs: InspectorPanelDataProps["inspectorMenuFirstActionRefs"];
  inspectorQuickActionsToggleRef: InspectorPanelDataProps["inspectorQuickActionsToggleRef"];
  inspectorQuickActionsAdvancedRef: InspectorPanelDataProps["inspectorQuickActionsAdvancedRef"];
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
  const normalizedSelectedBlockId = normalizeBlockId(selectedBlockId);

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
    selectedBlockId: normalizedSelectedBlockId,
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
