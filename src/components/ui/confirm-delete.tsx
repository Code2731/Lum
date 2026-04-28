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
import { cn } from "@/lib/utils";

interface Props {
  /** 삭제할 항목 이름 (제목/설명에 표시) */
  itemName: string;
  /** 항목 타입 라벨 — "워크스페이스"/"스크립트"/"모델" 등 */
  itemType?: string;
  /** 확인 버튼 클릭 시 콜백 */
  onConfirm: () => void;
  /** Trigger element (보통 Trash2 아이콘 button) */
  children: React.ReactNode;
  /** 추가 설명 (선택) */
  description?: string;
}

/**
 * 파괴적 액션 confirm 다이얼로그 — 인라인 deleteConfirm 패턴 통일.
 *
 * @example
 *   <ConfirmDeleteDialog itemName={ws.name} itemType="워크스페이스"
 *                        onConfirm={() => onDelete(ws.id)}>
 *     <button className="..."><Trash2 size={11} /></button>
 *   </ConfirmDeleteDialog>
 */
const ConfirmDeleteDialog: React.FC<Props> = ({
  itemName, itemType = "항목", onConfirm, children, description,
}) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
    <AlertDialogContent className="sm:max-w-md border-white/10">
      <AlertDialogHeader>
        <AlertDialogTitle>{itemType} 삭제</AlertDialogTitle>
        <AlertDialogDescription>
          <span className="font-medium text-white/85">"{itemName}"</span> 을(를) 삭제하시겠습니까?
          {description && <span className="block mt-1 text-xs">{description}</span>}
          <span className="block mt-2 text-xs text-white/40">이 작업은 되돌릴 수 없습니다.</span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className={cn(
            "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-400/30 shadow-none",
          )}
        >
          삭제
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export { ConfirmDeleteDialog };
