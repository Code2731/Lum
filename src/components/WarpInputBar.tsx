import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { tokenizeShell, TOKEN_COLORS } from "../utils/shellSyntax";
import {
  applyBackendPrefixToInput,
  clearBackendPrefixFromInput,
  detectBackendPrefixFromInput,
} from "../utils/backendPrefix";
import { useVoiceInput } from "../hooks/useVoiceInput";

export interface WarpInputBarHandle {
  focus: () => void;
  setValue: (v: string) => void;
  getValue: () => string;
}

interface Props {
  fontFamily: string;
  fontSize: number;
  /** Enter 시 호출 — 라우팅(shell/AI/agent)은 상위에서 */
  onSubmit: (cmd: string) => void;
  onInterrupt?: () => void;          // Ctrl+C
  onTab?: (buf: string) => boolean;  // 자동완성 — true면 기본 Tab 소비
  onChange?: (buf: string) => void;  // 입력 변화 — AI/explain 훅
  onFocusChange?: (focused: boolean) => void;
  onKeyDownIntercept?: (e: React.KeyboardEvent<HTMLInputElement>, value: string) => boolean;
  voiceEnabled?: boolean;            // 음성 입력 토글 표시 여부 (기본 true)
  compactContextChips?: boolean;
  contextChips?: Array<{
    id: string;
    label: string;
    tone?: "neutral" | "accent" | "success" | "warn";
  }>;
}

const WarpInputBar = forwardRef<WarpInputBarHandle, Props>(
  ({ fontFamily, fontSize, onSubmit, onInterrupt, onTab, onChange, onFocusChange, onKeyDownIntercept, voiceEnabled = true, compactContextChips = false, contextChips = [] }, ref) => {
    const [input, setInput] = useState("");
    const [isComposing, setIsComposing] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const history = useRef<string[]>([]);
    const historyIdx = useRef<number>(-1);
    const onChangeRef = useRef(onChange);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      setValue: (v: string) => { setInput(v); onChange?.(v); },
      getValue: () => input,
    }), [input, onChange]);

    useEffect(() => {
      inputRef.current?.focus();
    }, []);

    // 시각적 prompt char — 라우팅 로직은 상위에서
    const isHeavy      = input.trimStart().startsWith("!!");
    const isAgent      = input.startsWith(">>");
    const isAICmd      = input.startsWith("# ");
    const isExplain    = input.startsWith("? ");
    const isForceShell = input.startsWith("!") && !isHeavy;
    const isForceAI    = input.startsWith("@");
    const activeHeavy  = isHeavy;
    // 첫 토큰에서 `ls` 등 shell 냄새 풍기면 $, 아니면 기본값을 "AI 모드"로 표시 (★)
    const firstTok = input.trimStart().split(/\s+/)[0] ?? "";
    const looksShell = /^[a-z][a-z0-9._-]*$/i.test(firstTok) && firstTok.length <= 20;
    const promptColor =
      activeHeavy  ? "#bc8cff" :
      isAgent      ? "#ff7b72" :
      isAICmd      ? "#58a6ff" :
      isExplain    ? "#3fb950" :
      isForceShell ? "#d29922" :
      isForceAI    ? "#bc8cff" :
      input === "" ? "#58a6ff" :
      looksShell   ? "#3fb950" : "#58a6ff";
    const promptChar =
      activeHeavy  ? "!!" :
      isAgent      ? ">>" :
      isAICmd      ? "#" :
      isExplain    ? "?" :
      isForceShell ? "!" :
      isForceAI    ? "@" :
      input === "" ? "✨" :
      looksShell   ? "$" : "✨";
    const activeBackend = detectBackendPrefixFromInput(input);
    const activeBackendLabel = activeBackend ? activeBackend.toUpperCase() : null;
    const activeBackendStyle = activeBackend === "local"
      ? { color: "rgba(121,192,255,0.95)", border: "1px solid rgba(88,166,255,0.35)", background: "rgba(88,166,255,0.12)" }
      : activeBackend === "ollama"
        ? { color: "rgba(111,227,132,0.95)", border: "1px solid rgba(63,185,80,0.35)", background: "rgba(63,185,80,0.12)" }
        : activeBackend === "xllm"
          ? { color: "rgba(121,192,255,0.95)", border: "1px solid rgba(121,192,255,0.35)", background: "rgba(121,192,255,0.12)" }
          : { color: "rgba(233,194,105,0.96)", border: "1px solid rgba(227,179,65,0.35)", background: "rgba(227,179,65,0.12)" };

    const applyBackendPrefix = (backend: "local" | "ollama" | "xllm" | "gemini") => {
      const active = detectBackendPrefixFromInput(input);
      const next = active === backend
        ? clearBackendPrefixFromInput(input)
        : applyBackendPrefixToInput(input, backend);
      setInput(next);
      onChange?.(next);
    };
    const cycleBackendPrefix = (dir: 1 | -1 = 1) => {
      const order: Array<"local" | "ollama" | "xllm" | "gemini"> = ["local", "ollama", "xllm", "gemini"];
      const active = detectBackendPrefixFromInput(input);
      if (!active) {
        const next = applyBackendPrefixToInput(input, dir > 0 ? "local" : "gemini");
        setInput(next);
        onChange?.(next);
        return;
      }
      const idx = order.indexOf(active);
      if (idx < 0) {
        const next = clearBackendPrefixFromInput(input);
        setInput(next);
        onChange?.(next);
        return;
      }
      if (dir > 0 && idx === order.length - 1) {
        const next = clearBackendPrefixFromInput(input);
        setInput(next);
        onChange?.(next);
        return;
      }
      if (dir < 0 && idx === 0) {
        const next = clearBackendPrefixFromInput(input);
        setInput(next);
        onChange?.(next);
        return;
      }
      const next = applyBackendPrefixToInput(input, order[idx + dir]);
      setInput(next);
      onChange?.(next);
    };
    const clearBackendPrefix = () => {
      const next = clearBackendPrefixFromInput(input);
      setInput(next);
      onChange?.(next);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (isComposing || e.nativeEvent.isComposing) return;
      if (onKeyDownIntercept?.(e, input)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey) {
        if (e.key === "." || e.code === "Period") {
          e.preventDefault();
          cycleBackendPrefix(1);
          return;
        }
        if (e.key === "," || e.code === "Comma") {
          e.preventDefault();
          cycleBackendPrefix(-1);
          return;
        }
        if (e.key === "`" || e.key === "~" || e.code === "Backquote") {
          e.preventDefault();
          cycleBackendPrefix(e.shiftKey ? -1 : 1);
          return;
        }
      }
      if (mod && !e.altKey && !e.shiftKey) {
        if (e.key === "1" || e.code === "Digit1") {
          e.preventDefault();
          applyBackendPrefix("local");
          return;
        }
        if (e.key === "2" || e.code === "Digit2") {
          e.preventDefault();
          applyBackendPrefix("ollama");
          return;
        }
        if (e.key === "3" || e.code === "Digit3") {
          e.preventDefault();
          applyBackendPrefix("xllm");
          return;
        }
        if (e.key === "4" || e.code === "Digit4") {
          e.preventDefault();
          applyBackendPrefix("gemini");
          return;
        }
        if (e.key === "0" || e.code === "Digit0") {
          e.preventDefault();
          clearBackendPrefix();
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // @backend 단독 입력은 실행하지 않고 "입력 준비 상태"를 유지.
        // alias(@embedded/@cloud)는 canonical(@local/@gemini)로 정규화.
        const backend = detectBackendPrefixFromInput(input);
        if (backend && clearBackendPrefixFromInput(input).trim() === "") {
          const normalized = `@${backend} `;
          setInput(normalized);
          onChange?.(normalized);
          return;
        }
        const trimmed = input.trim();
        if (trimmed) {
          history.current.push(input);
          historyIdx.current = history.current.length;
        }
        onSubmit(input);
        // @backend 질의/태스크 실행 후에는 같은 backend prefix를 유지해 연속 작업 속도를 높인다.
        if (backend) {
          const keep = `@${backend} `;
          setInput(keep);
          onChange?.(keep);
        } else {
          setInput("");
          onChange?.("");
        }
        return;
      }

      if (e.key === "Tab") {
        if (onTab?.(input)) {
          e.preventDefault();
        }
        return;
      }

      if (e.key === "c" && (e.ctrlKey || e.metaKey) && input === "") {
        // 빈 입력일 때 Ctrl+C → PTY SIGINT
        e.preventDefault();
        onInterrupt?.();
        return;
      }

      if (e.key === "ArrowUp" && history.current.length > 0) {
        e.preventDefault();
        historyIdx.current = Math.max(0, historyIdx.current - 1);
        const v = history.current[historyIdx.current] ?? "";
        setInput(v);
        onChange?.(v);
        return;
      }

      if (e.key === "ArrowDown" && history.current.length > 0) {
        e.preventDefault();
        historyIdx.current = Math.min(history.current.length, historyIdx.current + 1);
        const v = history.current[historyIdx.current] ?? "";
        setInput(v);
        onChange?.(v);
        return;
      }

      if (e.key === "Home" && input === "" && history.current.length > 0) {
        e.preventDefault();
        historyIdx.current = 0;
        const v = history.current[historyIdx.current] ?? "";
        setInput(v);
        onChange?.(v);
        return;
      }

      if (e.key === "End" && input === "" && history.current.length > 0) {
        e.preventDefault();
        historyIdx.current = history.current.length - 1;
        const v = history.current[historyIdx.current] ?? "";
        setInput(v);
        onChange?.(v);
        return;
      }

      if (e.key === "Escape") {
        const backend = detectBackendPrefixFromInput(input);
        if (backend) {
          const rest = clearBackendPrefixFromInput(input);
          if (rest !== "") {
            const keep = `@${backend} `;
            setInput(keep);
            onChange?.(keep);
            return;
          }
        }
        setInput("");
        onChange?.("");
        return;
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setInput(v);
      onChange?.(v);
    };

    const injectTranscript = (text: string) => {
      const t = text.trim();
      if (!t) return;
      setInput((prev) => {
        const joined = prev.trim() ? `${prev} ${t}` : t;
        onChangeRef.current?.(joined);
        return joined;
      });
      inputRef.current?.focus();
    };

    const { isRecording, voiceBusy, voiceError, handleMicToggle } = useVoiceInput({
      enabled: voiceEnabled,
      onTranscript: injectTranscript,
    });

    const body =
      isHeavy      ? input.trimStart().slice(2).trimStart() :
      isAgent      ? input.replace(/^>>\s?/, "") :
      isAICmd      ? input.slice(2) :
      isExplain    ? input.slice(2) :
      isForceShell ? input.slice(1).trimStart() :
      isForceAI    ? input.slice(1).trimStart() :
      null;

    return (
      <div
        onMouseDown={(e) => {
          // input을 직접 클릭한 게 아니면 preventDefault로 포커스 이동 차단 + 강제 포커스
          if (e.target !== inputRef.current) {
            e.preventDefault();
          }
          inputRef.current?.focus();
        }}
        style={{
          flexShrink: 0,
          background: "linear-gradient(180deg, rgba(20,27,36,0.96), rgba(16,22,30,0.98))",
          borderTop: `1px solid ${isFocused ? "rgba(88,166,255,0.64)" : "rgba(255,255,255,0.14)"}`,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          boxShadow: isFocused ? "0 -10px 28px rgba(88,166,255,0.12)" : "inset 0 1px 0 rgba(255,255,255,0.02)",
          padding: contextChips.length > 0 ? (compactContextChips ? "4px 10px" : "6px 12px") : "0 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: contextChips.length > 0 ? (compactContextChips ? 3 : 5) : 0,
          minHeight: contextChips.length > 0 ? (compactContextChips ? 48 : 56) : 40,
          cursor: "text",
          boxSizing: "border-box",
          position: "relative",
          transition: "border-color 120ms",
        }}
      >
        {contextChips.length > 0 && (
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              alignContent: "flex-start",
              gap: 6,
              rowGap: compactContextChips ? 3 : 0,
              flexWrap: compactContextChips ? "wrap" : "nowrap",
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            {contextChips.map((chip) => {
              const primaryChip = chip.id === "route" || chip.id === "backend" || chip.id === "term";
              const chipOrder = !compactContextChips
                ? 0
                : chip.id === "route"
                  ? 0
                  : chip.id === "backend"
                    ? 1
                    : chip.id === "term"
                      ? 2
                      : 3;
              return (
              <span
                key={chip.id}
                style={{
                  order: chipOrder,
                  flexShrink: 0,
                  fontSize: 10,
                  lineHeight: 1.2,
                  padding: compactContextChips ? "1px 6px" : "2px 7px",
                  borderRadius: 999,
                  border:
                    chip.tone === "accent" ? "1px solid rgba(88,166,255,0.35)" :
                    chip.tone === "success" ? "1px solid rgba(63,185,80,0.35)" :
                    chip.tone === "warn" ? "1px solid rgba(227,179,65,0.35)" :
                    "1px solid rgba(255,255,255,0.14)",
                  color:
                    chip.tone === "accent" ? "rgba(121,192,255,0.95)" :
                    chip.tone === "success" ? "rgba(111,227,132,0.95)" :
                    chip.tone === "warn" ? "rgba(233,194,105,0.96)" :
                    "rgba(255,255,255,0.62)",
                  background:
                    chip.tone === "accent" ? "rgba(88,166,255,0.12)" :
                    chip.tone === "success" ? "rgba(63,185,80,0.12)" :
                    chip.tone === "warn" ? "rgba(227,179,65,0.12)" :
                    "rgba(255,255,255,0.04)",
                  opacity: compactContextChips && !primaryChip ? 0.52 : 1,
                  maxWidth: compactContextChips && !primaryChip ? 132 : undefined,
                  overflow: compactContextChips && !primaryChip ? "hidden" : undefined,
                  textOverflow: compactContextChips && !primaryChip ? "ellipsis" : undefined,
                  whiteSpace: compactContextChips && !primaryChip ? "nowrap" : undefined,
                  boxShadow: compactContextChips && primaryChip ? "0 0 0 1px rgba(255,255,255,0.12)" : "none",
                }}
              >
                {chip.label}
              </span>
            );
            })}
          </div>
        )}

        {voiceError && (
          <div
            style={{
              position: "absolute",
              top: -24,
              right: 10,
              fontSize: 10,
              color: "#ff7b72",
              background: "rgba(248,81,73,0.12)",
              border: "1px solid rgba(248,81,73,0.25)",
              borderRadius: 6,
              padding: "2px 6px",
              maxWidth: 420,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
            }}
            title={voiceError}
          >
            음성 입력 오류: {voiceError}
          </div>
        )}

        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, minHeight: 32 }}>
          <span style={{ color: promptColor, fontFamily, fontSize, opacity: 0.85, flexShrink: 0 }}>
            {promptChar}
          </span>

          {voiceEnabled && (
            <button
              type="button"
              onClick={handleMicToggle}
              disabled={voiceBusy}
              aria-label={isRecording ? "음성 녹음 중지" : "음성 녹음 시작"}
              title={isRecording ? "음성 녹음 중지" : "음성 녹음 시작"}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.16)",
                background: isRecording ? "rgba(248,81,73,0.22)" : "rgba(255,255,255,0.06)",
                color: isRecording ? "#ff7b72" : "rgba(255,255,255,0.78)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: voiceBusy ? "wait" : "pointer",
                opacity: voiceBusy ? 0.55 : 1,
              }}
            >
              {isRecording ? <Mic size={12} /> : <MicOff size={12} />}
            </button>
          )}

          {/* 입력 영역: 실제 input은 투명, 컬러 오버레이로 syntax highlight */}
          <div style={{ position: "relative", flex: 1, height: "100%", display: "flex", alignItems: "center" }}>
          {/* 컬러 오버레이 (pointer-events: none) */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              pointerEvents: "none",
              fontFamily,
              fontSize,
              whiteSpace: "pre",
              overflow: "hidden",
              lineHeight: 1.4,
            }}
          >
            {input === "" ? (
              <span style={{ color: "rgba(255,255,255,0.28)" }}>
                자연어는 AI · 명령어는 자동 실행 · !강제shell · @강제AI(@local/@ollama/@xllm/@sglang/@gemini) · &gt;&gt;에이전트 · Cmd/Ctrl+1~4/0 · `/. 정순환 · Shift+`/, 역순환
              </span>
            ) : body !== null ? (
              <span style={{ color: TOKEN_COLORS.text }}>{body}</span>
            ) : (
              tokenizeShell(input).map((t, idx) => (
                <span key={idx} style={{ color: TOKEN_COLORS[t.type] }}>{t.text}</span>
              ))
            )}
          </div>

          {/* 실제 입력: 텍스트 투명, 캐럿은 파랑 */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onFocus={() => {
              setIsFocused(true);
              onFocusChange?.(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              onFocusChange?.(false);
            }}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "transparent",
              caretColor: "#79c0ff",
              fontFamily,
              fontSize,
              padding: 0,
              margin: 0,
              lineHeight: 1.4,
            }}
          />
          </div>

          {input === "" && (
            <span
              title="Enter 실행 · Esc 클리어 · Cmd/Ctrl+` 또는 Cmd/Ctrl+. 정순환 · Cmd/Ctrl+Shift+` 또는 Cmd/Ctrl+, 역순환 · Cmd/Ctrl+0 backend 해제"
              style={{
                flexShrink: 0,
                fontSize: 10,
                color: "rgba(255,255,255,0.3)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                padding: "1px 6px",
                lineHeight: 1.2,
              }}
            >
              Enter 실행
            </span>
          )}
          {activeBackendLabel && (
            <button
              type="button"
              aria-label="clear-backend-badge"
              onClick={clearBackendPrefix}
              style={{
                flexShrink: 0,
                fontSize: 10,
                color: activeBackendStyle.color,
                border: activeBackendStyle.border,
                borderRadius: 6,
                padding: "1px 6px",
                lineHeight: 1.2,
                background: activeBackendStyle.background,
                cursor: "pointer",
              }}
              title="현재 backend 강제 상태 (Cmd/Ctrl+` 또는 . 정순환, Cmd/Ctrl+Shift+` 또는 , 역순환, 클릭/Cmd/Ctrl+0 해제)"
            >
              BACKEND {activeBackendLabel}
            </button>
          )}
        </div>

      </div>
    );
  },
);

WarpInputBar.displayName = "WarpInputBar";
export default WarpInputBar;
