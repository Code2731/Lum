import { useMemo } from "react";
import type { CommandBlock } from "./useCommandBlocks";
import type {
  InspectorPanelDataProps,
  ScriptLibraryLike,
} from "../components/InspectorPanel/types";
import { normalizeBlockId } from "../utils";

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

const FAILED_BLOCK_OUTPUT_TAIL_MAX_CHARS = 160;
const RECENT_BLOCK_OUTPUT_TAIL_MAX_CHARS = 120;

function extractOutputTail(output: string, maxChars = FAILED_BLOCK_OUTPUT_TAIL_MAX_CHARS): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim());
  const nonEmptyCount = lines.filter((line) => line.length > 0).length;
  if (nonEmptyCount === 0) return "";
  if (nonEmptyCount === 1) return lines.length === 1 ? (lines[0] ?? "") : "";
  let tail = lines.at(-1) ?? "";
  if (!tail) {
    for (let i = lines.length - 2; i >= 0; i -= 1) {
      if (lines[i]) {
        tail = lines[i];
        break;
      }
    }
  }
  if (tail.length <= maxChars) return tail;
  return `${tail.slice(0, maxChars)}...`;
}

function normalizeCommandText(command: string): string {
  const lines = command
    .split(/\r?\n/)
    .map((line) => line.trim());
  const kept: string[] = [];
  for (const line of lines) {
    if (!line) break;
    kept.push(line);
  }
  return kept.join("\n");
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
  // 브랜치 변경 수는 안전한 정수만 허용한다. 음수/무한대/비정수/과도값은 UI에 노출되지 않도록 제거한다.
  if (!Number.isSafeInteger(next)) return undefined;
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
        command: normalizeCommandText(b.command),
        exitCode: b.exitCode ?? 1,
        outputTail: extractOutputTail(b.output),
      }))
      .reverse()
  ), [cmdBlocks]);

  const normalizedSelectedBlockId = useMemo(() => normalizeBlockId(selectedBlockId), [selectedBlockId]);

  const focusedFailedBlock = useMemo(() => {
    if (inspectorFailedBlocks.length === 0) return null;
    if (normalizedSelectedBlockId) {
      const selected = inspectorFailedBlocks.find((b) => b.id === normalizedSelectedBlockId);
      if (selected) return selected;
    }
    return inspectorFailedBlocks[0];
  }, [inspectorFailedBlocks, normalizedSelectedBlockId]);

  const recentBlocks = useMemo(() => (
    cmdBlocks
      .filter((b) => b.command.trim() !== "")
      .slice(-6)
      .reverse()
      .map((b) => ({
        id: b.id,
        command: normalizeCommandText(b.command),
        exitCode: b.exitCode,
        durationMs: Math.max(0, (b.endedAt ?? b.startedAt) - b.startedAt),
        outputTail: extractOutputTail(b.output, RECENT_BLOCK_OUTPUT_TAIL_MAX_CHARS),
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
