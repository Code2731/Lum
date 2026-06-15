import type {
  FocusEvent,
  KeyboardEvent,
  MutableRefObject,
  RefObject,
} from "react";
import type { Script } from "../../hooks/useScriptLibrary";

export type InspectorTab = "summary" | "rag" | "scripts" | "sysmon";
export type InspectorDensity = "cozy" | "compact";

export interface InspectorAnalyzeCache {
  blockId: string;
  command: string;
  requestedAt: number;
  status: "streaming" | "done" | "error";
  result: string;
  rawResult: string;
  suggestedCommands: string[];
}

export interface InspectorFailedBlock {
  id: string;
  command: string;
  exitCode: number;
  outputTail: string;
}

export interface InspectorRecentBlock {
  id: string;
  command: string;
  exitCode: number | null;
  durationMs: number | null;
  outputTail: string;
}

export interface InspectorTabItem {
  id: InspectorTab;
  label: string;
  shortcut: string;
}

export interface ScriptLibraryLike {
  scripts: Script[];
  loading: boolean;
  onLoad: () => Promise<void>;
  onRun: (commands: string[]) => void;
  onDelete: (id: string) => Promise<void>;
  onSave: (name: string, description: string, commands: string[]) => Promise<Script>;
}

export interface InspectorPanelProps {
  showInspector: boolean;
  selectedModel: string;
  inspectorTab: InspectorTab;
  inspectorDensity: InspectorDensity;
  inspectorTabs: readonly InspectorTabItem[];
  inspectorTabRefs: MutableRefObject<Record<InspectorTab, HTMLButtonElement | null>>;

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
  inspectorMoreButtonRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorMenuFirstActionRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorQuickActionsToggleRef: RefObject<HTMLButtonElement>;
  inspectorQuickActionsAdvancedRef: RefObject<HTMLDivElement>;

  onDensityToggle: () => void;
  onClose: () => void;
  onTabSelect: (tab: InspectorTab) => void;
  onTabKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;

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
  onCommandMenuRowBlurCapture: (e: FocusEvent<HTMLDivElement>, rowIndex: number) => void;
  onSuggestedCommandRowKeyDown: (e: KeyboardEvent<HTMLDivElement>, rowIndex: number) => void;
  onCompactMenuKeyDown: (e: KeyboardEvent<HTMLDivElement>, rowIndex: number) => void;
  onOpenCompactMenu: (index: number) => void;
  onCloseCommandMenu: (restoreFocus?: boolean) => void;

  onQuickActionsToggle: () => void;
  onQuickActionsToggleKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onQuickActionsAdvancedKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onToggleProjectBin: () => void;
  onOpenWorkspace: () => void;
  onOpenHistory: () => void;
  onOpenDiffReview: () => void;
  onOpenFailedBlock: () => void;

  scriptLibrary: ScriptLibraryLike;
}
