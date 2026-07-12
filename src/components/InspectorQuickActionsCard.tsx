import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RecommendationReasonBadge } from "@/components/ui/recommendation-reason-badge";
import { RecommendationCard } from "@/components/ui/recommendation-card";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { SectionIntroHeader } from "@/components/ui/section-intro-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getInspectorQuickActionBadgeClass } from "@/utils/inspectorQuickActionTone";
import {
  Activity,
  AlertTriangle,
  FolderTree,
  GitCompareArrows,
  Layers,
  Library,
  Search,
} from "lucide-react";

interface InspectorQuickActionsCardProps {
  quickActionsExpanded: boolean;
  inspectorCardRegularClass: string;
  inspectorQuickGridClass: string;
  inspectorQuickActionsToggleRef: React.RefObject<HTMLButtonElement | null>;
  inspectorQuickActionsAdvancedRef: React.RefObject<HTMLDivElement | null>;
  onQuickActionsToggle: () => void;
  onQuickActionsToggleKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onQuickActionsAdvancedKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onToggleProjectBin: () => void;
  onOpenWorkspace: () => void;
  onOpenHistory: () => void;
  onOpenDiffReview: () => void;
  onOpenFailedBlock: () => void;
  onTabSelect: (tab: "summary" | "rag" | "scripts" | "sysmon") => void;
}

export interface InspectorQuickActionsFlowSummary {
  badges: [string, string, string];
  helper: string;
}

export interface InspectorQuickActionsRecoverySummary {
  badges: [string, string, string];
  helper: string;
}

export function getInspectorQuickActionsPrimaryFlowSummary(
  quickActionsExpanded: boolean,
): InspectorQuickActionsFlowSummary {
  return {
    badges: [
      "작업공간 복귀",
      "RAG·보관함 이동",
      quickActionsExpanded ? "운영 단계 닫기" : "운영 단계 열기",
    ],
    helper: quickActionsExpanded
      ? "복구와 분석 이후에 지금은 운영/검토 단계까지 펼쳐진 상태입니다. 필요 없으면 접고 핵심 흐름만 유지할 수 있습니다."
      : "복구와 분석이 끝났다면 작업공간 복귀, 코드 맥락 이동, 운영 점검 같은 후속 흐름으로 이어갑니다.",
  };
}

export function getInspectorQuickActionsAdvancedFlowSummary(): InspectorQuickActionsFlowSummary {
  return {
    badges: ["변경 검토", "기록 확인", "자동화 연결"],
    helper: "복구가 끝난 뒤 변경과 기록을 확인하고, 반복 작업은 스크립트나 운영 패널로 넘깁니다.",
  };
}

export function getInspectorQuickActionsRecoverySummary(): InspectorQuickActionsRecoverySummary {
  return {
    badges: ["바로 복구 시작", "실패 분석 연결", "첫 제안 실행"],
    helper: "실패 카드를 열어 원인을 확인하고, 분석 결과의 첫 제안 실행 흐름까지 이어지는 복구 시작점입니다.",
  };
}

const InspectorQuickActionsCard: React.FC<InspectorQuickActionsCardProps> = ({
  quickActionsExpanded,
  inspectorCardRegularClass,
  inspectorQuickGridClass,
  inspectorQuickActionsToggleRef,
  inspectorQuickActionsAdvancedRef,
  onQuickActionsToggle,
  onQuickActionsToggleKeyDown,
  onQuickActionsAdvancedKeyDown,
  onToggleProjectBin,
  onOpenWorkspace,
  onOpenHistory,
  onOpenDiffReview,
  onOpenFailedBlock,
  onTabSelect,
}) => {
  const primaryFlow = getInspectorQuickActionsPrimaryFlowSummary(quickActionsExpanded);
  const advancedFlow = getInspectorQuickActionsAdvancedFlowSummary();
  const recoveryFlow = getInspectorQuickActionsRecoverySummary();

  return (
    <div className={`${inspectorCardRegularClass} border-white/10 bg-white/[0.03] shadow-[0_8px_18px_rgba(0,0,0,0.08)]`}>
      <SectionIntroHeader
        title="4단계 운영 · 이동"
        description="복구 이후 자주 쓰는 작업공간 복귀와 운영 흐름으로 이동합니다."
        aside={(
          <span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/72">
            후속 단계
          </span>
        )}
      />
      <ActionFlowBar
        badges={primaryFlow.badges}
        helper={primaryFlow.helper}
        tone="cyan"
      />
      <div className={inspectorQuickGridClass}>
        <RecommendationCard
          title="프로젝트 보관함"
          description="프로젝트별 자산과 작업 파일을 다시 엽니다."
          icon={<FolderTree size={11} />}
          badges={<RecommendationReasonBadge label="정리" tone="neutral" />}
          onClick={onToggleProjectBin}
          actionAlign="center"
          surfaceTone="neutral"
          density="compact"
          className="w-full"
        />
        <RecommendationCard
          title="작업공간"
          description="최근 세션과 복귀 지점을 빠르게 이어갑니다."
          icon={<Layers size={11} />}
          badges={(
            <>
              <RecommendationReasonBadge label="복귀" tone="emerald" />
              <span className={getInspectorQuickActionBadgeClass("accent")}>추천</span>
            </>
          )}
          onClick={onOpenWorkspace}
          actionAlign="center"
          surfaceTone="emerald"
          density="compact"
          className="w-full"
        />
        <RecommendationCard
          title="RAG"
          description="코드 맥락 검색으로 바로 분석 흐름을 시작합니다."
          icon={<Library size={11} />}
          badges={(
            <>
              <RecommendationReasonBadge label="시작점" tone="cyan" />
              <span className={getInspectorQuickActionBadgeClass("cyan")}>AI</span>
            </>
          )}
          onClick={() => onTabSelect("rag")}
          actionAlign="center"
          surfaceTone="cyan"
          density="compact"
          className="w-full"
        />
        <button
          type="button"
          data-inspector-quick-actions-toggle
          aria-controls="inspector-quick-actions-advanced"
          aria-expanded={quickActionsExpanded}
          ref={inspectorQuickActionsToggleRef}
          onKeyDown={onQuickActionsToggleKeyDown}
          onClick={onQuickActionsToggle}
          className="inline-flex w-full min-h-[52px] items-start gap-2 rounded-md border border-white/12 bg-white/[0.05] px-2.5 py-2 text-left text-white/74 transition-colors hover:bg-white/[0.1] hover:text-white"
        >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
              <span className="truncate text-xs font-medium">{quickActionsExpanded ? "운영 단계 닫기" : "운영 단계 열기"}</span>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                후속
              </span>
            </span>
            <span aria-hidden="true" className="mt-1 block text-[11px] leading-4 text-white/42">
              {quickActionsExpanded ? "운영/검토 흐름을 접고 핵심 작업으로 돌아갑니다." : "변경 검토, 이력 확인, 자동화, 시스템 점검 흐름을 이어서 엽니다."}
            </span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {quickActionsExpanded && (
            <motion.div
              id="inspector-quick-actions-advanced"
              data-inspector-quick-actions-advanced
              key="inspector-quick-actions-advanced"
              className="col-span-2"
              ref={inspectorQuickActionsAdvancedRef}
              onKeyDown={onQuickActionsAdvancedKeyDown}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              style={{ overflow: "hidden" }}
            >
              <div className="mb-2">
                <ActionFlowBar
                  badges={advancedFlow.badges}
                  helper={advancedFlow.helper}
                  tone="amber"
                />
              </div>
            <div className="mb-2">
              <ActionFlowBar
                badges={recoveryFlow.badges}
                helper={recoveryFlow.helper}
                tone="cyan"
              />
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
              <StatusBadge tone="neutral">복구 이후</StatusBadge>
              <StatusBadge tone="amber">다음 검토</StatusBadge>
              <StatusBadge tone="neutral">이력 확인</StatusBadge>
              <StatusBadge tone="neutral">반복 자동화</StatusBadge>
              <span className="text-[10px] text-white/34">
                복구가 끝난 뒤 변경과 기록을 확인하고, 마지막에 반복 작업과 시스템 점검으로 넘깁니다.
              </span>
            </div>
            <div className={inspectorQuickGridClass}>
              <RecommendationCard
                title="실패"
                description="실패 블록과 복구 단서를 우선으로 확인합니다."
                icon={<AlertTriangle size={11} />}
                badges={(
                  <>
                    <RecommendationReasonBadge label="복구" tone="amber" />
                    <span className={getInspectorQuickActionBadgeClass("danger")}>우선</span>
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100/90">
                      시작점
                    </span>
                  </>
                )}
                onClick={onOpenFailedBlock}
                actionAlign="center"
                surfaceTone="danger"
                density="compact"
                className="w-full"
              />
              <RecommendationCard
                title="변경내역"
                description="Diff 리뷰와 수정 흐름을 바로 확인합니다."
                icon={<GitCompareArrows size={11} />}
                badges={(
                  <>
                    <RecommendationReasonBadge label="검토" tone="amber" />
                    <span className={getInspectorQuickActionBadgeClass("amber")}>다음</span>
                  </>
                )}
                onClick={onOpenDiffReview}
                actionAlign="center"
                surfaceTone="amber"
                density="compact"
                className="w-full"
              />
              <RecommendationCard
                title="기록"
                description="최근 탐색 기록과 히스토리를 다시 꺼냅니다."
                icon={<Search size={11} />}
                badges={(
                  <>
                    <RecommendationReasonBadge label="이력" tone="neutral" />
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                      확인
                    </span>
                  </>
                )}
                onClick={onOpenHistory}
                actionAlign="center"
                surfaceTone="neutral"
                density="compact"
                className="w-full"
              />
              <RecommendationCard
                title="스크립트"
                description="반복 작업을 라이브러리에서 즉시 실행합니다."
                icon={<Library size={11} />}
                badges={(
                  <>
                    <RecommendationReasonBadge label="자동화" tone="violet" />
                    <span className={getInspectorQuickActionBadgeClass("accent")}>반복</span>
                  </>
                )}
                onClick={() => onTabSelect("scripts")}
                actionAlign="center"
                surfaceTone="violet"
                density="compact"
                className="w-full"
              />
              <RecommendationCard
                title="시스템"
                description="리소스와 런타임 상태를 빠르게 점검합니다."
                icon={<Activity size={11} />}
                badges={(
                  <>
                    <RecommendationReasonBadge label="상태" tone="neutral" />
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                      점검
                    </span>
                  </>
                )}
                onClick={() => onTabSelect("sysmon")}
                actionAlign="center"
                surfaceTone="neutral"
                density="compact"
                className="w-full"
              />
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default InspectorQuickActionsCard;
