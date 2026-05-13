import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ToolbarTone = "accent" | "cyan";

interface ToolbarIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 툴팁/aria 라벨 — 필수 */
  label: string;
  /** 키보드 단축키 — 툴팁 우측 kbd 표시 (e.g. "⌘B") */
  shortcut?: string;
  /** 활성 상태 — 패널 열림/토글 ON 시 강조 */
  active?: boolean;
  /** 우상단 알림 점 표시 */
  badge?: boolean;
  /** 배지 보조 텍스트 (툴팁/스크린리더) */
  badgeLabel?: string;
  /** 활성 컬러 — 기본 accent, 특수 토글(추론 등)은 cyan */
  tone?: ToolbarTone;
}

const toneActive: Record<ToolbarTone, string> = {
  accent: "text-accent bg-accent/10",
  cyan: "text-cyan-300 bg-cyan-400/10",
};

const toAriaKeyShortcut = (shortcut?: string): string | undefined => {
  if (!shortcut) return undefined;

  const expanded = shortcut
    .replace(/⌘/g, "Meta+")
    .replace(/⇧/g, "Shift+")
    .replace(/⌥/g, "Alt+")
    .replace(/⌃/g, "Control+");

  const tokens = expanded
    .split("+")
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length === 0) return undefined;

  return tokens.join("+");
};

export const ToolbarIconButton = React.forwardRef<HTMLButtonElement, ToolbarIconButtonProps>(
  ({ label, shortcut, active, badge, badgeLabel, tone = "accent", className, children, ...props }, ref) => {
    const a11yLabel = badge && badgeLabel ? `${label} (${badgeLabel})` : label;
    const ariaShortcut = toAriaKeyShortcut(shortcut);
    return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          aria-label={a11yLabel}
          aria-keyshortcuts={ariaShortcut}
          aria-pressed={active}
          {...props}
          className={cn(
            "relative inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            active
              ? toneActive[tone]
              : "text-white/45 hover:text-white hover:bg-white/8",
            className,
          )}
        >
          {children}
          {badge && (
            <span className="pointer-events-none absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
          {badge && badgeLabel && (
            <span className="sr-only">{badgeLabel}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{label}</span>
        {badge && badgeLabel && (
          <span className="text-[10px] text-accent">[{badgeLabel}]</span>
        )}
        {shortcut && (
          <kbd className="text-[10px] text-white/50 border border-white/15 rounded px-1 py-px font-mono leading-none">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
  },
);
ToolbarIconButton.displayName = "ToolbarIconButton";

/** 툴바 그룹 사이 얇은 세로 구분선 */
export const ToolbarSeparator: React.FC = () => (
  <div aria-hidden className="h-4 w-px bg-white/10 mx-1" />
);
