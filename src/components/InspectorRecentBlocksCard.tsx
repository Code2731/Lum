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
      failedCount > 0 ? `후속 확인 ${failedCount}개` : `성공 흐름 ${successCount}개`,
      "필요 시 재실행",
    ],
    helper:
      failedCount > 0
        ? "복구와 분석이 끝난 뒤, 최근 흐름에서 다시 확인할 블록이나 재실행할 명령을 후속 후보로 고릅니다."
        : "최근 성공 흐름을 훑고 필요한 명령만 후속으로 다시 실행하거나 참조할 블록을 고릅니다.",
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
    <div className={`${inspectorCardRegularClass} border-white/10 bg-white/[0.035] shadow-[0_8px_18px_rgba(0,0,0,0.10)]`}>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/72">
          3단계
        </span>
        <p className="text-white/45 uppercase tracking-[0.06em] text-xs">최근 흐름 재확인</p>
      </div>
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
                    : "border-cyan-300/26 bg-cyan-400/10 text-cyan-100"
                }`}
              >
                {block.exitCode === 0 || block.exitCode == null ? "후속 재실행" : "후속 분석 가능"}
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
              onClick={() => onRerunBlock(block.command)}
              className="inline-flex min-w-[88px] justify-center items-center gap-1 px-2 py-1 rounded border border-cyan-300/34 bg-cyan-400/16 text-[11px] font-medium text-cyan-100 transition-[background-color,box-shadow,transform] hover:bg-cyan-400/26 hover:shadow-[0_8px_20px_rgba(34,211,238,0.16)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/40"
              title="후속 확인용 명령 재실행"
            >
              <RotateCcw size={9} />
              다시 실행
            </button>
            <button
              onClick={() => onSelectBlock(block.id)}
              className="inline-flex min-w-[78px] justify-center items-center px-2 py-1 rounded border border-white/14 bg-white/[0.04] text-[11px] text-white/70 transition-[background-color,box-shadow,transform,color] hover:text-white hover:bg-white/[0.1] hover:shadow-[0_8px_18px_rgba(0,0,0,0.14)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25"
              title="후속 확인 대상으로 이 블록 선택"
            >
              블록 선택
            </button>
            {block.exitCode !== 0 && block.exitCode != null && (
              <button
                onClick={() => onLoadAnalyzePromptToAiBar(block.id)}
                className="inline-flex min-w-[88px] justify-center items-center gap-1 px-2 py-1 rounded border border-amber-300/30 bg-amber-400/14 text-[11px] text-amber-100 transition-[background-color,box-shadow,transform] hover:bg-amber-400/22 hover:shadow-[0_8px_20px_rgba(245,158,11,0.16)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
                title="후속 분석 프롬프트 열기"
              >
                <Search size={9} />
                후속 분석
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default InspectorRecentBlocksCard;
