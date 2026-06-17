import { useMemo } from "react";
import type { CommandBlock } from "./useCommandBlocks";
import type {
  InspectorPanelDataProps,
  ScriptLibraryLike,
} from "../components/InspectorPanel/types";

interface TabMeta {
  title: string;
  cwd: string;
}

interface UseInspectorPanelDataOptions {
  showInspector: boolean;
  selectedModel: string;
  inspectorTab: InspectorPanelDataProps["inspectorTab"];
  inspectorDensity: InspectorPanelDataProps["inspectorDensity"];
  inspectorTabs: InspectorPanelDataProps["inspectorTabs"];
  inspectorTabRefs: InspectorPanelDataProps["inspectorTabRefs"];
  activeTab: TabMeta | null;
  activeTabGitInfo: { branch?: string; changed?: number } | null;
  cmdBlocks: readonly CommandBlock[];
  selectedBlockId: string | null;
  inspectorAnalyzeCache: InspectorPanelDataProps["analyzeCache"];
  inspectorCommandMenuIndex: number | null;
  quickActionsExpanded: boolean;
  inspectorMoreButtonRefs: InspectorPanelDataProps["inspectorMoreButtonRefs"];
  inspectorMenuFirstActionRefs: InspectorPanelDataProps["inspectorMenuFirstActionRefs"];
  inspectorQuickActionsToggleRef: InspectorPanelDataProps["inspectorQuickActionsToggleRef"];
  inspectorQuickActionsAdvancedRef: InspectorPanelDataProps["inspectorQuickActionsAdvancedRef"];
  scriptLibrary: ScriptLibraryLike;
}

function extractOutputTail(output: string, maxChars = 160): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "";
  const tail = lines[lines.length - 1];
  if (tail.length <= maxChars) return tail;
  return `${tail.slice(0, maxChars)}...`;
}

function normalizeOrFallback(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeOptionalString(value: string | undefined | null): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized;
}

function normalizeNonNegativeInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const next = Math.trunc(value);
  if (next < 0) return undefined;
  return next;
}

export function useInspectorPanelData({
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
  inspectorCommandMenuIndex,
  quickActionsExpanded,
  inspectorMoreButtonRefs,
  inspectorMenuFirstActionRefs,
  inspectorQuickActionsToggleRef,
  inspectorQuickActionsAdvancedRef,
  scriptLibrary,
}: UseInspectorPanelDataOptions): InspectorPanelDataProps {
  const inspectorFailedBlocks = useMemo(() => (
    cmdBlocks
      .filter((b) => b.exitCode !== null && b.exitCode !== 0 && b.command.trim() !== "")
      .map((b) => ({
        id: b.id,
        command: b.command.trim(),
        exitCode: b.exitCode ?? 1,
        outputTail: extractOutputTail(b.output),
      }))
      .reverse()
  ), [cmdBlocks]);

  const focusedFailedBlock = useMemo(() => {
    if (inspectorFailedBlocks.length === 0) return null;
    if (selectedBlockId) {
      const selected = inspectorFailedBlocks.find((b) => b.id === selectedBlockId);
      if (selected) return selected;
    }
    return inspectorFailedBlocks[0];
  }, [inspectorFailedBlocks, selectedBlockId]);

  const recentBlocks = useMemo(() => (
    cmdBlocks
      .filter((b) => b.command.trim() !== "")
      .slice(-6)
      .reverse()
      .map((b) => ({
        id: b.id,
        command: b.command.trim(),
        exitCode: b.exitCode,
        durationMs: b.endedAt != null ? Math.max(0, b.endedAt - b.startedAt) : null,
        outputTail: extractOutputTail(b.output, 120),
      }))
  ), [cmdBlocks]);

  const noActivity = cmdBlocks.length === 0 && !inspectorAnalyzeCache;

  return useMemo(() => ({
    showInspector,
    selectedModel,
    inspectorTab,
    inspectorDensity,
    inspectorTabs,
    inspectorTabRefs,

    activeTabTitle: normalizeOrFallback(activeTab?.title, "탭 없음"),
    activeTabPath: normalizeOrFallback(activeTab?.cwd, "cwd 없음"),
    activeTabBranch: normalizeOptionalString(activeTabGitInfo?.branch),
    activeTabChanged: normalizeNonNegativeInteger(activeTabGitInfo?.changed),

    noActivity,
    failedBlocks: inspectorFailedBlocks,
    focusedFailedBlock,
    analyzeCache: inspectorAnalyzeCache,
    recentBlocks,

    commandMenuIndex: inspectorCommandMenuIndex,
    quickActionsExpanded,
    inspectorMoreButtonRefs,
    inspectorMenuFirstActionRefs,
    inspectorQuickActionsToggleRef,
    inspectorQuickActionsAdvancedRef,
    scriptLibrary,
  }), [
    showInspector,
    selectedModel,
    inspectorTab,
    inspectorDensity,
    inspectorTabs,
    inspectorTabRefs,
    activeTab,
    activeTabGitInfo,
    noActivity,
    inspectorFailedBlocks,
    focusedFailedBlock,
    inspectorAnalyzeCache,
    recentBlocks,
    inspectorCommandMenuIndex,
    quickActionsExpanded,
    inspectorMoreButtonRefs,
    inspectorMenuFirstActionRefs,
    inspectorQuickActionsToggleRef,
    inspectorQuickActionsAdvancedRef,
    scriptLibrary,
  ]);
}
