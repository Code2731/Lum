import React from "react";
import { cn } from "@/lib/utils";

interface RecommendationCardActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  compact?: boolean;
}

export function getRecommendationCardActionAccessibleText(
  children: React.ReactNode,
  title?: string,
  ariaLabel?: string,
): string | undefined {
  if (ariaLabel) return ariaLabel;
  if (title) return title;
  return typeof children === "string" ? children : undefined;
}

export const RecommendationCardAction: React.FC<RecommendationCardActionProps> = ({
  className,
  compact = false,
  type = "button",
  children,
  title,
  "aria-label": ariaLabel,
  ...props
}) => {
  const accessibleText = getRecommendationCardActionAccessibleText(children, title, ariaLabel);

  return (
    <button
      type={type}
      title={accessibleText}
      aria-label={accessibleText}
      className={cn(
        "shrink-0 bg-accent/18 font-medium text-accent transition-colors hover:bg-accent/28",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        compact
          ? "rounded-lg px-2.5 py-1.5 text-[10px]"
          : "rounded-xl px-3 py-2 text-xs",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
};
