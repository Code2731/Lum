import React from "react";
import { cn } from "@/lib/utils";

interface RecommendationCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  onClick?: () => void;
  action?: React.ReactNode;
  actionAlign?: "start" | "center";
  surfaceTone?: "default" | "neutral" | "cyan" | "emerald" | "amber" | "danger" | "violet";
  density?: "default" | "compact";
  className?: string;
}

export interface RecommendationCardAccessibleText {
  label: string;
  title: string;
}

export function getRecommendationCardAccessibleText(
  title: string,
  description: string,
  badges?: React.ReactNode,
): RecommendationCardAccessibleText {
  const hasBadges = badges != null;
  return {
    label: hasBadges ? `${title} · ${description} · 추천 흐름 포함` : `${title} · ${description}`,
    title: `${title} · ${description}`,
  };
}

function getRecommendationCardIconTone(surfaceTone: RecommendationCardProps["surfaceTone"]) {
  if (surfaceTone === "danger") {
    return "border-rose-300/18 bg-rose-400/12 text-rose-100/90";
  }
  if (surfaceTone === "amber") {
    return "border-amber-300/18 bg-amber-400/12 text-amber-100/90";
  }
  if (surfaceTone === "emerald") {
    return "border-emerald-300/18 bg-emerald-400/10 text-emerald-100/90";
  }
  if (surfaceTone === "violet") {
    return "border-violet-300/18 bg-violet-400/12 text-violet-100/90";
  }
  if (surfaceTone === "neutral") {
    return "border-white/10 bg-white/[0.04] text-white/72";
  }
  return "border-cyan-300/14 bg-cyan-400/10 text-cyan-200/90";
}

function getRecommendationCardTitleTone(surfaceTone: RecommendationCardProps["surfaceTone"]) {
  if (surfaceTone === "danger") {
    return "text-rose-50/92";
  }
  if (surfaceTone === "amber") {
    return "text-amber-50/92";
  }
  if (surfaceTone === "emerald") {
    return "text-emerald-50/92";
  }
  if (surfaceTone === "violet") {
    return "text-violet-50/92";
  }
  if (surfaceTone === "neutral") {
    return "text-white/82";
  }
  return "text-white/86";
}

function getRecommendationCardDescriptionTone(surfaceTone: RecommendationCardProps["surfaceTone"]) {
  if (surfaceTone === "danger") {
    return "text-rose-100/72";
  }
  if (surfaceTone === "amber") {
    return "text-amber-100/70";
  }
  if (surfaceTone === "emerald") {
    return "text-emerald-100/68";
  }
  if (surfaceTone === "violet") {
    return "text-violet-100/70";
  }
  if (surfaceTone === "neutral") {
    return "text-white/48";
  }
  if (surfaceTone === "default") {
    return "text-white/52";
  }
  return "text-cyan-200/55";
}

function getRecommendationCardSurfaceTone(surfaceTone: RecommendationCardProps["surfaceTone"]) {
  if (surfaceTone === "danger") {
    return "border-rose-300/18 bg-rose-400/[0.08] shadow-[0_10px_24px_rgba(244,63,94,0.07)] hover:border-rose-300/26 hover:bg-rose-400/[0.11]";
  }
  if (surfaceTone === "cyan") {
    return "border-cyan-300/18 bg-cyan-400/[0.08] shadow-[0_10px_24px_rgba(34,211,238,0.07)] hover:border-cyan-300/26 hover:bg-cyan-400/[0.11]";
  }
  if (surfaceTone === "amber") {
    return "border-amber-300/18 bg-amber-400/[0.08] shadow-[0_10px_24px_rgba(251,191,36,0.07)] hover:border-amber-300/26 hover:bg-amber-400/[0.11]";
  }
  if (surfaceTone === "emerald") {
    return "border-emerald-300/18 bg-emerald-400/[0.08] shadow-[0_10px_24px_rgba(16,185,129,0.07)] hover:border-emerald-300/26 hover:bg-emerald-400/[0.11]";
  }
  if (surfaceTone === "violet") {
    return "border-violet-300/18 bg-violet-400/[0.08] shadow-[0_10px_24px_rgba(167,139,250,0.08)] hover:border-violet-300/26 hover:bg-violet-400/[0.11]";
  }
  if (surfaceTone === "neutral") {
    return "border-white/10 bg-white/[0.04] hover:border-white/16 hover:bg-white/[0.06]";
  }
  return "border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.07]";
}

const RecommendationCardContent: React.FC<Omit<RecommendationCardProps, "onClick" | "className">> = ({
  title,
  description,
  icon,
  badges,
  meta,
  action,
  actionAlign = "start",
  surfaceTone = "default",
  density = "default",
}) => (
  <>
    <div className={cn(
      "mt-0.5 shrink-0 border",
      getRecommendationCardIconTone(surfaceTone),
      density === "compact" ? "rounded-lg p-1.5" : "rounded-2xl p-2",
    )}>
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className={cn(
        "flex flex-wrap items-center gap-1.5",
        density === "compact" ? "min-h-4" : "min-h-6",
      )}>
        <p className={cn(
          "truncate font-medium",
          getRecommendationCardTitleTone(surfaceTone),
          density === "compact" ? "text-[13px]" : "text-sm",
        )} title={title}>{title}</p>
        {badges}
      </div>
      <p className={cn(
        getRecommendationCardDescriptionTone(surfaceTone),
        density === "compact" ? "mt-0.5 text-[11px] leading-4" : "mt-1.5 text-xs leading-5",
      )} title={description}>{description}</p>
      {meta && <div className={cn(density === "compact" ? "mt-0.5 space-y-0.5" : "mt-1.5 space-y-1")}>{meta}</div>}
    </div>
    {action && (
      <div className={cn(
        "shrink-0",
        density === "compact" ? "pl-0.5" : "pl-1",
        actionAlign === "center" ? "self-center" : "self-start",
      )}>
        {action}
      </div>
    )}
  </>
);

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  title,
  description,
  icon,
  badges,
  meta,
  onClick,
  action,
  actionAlign = "start",
  surfaceTone = "default",
  density = "default",
  className,
}) => {
  const accessibleText = getRecommendationCardAccessibleText(title, description, badges);
  const sharedClassName = cn(
    "flex items-start border",
    getRecommendationCardSurfaceTone(surfaceTone),
    density === "compact" ? "gap-2 rounded-xl px-2.5 py-1.5" : "gap-3.5 rounded-2xl px-4 py-3.5",
    onClick
      ? "w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      : "",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={accessibleText.label}
        title={accessibleText.title}
        className={sharedClassName}
      >
        <RecommendationCardContent
        title={title}
        description={description}
        icon={icon}
        badges={badges}
        meta={meta}
        action={action}
        actionAlign={actionAlign}
        surfaceTone={surfaceTone}
        density={density}
      />
    </button>
  );
  }

  return (
    <div role="group" aria-label={accessibleText.label} title={accessibleText.title} className={sharedClassName}>
      <RecommendationCardContent
      title={title}
      description={description}
      icon={icon}
      badges={badges}
      meta={meta}
      action={action}
      actionAlign={actionAlign}
      surfaceTone={surfaceTone}
      density={density}
    />
  </div>
  );
};
