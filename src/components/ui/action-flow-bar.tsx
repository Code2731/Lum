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
      return "rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200/90";
    case "cyan":
      return "rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200/90";
    default:
      return "rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-white/58";
  }
}

function getContainerClass(tone: ActionFlowBarTone) {
  switch (tone) {
    case "amber":
      return "border-amber-300/12 bg-amber-500/[0.045]";
    case "cyan":
      return "border-cyan-300/12 bg-cyan-500/[0.045]";
    default:
      return "border-white/8 bg-white/[0.03]";
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
        className={`rounded-xl border px-2.5 py-2 ${containerClass}`}
        aria-label={flowMeta.ariaLabel}
      >
        <div className="flex flex-wrap items-center gap-1.5" role="list">
          {flowMeta.badges.map((item, index) => (
            <React.Fragment key={`${index}-${item}`}>
              <span
                role="listitem"
                className={`inline-flex items-center gap-1.5 ${badgeClass}`}
              >
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-black/20 px-1 text-[9px] font-semibold text-current">
                  {index + 1}
                </span>
                <span>{item}</span>
              </span>
              {index < flowMeta.badges.length - 1 && (
                <span
                  aria-hidden="true"
                  className="text-[10px] font-semibold text-white/20"
                >
                  →
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
        {flowMeta.helper && (
          <p className="mt-1.5 text-[11px] leading-4 text-white/46">
            {flowMeta.helper}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-2.5 py-2 ${containerClass}`}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/46">
          {props.title}
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-white/38">
          {props.description}
        </p>
      </div>
      <span className={`shrink-0 ${badgeClass}`}>{props.badge}</span>
    </div>
  );
}
