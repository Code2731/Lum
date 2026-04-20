import React, { useCallback } from "react";
import { CheckCircle2, XCircle, Copy, X } from "lucide-react";
import type { CommandBlock } from "../hooks/useCommandBlocks";

interface Props {
  block: CommandBlock;
  onDismiss: () => void;
}

const CommandBlockBar: React.FC<Props> = ({ block, onDismiss }) => {
  const success = block.exitCode === 0 || block.exitCode === null;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(block.output).catch(() => {});
  }, [block.output]);

  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-2 bg-[#0d1117]/95 border-t border-white/5 backdrop-blur-sm z-10">
      {success ? (
        <CheckCircle2 size={12} className="text-green-400 shrink-0" />
      ) : (
        <XCircle size={12} className="text-red-400 shrink-0" />
      )}
      <span className={`text-[10px] font-mono shrink-0 tabular-nums ${success ? "text-green-400" : "text-red-400"}`}>
        {success ? "exit 0" : `exit ${block.exitCode ?? "?"}`}
      </span>
      <span className="font-mono text-[11px] text-white/50 truncate flex-1 min-w-0">
        <span className="text-white/25">$ </span>
        {block.command || "…"}
      </span>
      <button
        onClick={handleCopy}
        title="출력 복사"
        className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0"
      >
        <Copy size={11} />
      </button>
      <button
        onClick={onDismiss}
        aria-label="닫기"
        className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0"
      >
        <X size={11} />
      </button>
    </div>
  );
};

export default CommandBlockBar;
