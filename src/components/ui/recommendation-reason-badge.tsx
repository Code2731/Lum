import React from "react";
import { StatusBadge } from "@/components/ui/status-badge";

export type RecommendationReasonTone = "neutral" | "cyan" | "emerald" | "violet" | "amber";

interface RecommendationReasonBadgeProps {
  label: string;
  tone?: RecommendationReasonTone;
  className?: string;
  decorative?: boolean;
}

export function getRecommendationReasonBadgeAccessibleText(
  label: string,
  decorative = false,
): { ariaLabel?: string; title: string; ariaHidden?: true } {
  if (decorative) {
    return {
      title: label,
      ariaHidden: true,
    };
  }

  return {
    ariaLabel: label,
    title: label,
  };
}

export function RecommendationReasonBadge({
  label,
  tone = "neutral",
  className,
  decorative = false,
}: RecommendationReasonBadgeProps) {
  const accessibleText = getRecommendationReasonBadgeAccessibleText(label, decorative);

  return (
    <StatusBadge
      aria-hidden={accessibleText.ariaHidden}
      aria-label={accessibleText.ariaLabel}
      title={accessibleText.title}
      tone={tone}
      className={className}
    >
      {label}
    </StatusBadge>
  );
}
