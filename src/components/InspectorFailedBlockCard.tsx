import React from "react";
import { AlertTriangle, Copy, Search } from "lucide-react";
import type { InspectorFailedBlock } from "./InspectorPanel/types";

interface InspectorFailedBlockCardProps {
  failedBlocks: readonly InspectorFailedBlock[];
  focusedFailedBlock: InspectorFailedBlock | null;
  inspectorCardRegularClass: string;
  onFocusFailedBlock: () => void;
  onAnalyzeFailedBlock: (blockId?: string) => void;
  onCopyFailedOutput: (blockId?: string) => void;
  onCopyAnalyzePrompt: (blockId?: string) => void;
  onLoadAnalyzePromptToAiBar: (blockId?: string) => void;
  onSelectBlock: (blockId: string) => void;
}

const InspectorFailedBlockCard: React.FC<InspectorFailedBlockCardProps> = ({
  failedBlocks,
  focusedFailedBlock,
  inspectorCardRegularClass,
  onFocusFailedBlock,
  onAnalyzeFailedBlock,
  onCopyFailedOutput,
  onCopyAnalyzePrompt,
  onLoadAnalyzePromptToAiBar,
  onSelectBlock,
}) => (
  <div className={inspectorCardRegularClass}>
    <div className="flex items-center justify-between gap-2">
      <p className="text-white/45 uppercase tracking-[0.06em] text-xs">실패 블록</p>
      <span className="text-xs text-rose-200/80">{failedBlocks.length}개</span>
    </div>
    {focusedFailedBlock ? (
      <div className="rounded-md border border-rose-300/25 bg-rose-400/8 px-2 py-1.5 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-rose-100/90 truncate">{focusedFailedBlock.command}</p>
          <span className="text-xs px-1.5 py-0.5 rounded bg-rose-400/20 text-rose-100">
            ERR {focusedFailedBlock.exitCode}
          </span>
        </div>
        {focusedFailedBlock.outputTail && (
          <p className="text-xs text-rose-100/75 font-mono break-words">
            {focusedFailedBlock.outputTail}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={onFocusFailedBlock}
            className="inline-flex w-[84px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-rose-300/35 bg-rose-400/14 text-xs text-rose-100 hover:bg-rose-400/22 transition-colors"
          >
            <AlertTriangle size={9} />
            다음 실패
          </button>
          <button
            onClick={() => onAnalyzeFailedBlock(focusedFailedBlock.id)}
            className="inline-flex w-[88px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-300/35 bg-cyan-400/14 text-xs text-cyan-100 hover:bg-cyan-400/24 transition-colors"
          >
            <Search size={9} />
            AI 분석
          </button>
          <button
            onClick={() => onCopyFailedOutput(focusedFailedBlock.id)}
            className="inline-flex w-[76px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/20 bg-white/[0.05] text-xs text-white/75 hover:text-white hover:bg-white/[0.12] transition-colors"
          >
            <Copy size={9} />
            로그 복사
          </button>
          <button
            onClick={() => onCopyAnalyzePrompt(focusedFailedBlock.id)}
            className="inline-flex w-[92px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-300/30 bg-cyan-400/10 text-xs text-cyan-100 hover:bg-cyan-400/20 transition-colors"
          >
            <Copy size={9} />
            프롬프트 복사
          </button>
          <button
            onClick={() => onLoadAnalyzePromptToAiBar(focusedFailedBlock.id)}
            className="inline-flex w-[92px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-accent/35 bg-accent/14 text-xs text-accent hover:bg-accent/24 transition-colors"
          >
            <Search size={9} />
            프롬프트 불러오기
          </button>
          <button
            onClick={() => onSelectBlock(focusedFailedBlock.id)}
            className="inline-flex w-[60px] justify-center items-center px-1.5 py-0.5 rounded border border-white/18 bg-white/[0.05] text-xs text-white/75 hover:text-white hover:bg-white/[0.11] transition-colors"
          >
            선택
          </button>
        </div>
      </div>
    ) : (
      <p className="text-white/40">실패 블록이 없습니다.</p>
    )}
  </div>
);

export default InspectorFailedBlockCard;
