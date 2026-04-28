import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 호버 툴팁 텍스트 — 비우면 툴팁 없이 일반 button. */
  tooltip?: React.ReactNode;
  /** 툴팁 위치. 기본 "bottom". */
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * 아이콘 버튼 + 툴팁 통합. 기존 `<button title="...">` 패턴을 대체.
 * 스타일은 호출부에서 className으로 자유롭게 — 여기는 wrapper만.
 *
 * @example
 *   <IconButton tooltip="새로고침" onClick={handleRefresh}
 *               className="p-1 rounded text-white/30 hover:text-white/70">
 *     <RefreshCw size={11} />
 *   </IconButton>
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tooltip, side = "bottom", className, children, ...props }, ref) => {
    const button = (
      <button ref={ref} className={cn(className)} {...props}>
        {children}
      </button>
    );
    if (!tooltip) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    );
  },
);
IconButton.displayName = "IconButton";

export { IconButton };
