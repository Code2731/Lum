import React from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { cn } from "@/lib/utils";
import type { DangerMatch } from "../utils/pasteGuard";
import { getSmartPasteFlowSummary } from "../utils/smartPaste";

interface Props {
  match: DangerMatch;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface PasteGuardFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getPasteGuardFlowSummary(match: DangerMatch): PasteGuardFlowSummary {
  const pasteSummary = getSmartPasteFlowSummary(match.pattern);
  const decisionLabel = match.level === "danger" ? "마지막 실행 여부 재확인" : "마지막 계속 여부 결정";

  return {
    badges: [pasteSummary.primary, pasteSummary.secondary, decisionLabel],
    helper: `${pasteSummary.detail} 탐지된 이유를 읽고 ${match.level === "danger" ? "정말 실행할지 한 번 더 확인합니다." : "그대로 실행할지 취소할지 결정합니다."}`,
  };
}

const PasteGuardModal: React.FC<Props> = ({ match, onConfirm, onCancel }) => {
  const isDanger = match.level === "danger";
  const flow = getPasteGuardFlowSummary(match);
  const Icon = isDanger ? ShieldAlert : AlertTriangle;
  const tone = isDanger
    ? { title: "text-red-300", icon: "text-red-400", border: "border-red-500/20", bg: "bg-red-500/5", reasonBorder: "border-red-500/15", btn: "bg-red-500/15 hover:bg-red-500/25 text-red-400" }
    : { title: "text-yellow-300", icon: "text-yellow-400", border: "border-yellow-500/20", bg: "bg-yellow-500/5", reasonBorder: "border-yellow-500/15", btn: "bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400" };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-[480px] gap-0 p-0 overflow-hidden border-white/10">
        <div className={cn("flex items-center gap-2.5 px-5 py-4 border-b", tone.border, tone.bg)}>
          <Icon size={15} className={cn("shrink-0", tone.icon)} />
          <DialogTitle className={cn("text-sm font-semibold", tone.title)}>
            {isDanger ? "위험한 커맨드 감지" : "주의 필요"}
          </DialogTitle>
        </div>

        <div className="px-5 py-2.5 border-b border-white/10 bg-white/[0.02]">
          <ActionFlowBar
            badges={flow.badges}
            helper={flow.helper}
          />
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className={cn("p-3 rounded-xl border", tone.reasonBorder, tone.bg)}>
            <span className={cn("text-xs font-medium", tone.icon)}>
              {match.reason}
            </span>
          </div>
          <div className="bg-white/3 border border-white/7 rounded-xl px-3 py-2.5">
            <p className="text-sm text-white/40 mb-1">붙여넣을 내용</p>
            <pre className="text-xs text-white/70 font-mono whitespace-pre-wrap break-all line-clamp-4">
              {match.pattern}{match.pattern.length >= 80 ? "…" : ""}
            </pre>
          </div>
          <DialogDescription className="text-sm text-white/35">
            이 커맨드를 그대로 실행하시겠습니까?
          </DialogDescription>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs"
          >
            취소
          </Button>
          <Button
            onClick={onConfirm}
            className={cn("flex-1 text-xs", tone.btn)}
          >
            그래도 실행
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PasteGuardModal;
