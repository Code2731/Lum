import React from "react";
import { GitBranch } from "lucide-react";
import { ActionHintGroup } from "@/components/ui/action-hint-group";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";
import { StatusBadge } from "@/components/ui/status-badge";

interface InspectorSummaryOverviewCardProps {
  selectedModel: string;
  activeTabTitle: string;
  activeTabPath: string;
  activeTabBranch?: string;
  activeTabChanged?: number;
  failedBlockCount: number;
  inspectorCardTightClass: string;
  onOpenWorkspace: () => void;
  onOpenDiffReview: () => void;
  onOpenFailedBlock: () => void;
  onOpenRag: () => void;
}

const InspectorSummaryOverviewCard: React.FC<InspectorSummaryOverviewCardProps> = ({
  selectedModel,
  activeTabTitle,
  activeTabPath,
  activeTabBranch,
  activeTabChanged,
  failedBlockCount,
  inspectorCardTightClass,
  onOpenWorkspace,
  onOpenDiffReview,
  onOpenFailedBlock,
  onOpenRag,
}) => {
  const projectName = activeTabPath.split(/[\\/]/).filter(Boolean).pop() ?? activeTabPath;
  const hasBranch = Boolean(activeTabBranch);
  const hasChanges = (activeTabChanged ?? 0) > 0;
  const hasFailures = failedBlockCount > 0;
  const workspaceStatus = hasFailures
    ? `실패 블록 ${failedBlockCount}건이 있어 복구 흐름이 우선입니다.`
    : hasChanges
      ? `변경 ${activeTabChanged}건이 있어 검토 흐름이 우선입니다.`
      : hasBranch
        ? "작업공간이 정리된 상태라 바로 이어서 작업하기 좋습니다."
        : "브랜치 정보 없이 열린 탭이라 현재 문맥 확인이 먼저 필요합니다.";
  const modelStatus = selectedModel.trim().length > 0
    ? "현재 선택된 모델로 바로 분석과 실행을 이어갈 수 있습니다."
    : "모델이 비어 있어 먼저 실행 환경 확인이 필요합니다.";
  const workspacePrimaryAction = hasFailures
    ? { label: "복구 시작", onClick: onOpenFailedBlock, shortcut: undefined }
    : hasChanges
      ? { label: "변경 검토", onClick: onOpenDiffReview, shortcut: "⌘⇧R" }
      : { label: "RAG 분석", onClick: onOpenRag, shortcut: undefined };
  const workspaceSecondaryAction = hasBranch
    ? { label: "작업공간", onClick: onOpenWorkspace }
    : { label: "문맥 열기", onClick: onOpenWorkspace };
  const workspacePrimaryReason = hasFailures
    ? "실패 카드를 열어 분석과 첫 제안 실행 흐름으로 바로 이어가는 복구 시작점입니다."
    : hasChanges
      ? "바뀐 내용을 먼저 검토하고 다음 수정을 결정합니다."
      : "현재 코드 문맥을 기반으로 바로 분석을 시작합니다.";
  const workspaceSecondaryReason = hasBranch
    ? "저장된 세션과 열린 탭 묶음으로 바로 복귀합니다."
    : "현재 탭 기준으로 작업 문맥을 다시 확인합니다.";
  const workspaceFlowLabel = hasFailures
    ? "우선 복구"
    : hasChanges
      ? "다음 검토"
      : hasBranch
        ? "바로 이어서"
        : "문맥 확인";
  const workspaceFlowHint = hasFailures
    ? "실패 블록을 먼저 열고, 이어서 분석과 첫 제안 실행 흐름으로 복구를 시작합니다."
    : hasChanges
      ? "변경 내용을 먼저 검토하고 다음 수정을 결정합니다."
      : hasBranch
        ? "정리된 작업공간에서 바로 분석과 수정을 이어갑니다."
        : "브랜치 없이 열린 탭이라 현재 작업 문맥을 먼저 읽습니다.";
  const modelFlowLabel = selectedModel.trim().length > 0 ? "즉시 분석" : "모델 확인";
  const modelFlowHint = selectedModel.trim().length > 0
    ? "선택된 모델과 현재 프로젝트 문맥으로 바로 분석을 시작합니다."
    : "모델을 먼저 확인한 뒤 분석과 실행 흐름으로 넘어갑니다.";

  return (
    <>
      <div className={inspectorCardTightClass}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-white/45 uppercase tracking-[0.06em] text-xs">작업공간</p>
          {activeTabBranch && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-cyan-300/30 bg-cyan-400/12 text-cyan-100 text-xs">
              <GitBranch size={10} />
              {activeTabBranch}
              {activeTabChanged != null && activeTabChanged > 0 && (
                <span className="px-1 rounded bg-amber-400/22 text-amber-200 text-xs">
                  {activeTabChanged}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusBadge tone="neutral">프로젝트</StatusBadge>
          <span className="text-[11px] font-medium text-white/74">{projectName}</span>
          {hasFailures ? (
            <StatusBadge tone="amber">복구 우선</StatusBadge>
          ) : hasChanges ? (
            <StatusBadge tone="amber">검토 필요</StatusBadge>
          ) : (
            <StatusBadge tone="emerald">이어서 작업 가능</StatusBadge>
          )}
        </div>
        <p className="mt-2 text-white/82 truncate">{activeTabTitle}</p>
        <p className="text-white/55 font-mono break-all">{activeTabPath}</p>
        <p className="mt-2 text-[11px] leading-4 text-white/38">{workspaceStatus}</p>
        <div className="mt-2 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
          <ActionFlowBar
            badges={[
              workspaceFlowLabel,
              hasBranch ? "세션 복귀" : "현재 탭",
              hasFailures ? "복구 시작" : hasChanges ? "변경 검토" : "RAG 분석",
            ]}
            helper={workspaceFlowHint}
            tone={hasFailures || hasChanges ? "amber" : hasBranch ? "cyan" : "neutral"}
          />
        </div>
        <ActionHintGroup
          primary={{
            label: workspacePrimaryAction.label,
            onClick: workspacePrimaryAction.onClick,
            shortcut: workspacePrimaryAction.shortcut,
            reason: workspacePrimaryReason,
          }}
          secondary={{
            label: workspaceSecondaryAction.label,
            onClick: workspaceSecondaryAction.onClick,
            shortcut: "⌘⇧S",
            reason: workspaceSecondaryReason,
          }}
        />
      </div>
      <div className={inspectorCardTightClass}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-white/45 uppercase tracking-[0.06em] text-xs">모델</p>
          <StatusBadge tone="cyan">준비됨</StatusBadge>
        </div>
        <p className="mt-2 text-white/82 break-all">{selectedModel}</p>
        <p className="mt-2 text-[11px] leading-4 text-white/38">{modelStatus}</p>
        <div className="mt-2 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
          <ActionFlowBar
            badges={["모델 준비", modelFlowLabel, "분석 시작"]}
            helper={modelFlowHint}
            tone="cyan"
          />
        </div>
        <ActionHintGroup
          primary={{
            label: "모델로 분석 시작",
            onClick: onOpenRag,
            reason: "선택된 모델로 현재 프로젝트 맥락 분석을 바로 이어갑니다.",
          }}
        />
      </div>
    </>
  );
};

export default InspectorSummaryOverviewCard;
