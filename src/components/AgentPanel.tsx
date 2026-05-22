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
} from "lucide-react";
import type { AgentState, AgentStep, CompletedStep } from "../hooks/useAgentLoop";

interface Props {
  state: AgentState;
  onApprove: () => void;
  onCancel: () => void;
  onClose: () => void;
  onSaveScript?: (commands: string[]) => void;
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

const AgentPanel: React.FC<Props> = ({ state, onApprove, onCancel, onClose, onSaveScript }) => {
  const { status, task, plan, currentStepIdx, completed, message } = state;

  const currentStep = plan[currentStepIdx] ?? null;
  const totalSteps = plan.length;

  return (
    <div className="w-[520px] max-h-[80vh] flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-white/3 shrink-0">
        <Bot size={13} className="text-accent shrink-0" />
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

      {/* ── 메인 콘텐츠 (스크롤 영역) ────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* 계획 수립 중 */}
        {status === "planning" && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-white/40">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-[12px]">AI가 실행 계획을 수립하고 있습니다...</span>
          </div>
        )}

        {/* 승인 대기 — 계획 목록 표시 */}
        {status === "awaiting_approval" && (
          <div className="p-3 space-y-1">
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
              <span className="text-[12px] text-green-400 font-medium">{message || "태스크가 완료되었습니다."}</span>
            </div>
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
              <span className="text-[12px] text-red-400 leading-relaxed">{message || "태스크 실행 중 오류가 발생했습니다."}</span>
            </div>
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
            <span className="text-[12px]">{message || "취소되었습니다."}</span>
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
