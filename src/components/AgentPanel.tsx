import React from "react";
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Square,
  X,
  ChevronRight,
  BookOpen,
  Copy,
} from "lucide-react";
import type { AgentState, AgentStep, CompletedStep } from "../hooks/useAgentLoop";
import { SMALL_ICON_SIZE } from "../constants/ui";
import { IconButton } from "@/components/ui/icon-button";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";

interface Props {
  state: AgentState;
  onApprove: () => void;
  onCancel: () => void;
  onClose: () => void;
  onSaveScript?: (commands: string[]) => void;
}

export interface AgentPanelFlowSummary {
  badges: [string, string, string];
  helper: string;
}

// 위험도 배지 스타일
const RISK_CONFIG: Record<
  AgentStep["risk"],
  { label: string; className: string }
> = {
  safe: {
    label: "안전",
    className: "text-green-400 bg-green-400/10 border border-green-400/20",
  },
  caution: {
    label: "주의",
    className: "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20",
  },
  danger: {
    label: "위험",
    className: "text-red-400 bg-red-400/10 border border-red-400/20",
  },
};

// 상태 레이블
const STATUS_LABEL: Record<AgentState["status"], string> = {
  idle: "대기",
  planning: "계획 수립 중...",
  awaiting_approval: "승인 대기",
  executing: "실행 중",
  observing: "AI 분석 중...",
  done: "완료",
  failed: "실패",
  cancelled: "취소됨",
};

const RiskBadge: React.FC<{ risk: AgentStep["risk"] }> = ({ risk }) => {
  const cfg = RISK_CONFIG[risk];
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
};

const CompletedStepRow: React.FC<{ step: CompletedStep }> = ({ step }) => {
  const ok = step.exitCode === 0 || step.exitCode === null;
  return (
    <div className="flex items-start gap-2 py-1">
      {ok ? (
        <CheckCircle2 size={12} className="text-green-400 mt-0.5 shrink-0" />
      ) : (
        <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
      )}
      <span className="font-mono text-sm text-white/60 truncate">
        $ {step.cmd}
      </span>
      {step.exitCode !== null && step.exitCode !== 0 && (
        <span className="text-xs text-red-400 shrink-0">({step.exitCode})</span>
      )}
    </div>
  );
};

export function getAgentPanelHeaderFlowSummary(status: AgentState["status"]): AgentPanelFlowSummary {
  if (status === "awaiting_approval") {
    return {
      badges: ["먼저 계획 확인", "다음 승인", "마지막 관찰"],
      helper: "계획과 위험도를 먼저 보고, 승인 후 실행 흐름으로 넘기면 관찰 결과가 아래에 이어집니다.",
    };
  }

  if (status === "executing" || status === "observing") {
    return {
      badges: ["현재 단계", "다음 관찰", "마지막 완료"],
      helper: "현재 단계와 완료된 기록을 함께 보면서 실행 흐름이 어디까지 왔는지 바로 파악합니다.",
    };
  }

  if (status === "done" || status === "failed" || status === "cancelled") {
    return {
      badges: ["현재 결과", "다음 기록 확인", "마지막 닫기"],
      helper:
        status === "failed"
          ? "오류를 복사해 공유하거나, 아래에서 어디까지 실행됐는지 확인한 뒤 같은 작업을 다시 정리할 수 있습니다."
          : "결과를 먼저 확인하고, 아래 실행 기록을 훑은 뒤 닫거나 다음 작업으로 이어갑니다.",
    };
  }

  return {
    badges: ["먼저 계획", "다음 실행", "마지막 결과"],
    helper: "계획이 잡히면 실행, 관찰, 결과 확인 순서로 같은 패널에서 이어집니다.",
  };
}

export function getAgentPanelApprovalFlowSummary(
  totalSteps: number,
  cautionCount: number,
  dangerCount: number,
): AgentPanelFlowSummary {
  return {
    badges: [
      `총 ${totalSteps}단계`,
      dangerCount > 0 ? `위험 ${dangerCount}개` : cautionCount > 0 ? `주의 ${cautionCount}개` : "바로 승인",
      "실행 대기",
    ],
    helper: "실행 전에 단계 수와 위험도를 먼저 보고, 승인 후 같은 순서대로 실행이 진행됩니다.",
  };
}

const AgentPanel: React.FC<Props> = ({ state, onApprove, onCancel, onClose, onSaveScript }) => {
  const { status, task, plan, currentStepIdx, completed, message } = state;
  const copyText = (text: string) => {
    navigator.clipboard?.writeText?.(text).catch(() => {});
  };

  const currentStep = plan[currentStepIdx] ?? null;
  const totalSteps = plan.length;
  const cautionCount = plan.filter((step) => step.risk === "caution").length;
  const dangerCount = plan.filter((step) => step.risk === "danger").length;
  const headerFlow = getAgentPanelHeaderFlowSummary(status);
  const approvalFlow = getAgentPanelApprovalFlowSummary(totalSteps, cautionCount, dangerCount);

  return (
    <div className="w-[520px] max-h-[80vh] flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-white/3 shrink-0">
        <Bot size={SMALL_ICON_SIZE} className="text-accent shrink-0" />
        <span className="text-sm font-semibold text-accent">에이전트 태스크</span>
        <span className="text-xs text-white/30 ml-1 truncate flex-1">{task}</span>
        <button
          onClick={onClose}
          className="ml-auto text-white/30 hover:text-white/70 transition-colors shrink-0"
          aria-label="닫기"
        >
          <X size={12} />
        </button>
      </div>

      {/* ── 상태 표시줄 ───────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-white/2 shrink-0">
        {(status === "planning" || status === "observing" || status === "executing") && (
          <Loader2 size={11} className="animate-spin text-accent shrink-0" />
        )}
        {status === "done" && (
          <CheckCircle2 size={11} className="text-green-400 shrink-0" />
        )}
        {status === "failed" && (
          <XCircle size={11} className="text-red-400 shrink-0" />
        )}
        {status === "cancelled" && (
          <AlertTriangle size={11} className="text-white/40 shrink-0" />
        )}
        {status === "awaiting_approval" && (
          <ChevronRight size={11} className="text-yellow-400 shrink-0" />
        )}
        <span
          className={`text-sm font-medium ${
            status === "done"
              ? "text-green-400"
              : status === "failed"
              ? "text-red-400"
              : status === "cancelled"
              ? "text-white/40"
              : status === "awaiting_approval"
              ? "text-yellow-400"
              : "text-white/60"
          }`}
        >
          {STATUS_LABEL[status]}
        </span>
        {(status === "executing" || status === "observing") && totalSteps > 0 && (
          <span className="text-xs text-white/30 ml-auto">
            {Math.min(currentStepIdx + 1, totalSteps)} / {totalSteps}
          </span>
        )}
      </div>

      <div className="px-3 py-2 border-b border-white/5 bg-white/[0.035] shrink-0">
        <ActionFlowBar badges={headerFlow.badges} helper={headerFlow.helper} />
      </div>

      {/* ── 메인 콘텐츠 (스크롤 영역) ────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* 계획 수립 중 */}
        {status === "planning" && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-white/40">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-xs">AI가 실행 계획을 수립하고 있습니다...</span>
          </div>
        )}

        {/* 승인 대기 — 계획 목록 표시 */}
        {status === "awaiting_approval" && (
          <div className="p-3 space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
              <ActionFlowBar
                badges={approvalFlow.badges}
                helper={approvalFlow.helper}
              />
            </div>
            <p className="text-xs text-white/30 mb-2 uppercase tracking-wider">실행 계획</p>
            {plan.map((step, idx) => (
              <div
                key={step.id}
                className="flex items-start gap-2 p-2 rounded-lg bg-white/3 border border-white/5"
              >
                <span className="text-xs text-white/30 font-mono w-4 shrink-0 mt-0.5">
                  {idx + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-white/80 truncate">
                    $ {step.cmd}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">{step.description}</div>
                </div>
                <RiskBadge risk={step.risk} />
              </div>
            ))}
          </div>
        )}

        {/* 실행 중 */}
        {(status === "executing" || status === "observing") && (
          <div className="p-3 space-y-3">
            {/* 현재 실행 단계 */}
            {currentStep && (
              <div className="p-2.5 rounded-lg bg-accent/5 border border-accent/20">
                <div className="flex items-center gap-2 mb-1">
                  <Loader2 size={11} className="animate-spin text-accent shrink-0" />
                  <span className="text-xs text-accent font-medium">
                    {status === "observing" ? "AI 관찰 중..." : `단계 ${currentStepIdx + 1} 실행 중`}
                  </span>
                  <RiskBadge risk={currentStep.risk} />
                </div>
                <div className="font-mono text-sm text-white/70">$ {currentStep.cmd}</div>
                <div className="text-xs text-white/35 mt-0.5">{currentStep.description}</div>
              </div>
            )}

            {/* 완료된 단계 목록 */}
            {completed.length > 0 && (
              <div>
                <p className="text-xs text-white/25 uppercase tracking-wider mb-1">완료된 단계</p>
                <div className="space-y-0.5">
                  {completed.map((c) => (
                    <CompletedStepRow key={c.id} step={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 완료 */}
        {status === "done" && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              <span className="text-xs text-green-400 font-medium">{message || "태스크가 완료되었습니다."}</span>
            </div>
            <p className="text-xs leading-relaxed text-white/45">
              실행된 단계를 확인한 뒤 필요한 명령만 스크립트로 저장하거나, 다음 태스크로 바로 이어갈 수 있습니다.
            </p>
            {completed.length > 0 && (
              <div>
                <p className="text-xs text-white/25 uppercase tracking-wider mb-1">실행된 단계</p>
                <div className="space-y-0.5">
                  {completed.map((c) => (
                    <CompletedStepRow key={c.id} step={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 실패 */}
        {status === "failed" && (
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <span className="text-xs text-red-400 leading-relaxed flex-1">{message || "태스크 실행 중 오류가 발생했습니다."}</span>
              <IconButton
                tooltip="오류 텍스트 복사"
                onClick={() => copyText(message || "태스크 실행 중 오류가 발생했습니다.")}
                className="p-1 rounded text-white/60 hover:text-white/85 hover:bg-red-500/20 transition-colors"
              >
                <Copy size={11} />
              </IconButton>
            </div>
            <p className="text-xs leading-relaxed text-white/45">
              오류를 복사해 공유하거나, 아래에서 어디까지 실행됐는지 확인한 뒤 같은 작업을 다시 정리할 수 있습니다.
            </p>
            {completed.length > 0 && (
              <div>
                <p className="text-xs text-white/25 uppercase tracking-wider mb-1">실행된 단계</p>
                <div className="space-y-0.5">
                  {completed.map((c) => (
                    <CompletedStepRow key={c.id} step={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 취소됨 */}
        {status === "cancelled" && (
          <div className="p-4 flex items-center gap-2 text-white/40">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="text-xs">{message || "취소되었습니다."}</span>
          </div>
        )}
      </div>

      {/* ── 액션 버튼 영역 ────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/5 px-3 py-2.5 flex items-center justify-end gap-2">
        {status === "awaiting_approval" && (
          <>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded-md text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
            >
              취소
            </button>
            <button
              onClick={onApprove}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors font-medium"
            >
              <Play size={11} />
              실행 시작
            </button>
          </>
        )}

        {(status === "executing" || status === "observing") && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Square size={11} />
            중단
          </button>
        )}

        {status === "done" && onSaveScript && completed.length > 0 && (
          <button
            onClick={() => onSaveScript(completed.map((c) => c.cmd))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 transition-colors"
          >
            <BookOpen size={11} />
            스크립트 저장
          </button>
        )}
        {(status === "done" || status === "failed" || status === "cancelled") && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80 transition-colors"
          >
            닫기
          </button>
        )}
      </div>
    </div>
  );
};

export default AgentPanel;
