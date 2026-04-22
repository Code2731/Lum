import React from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import type { DangerMatch } from "../utils/pasteGuard";

interface Props {
  match: DangerMatch;
  onConfirm: () => void;
  onCancel: () => void;
}

const PasteGuardModal: React.FC<Props> = ({ match, onConfirm, onCancel }) => {
  const isDanger = match.level === "danger";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0d1117] border border-white/10 rounded-2xl w-[480px] shadow-2xl overflow-hidden">
        <div className={`flex items-center gap-2.5 px-5 py-4 border-b ${isDanger ? "border-red-500/20 bg-red-500/5" : "border-yellow-500/20 bg-yellow-500/5"}`}>
          {isDanger
            ? <ShieldAlert size={15} className="text-red-400 shrink-0" />
            : <AlertTriangle size={15} className="text-yellow-400 shrink-0" />}
          <span className={`text-sm font-semibold ${isDanger ? "text-red-300" : "text-yellow-300"}`}>
            {isDanger ? "위험한 커맨드 감지" : "주의 필요"}
          </span>
          <button onClick={onCancel} className="ml-auto text-white/30 hover:text-white/70 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className={`flex items-start gap-2 p-3 rounded-xl border ${isDanger ? "border-red-500/15 bg-red-500/5" : "border-yellow-500/15 bg-yellow-500/5"}`}>
            <span className={`text-xs font-medium mt-0.5 shrink-0 ${isDanger ? "text-red-400" : "text-yellow-400"}`}>
              {match.reason}
            </span>
          </div>
          <div className="bg-white/3 border border-white/7 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-white/40 mb-1">붙여넣을 내용</p>
            <pre className="text-xs text-white/70 font-mono whitespace-pre-wrap break-all line-clamp-4">
              {match.pattern}{match.pattern.length >= 80 ? "…" : ""}
            </pre>
          </div>
          <p className="text-[11px] text-white/35">
            이 커맨드를 그대로 실행하시겠습니까?
          </p>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
              isDanger
                ? "bg-red-500/15 hover:bg-red-500/25 text-red-400"
                : "bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400"
            }`}
          >
            그래도 실행
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasteGuardModal;
