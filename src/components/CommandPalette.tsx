import React from "react";
import { TerminalSquare, Layers, Zap, History, Clock } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { WorkspaceCardBadges } from "@/components/ui/workspace-card-badges";
import { WorkspaceCardMeta } from "@/components/ui/workspace-card-meta";
import { RecommendationCardAction } from "@/components/ui/recommendation-card-action";
import { RecommendationCard } from "@/components/ui/recommendation-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import type { Tab } from "../hooks/useTabManager";
import type { Workspace } from "../hooks/useWorkspace";
import type { QuickAction } from "../hooks/useQuickActions";
import { shortPath } from "../utils";
import { countWorkspaceProjects } from "../utils/workspaceSummary";
import { getWorkspaceSectionDescription } from "../utils/workspace-recommendation";
import {
  getLatestRestoredWorkspaceId,
  getMostRestoredWorkspaceId,
  loadWorkspaceRestoreMeta,
  type WorkspaceRestoreMeta,
  sortWorkspacesByRestoreMeta,
} from "../utils/workspaceRestoreMeta";

function fmtRecentRestore(ts: number) {
  return new Date(ts).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtCreatedAt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  workspaces: Workspace[];
  quickActions: QuickAction[];
  recentHistory: string[];
  onSwitchTab: (id: string) => void;
  onRestoreWorkspace: (ws: Workspace) => void;
  onRunAction: (cmd: string) => void;
  onClose: () => void;
}

export interface CommandPaletteFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getCommandPaletteTabsFlowSummary(count: number): CommandPaletteFlowSummary {
  return {
    badges: [`탭 ${count}개`, "현재 흐름", "즉시 이동"],
    helper: "지금 열려 있는 흐름을 먼저 훑고 바로 전환합니다.",
  };
}

export function getCommandPaletteRecommendedWorkspaceFlowSummary(count: number): CommandPaletteFlowSummary {
  return {
    badges: [`추천 복귀 ${count}개`, "Enter 이어서", "대표 경로"],
    helper: "최근 복귀 흐름과 프로젝트 위치를 한 번에 이어서 찾습니다.",
  };
}

export function getCommandPaletteArchiveWorkspaceFlowSummary(): CommandPaletteFlowSummary {
  return {
    badges: ["보관 탐색", "탭 흐름", "저장 시점"],
    helper: "보관된 복귀 흐름을 열기 전에 탭과 저장 시점을 함께 훑어봅니다.",
  };
}

export function getCommandPaletteQuickActionsFlowSummary(count: number): CommandPaletteFlowSummary {
  return {
    badges: [`빠른 액션 ${count}개`, "다음 실행", "반복 작업"],
    helper: "자주 쓰는 명령을 고르고 바로 실행 흐름으로 이어갑니다.",
  };
}

export function getCommandPaletteHistoryFlowSummary(count: number): CommandPaletteFlowSummary {
  return {
    badges: [`최근 기록 ${count}개`, "다음 재실행", "같은 흐름"],
    helper: "방금 썼던 명령 흐름을 골라 같은 맥락으로 다시 시작합니다.",
  };
}

const CommandPalette: React.FC<Props> = ({
  tabs, activeTabId, workspaces, quickActions, recentHistory,
  onSwitchTab, onRestoreWorkspace, onRunAction, onClose,
}) => {
  const otherTabs = tabs.filter((t) => t.id !== activeTabId);
  const workspaceRestoreMeta = React.useMemo<WorkspaceRestoreMeta>(() => loadWorkspaceRestoreMeta(), []);
  const sortedWorkspaces = React.useMemo(
    () => sortWorkspacesByRestoreMeta(workspaces, workspaceRestoreMeta),
    [workspaceRestoreMeta, workspaces],
  );
  const recommendedWorkspaces = React.useMemo(
    () => sortedWorkspaces.slice(0, 2),
    [sortedWorkspaces],
  );
  const remainingWorkspaces = React.useMemo(
    () => sortedWorkspaces.slice(2),
    [sortedWorkspaces],
  );
  const latestRestoredWorkspaceId = React.useMemo(
    () => getLatestRestoredWorkspaceId(workspaceRestoreMeta),
    [workspaceRestoreMeta],
  );
  const mostRestoredWorkspaceId = React.useMemo(
    () => getMostRestoredWorkspaceId(workspaceRestoreMeta),
    [workspaceRestoreMeta],
  );
  const tabsFlow = getCommandPaletteTabsFlowSummary(otherTabs.length);
  const recommendedFlow = getCommandPaletteRecommendedWorkspaceFlowSummary(recommendedWorkspaces.length);
  const archiveFlow = getCommandPaletteArchiveWorkspaceFlowSummary();
  const quickActionsFlow = getCommandPaletteQuickActionsFlowSummary(quickActions.length);
  const historyFlow = getCommandPaletteHistoryFlowSummary(recentHistory.length);

  return (
    <CommandDialog open onOpenChange={(o) => { if (!o) onClose(); }} title="커맨드 팔레트">
      <CommandInput placeholder="탭, 워크스페이스, 액션, 히스토리 검색…" />
      <div className="flex items-start justify-between gap-3 border-b border-white/8 px-3 py-2">
        <p className="text-[11px] text-foreground/55">
          탭 전환, 워크스페이스 복귀, 명령 재실행까지 한 번에 이어서 찾습니다.
        </p>
        <div className="flex items-center gap-1.5">
          <StatusBadge tone="neutral">통합 탐색</StatusBadge>
          <StatusBadge tone="cyan">빠른 이동</StatusBadge>
        </div>
      </div>
      <CommandList>
        <CommandEmpty>
          <div className="px-3 py-5 text-center">
            <p className="text-sm font-medium text-white/72">결과 없음</p>
            <p className="mt-1 text-[11px] leading-5 text-white/38">
              탭 이름, 워크스페이스, 자주 쓰는 명령어로 다시 찾아보세요.
            </p>
          </div>
        </CommandEmpty>

        {otherTabs.length > 0 && (
          <CommandGroup heading="탭">
            <div className="px-2 pb-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-foreground/55">
                  열려 있는 다른 탭으로 바로 전환해 현재 흐름을 이어갑니다.
                </p>
                <div className="flex items-center gap-1.5">
                  <StatusBadge tone="neutral">{otherTabs.length}개 항목</StatusBadge>
                  <StatusBadge tone="neutral">즉시 전환</StatusBadge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar badges={tabsFlow.badges} helper={tabsFlow.helper} tone="neutral" />
              </div>
            </div>
            {otherTabs.map((t) => (
              <CommandItem
                key={`tab-${t.id}`}
                value={`tab ${t.title} ${t.cwd ?? ""}`}
                onSelect={() => { onSwitchTab(t.id); onClose(); }}
              >
                <TerminalSquare size={12} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white/85 truncate">{t.title}</p>
                    <StatusBadge tone="neutral" className="shrink-0">전환</StatusBadge>
                  </div>
                  <p className="text-xs text-white/36 truncate">열려 있는 흐름으로 바로 전환합니다.</p>
                  {t.cwd && (
                    <p className="text-xs text-white/38 font-mono truncate">{shortPath(t.cwd)}</p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {recommendedWorkspaces.length > 0 && (
          <CommandGroup heading="추천 복귀">
            <div className="px-2 pb-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-foreground/55">
                  {getWorkspaceSectionDescription("recommended")}
                </p>
                <div className="flex items-center gap-1.5">
                  <StatusBadge tone="neutral">{recommendedWorkspaces.length}개 항목</StatusBadge>
                  <StatusBadge tone="neutral">최근 우선</StatusBadge>
                  <StatusBadge tone="cyan">Enter 복귀</StatusBadge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar badges={recommendedFlow.badges} helper={recommendedFlow.helper} tone="cyan" />
              </div>
            </div>
            {recommendedWorkspaces.map((ws) => (
              <CommandItem
                key={`ws-${ws.id}`}
                value={`workspace ${ws.name}`}
                onSelect={() => { onRestoreWorkspace(ws); onClose(); }}
              >
                <RecommendationCard
                  title={ws.name}
                  description={
                    ws.id === latestRestoredWorkspaceId
                      ? "가장 최근에 다시 연 복귀 흐름"
                      : ws.id === mostRestoredWorkspaceId && (workspaceRestoreMeta[ws.id]?.restoreCount ?? 0) > 1
                        ? "가장 자주 다시 여는 복귀 흐름"
                        : "지금 바로 이어갈 가능성이 높은 복귀 흐름"
                  }
                  icon={<Layers size={12} className="text-cyan-200/90" />}
                  badges={(
                    <WorkspaceCardBadges
                      recommended={true}
                      latest={ws.id === latestRestoredWorkspaceId}
                      frequent={ws.id === mostRestoredWorkspaceId && (workspaceRestoreMeta[ws.id]?.restoreCount ?? 0) > 1}
                      compact
                    />
                  )}
                  meta={(
                    <>
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <StatusBadge tone="neutral">탭 {ws.tabs.length}개</StatusBadge>
                        <StatusBadge tone="neutral">프로젝트 {countWorkspaceProjects(ws.tabs)}곳</StatusBadge>
                        {(workspaceRestoreMeta[ws.id]?.restoreCount ?? 0) > 0 && (
                          <StatusBadge tone="cyan">복원 {workspaceRestoreMeta[ws.id]?.restoreCount}회</StatusBadge>
                        )}
                      </div>
                      {workspaceRestoreMeta[ws.id]?.lastRestoredAt && (
                        <div className="mb-0.5 flex flex-wrap items-center gap-1">
                          <span className="rounded-full border border-cyan-300/12 bg-cyan-400/[0.06] px-1.5 py-0.5 text-[10px] text-cyan-100/48">
                            복귀 시점
                          </span>
                          <Clock size={9} className="text-cyan-100/34" />
                          <span className="text-xs text-cyan-100/44">
                            {fmtRecentRestore(workspaceRestoreMeta[ws.id].lastRestoredAt)}
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
                        restoreCount={workspaceRestoreMeta[ws.id]?.restoreCount}
                        showProjectSummaryFirst
                        pathLabel="대표 경로"
                        projectSummaryClassName="text-xs text-white/40 truncate"
                        recentTabsClassName="text-xs font-medium text-white/46 truncate"
                        pathClassName="text-xs text-white/28 font-mono truncate"
                      />
                    </>
                  )}
                  action={(
                    <RecommendationCardAction compact>
                      {ws.id === latestRestoredWorkspaceId
                        ? "최근 이어서"
                        : ws.id === mostRestoredWorkspaceId && (workspaceRestoreMeta[ws.id]?.restoreCount ?? 0) > 1
                          ? "자주 복귀"
                          : "바로 복귀"}
                    </RecommendationCardAction>
                  )}
                  actionAlign="center"
                  surfaceTone="cyan"
                  density="compact"
                  className={
                    ws.id === latestRestoredWorkspaceId
                      ? "w-full border-cyan-300/24 bg-cyan-400/[0.12] shadow-[0_12px_28px_rgba(34,211,238,0.12)]"
                      : ws.id === mostRestoredWorkspaceId && (workspaceRestoreMeta[ws.id]?.restoreCount ?? 0) > 1
                        ? "w-full border-emerald-300/18 bg-emerald-400/[0.08] shadow-[0_10px_24px_rgba(16,185,129,0.08)]"
                        : "w-full"
                  }
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {remainingWorkspaces.length > 0 && (
          <CommandGroup heading="전체 작업공간">
            <div className="px-2 pb-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-foreground/55">
                  {getWorkspaceSectionDescription("all")}
                </p>
                <div className="flex items-center gap-1.5">
                  <StatusBadge tone="neutral">{remainingWorkspaces.length}개 항목</StatusBadge>
                  <StatusBadge tone="neutral">보관 탐색</StatusBadge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar badges={archiveFlow.badges} helper={archiveFlow.helper} tone="neutral" />
              </div>
            </div>
            {remainingWorkspaces.map((ws) => (
              <CommandItem
                key={`ws-rest-${ws.id}`}
                value={`workspace ${ws.name}`}
                onSelect={() => { onRestoreWorkspace(ws); onClose(); }}
              >
                <RecommendationCard
                  title={ws.name}
                  description="보관해 둔 흐름을 다시 꺼내는 작업공간"
                  icon={<Layers size={12} className="text-purple-300/90" />}
                  badges={(
                    <WorkspaceCardBadges
                      archived
                      latest={ws.id === latestRestoredWorkspaceId}
                      frequent={ws.id === mostRestoredWorkspaceId && (workspaceRestoreMeta[ws.id]?.restoreCount ?? 0) > 1}
                      compact
                    />
                  )}
                  meta={(
                    <>
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <StatusBadge tone="neutral">탭 {ws.tabs.length}개</StatusBadge>
                        <StatusBadge tone="neutral">프로젝트 {countWorkspaceProjects(ws.tabs)}곳</StatusBadge>
                        {(workspaceRestoreMeta[ws.id]?.restoreCount ?? 0) > 0 && (
                          <StatusBadge tone="neutral">복원 {workspaceRestoreMeta[ws.id]?.restoreCount}회</StatusBadge>
                        )}
                      </div>
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <span className="rounded-full border border-white/6 bg-white/[0.015] px-1.5 py-0.5 text-[10px] text-white/20">
                          저장 시점
                        </span>
                        <Clock size={9} className="text-white/14" />
                        <span className="text-xs text-white/24">{fmtCreatedAt(ws.created_at)}</span>
                      </div>
                      {workspaceRestoreMeta[ws.id]?.lastRestoredAt && (
                        <div className="mb-0.5 flex flex-wrap items-center gap-1">
                          <span className="rounded-full border border-emerald-300/14 bg-emerald-400/[0.07] px-1.5 py-0.5 text-[10px] text-emerald-100/60">
                            마지막 복원
                          </span>
                          <Clock size={9} className="text-emerald-100/40" />
                          <span className="text-xs text-emerald-100/50">
                            {fmtRecentRestore(workspaceRestoreMeta[ws.id].lastRestoredAt)}
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
                        restoreCount={workspaceRestoreMeta[ws.id]?.restoreCount}
                        pathLabel="대표 경로"
                        projectSummaryClassName="text-xs text-white/38 truncate"
                        recentTabsClassName="text-xs font-medium text-white/44 truncate"
                        pathClassName="text-xs text-white/26 font-mono truncate"
                      />
                    </>
                  )}
                  action={(
                    <RecommendationCardAction compact>
                      보관 열기
                    </RecommendationCardAction>
                  )}
                  actionAlign="center"
                  surfaceTone="neutral"
                  density="compact"
                  className="w-full"
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {quickActions.length > 0 && (
          <CommandGroup heading="빠른 액션">
            <div className="px-2 pb-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-foreground/55">
                  반복 실행하는 명령을 바로 다시 호출할 수 있습니다.
                </p>
                <div className="flex items-center gap-1.5">
                  <StatusBadge tone="neutral">{quickActions.length}개 항목</StatusBadge>
                  <StatusBadge tone="amber">즉시 실행</StatusBadge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar badges={quickActionsFlow.badges} helper={quickActionsFlow.helper} tone="neutral" />
              </div>
            </div>
            {quickActions.map((a) => (
              <CommandItem
                key={`action-${a.id}`}
                value={`action ${a.label} ${a.command}`}
                onSelect={() => { onRunAction(a.command); onClose(); }}
              >
                <Zap size={12} className="text-yellow-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white/85 truncate">{a.label}</p>
                    <StatusBadge tone="amber" className="shrink-0">실행</StatusBadge>
                  </div>
                  <p className="text-xs text-white/36 truncate">저장해 둔 반복 명령을 바로 실행합니다.</p>
                  <p className="text-xs text-white/38 font-mono truncate">{a.command}</p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {recentHistory.length > 0 && (
          <CommandGroup heading="히스토리">
            <div className="px-2 pb-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-foreground/55">
                  최근에 실행한 기록을 골라 같은 흐름을 다시 이어갑니다.
                </p>
                <div className="flex items-center gap-1.5">
                  <StatusBadge tone="neutral">{recentHistory.length}개 항목</StatusBadge>
                  <StatusBadge tone="neutral">최근 재실행</StatusBadge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <ActionFlowBar badges={historyFlow.badges} helper={historyFlow.helper} tone="neutral" />
              </div>
            </div>
            {recentHistory.map((cmd, i) => (
              <CommandItem
                key={`hist-${i}`}
                value={`history ${cmd}`}
                onSelect={() => { onRunAction(cmd); onClose(); }}
              >
                <History size={12} className="text-white/40 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white/85 font-mono truncate">{cmd}</p>
                    <StatusBadge tone="neutral" className="shrink-0">재실행</StatusBadge>
                  </div>
                  <p className="text-xs text-white/36 truncate">최근 실행 기록에서 같은 흐름을 다시 시작합니다.</p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;
