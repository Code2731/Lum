import React, { useCallback } from "react";
import { CheckCircle2, XCircle, Copy, X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { CommandBlock } from "../hooks/useCommandBlocks";

interface Props {
  block: CommandBlock;
  blockIndex: number;
  blockTotal: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRerun: (command: string) => void;
  onDismiss: () => void;
}

const CommandBlockBar: React.FC<Props> = ({
  block,
  blockIndex,
  blockTotal,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onRerun,
  onDismiss,
}) => {
  const success = block.exitCode === 0 || block.exitCode === null;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(block.output).catch(() => {});
  }, [block.output]);

  const handleCopyCommand = useCallback(() => {
    navigator.clipboard.writeText(block.command).catch(() => {});
  }, [block.command]);

  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-2 bg-[#0d1117]/95 border-t border-white/5 backdrop-blur-sm z-10">
      {success ? (
        <CheckCircle2 size={12} className="text-green-400 shrink-0" />
      ) : (
        <XCircle size={12} className="text-red-400 shrink-0" />
      )}
      <span className={`text-xs font-mono font-medium shrink-0 tabular-nums ${success ? "text-green-400" : "text-red-400"}`}>
        {success ? "exit 0" : `exit ${block.exitCode ?? "?"}`}
      </span>
      <span className="text-xs text-white/30 font-mono shrink-0 tabular-nums">
        {blockIndex + 1}/{blockTotal}
      </span>
      <span className="font-mono text-xs text-white/55 truncate flex-1 min-w-0">
        <span className="text-white/30">$ </span>
        {block.command || "…"}
      </span>
      <IconButton
        tooltip="이전 블록 (Cmd/Ctrl+Shift+↑)"
        onClick={onPrev}
        disabled={!canPrev}
        className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30"
      >
        <ChevronLeft size={11} />
      </IconButton>
      <IconButton
        tooltip="다음 블록 (Cmd/Ctrl+Shift+↓)"
        onClick={onNext}
        disabled={!canNext}
        className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30"
      >
        <ChevronRight size={11} />
      </IconButton>
      <IconButton
        tooltip="명령어 복사"
        onClick={handleCopyCommand}
        className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0"
      >
        <Copy size={11} />
      </IconButton>
      <IconButton
        tooltip="명령어 다시 실행"
        onClick={() => onRerun(block.command)}
        className="p-1 rounded text-white/30 hover:text-accent hover:bg-white/10 transition-colors shrink-0"
      >
        <RotateCcw size={11} />
      </IconButton>
      <IconButton
        tooltip="출력 복사"
        onClick={handleCopy}
        className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0"
      >
        <Copy size={11} />
      </IconButton>
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
