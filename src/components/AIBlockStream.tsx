import React, { useEffect, useRef } from "react";
import { Loader2, X, Sparkles } from "lucide-react";
import type { ChatMessage } from "../hooks/useAIChat";
import { MessageBubble } from "./AIChatPanel";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  onClear: () => void;
  onExecute: (cmd: string) => void;
}

/**
 * WarpInputBar 위에 놓이는 AI 답변 타임라인.
 * - 메시지 없으면 렌더 안 함 (0 height)
 * - 스트리밍/완료 시 자동 스크롤
 * - 최대 60% height, 내부 스크롤
 */
const AIBlockStream: React.FC<Props> = ({ messages, streaming, error, onClear, onExecute }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  if (messages.length === 0 && !error) return null;

  return (
    <div
      data-testid="ai-block-stream"
      style={{
        flexShrink: 0,
        maxHeight: "60%",
        display: "flex",
        flexDirection: "column",
        background: "#0d1117",
        borderTop: "1px solid rgba(88,166,255,0.2)",
        boxSizing: "border-box",
      }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 text-[12px] text-white/50">
          <Sparkles size={13} className="text-accent" />
          <span>AI 대화</span>
          <span className="text-white/25">· {messages.length}개 메시지</span>
          {streaming && <Loader2 size={12} className="animate-spin text-accent/70 ml-1" />}
        </div>
        <button
          onClick={onClear}
          className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
          title="대화 지우기"
        >
          <X size={14} />
        </button>
      </div>

      <div ref={scrollRef} className="overflow-y-auto px-4 py-3 flex-1 space-y-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} onExecute={onExecute} compact={false} />
        ))}
        {error && (
          <div className="text-[12px] text-red-400/80 px-2.5 py-1.5 rounded bg-red-500/10 border border-red-500/20">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIBlockStream;
