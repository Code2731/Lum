import React, { useRef, useEffect } from "react";
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Square,
  X,
  Brain,
  Zap,
  Eye,
  Terminal,
} from "lucide-react";
import type { ReactAgentState, ReactStep } from "../hooks/useReactAgent";

interface Props {
  state: ReactAgentState;
  onCancel: () => void;
  onClose: () => void;
}

const KIND_ICON: Record<ReactStep["kind"], React.ReactNode> = {
  thought: <Brain size={10} className="text-purple-400 shrink-0 mt-0.5" />,
  action: <Zap size={10} className="text-yellow-400 shrink-0 mt-0.5" />,
  observation: <Eye size={10} className="text-blue-400 shrink-0 mt-0.5" />,
  answer: <CheckCircle2 size={10} className="text-green-400 shrink-0 mt-0.5" />,
  error: <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />,
  status: <Terminal size={10} className="text-white/30 shrink-0 mt-0.5" />,
};

const KIND_COLOR: Record<ReactStep["kind"], string> = {
  thought: "text-purple-300/80",
  action: "text-yellow-300/80",
  observation: "text-blue-300/70",
  answer: "text-green-300",
  error: "text-red-400",
  status: "text-white/30",
};

const StepRow: React.FC<{ step: ReactStep; idx: number }> = ({ step }) => {
  if (step.kind === "status") {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1">
        {KIND_ICON[step.kind]}
        <span className="text-[10px] text-white/25 font-mono">{step.content}</span>
      </div>
    );
  }
  return (
    <div className={`flex items-start gap-1.5 py-1 px-1 rounded ${
      step.kind === "observation" ? "bg-white/2" :
      step.kind === "answer" ? "bg-green-500/5 border border-green-500/10" : ""
    }`}>
      {KIND_ICON[step.kind]}
      <div className="flex-1 min-w-0">
        {step.kind === "action" && step.tool && (
          <span className="text-[9px] font-mono text-yellow-500/60 mr-1">[{step.tool}]</span>
        )}
        <span className={`text-[11px] leading-relaxed ${KIND_COLOR[step.kind]} ${
          step.kind === "observation" || step.kind === "action" ? "font-mono" : ""
        }`}>
          {step.content}
        </span>
      </div>
    </div>
  );
};

const STATUS_LABEL: Record<ReactAgentState["status"], string> = {
  idle: "대기",
  running: "실행 중...",
  done: "완료",
  error: "오류",
  cancelled: "취소됨",
};

const ReactAgentPanel: React.FC<Props> = ({ state, onCancel, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { status, goal, steps } = state;
  const isActive = status === "running";
  const currentStep = steps.filter(s => s.kind === "status").length;

  // 새 단계 추가 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps.length]);

  return (
    <div className="w-[540px] max-h-[80vh] flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 bg-white/3 shrink-0">
        <Bot size={13} className="text-accent shrink-0" />
        <span className="text-[11px] font-semibold text-accent">ReAct 에이전트</span>
        <span className="text-[10px] text-white/30 ml-1 truncate flex-1">{goal}</span>
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
        {isActive && <Loader2 size={11} className="animate-spin text-accent shrink-0" />}
        {status === "done" && <CheckCircle2 size={11} className="text-green-400 shrink-0" />}
        {status === "error" && <XCircle size={11} className="text-red-400 shrink-0" />}
        {status === "cancelled" && <AlertTriangle size={11} className="text-white/40 shrink-0" />}
        <span className={`text-[11px] font-medium ${
          status === "done" ? "text-green-400" :
          status === "error" ? "text-red-400" :
          status === "cancelled" ? "text-white/40" :
          "text-white/60"
        }`}>
          {STATUS_LABEL[status]}
        </span>
        {isActive && currentStep > 0 && (
          <span className="text-[10px] text-white/30 ml-auto">
            {currentStep} / 15 단계
          </span>
        )}
      </div>

      {/* ── 단계 목록 (스크롤) ───────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-2 space-y-0.5">
        {steps.map((step, idx) => (
          <StepRow key={idx} step={step} idx={idx} />
        ))}
        {isActive && (
          <div className="flex items-center gap-1.5 py-1 px-1">
            <Loader2 size={10} className="animate-spin text-accent/60 shrink-0" />
            <span className="text-[10px] text-white/30">생각 중...</span>
          </div>
        )}
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-white/25">
            <Bot size={20} />
            <span className="text-[11px]">에이전트 시작 대기 중</span>
          </div>
        )}
      </div>

      {/* ── 액션 버튼 ─────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/5 px-3 py-2.5 flex items-center justify-end gap-2">
        {isActive && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Square size={11} />
            중단
          </button>
        )}
        {(status === "done" || status === "error" || status === "cancelled") && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] rounded-md bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80 transition-colors"
          >
            닫기
          </button>
        )}
      </div>
    </div>
  );
};

export default ReactAgentPanel;
