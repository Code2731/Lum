import React from "react";

export function getActionHintButtonTitle(label: string, shortcut?: string): string {
  return shortcut ? `${label} (${shortcut})` : label;
}

export function getActionReasonLabel(label: string): string {
  return `${label}:`;
}

export const ActionHintButton: React.FC<{
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary" | "warn";
  shortcut?: string;
}> = ({ label, onClick, tone = "secondary", shortcut }) => {
  const buttonTitle = getActionHintButtonTitle(label, shortcut);

  return (
    <button
      type="button"
      onClick={onClick}
      title={buttonTitle}
      className={
        tone === "primary"
          ? "inline-flex items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200/90 transition-[background-color,box-shadow,transform] hover:bg-cyan-400/18 hover:shadow-[0_8px_20px_rgba(34,211,238,0.16)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/40"
          : tone === "warn"
            ? "inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[11px] font-medium text-amber-100 transition-[background-color,box-shadow,transform] hover:bg-amber-400/18 hover:shadow-[0_8px_20px_rgba(245,158,11,0.16)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
            : "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-white/62 transition-[background-color,box-shadow,transform,color] hover:bg-white/[0.1] hover:text-white/82 hover:shadow-[0_8px_18px_rgba(0,0,0,0.14)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25"
      }
    >
      <span>{label}</span>
      {shortcut && (
        <kbd className="rounded border border-current/20 px-1 py-px font-mono text-[10px] leading-none opacity-80">
          {shortcut}
        </kbd>
      )}
    </button>
  );
};

export const ActionReasonText: React.FC<{
  label?: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <p className="text-[11px] leading-4 text-white/34">
    {label && <span className="mr-1 font-medium text-white/52">{label}</span>}
    <span>{children}</span>
  </p>
);

export interface ActionHintItem {
  label: string;
  onClick: () => void;
  shortcut?: string;
  reason: string;
  tone?: "primary" | "secondary" | "warn";
}

export const ActionHintGroup: React.FC<{
  /** 새 화면은 actions 배열을 사용한다. primary/secondary는 기존 호출 호환용이다. */
  actions?: ActionHintItem[];
  primary?: ActionHintItem;
  secondary?: ActionHintItem;
}> = ({ actions, primary, secondary }) => {
  const items = actions ?? [primary, secondary].filter((item): item is ActionHintItem => Boolean(item));

  if (items.length === 0) return null;

  return (
  <div aria-label="추천 작업" className="mt-2">
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="실행 가능한 작업">
      {items.map((item, index) => (
        <ActionHintButton
          key={item.label}
          label={item.label}
          onClick={item.onClick}
          tone={item.tone ?? (index === 0 ? "primary" : "secondary")}
          shortcut={item.shortcut}
        />
      ))}
    </div>
    <div className="mt-2 space-y-1" role="list" aria-label="작업 이유">
      {items.map((item) => (
        <div role="listitem">
          <ActionReasonText label={getActionReasonLabel(item.label)}>{item.reason}</ActionReasonText>
        </div>
      ))}
    </div>
  </div>
  );
};
