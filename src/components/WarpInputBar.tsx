import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { tokenizeShell, TOKEN_COLORS } from "../utils/shellSyntax";

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
}

const WarpInputBar = forwardRef<WarpInputBarHandle, Props>(
  ({ fontFamily, fontSize, onSubmit, onInterrupt, onTab, onChange }, ref) => {
    const [input, setInput] = useState("");
    const [isComposing, setIsComposing] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const history = useRef<string[]>([]);
    const historyIdx = useRef<number>(-1);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      setValue: (v: string) => { setInput(v); onChange?.(v); },
      getValue: () => input,
    }), [input, onChange]);

    useEffect(() => {
      inputRef.current?.focus();
    }, []);

    // 시각적 prompt char — 라우팅 로직은 상위에서
    const isAgent   = input.startsWith(">>");
    const isAICmd   = input.startsWith("# ");
    const isExplain = input.startsWith("? ");
    const isForceShell = input.startsWith("!");
    const isForceAI    = input.startsWith("@");
    // 첫 토큰에서 `ls` 등 shell 냄새 풍기면 $, 아니면 기본값을 "AI 모드"로 표시 (★)
    const firstTok = input.trimStart().split(/\s+/)[0] ?? "";
    const looksShell = /^[a-z][a-z0-9._-]*$/i.test(firstTok) && firstTok.length <= 20;
    const promptColor =
      isAgent      ? "#ff7b72" :
      isAICmd      ? "#58a6ff" :
      isExplain    ? "#3fb950" :
      isForceShell ? "#d29922" :
      isForceAI    ? "#bc8cff" :
      input === "" ? "#58a6ff" :
      looksShell   ? "#3fb950" : "#58a6ff";
    const promptChar =
      isAgent      ? ">>" :
      isAICmd      ? "#" :
      isExplain    ? "?" :
      isForceShell ? "!" :
      isForceAI    ? "@" :
      input === "" ? "✨" :
      looksShell   ? "$" : "✨";

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (isComposing || e.nativeEvent.isComposing) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = input.trim();
        if (trimmed) {
          history.current.push(input);
          historyIdx.current = history.current.length;
        }
        onSubmit(input);
        setInput("");
        onChange?.("");
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

      if (e.key === "Escape") {
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

    const body =
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
          background: "#161b22",
          borderTop: `1px solid ${isFocused ? "rgba(88,166,255,0.6)" : "rgba(88,166,255,0.2)"}`,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 40,
          minHeight: 40,
          cursor: "text",
          boxSizing: "border-box",
          position: "relative",
          transition: "border-color 120ms",
        }}
      >
        <span style={{ color: promptColor, fontFamily, fontSize, opacity: 0.85, flexShrink: 0 }}>
          {promptChar}
        </span>

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
              <span style={{ color: "rgba(255,255,255,0.2)" }}>자연어는 AI · 명령어는 자동 실행 · !강제shell · @강제AI · &gt;&gt;에이전트</span>
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
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
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
              caretColor: "#58a6ff",
              fontFamily,
              fontSize,
              padding: 0,
              margin: 0,
              lineHeight: 1.4,
            }}
          />
        </div>
      </div>
    );
  },
);

WarpInputBar.displayName = "WarpInputBar";
export default WarpInputBar;
