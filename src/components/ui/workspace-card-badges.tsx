import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceRestoreBadges } from "@/components/ui/workspace-restore-badges";

interface WorkspaceCardBadgesProps {
  archived?: boolean;
  recommended?: boolean;
  latest?: boolean;
  frequent?: boolean;
  compact?: boolean;
}

export function getWorkspaceCardBadgeSummary({
  archived = false,
  recommended = false,
  latest = false,
  frequent = false,
}: Omit<WorkspaceCardBadgesProps, "compact">): string {
  const labels: string[] = [];
  if (archived) labels.push("보관");
  if (recommended) labels.push("바로 복귀");
  if (latest) labels.push("최근 복원");
  if (frequent) labels.push("자주 복원");
  return labels.length > 0
    ? `워크스페이스 상태 배지: ${labels.join(", ")}`
    : "워크스페이스 상태 배지: 없음";
}

export function WorkspaceCardBadges({
  archived = false,
  recommended = false,
  latest = false,
  frequent = false,
  compact = false,
}: WorkspaceCardBadgesProps) {
  const summary = getWorkspaceCardBadgeSummary({ archived, recommended, latest, frequent });

  return (
    <span
      role="list"
      aria-label={summary}
      title={summary}
      className="inline-flex flex-wrap items-center gap-1"
    >
      {archived && (
        <span role="listitem">
          <StatusBadge
            tone="neutral"
            title="보관된 작업공간"
            className={compact ? "px-1" : undefined}
          >
            보관
          </StatusBadge>
        </span>
      )}
      {recommended && (
        <span role="listitem">
          <WorkspaceRestoreBadges recommended compact={compact} />
        </span>
      )}
      {latest && (
        <span role="listitem">
          <WorkspaceRestoreBadges latest compact={compact} />
        </span>
      )}
      {frequent && (
        <span role="listitem">
          <WorkspaceRestoreBadges frequent compact={compact} />
        </span>
      )}
    </span>
  );
}
