import React, { useEffect, useRef } from "react";
import { Loader2, X, Sparkles } from "lucide-react";
import type { ChatMessage } from "../hooks/useAIChat";
import { MessageBubble } from "./AIChatPanel";
import EditBlockCard from "./EditBlockCard";
import { parseEditBlocks } from "../utils/editBlockParser";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  onClear: () => void;
  onExecute: (cmd: string) => void;
  cwd?: string;
  /** true면 부모 flex 컨테이너의 남은 공간을 전부 차지 (xterm 자리 대체) */
  fullHeight?: boolean;
  /** 테스트 실패 로그를 AI 대화에 재주입 — 테스트 루프 */
  onAskAIForFix?: (failureLog: string) => void;
}

/**
 * WarpInputBar 위에 놓이는 AI 답변 타임라인.
 * 전체 패널이 하나의 스크롤 컨테이너 — 헤더는 sticky로 상단 고정.
 * 빈 상태면 렌더 안 함. 사용자가 위로 스크롤하면 auto-scroll 중단.
 */
const AIBlockStream: React.FC<Props> = ({ messages, streaming, error, onClear, onExecute, cwd, fullHeight, onAskAIForFix }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  if (messages.length === 0 && !error) return null;

  return (
    <div
      data-testid="ai-block-stream"
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        // fullHeight: 부모 flex의 남은 공간 전부 (xterm 대체)
        // 아니면 기존처럼 콘텐츠 크기 + maxHeight 60vh
        ...(fullHeight
          ? { flex: "1 1 0", minHeight: 0 }
          : { flexShrink: 0, maxHeight: "60vh" }),
        overflowY: "auto",
        background: "#0d1117",
        borderTop: "1px solid rgba(88,166,255,0.2)",
        boxSizing: "border-box",
      }}
    >
      {/* 헤더 — sticky로 스크롤 시에도 상단 고정 */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-white/5"
        style={{ position: "sticky", top: 0, background: "#0d1117", zIndex: 1 }}
      >
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

      <div className="px-4 py-3 space-y-3">
        {messages.map((m) => {
          const editBlocks =
            m.role === "assistant" && cwd ? parseEditBlocks(m.content) : [];
          if (editBlocks.length === 0) {
            return <MessageBubble key={m.id} msg={m} onExecute={onExecute} compact={false} />;
          }
          return (
            <div key={m.id} className="space-y-2">
              <MessageBubble msg={m} onExecute={onExecute} compact={false} />
              {editBlocks.map((b) => (
                <EditBlockCard key={`${m.id}-${b.index}`} block={b} cwd={cwd!} onAskAIForFix={onAskAIForFix} />
              ))}
            </div>
          );
        })}
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
