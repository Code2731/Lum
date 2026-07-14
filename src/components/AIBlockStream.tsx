import React, { useEffect, useRef, useState, useCallback } from "react";
import { Copy, Loader2, Settings, Square, X, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage } from "../hooks/useAIChat";
import { MessageBubble } from "./AIChatPanel";
import EditBlockCard from "./EditBlockCard";
import { parseEditBlocks } from "../utils/editBlockParser";
import { parseToolCalls } from "../utils/toolCallParser";
import ToolCallCard from "./ToolCallCard";
import { IconButton } from "@/components/ui/icon-button";
import { isRoutingError } from "../utils/errorMessage";
import { SMALL_ICON_SIZE } from "../constants/ui";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  onOpenXllmPanel?: () => void;
  onClear: () => void;
  onCancel?: () => void;
  onExecute: (cmd: string) => void;
  cwd?: string;
  /** true면 부모 flex 컨테이너의 남은 공간을 전부 차지 (xterm 자리 대체) */
  fullHeight?: boolean;
  /** 테스트 실패 로그·MCP 툴 결과를 AI 대화에 재주입 (이미지 첨부 가능) */
  onAskAIForFix?: (text: string, images?: string[]) => void;
  /** 비전 모드 활성 — ToolCallCard 결과 이미지를 AI에 전달할지 */
  visionEnabled?: boolean;
}

/**
 * WarpInputBar 위에 놓이는 AI 답변 타임라인.
 * 전체 패널이 하나의 스크롤 컨테이너 — 헤더는 sticky로 상단 고정.
 * 빈 상태면 렌더 안 함. 사용자가 위로 스크롤하면 auto-scroll 중단.
 */
const FONT_KEY = "lum.aiChatFontSize";
const FONT_MIN = 10;
const FONT_MAX = 24;
const FONT_DEFAULT = 14;

const RESPONSE_BACKEND_META = {
  embedded: { label: "mistral.rs · 로컬", className: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100/85" },
  ollama: { label: "Ollama", className: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100/85" },
  xllm: { label: "xLLM", className: "border-blue-300/25 bg-blue-400/10 text-blue-100/85" },
  gemini: { label: "Gemini · 클라우드", className: "border-amber-300/25 bg-amber-400/10 text-amber-100/85" },
} as const;

const ResponseBackendBadge: React.FC<{ backend?: ChatMessage["backend"] }> = ({ backend }) => {
  if (!backend) return null;
  const meta = RESPONSE_BACKEND_META[backend];
  return (
    <div className="mb-1 flex">
      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}>
        실제 응답: {meta.label}
      </span>
    </div>
  );
};

const EmbeddedFallbackNotice: React.FC<{ reason?: string }> = ({ reason }) => {
  if (!reason) return null;
  return (
    <p className="mb-1 rounded-md border border-amber-300/20 bg-amber-400/[0.08] px-2 py-1 text-[10px] leading-4 text-amber-100/85">
      mistral.rs 자동 복원 실패 후 다른 백엔드로 처리됨: {reason}
    </p>
  );
};

export interface AIBlockStreamHeaderMeta {
  ariaLabel: string;
  title: string;
  countLabel: string;
  streamingLabel: string | null;
}

export function getAIBlockStreamHeaderMeta(messageCount: number, streaming: boolean): AIBlockStreamHeaderMeta {
  return {
    ariaLabel: `AI 대화 헤더 · 메시지 ${messageCount}개${streaming ? " · 응답 생성 중" : ""}`,
    title: "AI 대화",
    countLabel: `${messageCount}개 메시지`,
    streamingLabel: streaming ? "응답 생성 중" : null,
  };
}

export interface AIBlockStreamErrorMeta {
  ariaLabel: string;
  settingsDescription: string;
  copyDescription: string;
}

export function getAIBlockStreamErrorMeta(error: string, canOpenSettings: boolean): AIBlockStreamErrorMeta {
  return {
    ariaLabel: canOpenSettings ? `라우팅 오류 배너 · ${error}` : `AI 오류 배너 · ${error}`,
    settingsDescription:
      "현재 라우팅 실패를 해결할 수 있도록 모델 로드 상태와 xLLM 연결 설정 화면을 바로 엽니다.",
    copyDescription:
      "현재 에러 메시지를 그대로 복사해 이슈 공유나 후속 AI 질문에 바로 붙여넣을 수 있습니다.",
  };
}

// Phase 126: invoke로 fontSize 영속. 실패해도 silent — UI는 메모리 상태로 동작.
const persistFontSize = (size: number) => {
  invoke("save_ui_preferences", { aiChatFontSize: size }).catch(() => {});
};

const AIBlockStream: React.FC<Props> = ({
  messages,
  streaming,
  error,
  onOpenXllmPanel,
  onClear,
  onCancel,
  onExecute,
  cwd,
  fullHeight,
  onAskAIForFix,
  visionEnabled,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  // Ctrl/Cmd + 휠로 폰트 크기 조절. 초기값은 localStorage(마이그레이션 전 사용자) → mount 후 config가 덮어씀.
  const [fontSize, setFontSize] = useState<number>(() => {
    try {
      const saved = parseInt(localStorage.getItem(FONT_KEY) ?? "", 10);
      return Number.isFinite(saved) && saved >= FONT_MIN && saved <= FONT_MAX ? saved : FONT_DEFAULT;
    } catch { return FONT_DEFAULT; }
  });

  // Phase 126 — config에서 fontSize 로드 + localStorage 1회 마이그레이션.
  useEffect(() => {
    invoke<{ ui_ai_chat_font_size?: number }>("load_app_config")
      .then(async (c) => {
        if (typeof c.ui_ai_chat_font_size === "number") {
          const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, c.ui_ai_chat_font_size));
          setFontSize(clamped);
          return;
        }
        // config 미설정 — localStorage에 값 있으면 한 번 옮기고 키 제거.
        try {
          const raw = parseInt(localStorage.getItem(FONT_KEY) ?? "", 10);
          if (Number.isFinite(raw) && raw >= FONT_MIN && raw <= FONT_MAX) {
            await invoke("save_ui_preferences", { aiChatFontSize: raw });
            try { localStorage.removeItem(FONT_KEY); } catch { /* noop */ }
          }
        } catch { /* noop */ }
      })
      .catch(() => {});
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setFontSize((s) => {
      const next = e.deltaY < 0 ? s + 1 : s - 1;
      const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, next));
      persistFontSize(clamped);
      return clamped;
    });
  }, []);

  const showRoutingErrorActions = isRoutingError(error);
  const headerMeta = getAIBlockStreamHeaderMeta(messages.length, streaming);
  const errorMeta = error ? getAIBlockStreamErrorMeta(error, showRoutingErrorActions) : null;
  const handleCopyError = () => {
    if (!error) return;
    navigator.clipboard?.writeText?.(error).catch(() => {});
  };

  // React 17+에서 wheel은 passive default — preventDefault 위해 native listener로 추가 등록
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onNative = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setFontSize((s) => {
        const next = e.deltaY < 0 ? s + 1 : s - 1;
        const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, next));
        persistFontSize(clamped);
        return clamped;
      });
    };
    el.addEventListener("wheel", onNative, { passive: false });
    return () => el.removeEventListener("wheel", onNative);
  }, []);

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
      onWheel={handleWheel}
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
        fontSize: `${fontSize}px`,
      }}
    >
      {/* 헤더 — sticky로 스크롤 시에도 상단 고정 */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-white/5"
        style={{ position: "sticky", top: 0, background: "#0d1117", zIndex: 1 }}
      >
        <div className="flex items-center gap-2 text-xs text-white/50" aria-label={headerMeta.ariaLabel}>
          <Sparkles size={SMALL_ICON_SIZE} className="text-accent" />
          <span>{headerMeta.title}</span>
          <span className="text-white/25">· {headerMeta.countLabel}</span>
          {streaming && (
            <span className="inline-flex items-center gap-1 text-accent/70" aria-label={headerMeta.streamingLabel ?? undefined}>
              <Loader2 size={12} className="animate-spin text-accent/70 ml-1" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {streaming && (
            <IconButton
              tooltip="응답 중지"
              description="현재 생성 중인 답변만 멈추고, 지금까지 받은 내용은 그대로 유지합니다."
              onClick={onCancel}
              className="p-1 rounded text-red-300/70 hover:text-red-200 hover:bg-red-500/10 transition-colors"
            >
              <Square size={13} />
            </IconButton>
          )}
          <IconButton
            tooltip="폰트 크기 초기화 (Ctrl+휠로 조절)"
            description="AI 대화 글자 크기를 기본값으로 되돌립니다. 확대·축소는 Ctrl/Cmd와 휠로 바로 조절할 수 있습니다."
            onClick={() => {
              setFontSize(FONT_DEFAULT);
              persistFontSize(FONT_DEFAULT);
            }}
            className="text-xs px-2 py-1 rounded text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors font-mono tabular-nums"
          >
            {fontSize}px
          </IconButton>
          <IconButton
            tooltip="대화 지우기"
            description="현재 AI 대화 타임라인만 비우고, 터미널이나 다른 패널 상태는 그대로 둡니다."
            onClick={onClear}
            className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <X size={14} />
          </IconButton>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {messages.map((m) => {
          if (m.role !== "assistant") {
            return <MessageBubble key={m.id} msg={m} onExecute={onExecute} compact={false} />;
          }
          const editBlocks = cwd ? parseEditBlocks(m.content) : [];
          const toolCalls = parseToolCalls(m.content);
          if (editBlocks.length === 0 && toolCalls.length === 0) {
            return (
              <div key={m.id}>
                <ResponseBackendBadge backend={m.backend} />
                <EmbeddedFallbackNotice reason={m.fallbackReason} />
                <MessageBubble msg={m} onExecute={onExecute} compact={false} />
              </div>
            );
          }
          return (
            <div key={m.id} className="space-y-2">
              <ResponseBackendBadge backend={m.backend} />
              <EmbeddedFallbackNotice reason={m.fallbackReason} />
              <MessageBubble msg={m} onExecute={onExecute} compact={false} />
              {editBlocks.map((b) => (
                <EditBlockCard
                  key={`edit-${m.id}-${b.index}`}
                  block={b}
                  cwd={cwd!}
                  onAskAIForFix={onAskAIForFix}
                  onOpenXllmPanel={onOpenXllmPanel}
                />
              ))}
              {toolCalls.map((c) => (
                <ToolCallCard
                  key={`tool-${m.id}-${c.index}`}
                  call={c}
                  onAskAIWithResult={onAskAIForFix}
                  visionEnabled={visionEnabled}
                  onOpenXllmPanel={onOpenXllmPanel}
                />
              ))}
            </div>
          );
        })}
        {error && (
          <div
            role="alert"
            aria-label={errorMeta?.ariaLabel}
            className="text-xs text-red-400/80 px-2.5 py-1.5 rounded bg-red-500/10 border border-red-500/20"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="whitespace-pre-wrap break-all flex-1">{error}</div>
              <div className="flex items-center gap-1">
                {showRoutingErrorActions && onOpenXllmPanel && (
                  <IconButton
                    tooltip="xLLM/모델 설정 열기"
                    description={errorMeta?.settingsDescription}
                    onClick={onOpenXllmPanel}
                    className="p-1 rounded text-red-200/85 hover:text-red-100 hover:bg-red-500/20 transition-colors"
                  >
                    <Settings size={12} />
                  </IconButton>
                )}
                <IconButton
                  tooltip="오류 텍스트 복사"
                  description={errorMeta?.copyDescription}
                  onClick={handleCopyError}
                  className="p-1 rounded text-red-200/85 hover:text-red-100 hover:bg-red-500/20 transition-colors"
                >
                  <Copy size={12} />
                </IconButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIBlockStream;
