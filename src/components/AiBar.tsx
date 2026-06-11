import React from "react";
import { Zap, Loader2, Square } from "lucide-react";
import { motion } from "framer-motion";

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

const AiBar: React.FC<AiBarProps> = ({ value, onChange, onSubmit, onCancel, onClose, disabled, processing, inputRef }) => (
  <motion.div
    key="ai-bar"
    initial={{ y: 20, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    exit={{ y: 20, opacity: 0 }}
    transition={{ duration: 0.18, ease: "easeOut" }}
    className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#0b1017]/96 via-[#0b1017]/72 to-transparent pointer-events-none"
  >
    <div className="pointer-events-auto">
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
      <p className="text-xs text-white/30 text-center mt-1.5 tracking-wide" aria-live="polite">Esc 또는 Cmd/Ctrl+Shift+K 로 닫기</p>
    </div>
  </motion.div>
);

export default AiBar;
