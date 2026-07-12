import React from "react";
import { Zap, Loader2, Square } from "lucide-react";
import { motion } from "framer-motion";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";

interface AiBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onClose: () => void;
  disabled: boolean;
  processing: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export interface AiBarFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

export function getAiBarFlowSummary(input: {
  processing: boolean;
  disabled: boolean;
  value: string;
}): AiBarFlowSummary {
  if (input.processing) {
    return {
      primary: "응답 생성 중",
      secondary: "중단 가능",
      detail: "응답이 길어지면 중단하고, 결과를 확인한 뒤 다음 질문으로 바로 이어갈 수 있습니다.",
    };
  }

  if (input.disabled) {
    return {
      primary: "입력 일시 중지",
      secondary: "질문 대기",
      detail: "현재 입력이 비활성화되어 있어 처리 완료 후 다시 질문할 수 있습니다.",
    };
  }

  if (input.value.trim()) {
    return {
      primary: "질문 준비 완료",
      secondary: "Enter 전송",
      detail: "작성한 질문을 Enter로 보내고 필요하면 Esc나 단축키로 즉시 닫을 수 있습니다.",
    };
  }

  return {
    primary: "질문 준비",
    secondary: "입력 대기",
    detail: "질문을 먼저 입력하고 Enter로 보내며, 필요하면 Esc나 단축키로 즉시 닫습니다.",
  };
}

const AiBar: React.FC<AiBarProps> = ({ value, onChange, onSubmit, onCancel, onClose, disabled, processing, inputRef }) => {
  const flowSummary = getAiBarFlowSummary({ processing, disabled, value });

  return (
    <motion.div
      key="ai-bar"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#0b1017]/96 via-[#0b1017]/72 to-transparent pointer-events-none"
    >
      <div className="pointer-events-auto">
        <div className="mb-2">
          <ActionFlowBar
            badges={[flowSummary.primary, flowSummary.secondary, "마지막 닫기"]}
            helper={flowSummary.detail}
            tone="cyan"
          />
        </div>
        <div className="flex items-center gap-2 bg-white/[0.07] border border-white/[0.16] rounded-xl px-3 py-2 backdrop-blur-md shadow-2xl">
          <Zap size={13} className="text-accent shrink-0" />
          <input
            ref={inputRef}
            className="bg-transparent border-none outline-none text-xs flex-1 placeholder:text-white/35"
            placeholder="AI에게 질문하세요… (Enter 전송 · Esc 닫기)"
            aria-label="AI 질문 입력"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onSubmit();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
          />
          {processing && <Loader2 size={12} className="animate-spin text-white/40 shrink-0" />}
          {processing && (
            <button
              type="button"
              aria-label="AI 응답 중지"
              onClick={onCancel}
              className="p-1 rounded border border-red-400/25 bg-red-500/10 text-red-200/80 hover:bg-red-500/20 hover:text-red-100 transition-colors"
            >
              <Square size={12} />
            </button>
          )}
        </div>
        <p className="text-xs text-white/30 text-center mt-1.5 tracking-wide" aria-live="polite">
          Enter 전송 · Esc 또는 Cmd/Ctrl+Shift+K 로 닫기
        </p>
      </div>
    </motion.div>
  );
};

export default AiBar;
