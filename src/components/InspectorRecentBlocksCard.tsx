import React from "react";
import { Clock3, RotateCcw, Search } from "lucide-react";
import type { InspectorRecentBlock } from "./InspectorPanel/types";
import { formatDurationMs } from "./InspectorPanelSummary/utils";

interface InspectorRecentBlocksCardProps {
  recentBlocks: readonly InspectorRecentBlock[];
  inspectorCardRegularClass: string;
  onSelectBlock: (blockId: string) => void;
  onRerunBlock: (command: string) => void;
  onLoadAnalyzePromptToAiBar: (blockId?: string) => void;
}

const InspectorRecentBlocksCard: React.FC<InspectorRecentBlocksCardProps> = ({
  recentBlocks,
  inspectorCardRegularClass,
  onSelectBlock,
  onRerunBlock,
  onLoadAnalyzePromptToAiBar,
}) => (
  <div className={inspectorCardRegularClass}>
    <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Recent Blocks</p>
    {recentBlocks.map((block) => (
      <div key={block.id} className="flex items-start gap-2 rounded-md border border-white/[0.08] bg-black/20 px-2 py-1.5">
        <span className={`mt-0.5 inline-flex items-center justify-center text-xs px-1.5 py-0.5 rounded ${
          block.exitCode === 0 || block.exitCode == null
            ? "bg-emerald-400/16 text-emerald-200"
            : "bg-rose-400/18 text-rose-200"
        }`}>
          {block.exitCode === 0 || block.exitCode == null ? "OK" : `ERR ${block.exitCode}`}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-white/80 truncate">{block.command}</p>
          <p className="text-white/44 text-xs inline-flex items-center gap-1 mt-0.5">
            <Clock3 size={10} />
            {formatDurationMs(block.durationMs)}
          </p>
          {block.outputTail && (
            <p className="text-xs text-white/36 font-mono truncate mt-0.5">{block.outputTail}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onSelectBlock(block.id)}
            className="inline-flex w-[56px] justify-center items-center px-1.5 py-0.5 rounded border border-white/12 bg-white/[0.05] text-xs text-white/68 hover:text-white hover:bg-white/[0.11] transition-colors"
            title="이 블록 선택"
          >
            SEL
          </button>
          <button
            onClick={() => onRerunBlock(block.command)}
            className="inline-flex w-[64px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-300/30 bg-cyan-400/14 text-xs text-cyan-100 hover:bg-cyan-400/24 transition-colors"
            title="명령 재실행"
          >
            <RotateCcw size={9} />
            RUN
          </button>
          {block.exitCode !== 0 && block.exitCode != null && (
            <button
              onClick={() => onLoadAnalyzePromptToAiBar(block.id)}
              className="inline-flex w-[68px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-accent/35 bg-accent/14 text-xs text-accent hover:bg-accent/24 transition-colors"
              title="실패 분석 프롬프트 로드"
            >
              <Search size={9} />
              LOAD
            </button>
          )}
        </div>
      </div>
    ))}
  </div>
);

export default InspectorRecentBlocksCard;
