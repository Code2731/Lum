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
  tone?: "primary" | "secondary";
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
          ? "inline-flex items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200/90 transition-colors hover:bg-cyan-400/18 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          : "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-white/62 transition-colors hover:bg-white/[0.1] hover:text-white/82 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

export const ActionHintGroup: React.FC<{
  primary: {
    label: string;
    onClick: () => void;
    shortcut?: string;
    reason: string;
  };
  secondary?: {
    label: string;
    onClick: () => void;
    shortcut?: string;
    reason: string;
  };
}> = ({ primary, secondary }) => (
  <div aria-label="추천 작업" className="mt-2">
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="실행 가능한 작업">
      <ActionHintButton
        label={primary.label}
        onClick={primary.onClick}
        tone="primary"
        shortcut={primary.shortcut}
      />
      {secondary && (
        <ActionHintButton
          label={secondary.label}
          onClick={secondary.onClick}
          shortcut={secondary.shortcut}
        />
      )}
    </div>
    <div className="mt-2 space-y-1" role="list" aria-label="작업 이유">
      <div role="listitem">
        <ActionReasonText label={getActionReasonLabel(primary.label)}>{primary.reason}</ActionReasonText>
      </div>
      {secondary && (
        <div role="listitem">
          <ActionReasonText label={getActionReasonLabel(secondary.label)}>{secondary.reason}</ActionReasonText>
        </div>
      )}
    </div>
  </div>
);
