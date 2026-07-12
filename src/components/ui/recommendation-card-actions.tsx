import React from "react";

interface RecommendationCardActionsProps {
  children: React.ReactNode;
  compact?: boolean;
}

export function getRecommendationCardActionsAccessibleLabel(count?: number): string {
  return count && count > 0 ? `추천 카드 작업 ${count}개` : "추천 카드 작업";
}

export function RecommendationCardActions({
  children,
  compact = false,
}: RecommendationCardActionsProps) {
  const count = React.Children.count(children);
  const label = getRecommendationCardActionsAccessibleLabel(count);

  return (
    <div
      role="group"
      aria-label={label}
      title={label}
      className={compact ? "flex items-center gap-1" : "flex items-center gap-1.5"}
    >
      {children}
    </div>
  );
}
