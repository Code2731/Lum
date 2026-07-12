import React from "react";
import { StatusBadge } from "@/components/ui/status-badge";
export { getWorkspaceRecommendationReason } from "@/utils/workspace-recommendation";

interface WorkspaceRestoreBadgesProps {
  recommended?: boolean;
  latest?: boolean;
  frequent?: boolean;
  compact?: boolean;
}

export function getWorkspaceRestoreBadgeSummary({
  recommended = false,
  latest = false,
  frequent = false,
}: Omit<WorkspaceRestoreBadgesProps, "compact">): string {
  const labels: string[] = [];
  if (recommended) labels.push("바로 복귀");
  if (latest) labels.push("최근 복원");
  if (frequent) labels.push("자주 복원");
  return labels.length > 0
    ? `복원 상태 배지: ${labels.join(", ")}`
    : "복원 상태 배지: 없음";
}

export const WorkspaceRestoreBadges: React.FC<WorkspaceRestoreBadgesProps> = ({
  recommended,
  latest,
  frequent,
  compact = false,
}) => {
  const compactClassName = compact ? "px-1" : undefined;
  const summary = getWorkspaceRestoreBadgeSummary({ recommended, latest, frequent });

  return (
    <span role="list" aria-label={summary} title={summary} className="inline-flex flex-wrap items-center gap-1">
      {recommended && (
        <span role="listitem">
          <StatusBadge
            tone="cyan"
            title="지금 가장 바로 복귀하기 좋은 작업공간"
            className={compactClassName}
          >
            바로 복귀
          </StatusBadge>
        </span>
      )}
      {latest && (
        <span role="listitem">
          <StatusBadge
            tone="emerald"
            title="가장 최근에 복원한 작업공간"
            className={compactClassName}
          >
            최근 복원
          </StatusBadge>
        </span>
      )}
      {frequent && (
        <span role="listitem">
          <StatusBadge
            tone="violet"
            title="반복적으로 자주 복원한 작업공간"
            className={compactClassName}
          >
            자주 복원
          </StatusBadge>
        </span>
      )}
    </span>
  );
};
