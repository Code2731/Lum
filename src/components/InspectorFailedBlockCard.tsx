import React from "react";
import { AlertTriangle, Copy, Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
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

export interface InspectorFailedBlockMeta {
  exitLabel: string;
  guide: string;
  badges: [string, string, string];
  primaryActionHelper: string;
}

export function getInspectorFailedBlockMeta(
  block: InspectorFailedBlock,
): InspectorFailedBlockMeta {
  return {
    exitLabel: `실패 ${block.exitCode}`,
    guide: "실패 블록을 먼저 보고, 다음으로 AI 분석을 열고, 마지막에 로그나 프롬프트를 넘깁니다.",
    badges: ["먼저 실패 확인", "다음 분석 열기", "마지막 로그/프롬프트"],
    primaryActionHelper: "현재 실패 블록을 기준으로 분석을 열면 첫 제안 실행 흐름까지 가장 빠르게 이어집니다.",
  };
}

export function getInspectorFailedBlockActionLabel(
  action: "focus" | "analyze" | "copyLog" | "copyPrompt" | "loadPrompt" | "select",
): string {
  switch (action) {
    case "focus":
      return "다음 실패 확인";
    case "analyze":
      return "실패 분석 열기";
    case "copyLog":
      return "실패 로그 복사";
    case "copyPrompt":
      return "분석 프롬프트 복사";
    case "loadPrompt":
      return "분석 입력 불러오기";
    default:
      return "블록 선택";
  }
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
}) => {
  const blockMeta = focusedFailedBlock ? getInspectorFailedBlockMeta(focusedFailedBlock) : null;

  return (
  <div className={inspectorCardRegularClass}>
    <div className="flex items-center justify-between gap-2">
      <p className="text-white/45 uppercase tracking-[0.06em] text-xs">실패 블록</p>
      <span className="text-xs text-rose-200/80">{failedBlocks.length}개</span>
    </div>
    {focusedFailedBlock ? (
      <div className="rounded-xl border border-rose-300/25 bg-rose-400/8 px-2.5 py-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-rose-100/90 truncate">{focusedFailedBlock.command}</p>
          <span className="inline-flex items-center rounded-full border border-rose-300/26 bg-rose-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-100">
            {blockMeta?.exitLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-rose-300/16 bg-black/10 px-2 py-1.5">
          <StatusBadge tone="amber">{blockMeta?.badges[0]}</StatusBadge>
          <StatusBadge tone="neutral">{blockMeta?.badges[1]}</StatusBadge>
          <StatusBadge tone="neutral">{blockMeta?.badges[2]}</StatusBadge>
          <span className="text-[10px] text-rose-100/60">
            {blockMeta?.guide}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-cyan-300/14 bg-cyan-400/[0.06] px-2 py-1.5">
          <StatusBadge tone="cyan">바로 복구 시작</StatusBadge>
          <span className="text-[10px] text-cyan-100/76">
            {blockMeta?.primaryActionHelper}
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
            className="inline-flex min-w-[94px] justify-center items-center gap-1 px-2 py-1 rounded border border-rose-300/35 bg-rose-400/14 text-[11px] text-rose-100 hover:bg-rose-400/22 transition-colors"
          >
            <AlertTriangle size={9} />
            {getInspectorFailedBlockActionLabel("focus")}
          </button>
          <button
            onClick={() => onAnalyzeFailedBlock(focusedFailedBlock.id)}
            className="inline-flex min-w-[94px] justify-center items-center gap-1 px-2 py-1 rounded border border-cyan-300/35 bg-cyan-400/14 text-[11px] text-cyan-100 hover:bg-cyan-400/24 transition-colors"
          >
            <Search size={9} />
            {getInspectorFailedBlockActionLabel("analyze")}
          </button>
          <button
            onClick={() => onCopyFailedOutput(focusedFailedBlock.id)}
            className="inline-flex min-w-[98px] justify-center items-center gap-1 px-2 py-1 rounded border border-white/20 bg-white/[0.05] text-[11px] text-white/75 hover:text-white hover:bg-white/[0.12] transition-colors"
          >
            <Copy size={9} />
            {getInspectorFailedBlockActionLabel("copyLog")}
          </button>
          <button
            onClick={() => onCopyAnalyzePrompt(focusedFailedBlock.id)}
            className="inline-flex min-w-[112px] justify-center items-center gap-1 px-2 py-1 rounded border border-cyan-300/30 bg-cyan-400/10 text-[11px] text-cyan-100 hover:bg-cyan-400/20 transition-colors"
          >
            <Copy size={9} />
            {getInspectorFailedBlockActionLabel("copyPrompt")}
          </button>
          <button
            onClick={() => onLoadAnalyzePromptToAiBar(focusedFailedBlock.id)}
            className="inline-flex min-w-[116px] justify-center items-center gap-1 px-2 py-1 rounded border border-accent/35 bg-accent/14 text-[11px] text-accent hover:bg-accent/24 transition-colors"
          >
            <Search size={9} />
            {getInspectorFailedBlockActionLabel("loadPrompt")}
          </button>
          <button
            onClick={() => onSelectBlock(focusedFailedBlock.id)}
            className="inline-flex min-w-[78px] justify-center items-center px-2 py-1 rounded border border-white/18 bg-white/[0.05] text-[11px] text-white/75 hover:text-white hover:bg-white/[0.11] transition-colors"
          >
            {getInspectorFailedBlockActionLabel("select")}
          </button>
        </div>
      </div>
    ) : (
      <p className="text-white/40">실패 블록이 없습니다.</p>
    )}
  </div>
  );
};

export default InspectorFailedBlockCard;
