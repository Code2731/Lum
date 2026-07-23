import React from "react";

type ActionFlowBarTone = "cyan" | "amber" | "neutral";

type LegacyActionFlowBarProps = {
  title: string;
  description: string;
  badge: string;
  tone?: ActionFlowBarTone;
  badges?: never;
  helper?: never;
};

type ModernActionFlowBarProps = {
  badges: string[];
  helper?: string;
  tone?: ActionFlowBarTone;
  title?: never;
  description?: never;
  badge?: never;
};

export type ActionFlowBarProps =
  | LegacyActionFlowBarProps
  | ModernActionFlowBarProps;

export interface ActionFlowBarFlowMeta {
  badges: string[];
  helper?: string;
  ariaLabel: string;
}

export function getActionFlowBarFlowMeta(
  badges: string[],
  helper?: string,
): ActionFlowBarFlowMeta {
  const normalizedBadges = badges
    .map((badge) => badge.trim())
    .filter((badge) => badge.length > 0);

  const ariaLabel =
    normalizedBadges.length > 0
      ? `작업 흐름 ${normalizedBadges.length}단계`
      : "작업 흐름";

  return {
    badges: normalizedBadges,
    helper,
    ariaLabel,
  };
}

function getBadgeClass(tone: ActionFlowBarTone) {
  switch (tone) {
    case "amber":
      return "rounded-md border border-amber-300/18 bg-amber-400/[0.07] px-1.5 py-0.5 text-xs font-medium text-amber-200/85";
    case "cyan":
      return "rounded-md border border-cyan-300/18 bg-cyan-400/[0.07] px-1.5 py-0.5 text-xs font-medium text-cyan-200/85";
    default:
      return "rounded-md border border-white/[0.08] bg-white/[0.035] px-1.5 py-0.5 text-xs font-medium text-white/56";
  }
}

function getContainerClass(tone: ActionFlowBarTone) {
  switch (tone) {
    case "amber":
      return "text-amber-100/75";
    case "cyan":
      return "text-cyan-100/75";
    default:
      return "text-white/70";
  }
}

export function ActionFlowBar(props: ActionFlowBarProps) {
  const tone = props.tone ?? "neutral";
  const badgeClass = getBadgeClass(tone);
  const containerClass = getContainerClass(tone);

  if ("badges" in props) {
    const flowMeta = getActionFlowBarFlowMeta(props.badges, props.helper);

    return (
      <div
        className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 ${containerClass}`}
        aria-label={flowMeta.ariaLabel}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1" role="list">
          {flowMeta.badges.map((item, index) => (
            <React.Fragment key={`${index}-${item}`}>
              <span
                role="listitem"
                className={`inline-flex items-center ${badgeClass}`}
              >
                <span>{item}</span>
              </span>
              {index < flowMeta.badges.length - 1 && (
                <span
                  aria-hidden="true"
                  className="text-xs text-white/22"
                >
                  ·
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
        {flowMeta.helper && (
          <p className="min-w-0 flex-1 truncate text-xs leading-4 text-white/38">
            {flowMeta.helper}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 ${containerClass}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-white/46">
          {props.title}
        </p>
        <p className="mt-0.5 text-xs leading-4 text-white/38">
          {props.description}
        </p>
      </div>
      <span className={`shrink-0 ${badgeClass}`}>{props.badge}</span>
    </div>
  );
}
