import React from "react";
import { cn } from "@/lib/utils";

type StatusBadgeTone = "neutral" | "cyan" | "emerald" | "violet" | "amber";

export interface StatusBadgeAccessibleText {
  title?: string;
}

const toneClass: Record<StatusBadgeTone, string> = {
  neutral: "border-white/10 bg-white/[0.06] text-white/60",
  cyan: "border-cyan-300/16 bg-cyan-400/10 text-cyan-200/90",
  emerald: "border-emerald-300/18 bg-emerald-400/10 text-emerald-200/90",
  violet: "border-violet-300/18 bg-violet-400/10 text-violet-200/90",
  amber: "border-amber-300/18 bg-amber-400/10 text-amber-200/90",
};

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusBadgeTone;
}

export function getStatusBadgeAccessibleText(input: {
  children?: React.ReactNode;
  title?: string;
}): StatusBadgeAccessibleText {
  return {
    title: input.title ?? (typeof input.children === "string" ? input.children : undefined),
  };
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone = "neutral",
  className,
  children,
  title,
  ...props
}) => {
  const accessibleText = getStatusBadgeAccessibleText({
    children,
    title,
  });

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        toneClass[tone],
        className,
      )}
      title={accessibleText.title}
      {...props}
    >
      {children}
    </span>
  );
};
