import React, { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, User, Trash2, X, Loader2, Send, Play } from "lucide-react";
import type { ChatMessage } from "../hooks/useAIChat";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onClear: () => void;
  onClose: () => void;
  onExecute: (cmd: string) => void;
}

const AIChatPanel: React.FC<Props> = ({ messages, streaming, error, onSend, onClear, onClose, onExecute }) => {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    onSend(text);
  }, [input, streaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0d1117] border-l border-white/5">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <Bot size={13} className="text-accent shrink-0" />
        <span className="text-[11px] font-semibold text-white/80 flex-1">AI Chat</span>
        {messages.length > 0 && (
          <button
            onClick={onClear}
            className="text-white/25 hover:text-white/60 transition-colors p-0.5 rounded"
            title="대화 초기화"
          >
            <Trash2 size={11} />
          </button>
        )}
        <button
          onClick={onClose}
          className="text-white/25 hover:text-white/60 transition-colors p-0.5 rounded"
        >
          <X size={11} />
        </button>
      </div>

      {/* 에러 배너 */}
      {error && (
        <div className="shrink-0 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-[10px] text-red-400 leading-relaxed">
          {error}
        </div>
      )}

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20 py-12">
            <Bot size={28} />
            <p className="text-[11px] text-center leading-relaxed">
              터미널 컨텍스트를 인식합니다.
              <br />
              질문이나 명령어 작성을 도와드립니다.
            </p>
            <div className="text-[10px] text-white/15 space-y-0.5 mt-1 text-center">
              <p># 자연어 → 명령어 변환 (터미널)</p>
              <p>? 명령어 설명 (터미널)</p>
              <p>&gt;&gt; 에이전트 태스크 (터미널)</p>
              <p>git 관련 질문 → 자동으로 상태 파악</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onExecute={msg.role === "assistant" ? onExecute : undefined} />
        ))}

        {streaming && messages[messages.length - 1]?.role === "assistant" &&
          messages[messages.length - 1]?.content === "" && (
            <div className="flex items-center gap-1.5 text-white/30">
              <Loader2 size={11} className="animate-spin" />
              <span className="text-[10px]">응답 생성 중…</span>
            </div>
          )}

        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <div className="shrink-0 border-t border-white/5 p-2">
        <div className="flex items-end gap-1.5 bg-white/5 rounded-lg border border-white/8 px-2.5 py-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            rows={1}
            placeholder="질문하세요… (Enter 전송 · Shift+Enter 줄바꿈)"
            className="flex-1 bg-transparent border-none outline-none resize-none text-[11px] text-white/80 placeholder-white/20 leading-relaxed max-h-24 disabled:opacity-40"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || streaming}
            className="shrink-0 p-1 rounded text-accent hover:text-accent/80 disabled:opacity-30 transition-colors"
          >
            {streaming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
        <p className="text-[9px] text-white/15 text-center mt-1">Cmd+Shift+A 로 닫기</p>
      </div>
    </div>
  );
};

// ─── 실행 버튼이 붙은 코드블록 ──────────────────────────────────

const SHELL_LANGS = new Set(["bash", "sh", "shell", "zsh", "fish", "powershell", "ps1", ""]);

const ExecCodeBlock: React.FC<{ code: string; lang: string; onExecute: (cmd: string) => void }> = ({
  code, lang, onExecute,
}) => {
  const [ran, setRan] = useState(false);

  const handleRun = () => {
    onExecute(code.trimEnd());
    setRan(true);
    setTimeout(() => setRan(false), 2000);
  };

  return (
    <div className="relative mt-1.5 mb-1.5 group">
      <pre className="p-2 pr-16 rounded-md bg-white/5 border border-white/8 overflow-x-auto text-[10px] font-mono text-white/60">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleRun}
        className={`absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
          ran
            ? "bg-green-500/20 text-green-400"
            : "bg-white/8 hover:bg-accent/20 text-white/40 hover:text-accent"
        }`}
        title="터미널에서 실행"
      >
        <Play size={8} />
        {ran ? "전송됨" : "실행"}
      </button>
      {lang && <span className="absolute bottom-1.5 right-1.5 text-[8px] text-white/20 font-mono">{lang}</span>}
    </div>
  );
};

// ─── 메시지 버블 ────────────────────────────────────────────────

const MessageBubble: React.FC<{ msg: ChatMessage; onExecute?: (cmd: string) => void }> = ({ msg, onExecute }) => {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex items-start gap-1.5 justify-end">
        <div className="max-w-[85%] px-2.5 py-1.5 rounded-xl rounded-tr-sm bg-accent/15 border border-accent/20 text-[11px] text-white/80 leading-relaxed whitespace-pre-wrap break-words">
          {msg.content}
        </div>
        <div className="shrink-0 mt-0.5 text-accent/60">
          <User size={11} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5">
      <div className="shrink-0 mt-0.5 text-accent/60">
        <Bot size={11} />
      </div>
      <div className="max-w-[90%] text-[11px] text-white/70 leading-relaxed min-w-0">
        {msg.content ? (
          <ReactMarkdown
            components={{
              code: ({ children, className }) => {
                const lang = (className ?? "").replace("language-", "");
                const isBlock = !!className?.startsWith("language-") || false;
                const codeStr = String(children).replace(/\n$/, "");

                // 블록 코드이고 실행 가능한 언어면 실행 버튼 포함
                if (isBlock && onExecute && SHELL_LANGS.has(lang)) {
                  return <ExecCodeBlock code={codeStr} lang={lang} onExecute={onExecute} />;
                }

                // 일반 블록 코드 (언어 명시됐지만 셸 아님)
                if (isBlock) {
                  return (
                    <pre className="mt-1.5 mb-1.5 p-2 rounded-md bg-white/5 border border-white/8 overflow-x-auto text-[10px] font-mono text-white/60">
                      <code>{codeStr}</code>
                    </pre>
                  );
                }

                return (
                  <code className="px-1 py-0.5 rounded bg-white/8 font-mono text-[10px] text-accent/80">
                    {children}
                  </code>
                );
              },
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="pl-3 space-y-0.5 list-disc marker:text-white/30">{children}</ul>,
              ol: ({ children }) => <ol className="pl-3 space-y-0.5 list-decimal marker:text-white/30">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            }}
          >
            {msg.content}
          </ReactMarkdown>
        ) : (
          <span className="opacity-0">​</span>
        )}
      </div>
    </div>
  );
};

export default AIChatPanel;
