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
  /** 활성 컬러 — 기본 accent, 특수 토글(추론 등)은 cyan */
  tone?: ToolbarTone;
}

const toneActive: Record<ToolbarTone, string> = {
  accent: "text-accent bg-accent/10",
  cyan: "text-cyan-300 bg-cyan-400/10",
};

export const ToolbarIconButton = React.forwardRef<HTMLButtonElement, ToolbarIconButtonProps>(
  ({ label, shortcut, active, badge, tone = "accent", className, children, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          aria-label={label}
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
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && (
          <kbd className="text-[10px] text-white/50 border border-white/15 rounded px-1 py-px font-mono leading-none">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  ),
);
ToolbarIconButton.displayName = "ToolbarIconButton";

/** 툴바 그룹 사이 얇은 세로 구분선 */
export const ToolbarSeparator: React.FC = () => (
  <div aria-hidden className="h-4 w-px bg-white/10 mx-1" />
);
