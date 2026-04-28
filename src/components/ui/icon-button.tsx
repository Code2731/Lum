import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface IconButtonConfirm {
  /** 다이얼로그 제목 — "대화 초기화" / "MCP 서버 제거" 등 */
  title: string;
  /** 안내문 (선택) — JSX 가능 */
  description?: React.ReactNode;
  /** 확인 버튼 라벨 — default "삭제" */
  confirmLabel?: string;
  /** 취소 버튼 라벨 — default "취소" */
  cancelLabel?: string;
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 호버 툴팁 텍스트 — 비우면 툴팁 없이 일반 button */
  tooltip?: React.ReactNode;
  /** 툴팁 위치. default "bottom". */
  side?: "top" | "right" | "bottom" | "left";
  /** 클릭 시 confirm 다이얼로그 — 사용자가 확인해야 onClick 호출 */
  confirm?: IconButtonConfirm;
}

/**
 * 아이콘 버튼 + Tooltip + (선택) AlertDialog confirm 통합.
 *
 * @example 단순 툴팁
 *   <IconButton tooltip="새로고침" onClick={refresh}>...</IconButton>
 *
 * @example confirm 포함
 *   <IconButton
 *     tooltip="대화 초기화"
 *     confirm={{ title: "대화 초기화", description: "..." }}
 *     onClick={onClear}>
 *     <Trash2 />
 *   </IconButton>
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tooltip, side = "bottom", confirm, onClick, className, children, ...props }, ref) => {
    // 내부 button — confirm 있으면 onClick 안 받음 (Action 버튼이 처리)
    // tooltip이 string이면 자동 aria-label (스크린 리더 + testing-library getByLabelText 호환).
    // 명시적 aria-label 전달 시 props spread가 우선.
    const inner = (
      <button
        ref={ref}
        aria-label={typeof tooltip === "string" ? tooltip : undefined}
        {...props}
        className={cn(className)}
        onClick={confirm ? undefined : onClick}
      >
        {children}
      </button>
    );

    // confirm 있으면 AlertDialogTrigger로 감싸기 (Slot composition으로 click 핸들러 자동 부착)
    let core: React.ReactNode = confirm
      ? <AlertDialogTrigger asChild>{inner}</AlertDialogTrigger>
      : inner;

    // tooltip 있으면 Tooltip 추가 (TooltipTrigger도 asChild Slot composition)
    if (tooltip) {
      core = (
        <Tooltip>
          <TooltipTrigger asChild>{core}</TooltipTrigger>
          <TooltipContent side={side}>{tooltip}</TooltipContent>
        </Tooltip>
      );
    }

    if (!confirm) return <>{core}</>;

    // AlertDialog가 outermost — Tooltip + AlertDialogTrigger의 asChild Slot이 button에 props 병합.
    // 인용구: <AlertDialog><Tooltip><TooltipTrigger asChild><AlertDialogTrigger asChild><button/></AlertDialogTrigger></TooltipTrigger>...
    return (
      <AlertDialog>
        {core}
        <AlertDialogContent className="sm:max-w-md border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
            {confirm.description && (
              <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{confirm.cancelLabel ?? "취소"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onClick}
              className="bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-400/30 shadow-none"
            >
              {confirm.confirmLabel ?? "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  },
);
IconButton.displayName = "IconButton";

export { IconButton };
