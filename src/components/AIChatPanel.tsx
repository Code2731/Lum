import React, { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, User, Trash2, X, Loader2, Send, Play, StopCircle } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "../hooks/useAIChat";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onCancel: () => void;
  onClear: () => void;
  onClose: () => void;
  onExecute: (cmd: string) => void;
}

const AIChatPanel: React.FC<Props> = ({ messages, streaming, error, onSend, onCancel, onClear, onClose, onExecute }) => {
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
          <IconButton
            tooltip="대화 초기화"
            confirm={{
              title: "대화 초기화",
              description: `현재 대화의 메시지 ${messages.length}개가 모두 지워집니다.`,
              confirmLabel: "초기화",
            }}
            onClick={onClear}
            className="text-white/25 hover:text-white/60 transition-colors p-0.5 rounded"
          >
            <Trash2 size={11} />
          </IconButton>
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
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            rows={1}
            placeholder="질문하세요… (Enter 전송 · Shift+Enter 줄바꿈)"
            className="flex-1 bg-transparent border-none px-0 py-0 text-[11px] text-white/80 placeholder-white/20 leading-relaxed max-h-24 disabled:opacity-40"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          {streaming ? (
            <IconButton tooltip="응답 중단" onClick={onCancel}
              className="shrink-0 p-1 rounded text-red-400 hover:text-red-300 transition-colors">
              <StopCircle size={13} />
            </IconButton>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="shrink-0 p-1 rounded text-accent hover:text-accent/80 disabled:opacity-30 transition-colors"
            >
              <Send size={13} />
            </button>
          )}
        </div>
        <p className="text-[9px] text-white/15 text-center mt-1">Cmd+Shift+A 로 닫기</p>
      </div>
    </div>
  );
};

type MermaidEdge = {
  from: string;
  to: string;
  label?: string;
  arrow: string;
};

const parseMermaidEdges = (code: string): MermaidEdge[] => {
  const edges: MermaidEdge[] = [];
  const seen = new Set<string>();
  const arrowTokens = [
    "-->>",
    "<-->",
    "<-.->",
    "-.->",
    "==>",
    "<==",
    "o--o",
    "x--x",
    "x--o",
    "o--x",
    "<-x",
    "x<-",
    "<-o",
    "o<-",
    "<x--x",
    "<x--o",
    "<o--x",
    "<o--o",
    "x--",
    "--x",
    "o--",
    "--o",
    "<--x",
    "<x--",
    "<--o",
    "<o--",
    "-->",
    "---",
    "<--",
    "->",
    "<-",
  ];
  const lines = code.split("\n").map((l) => l.trim()).filter(Boolean);

  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripComment = (line: string) => {
    let inSingle = false;
    let inDouble = false;
    let escaped = false;

    for (let i = 0; i < line.length - 1; i += 1) {
      const ch = line[i];
      const next = line[i + 1];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (!inDouble && ch === "'") {
        inSingle = !inSingle;
        continue;
      }
      if (!inSingle && ch === "\"") {
        inDouble = !inDouble;
        continue;
      }

      if (!inSingle && !inDouble && ch === "%" && next === "%") {
        const prev = i > 0 ? line[i - 1] : "";
        const hasLeadingSpace = i === 0 || /\s/.test(prev);
        if (!hasLeadingSpace) {
          continue;
        }
        return line.slice(0, i).trimEnd();
      }
    }

    return line;
  };

  for (const line of lines) {
    const trimmed = stripComment(line).trim();
    if (!trimmed || trimmed.startsWith("%%")) {
      continue;
    }

    let from = "";
    let to = "";
    let label: string | undefined;
    let arrow = "";

    const parseLabelAndTo = (text: string): { to: string; label?: string } => {
      const trimmedText = text.trim();
      if (!trimmedText.startsWith("|")) {
        return { to: trimmedText };
      }

      let i = 1;
      const labelChars: string[] = [];
      let escaped = false;

      for (; i < trimmedText.length; i += 1) {
        const ch = trimmedText[i];
        if (escaped) {
          if (ch === "\\") {
            labelChars.push("\\");
          } else if (ch === "|") {
            labelChars.push("|");
          } else {
            labelChars.push(ch);
          }
          escaped = false;
          continue;
        }

        if (ch === "\\") {
          escaped = true;
          continue;
        }

        if (ch === "|") {
          return {
            label: labelChars.join("").trim(),
            to: trimmedText.slice(i + 1).trim(),
          };
        }

        labelChars.push(ch);
      }

      return { to: trimmedText };
    };

    for (const candidate of arrowTokens) {
      const pattern = new RegExp(
        `^(.*?)\\s*${escapeRegex(candidate)}\\s*(.*)$`,
      );
      const match = pattern.exec(trimmed);
      if (!match) continue;

      from = match[1].trim();
      const parsed = parseLabelAndTo(match[2] ?? "");
      to = parsed.to;
      label = parsed.label && parsed.label.length > 0 ? parsed.label : undefined;
      arrow = candidate;
      break;
    }

    if (!from || !to || !arrow) continue;

    const key = `${from}|${arrow}|${label ?? ""}|${to}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    edges.push({
      from,
      to,
      label: label,
      arrow,
    });
  }

  return edges;
};

const MermaidCodeBlock: React.FC<{ code: string }> = ({ code }) => {
  const raw = code.trim();
  const edges = parseMermaidEdges(raw);

  if (edges.length === 0) {
    return (
      <pre className="mt-1.5 mb-1.5 p-2 rounded-md bg-white/5 border border-white/8 overflow-x-auto font-mono text-white/70 text-[10px]">
        <code>{raw}</code>
      </pre>
    );
  }

  return (
    <div className="mt-1.5 mb-1.5 rounded-md border border-white/8 bg-white/5 p-2 overflow-x-auto">
      <div className="text-[10px] text-cyan-200 mb-1">Mermaid 텍스트 다이어그램</div>
      <ul className="pl-4 list-disc space-y-0.5 text-[10px] text-white/75">
        {edges.map((edge) => (
          <li key={`${edge.from}-${edge.to}-${edge.arrow}-${edge.label ?? ""}`}>
            {edge.from} {edge.arrow} {edge.to}
            {edge.label ? <span className="text-white/60">{` (${edge.label})`}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ─── 실행 버튼이 붙은 코드블록 ──────────────────────────────────

export const SHELL_LANGS = new Set(["bash", "sh", "shell", "zsh", "fish", "powershell", "ps1", ""]);

export const ExecCodeBlock: React.FC<{ code: string; lang: string; onExecute: (cmd: string) => void }> = ({
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
      <IconButton
        tooltip="터미널에서 실행"
        onClick={handleRun}
        className={`absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
          ran
            ? "bg-green-500/20 text-green-400"
            : "bg-white/8 hover:bg-accent/20 text-white/40 hover:text-accent"
        }`}
      >
        <Play size={8} />
        {ran ? "전송됨" : "실행"}
      </IconButton>
      {lang && <span className="absolute bottom-1.5 right-1.5 text-[8px] text-white/20 font-mono">{lang}</span>}
    </div>
  );
};

// ─── 메시지 버블 ────────────────────────────────────────────────

export const MessageBubble: React.FC<{
  msg: ChatMessage;
  onExecute?: (cmd: string) => void;
  compact?: boolean;
}> = ({ msg, onExecute, compact = true }) => {
  const isUser = msg.role === "user";

  // compact: sidebar용 11px, non-compact: 스트림용 14px
  const bodyText = compact ? "text-[11px]" : "text-[14px]";
  const codeText = compact ? "text-[10px]" : "text-[13px]";
  const inlineCodeText = compact ? "text-[10px]" : "text-[12.5px]";
  const iconSize = compact ? 11 : 14;

  if (isUser) {
    // Warp 스타일 — 좌측 정렬, 테두리/배경 없이 아이콘 + 텍스트만
    return (
      <div className="flex items-start gap-1.5">
        <div className="shrink-0 mt-0.5 text-accent/60">
          <User size={iconSize} />
        </div>
        <div className={`max-w-[90%] ${bodyText} text-white/85 leading-relaxed whitespace-pre-wrap break-words min-w-0`}>
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5">
      <div className="shrink-0 mt-0.5 text-accent/60">
        <Bot size={iconSize} />
      </div>
      <div className={`max-w-[90%] ${bodyText} text-white/80 leading-relaxed min-w-0`}>
        {msg.content ? (
          <ReactMarkdown
            components={{
              code: ({ children, className }) => {
                const lang = (className ?? "").replace("language-", "");
                const isBlock = !!className?.startsWith("language-") || false;
                const codeStr = String(children).replace(/\n$/, "");

                if (isBlock && onExecute && SHELL_LANGS.has(lang)) {
                  return <ExecCodeBlock code={codeStr} lang={lang} onExecute={onExecute} />;
                }

                if (isBlock && lang === "mermaid") {
                  return <MermaidCodeBlock code={codeStr} />;
                }

                if (isBlock) {
                  return (
                    <pre className={`mt-1.5 mb-1.5 p-2 rounded-md bg-white/5 border border-white/8 overflow-x-auto font-mono text-white/70 ${codeText}`}>
                      <code>{codeStr}</code>
                    </pre>
                  );
                }

                return (
                  <code className={`px-1 py-0.5 rounded bg-white/8 font-mono text-accent/80 ${inlineCodeText}`}>
                    {children}
                  </code>
                );
              },
              p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="pl-4 space-y-0.5 list-disc marker:text-white/30">{children}</ul>,
              ol: ({ children }) => <ol className="pl-4 space-y-0.5 list-decimal marker:text-white/30">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              h1: ({ children }) => <h1 className={`font-semibold mt-2 mb-1 ${compact ? "text-[12px]" : "text-[16px]"}`}>{children}</h1>,
              h2: ({ children }) => <h2 className={`font-semibold mt-2 mb-1 ${compact ? "text-[11.5px]" : "text-[15px]"}`}>{children}</h2>,
              h3: ({ children }) => <h3 className={`font-semibold mt-1.5 mb-0.5 ${compact ? "text-[11px]" : "text-[14.5px]"}`}>{children}</h3>,
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
