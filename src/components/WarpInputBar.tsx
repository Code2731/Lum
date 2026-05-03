import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  voiceEnabled?: boolean;            // 음성 입력 토글 표시 여부 (기본 true)
}

const WarpInputBar = forwardRef<WarpInputBarHandle, Props>(
  ({ fontFamily, fontSize, onSubmit, onInterrupt, onTab, onChange, voiceEnabled = true }, ref) => {
    const [input, setInput] = useState("");
    const [isComposing, setIsComposing] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [voiceBusy, setVoiceBusy] = useState(false);
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const history = useRef<string[]>([]);
    const historyIdx = useRef<number>(-1);
    const lastInjectedRef = useRef<{ text: string; ts: number } | null>(null);
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

    // 백엔드 녹음 상태와 버튼 상태 동기화 (패널 재마운트/리렌더 안전성).
    useEffect(() => {
      if (!voiceEnabled) return;
      invoke<boolean>("voice_recording_status")
        .then((on) => setIsRecording(Boolean(on)))
        .catch(() => {});
    }, [voiceEnabled]);

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

    const injectTranscript = (text: string) => {
      const t = text.trim();
      if (!t) return;
      const now = Date.now();
      const last = lastInjectedRef.current;
      if (last && last.text === t && now - last.ts < 500) {
        return;
      }
      lastInjectedRef.current = { text: t, ts: now };
      setInput((prev) => {
        const joined = prev.trim() ? `${prev} ${t}` : t;
        onChangeRef.current?.(joined);
        return joined;
      });
      inputRef.current?.focus();
    };

    const handleMicToggle = async () => {
      if (voiceBusy) return;
      setVoiceBusy(true);
      try {
        if (isRecording) {
          setIsRecording(false);
          const transcript = await invoke<string>("stop_voice_recording");
          injectTranscript(transcript ?? "");
          setVoiceError(null);
        } else {
          await invoke("start_voice_recording");
          setIsRecording(true);
          setVoiceError(null);
        }
      } catch (e) {
        // 음성 기능은 best-effort. 실패 시 녹음 상태만 안전하게 복구.
        setIsRecording(false);
        setVoiceError(String(e));
      } finally {
        setVoiceBusy(false);
      }
    };

    // 백엔드가 stop 시 emit하는 전사 이벤트를 입력바에 즉시 반영.
    useEffect(() => {
      if (!voiceEnabled) return;
      let unlisten: (() => void) | null = null;
      listen<string>("voice_transcript", (event) => {
        injectTranscript(event.payload ?? "");
        setVoiceError(null);
      })
        .then((off) => {
          unlisten = off;
        })
        .catch(() => {});
      return () => {
        unlisten?.();
      };
    }, [voiceEnabled]);

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
              border: "1px solid rgba(255,255,255,0.12)",
              background: isRecording ? "rgba(248,81,73,0.18)" : "rgba(255,255,255,0.04)",
              color: isRecording ? "#ff7b72" : "rgba(255,255,255,0.72)",
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
