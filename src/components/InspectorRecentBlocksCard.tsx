import React from "react";
import { Clock3, RotateCcw, Search } from "lucide-react";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import type { InspectorRecentBlock } from "./InspectorPanel/types";
import { formatDurationMs } from "./InspectorPanelSummary/utils";

interface InspectorRecentBlocksCardProps {
  recentBlocks: readonly InspectorRecentBlock[];
  inspectorCardRegularClass: string;
  onSelectBlock: (blockId: string) => void;
  onRerunBlock: (command: string) => void;
  onLoadAnalyzePromptToAiBar: (blockId?: string) => void;
}

export interface InspectorRecentBlocksFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export function getInspectorRecentBlocksFlowSummary(
  recentBlocks: readonly InspectorRecentBlock[],
): InspectorRecentBlocksFlowSummary {
  const failedCount = recentBlocks.filter(
    (block) => block.exitCode !== 0 && block.exitCode != null,
  ).length;
  const successCount = recentBlocks.filter(
    (block) => block.exitCode === 0 || block.exitCode == null,
  ).length;

  return {
    badges: [
      `최근 블록 ${recentBlocks.length}개`,
      failedCount > 0 ? `분석 가능 ${failedCount}개` : `성공 흐름 ${successCount}개`,
      "마지막 블록 선택",
    ],
    helper:
      failedCount > 0
        ? "방금 실행한 흐름을 먼저 읽고, 실패한 명령은 다시 실행하거나 분석한 뒤 필요한 블록을 작업 대상으로 고릅니다."
        : "최근 성공 흐름을 빠르게 훑고 필요한 명령을 다시 실행한 뒤, 이어서 볼 블록을 선택합니다.",
  };
}

const InspectorRecentBlocksCard: React.FC<InspectorRecentBlocksCardProps> = ({
  recentBlocks,
  inspectorCardRegularClass,
  onSelectBlock,
  onRerunBlock,
  onLoadAnalyzePromptToAiBar,
}) => {
  const flow = getInspectorRecentBlocksFlowSummary(recentBlocks);

  return (
    <div className={inspectorCardRegularClass}>
      <p className="text-white/45 uppercase tracking-[0.06em] text-xs">최근 블록</p>
      <div className="mt-2">
        <ActionFlowBar
          badges={flow.badges}
          helper={flow.helper}
          tone="neutral"
        />
      </div>
      {recentBlocks.map((block) => (
        <div key={block.id} className="mt-2 flex items-start gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-2.5 py-2">
          <span
            className={`mt-0.5 inline-flex items-center justify-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
              block.exitCode === 0 || block.exitCode == null
                ? "border-emerald-300/24 bg-emerald-400/16 text-emerald-100"
                : "border-rose-300/28 bg-rose-400/18 text-rose-100"
            }`}
          >
            {block.exitCode === 0 || block.exitCode == null ? "성공 흐름" : `실패 ${block.exitCode}`}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-white/80 truncate">{block.command}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-white/46">
                최근 실행
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${
                  block.exitCode === 0 || block.exitCode == null
                    ? "border-emerald-300/24 bg-emerald-400/10 text-emerald-100"
                    : "border-amber-300/26 bg-amber-400/10 text-amber-100"
                }`}
              >
                {block.exitCode === 0 || block.exitCode == null ? "바로 재실행" : "분석 가능"}
              </span>
            </div>
            <p className="text-white/44 text-xs inline-flex items-center gap-1 mt-1">
              <Clock3 size={10} />
              {formatDurationMs(block.durationMs)}
            </p>
            {block.outputTail && (
              <p className="text-xs text-white/36 font-mono truncate mt-0.5">{block.outputTail}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              onClick={() => onSelectBlock(block.id)}
              className="inline-flex min-w-[78px] justify-center items-center px-2 py-1 rounded border border-white/12 bg-white/[0.05] text-[11px] text-white/68 hover:text-white hover:bg-white/[0.11] transition-colors"
              title="이 블록 선택"
            >
              블록 선택
            </button>
            <button
              onClick={() => onRerunBlock(block.command)}
              className="inline-flex min-w-[88px] justify-center items-center gap-1 px-2 py-1 rounded border border-cyan-300/30 bg-cyan-400/14 text-[11px] text-cyan-100 hover:bg-cyan-400/24 transition-colors"
              title="명령 재실행"
            >
              <RotateCcw size={9} />
              다시 실행
            </button>
            {block.exitCode !== 0 && block.exitCode != null && (
              <button
                onClick={() => onLoadAnalyzePromptToAiBar(block.id)}
                className="inline-flex min-w-[88px] justify-center items-center gap-1 px-2 py-1 rounded border border-accent/35 bg-accent/14 text-[11px] text-accent hover:bg-accent/24 transition-colors"
                title="실패 분석 프롬프트 로드"
              >
                <Search size={9} />
                분석 열기
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default InspectorRecentBlocksCard;
