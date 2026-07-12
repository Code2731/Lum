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

export interface InspectorPanelFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export interface InspectorPanelDataMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

const FAILED_BLOCK_OUTPUT_TAIL_MAX_CHARS = 160;
const RECENT_BLOCK_OUTPUT_TAIL_MAX_CHARS = 120;

function extractOutputTail(output: string, maxChars = FAILED_BLOCK_OUTPUT_TAIL_MAX_CHARS): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim());
  const nonEmptyCount = lines.filter((line) => line.length > 0).length;
  if (nonEmptyCount === 0) return "";
  if (nonEmptyCount === 1) return lines.length === 1 ? (lines[0] ?? "") : "";
  let tail = lines[lines.length - 1] ?? "";
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
  if (value == null || !Number.isFinite(value)) return undefined;
  const next = Math.trunc(value);
  // 브랜치 변경 수는 안전한 정수만 허용한다. 음수/무한대/비정수/과도값은 UI에 노출되지 않도록 제거한다.
  if (!Number.isSafeInteger(next)) return undefined;
  if (next < 0) return undefined;
  return next;
}

export function getInspectorPanelFlowSummary({
  activeTabTitle,
  noActivity,
  failedBlockCount,
  recentBlockCount,
}: {
  activeTabTitle: string;
  noActivity: boolean;
  failedBlockCount: number;
  recentBlockCount: number;
}): InspectorPanelFlowSummary {
  if (noActivity) {
    return {
      badges: [activeTabTitle || "현재 탭", "실행 대기", "첫 기록 수집 전"],
      helper: "아직 실행 기록이 없어 첫 명령을 실행하면 실패 분석과 최근 기록 흐름이 여기서부터 시작됩니다.",
    };
  }

  if (failedBlockCount > 0) {
    return {
      badges: [activeTabTitle || "현재 탭", `실패 ${failedBlockCount}개`, `최근 ${recentBlockCount}개`],
      helper: "실패 블록이 있어 복구나 재실행을 먼저 보고, 이후 최근 기록 흐름으로 이어가는 상태입니다.",
    };
  }

  return {
    badges: [activeTabTitle || "현재 탭", "실패 없음", `최근 ${recentBlockCount}개`],
    helper: "현재는 치명적인 실패 없이 최근 실행 기록을 중심으로 흐름을 확인할 수 있는 상태입니다.",
  };
}

export function getInspectorPanelDataMeta(input: {
  activeTabTitle: string;
  failedBlockCount: number;
  recentBlockCount: number;
  inspectorAnalyzeStatus: InspectorPanelDataProps["analyzeCache"] extends { status: infer T } ? T | null : string | null;
  quickActionsExpanded: boolean;
}): InspectorPanelDataMeta {
  const analyzeLabel = input.inspectorAnalyzeStatus ?? "idle";
  return {
    title: input.failedBlockCount > 0 ? `${input.activeTabTitle} 인스펙터 상태` : `${input.activeTabTitle} 실행 요약`,
    badges: [
      `실패 ${input.failedBlockCount}개`,
      `최근 ${input.recentBlockCount}개`,
      input.quickActionsExpanded ? `빠른 액션 펼침 · 분석 ${analyzeLabel}` : `빠른 액션 접힘 · 분석 ${analyzeLabel}`,
    ],
    helper: input.failedBlockCount > 0
      ? "실패 블록, 최근 실행 기록, 분석 캐시를 함께 보며 복구나 재실행 흐름을 이어갈 수 있습니다."
      : "최근 실행 기록과 빠른 액션을 중심으로 현재 탭의 작업 흐름을 점검할 수 있습니다.",
  };
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
