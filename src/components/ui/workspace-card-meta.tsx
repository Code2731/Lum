import type { WorkspaceTab } from "@/hooks/useWorkspace";
import { shortPath } from "@/utils";
import {
  countWorkspaceProjects,
  getPrimaryWorkspaceCwd,
  summarizeWorkspaceTabs,
} from "@/utils/workspaceSummary";

interface WorkspaceCardMetaProps {
  tabs: WorkspaceTab[];
  restoreCount?: number;
  lastRestoredLabel?: string;
  showProjectSummaryFirst?: boolean;
  pathLabel?: string;
  projectSummaryClassName: string;
  recentTabsClassName: string;
  pathClassName: string;
  lastRestoredClassName?: string;
}

export function getWorkspaceCardMetaSummary(
  tabs: WorkspaceTab[],
  restoreCount?: number,
  lastRestoredLabel?: string,
): string {
  const parts = [
    `탭 ${tabs.length}개`,
    `프로젝트 ${countWorkspaceProjects(tabs)}곳`,
  ];
  if (restoreCount) parts.push(`복원 ${restoreCount}회`);
  if (lastRestoredLabel) parts.push(`마지막 복원 ${lastRestoredLabel}`);
  return `작업공간 메타 정보: ${parts.join(", ")}`;
}

export function WorkspaceCardMeta({
  tabs,
  restoreCount,
  lastRestoredLabel,
  showProjectSummaryFirst = false,
  pathLabel,
  projectSummaryClassName,
  recentTabsClassName,
  pathClassName,
  lastRestoredClassName = "text-xs text-white/32",
}: WorkspaceCardMetaProps) {
  const projectSummary = `탭 ${tabs.length}개 · 프로젝트 ${countWorkspaceProjects(tabs)}곳${restoreCount ? ` · 복원 ${restoreCount}회` : ""}`;
  const primaryCwd = getPrimaryWorkspaceCwd(tabs);
  const summary = getWorkspaceCardMetaSummary(tabs, restoreCount, lastRestoredLabel);

  return (
    <div role="list" aria-label={summary} title={summary}>
      {showProjectSummaryFirst && (
        <p role="listitem" title={projectSummary} className={projectSummaryClassName}>
          {projectSummary}
        </p>
      )}
      <p
        role="listitem"
        title={`최근 탭 · ${summarizeWorkspaceTabs(tabs)}`}
        className={recentTabsClassName}
      >
        최근 탭 · {summarizeWorkspaceTabs(tabs)}
      </p>
      {!showProjectSummaryFirst && (
        <p role="listitem" title={projectSummary} className={projectSummaryClassName}>
          {projectSummary}
        </p>
      )}
      {primaryCwd && (
        <p
          role="listitem"
          title={pathLabel ? `${pathLabel} · ${shortPath(primaryCwd)}` : shortPath(primaryCwd)}
          className={pathClassName}
        >
          {pathLabel ? `${pathLabel} · ` : ""}{shortPath(primaryCwd)}
        </p>
      )}
      {lastRestoredLabel && (
        <p
          role="listitem"
          title={`마지막 복원 · ${lastRestoredLabel}`}
          className={lastRestoredClassName}
        >
          마지막 복원 · {lastRestoredLabel}
        </p>
      )}
    </div>
  );
}
