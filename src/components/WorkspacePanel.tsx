import React, { useMemo, useState } from "react";
import { Check, Layers, Save, Trash2, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete";
import { WorkspaceCardBadges } from "@/components/ui/workspace-card-badges";
import { RecommendationCardActions } from "@/components/ui/recommendation-card-actions";
import { RecommendationCardAction } from "@/components/ui/recommendation-card-action";
import { RecommendationCard } from "@/components/ui/recommendation-card";
import { SectionIntroHeader } from "@/components/ui/section-intro-header";
import { WorkspaceTabChip } from "@/components/ui/workspace-tab-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCardMeta } from "@/components/ui/workspace-card-meta";
import { focusMainInput } from "@/utils/focus";
import type { Workspace, WorkspaceTab } from "../hooks/useWorkspace";
import {
  getWorkspaceRecommendationReason,
  getWorkspaceSectionDescription,
} from "../utils/workspace-recommendation";
import {
  getLatestRestoredWorkspaceId,
  getMostRestoredWorkspaceId,
  loadWorkspaceRestoreMeta,
  markWorkspaceRestored,
  persistWorkspaceRestoreMeta,
  type WorkspaceRestoreMeta,
  sortWorkspacesByRestoreMeta,
} from "../utils/workspaceRestoreMeta";
import { countWorkspaceProjects } from "../utils/workspaceSummary";

interface Props {
  currentTabs: WorkspaceTab[];
  activeTabId: string;
  workspaces: Workspace[];
  loading: boolean;
  onSave: (name: string) => Promise<void>;
  onRestore: (ws: Workspace) => void;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

const WORKSPACE_NAME_SUGGESTIONS = [
  "결제 버그 조사",
  "QA 재현",
  "릴리스 점검",
] as const;

export interface WorkspacePanelFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getWorkspaceSaveFlowSummary(
  hasSuggestedName: boolean,
  hasManualWorkspaceName: boolean,
): WorkspacePanelFlowSummary {
  return {
    badges: [
      hasSuggestedName ? "추천 이름 확인" : hasManualWorkspaceName ? "직접 이름 확인" : "먼저 이름 확인",
      "다음 저장 준비",
      "마지막 복귀 연결",
    ],
    helper: hasSuggestedName
      ? "추천 이름을 빠르게 적용한 뒤 저장하면 다음 복귀 흐름 상단에서 바로 이어갈 수 있습니다."
      : hasManualWorkspaceName
        ? "직접 입력한 이름을 확인하고 저장하면 다음 복귀 흐름에서 같은 작업 맥락을 더 쉽게 다시 찾을 수 있습니다."
        : "현재 세션 이름을 먼저 정하고 저장하면 다음 복귀 흐름에 탭 묶음과 프로젝트 문맥이 함께 추가됩니다.",
  };
}

export function getWorkspaceEmptyFlowSummary(): WorkspacePanelFlowSummary {
  return {
    badges: ["먼저 저장", "탭 흐름", "다음 복귀"],
    helper: "위에서 현재 세션을 저장해 두면 다음에 탭 묶음과 프로젝트 문맥을 바로 복구할 수 있습니다.",
  };
}

export function getWorkspaceRecommendedFlowSummary(count: number): WorkspacePanelFlowSummary {
  return {
    badges: [`추천 복귀 ${count}개`, "탭 흐름", "대표 경로"],
    helper: "최근에 이어갈 흐름과 프로젝트 위치를 함께 정리합니다.",
  };
}

export function getWorkspaceArchiveFlowSummary(): WorkspacePanelFlowSummary {
  return {
    badges: ["보관 탐색", "탭 흐름", "저장 시점"],
    helper: "보관된 흐름을 다시 열기 전에 탭과 저장 시점을 함께 훑어봅니다.",
  };
}

function fmtDate(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtRecentDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const WorkspacePanel: React.FC<Props> = ({
  currentTabs, activeTabId, workspaces, loading,
  onSave, onRestore, onDelete, onClose,
}) => {
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [recentRestoreMeta, setRecentRestoreMeta] = useState<WorkspaceRestoreMeta>(() => loadWorkspaceRestoreMeta());
  const currentProjectCount = countWorkspaceProjects(currentTabs);
  const trimmedSaveName = saveName.trim();
  const pendingWorkspaceName = trimmedSaveName || `워크스페이스 ${new Date().toLocaleDateString("ko-KR")}`;
  const sortedWorkspaces = useMemo(
    () => sortWorkspacesByRestoreMeta(workspaces, recentRestoreMeta),
    [recentRestoreMeta, workspaces],
  );
  const recommendedWorkspaces = sortedWorkspaces.slice(0, 2);
  const remainingWorkspaces = sortedWorkspaces.slice(2);
  const latestRestoredWorkspaceId = getLatestRestoredWorkspaceId(recentRestoreMeta);
  const mostRestoredWorkspaceId = getMostRestoredWorkspaceId(recentRestoreMeta);
  const selectedSuggestedName = WORKSPACE_NAME_SUGGESTIONS.find((suggestion) => suggestion === trimmedSaveName) ?? null;
  const hasManualWorkspaceName = Boolean(trimmedSaveName && !selectedSuggestedName);
  const saveFlow = getWorkspaceSaveFlowSummary(Boolean(selectedSuggestedName), hasManualWorkspaceName);
  const emptyFlow = getWorkspaceEmptyFlowSummary();
  const recommendedFlow = getWorkspaceRecommendedFlowSummary(recommendedWorkspaces.length);
  const archiveFlow = getWorkspaceArchiveFlowSummary();

  const handleSave = async () => {
    const name = pendingWorkspaceName;
    setSaving(true);
    try { await onSave(name); setSaveName(""); } finally { setSaving(false); }
  };
  const handleRestore = (ws: Workspace) => {
    const next = markWorkspaceRestored(recentRestoreMeta, ws.id);
    setRecentRestoreMeta(next);
    persistWorkspaceRestoreMeta(next);
    onRestore(ws);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[580px] max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden border-white/10 rounded-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusMainInput();
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/8 shrink-0">
          <Layers size={15} className="text-accent" />
          <DialogTitle className="text-sm font-semibold">워크스페이스</DialogTitle>
        </div>

        {/* 현재 세션 저장 */}
        <div className="px-5 py-4 border-b border-white/8 shrink-0">
          <div className="mb-2">
            <SectionIntroHeader
              title="현재 세션 저장"
              description={`현재 탭 ${currentTabs.length}개와 프로젝트 ${currentProjectCount}곳을 복귀 지점으로 저장합니다.`}
              titleClassName="text-xs text-white/35"
              descriptionClassName="mt-1 text-[11px] leading-4 text-white/38"
              aside={(
                <div className="flex items-center gap-1.5">
                  <StatusBadge tone="neutral">{currentTabs.length}개 탭 준비</StatusBadge>
                  <StatusBadge tone="cyan" className="px-2">
                    빠른 복귀
                  </StatusBadge>
                </div>
              )}
            />
          </div>
          <div className="mb-2 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
            <ActionFlowBar badges={saveFlow.badges} helper={saveFlow.helper} tone="cyan" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1 bg-white/3 border border-white/7 rounded-2xl px-3 py-2">
              <div className="flex gap-1 flex-wrap mb-2">
                {currentTabs.map(t => (
                  <WorkspaceTabChip
                    key={t.id}
                    title={t.title}
                    cwd={t.cwd}
                    active={t.id === activeTabId}
                  />
                ))}
              </div>
              <div
                className={
                  selectedSuggestedName
                    ? "mb-2 rounded-xl border border-accent/22 bg-accent/[0.08] px-2.5 py-2 shadow-[0_0_0_1px_rgba(34,211,238,0.05)]"
                    : "mb-2 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2"
                }
              >
                {selectedSuggestedName && (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/12 px-2 py-0.5 text-[10px] font-medium text-accent">
                      <Check size={10} />
                      추천 적용 중
                    </span>
                    <span className="text-[10px] text-accent/80">
                      {selectedSuggestedName}
                    </span>
                  </div>
                )}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge tone="neutral">복귀 이름</StatusBadge>
                  <StatusBadge tone={selectedSuggestedName ? "cyan" : "neutral"}>
                    {selectedSuggestedName ? "추천 입력" : hasManualWorkspaceName ? "직접 입력" : "자동 이름"}
                  </StatusBadge>
                  <StatusBadge tone="neutral">저장 가이드</StatusBadge>
                  <span className="text-[10px] text-white/34">
                    저장 직후 추천 복귀 흐름에서 바로 이어질 이름을 정리합니다.
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] leading-4 text-white/40">
                    결제 버그 조사, QA 재현, 릴리스 점검처럼 다시 찾을 이름으로 저장해 두세요.
                  </p>
                  <span
                    className={
                      selectedSuggestedName
                        ? "shrink-0 rounded-full border border-accent/22 bg-accent/14 px-2 py-0.5 text-[10px] font-medium text-accent"
                        : "shrink-0 rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/38"
                    }
                  >
                    클릭 즉시 입력
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-white/40">
                    빠른 이름 제안
                  </span>
                  {selectedSuggestedName && (
                    <span className="rounded-full border border-accent/24 bg-accent/14 px-2 py-0.5 text-[10px] font-medium text-accent">
                      선택됨
                    </span>
                  )}
                  {WORKSPACE_NAME_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                    onClick={() => setSaveName(suggestion)}
                      className={
                        saveName === suggestion
                          ? "inline-flex items-center gap-1 rounded-full border border-accent/34 bg-accent/20 px-2.5 py-1 text-[11px] font-medium text-accent shadow-[0_8px_20px_rgba(34,211,238,0.12)] transition-colors"
                          : "rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/58 transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-white/82"
                      }
                    >
                      {saveName === suggestion && <Check size={10} />}
                      {suggestion}
                    </button>
                  ))}
                </div>
                {selectedSuggestedName && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-accent/88">
                      현재 선택 · {selectedSuggestedName}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSaveName(`${selectedSuggestedName} ${new Date().toLocaleDateString("ko-KR")}`)}
                      className="rounded-full border border-accent/18 bg-accent/10 px-2 py-0.5 text-[10px] text-accent/88 transition-colors hover:border-accent/26 hover:bg-accent/14"
                    >
                      날짜 붙이기
                    </button>
                  </div>
                )}
              </div>
              <input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSave();
                  }
                }}
                placeholder="예: 결제 버그 조사 · QA 재현 · 릴리스 점검"
                className="w-full rounded-xl border border-white/10 bg-black/14 px-3 py-2 text-xs text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] outline-none placeholder:text-white/28"
              />
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="min-w-0">
                  <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-white/34">
                    {trimmedSaveName ? "저장 이름" : "자동 이름"}
                  </span>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone="neutral">현재 입력</StatusBadge>
                    <StatusBadge tone={selectedSuggestedName ? "cyan" : "neutral"}>
                      {selectedSuggestedName ? "추천 복귀" : hasManualWorkspaceName ? "직접 저장" : "자동 저장"}
                    </StatusBadge>
                    <StatusBadge tone="neutral">다음 복귀</StatusBadge>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-white/58">
                    {trimmedSaveName
                      ? `현재 입력 · ${trimmedSaveName}`
                      : `${pendingWorkspaceName} 이름으로 저장됩니다.`}
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-white/36">
                    {selectedSuggestedName
                      ? "날짜 붙이기로 같은 흐름의 새 세션 버전을 바로 만듭니다."
                      : hasManualWorkspaceName
                        ? "직접 입력한 이름으로 저장하면 추천 복귀에서 바로 다시 이어갈 수 있습니다."
                        : "비워 두면 오늘 날짜 기준 기본 이름으로 빠르게 저장됩니다."}
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-white/34">
                    저장 후 추천 복귀 상단에서 이 이름으로 바로 이어집니다.
                  </p>
                </div>
                {trimmedSaveName && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={
                        selectedSuggestedName
                          ? "rounded-full border border-accent/26 bg-accent/16 px-2 py-0.5 text-[10px] font-medium text-accent"
                          : "rounded-full border border-white/12 bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/50"
                      }
                    >
                      {selectedSuggestedName ? "추천 이름" : "직접 입력"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSaveName("")}
                      className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/46 transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-white/78"
                    >
                      지우기
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/24">
                <span className="inline-flex items-center gap-1.5 text-white/34">
                  <StatusBadge tone="neutral">먼저 이름 확인</StatusBadge>
                  <span>빈칸이면 오늘 날짜로 저장</span>
                </span>
                <span className="rounded-full border border-accent/20 bg-accent/12 px-2 py-0.5 text-[10px] font-medium text-accent/92">
                  Enter 저장
                </span>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className={
                selectedSuggestedName
                  ? "shrink-0 rounded-2xl border border-accent/48 bg-accent/30 px-3 py-2.5 text-left text-accent shadow-[0_14px_34px_rgba(34,211,238,0.16)] ring-1 ring-accent/12 transition-colors hover:bg-accent/36 hover:border-accent/60 disabled:opacity-40"
                  : "shrink-0 rounded-2xl border border-accent/36 bg-accent/24 px-3 py-2.5 text-left text-accent shadow-[0_12px_28px_rgba(34,211,238,0.12)] transition-colors hover:bg-accent/32 hover:border-accent/50 disabled:opacity-40"
              }
            >
              <span className="flex items-center gap-2 text-xs font-semibold">
                <Save size={12} />
                지금 저장
                {selectedSuggestedName && (
                  <span className="rounded-full border border-accent/30 bg-accent/16 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    추천 적용
                  </span>
                )}
                {hasManualWorkspaceName && (
                  <span className="rounded-full border border-white/12 bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-white/70">
                    직접 입력
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[11px] leading-4 text-accent/84">
                {selectedSuggestedName
                  ? `${selectedSuggestedName} 이름으로 복귀 지점을 만듭니다.`
                  : trimmedSaveName
                    ? `${trimmedSaveName} 이름으로 복귀 지점을 만듭니다.`
                    : "현재 세션을 다음 복귀 흐름에 바로 추가합니다."}
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-accent/70">
                탭 {currentTabs.length}개 · 프로젝트 {currentProjectCount}곳이 함께 저장됩니다.
              </span>
              <kbd className="mt-2 inline-flex rounded border border-accent/30 bg-black/10 px-1 py-px font-mono text-[10px] leading-none text-accent/88">
                Enter
              </kbd>
            </button>
          </div>
        </div>

        {/* 저장된 워크스페이스 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-0">
          {loading && (
            <p className="text-xs text-white/25 text-center py-6">불러오는 중…</p>
          )}
          {!loading && workspaces.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center">
              <div className="mx-auto mb-3 max-w-md text-left">
                <ActionFlowBar badges={emptyFlow.badges} helper={emptyFlow.helper} tone="neutral" />
              </div>
              <p className="text-sm font-medium text-white/72">저장된 워크스페이스가 없습니다</p>
              <p className="mt-2 text-[10px] leading-5 text-white/28">
                먼저 저장해 두고, 다음에 같은 흐름을 바로 다시 엽니다.
              </p>
            </div>
          )}
          {!loading && recommendedWorkspaces.length > 0 && (
            <div className="space-y-2">
              <div className="px-1">
                <SectionIntroHeader
                  title="추천 복귀"
                  description={getWorkspaceSectionDescription("recommended")}
                  aside={(
                    <div className="flex items-center gap-1.5">
                      <StatusBadge tone="neutral">{recommendedWorkspaces.length}개 항목</StatusBadge>
                      <StatusBadge tone="neutral" className="px-2">
                        최근 우선
                      </StatusBadge>
                      <StatusBadge tone="emerald" className="px-2">
                        바로 복귀
                      </StatusBadge>
                    </div>
                  )}
                />
              </div>
              <div className="mx-1 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar badges={recommendedFlow.badges} helper={recommendedFlow.helper} tone="cyan" />
              </div>
              {recommendedWorkspaces.map((ws) => (
                <RecommendationCard
                  key={`recommended-${ws.id}`}
                  icon={<Layers size={13} className="text-accent" />}
                  title={ws.name}
                  description={
                    getWorkspaceRecommendationReason({
                      recommended: true,
                      latest: ws.id === latestRestoredWorkspaceId,
                      frequent: ws.id === mostRestoredWorkspaceId && (recentRestoreMeta[ws.id]?.restoreCount ?? 0) > 1,
                    }) ?? "추천 후보"
                  }
                  badges={(
                    <WorkspaceCardBadges
                      recommended={ws.id === recommendedWorkspaces[0]?.id && ws.id !== latestRestoredWorkspaceId}
                      latest={ws.id === latestRestoredWorkspaceId}
                      frequent={ws.id === mostRestoredWorkspaceId && (recentRestoreMeta[ws.id]?.restoreCount ?? 0) > 1}
                    />
                  )}
                  meta={(
                    <>
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <StatusBadge tone="neutral">탭 {ws.tabs.length}개</StatusBadge>
                        <StatusBadge tone="neutral">프로젝트 {countWorkspaceProjects(ws.tabs)}곳</StatusBadge>
                        {(recentRestoreMeta[ws.id]?.restoreCount ?? 0) > 0 && (
                          <StatusBadge tone="cyan">복원 {recentRestoreMeta[ws.id]?.restoreCount}회</StatusBadge>
                        )}
                      </div>
                      {recentRestoreMeta[ws.id]?.lastRestoredAt && (
                        <div className="mb-0.5 flex flex-wrap items-center gap-1">
                          <span className="rounded-full border border-cyan-300/12 bg-cyan-400/[0.06] px-1.5 py-0.5 text-[10px] text-cyan-100/48">
                            복귀 시점
                          </span>
                          <Clock size={9} className="text-cyan-100/34" />
                          <span className="text-[11px] text-cyan-100/44">
                            {fmtRecentDate(recentRestoreMeta[ws.id].lastRestoredAt)}
                          </span>
                        </div>
                      )}
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/30">
                          최근 탭
                        </span>
                        <span className="text-[10px] text-white/34">
                          먼저 이어갈 탭을 바로 봅니다.
                        </span>
                      </div>
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/30">
                          대표 경로
                        </span>
                        <span className="text-[10px] text-white/32">
                          프로젝트 위치를 바로 봅니다.
                        </span>
                      </div>
                      <WorkspaceCardMeta
                        tabs={ws.tabs}
                        restoreCount={recentRestoreMeta[ws.id]?.restoreCount}
                        showProjectSummaryFirst
                        pathLabel="대표 경로"
                        projectSummaryClassName="text-[11px] text-white/46"
                        recentTabsClassName="truncate text-[11px] font-medium text-white/52"
                        pathClassName="truncate text-[11px] font-mono text-white/34"
                      />
                    </>
                  )}
                  action={(
                    <RecommendationCardAction onClick={() => { handleRestore(ws); }}>
                      {ws.id === latestRestoredWorkspaceId
                        ? "최근 이어서"
                        : ws.id === mostRestoredWorkspaceId && (recentRestoreMeta[ws.id]?.restoreCount ?? 0) > 1
                          ? "자주 복귀"
                          : "바로 복귀"}
                    </RecommendationCardAction>
                  )}
                  surfaceTone="cyan"
                  className={
                    ws.id === latestRestoredWorkspaceId
                      ? "border-cyan-300/24 bg-cyan-400/[0.12] shadow-[0_12px_28px_rgba(34,211,238,0.12)]"
                      : ws.id === mostRestoredWorkspaceId && (recentRestoreMeta[ws.id]?.restoreCount ?? 0) > 1
                        ? "border-emerald-300/18 bg-emerald-400/[0.08] shadow-[0_10px_24px_rgba(16,185,129,0.08)]"
                        : undefined
                  }
                />
              ))}
            </div>
          )}
          {remainingWorkspaces.length > 0 && (
            <div className="space-y-2">
              <div className="px-1">
                <SectionIntroHeader
                  title="전체 작업공간"
                  description={getWorkspaceSectionDescription("all")}
                  aside={(
                    <div className="flex items-center gap-1.5">
                      <StatusBadge tone="neutral">{remainingWorkspaces.length}개 항목</StatusBadge>
                      <StatusBadge tone="neutral" className="px-2">
                        보관 탐색
                      </StatusBadge>
                    </div>
                  )}
                />
              </div>
              <div className="mx-1 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar badges={archiveFlow.badges} helper={archiveFlow.helper} tone="neutral" />
              </div>
              {remainingWorkspaces.map(ws => (
                <RecommendationCard
                  key={ws.id}
                  icon={<Layers size={13} className="text-accent/80" />}
                  title={ws.name}
                  description="보관해 둔 흐름을 다시 꺼내는 작업공간"
                  badges={(
                    <WorkspaceCardBadges
                      archived
                      latest={ws.id === latestRestoredWorkspaceId}
                      frequent={ws.id === mostRestoredWorkspaceId && (recentRestoreMeta[ws.id]?.restoreCount ?? 0) > 1}
                    />
                  )}
                  meta={(
                    <>
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <StatusBadge tone="neutral">탭 {ws.tabs.length}개</StatusBadge>
                        <StatusBadge tone="neutral">프로젝트 {countWorkspaceProjects(ws.tabs)}곳</StatusBadge>
                        {(recentRestoreMeta[ws.id]?.restoreCount ?? 0) > 0 && (
                          <StatusBadge tone="neutral">복원 {recentRestoreMeta[ws.id]?.restoreCount}회</StatusBadge>
                        )}
                      </div>
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full border border-white/6 bg-white/[0.015] px-1.5 py-0.5 text-[10px] text-white/20">
                          저장 시점
                        </span>
                        <Clock size={9} className="text-white/14" />
                        <span className="text-xs text-white/24">{fmtDate(ws.created_at)}</span>
                      </div>
                      {recentRestoreMeta[ws.id]?.lastRestoredAt && (
                        <div className="mb-0.5 flex flex-wrap items-center gap-1">
                          <span className="rounded-full border border-emerald-300/14 bg-emerald-400/[0.07] px-1.5 py-0.5 text-[10px] text-emerald-100/60">
                            마지막 복원
                          </span>
                          <Clock size={9} className="text-emerald-100/40" />
                          <span className="text-xs text-emerald-100/50">
                            {fmtRecentDate(recentRestoreMeta[ws.id].lastRestoredAt)}
                          </span>
                        </div>
                      )}
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/30">
                          최근 탭
                        </span>
                        <span className="text-[10px] text-white/34">
                          다시 꺼낼 탭 흐름을 먼저 봅니다.
                        </span>
                      </div>
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/30">
                          대표 경로
                        </span>
                        <span className="text-[10px] text-white/32">
                          저장된 프로젝트 위치를 바로 봅니다.
                        </span>
                      </div>
                      <WorkspaceCardMeta
                        tabs={ws.tabs}
                        restoreCount={recentRestoreMeta[ws.id]?.restoreCount}
                        pathLabel="대표 경로"
                        projectSummaryClassName="text-[11px] text-white/40"
                        recentTabsClassName="truncate text-[11px] font-medium text-white/50"
                        pathClassName="truncate text-[11px] text-white/32"
                      />
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {ws.tabs.map(t => (
                          <WorkspaceTabChip
                            key={t.id}
                            title={t.title}
                            cwd={t.cwd}
                            compact
                          />
                        ))}
                      </div>
                    </>
                  )}
                  action={(
                    <RecommendationCardActions>
                      <RecommendationCardAction onClick={() => { handleRestore(ws); }}>
                          보관 열기
                        </RecommendationCardAction>
                      <ConfirmDeleteDialog
                        itemName={ws.name}
                        itemType="워크스페이스"
                        description={`탭 ${ws.tabs.length}개가 함께 삭제됩니다.`}
                        onConfirm={() => onDelete(ws.id)}
                      >
                        <button className="p-1 rounded text-white/20 hover:text-red-400 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </ConfirmDeleteDialog>
                    </RecommendationCardActions>
                  )}
                  surfaceTone="neutral"
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkspacePanel;
