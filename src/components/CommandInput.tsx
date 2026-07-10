import { useState, useMemo, useEffect, useRef } from "react";
import { Zap, Mic, MicOff, Copy, RotateCcw, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { shortPath } from "../utils";
import Editor from "react-simple-code-editor";
import { invoke } from "@tauri-apps/api/core";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/themes/prism-tomorrow.css";
import { useVoiceInput } from "../hooks/useVoiceInput";

interface Props {
  onCommandSubmit: (cmd: string, type: "shell" | "ai") => void;
  selectedModel: string;
  xllmOnline: boolean;
  context: { cwd: string; git_branch: string | null };
}

const VOICE_ERROR_FONT_SIZE = 11;
const VOICE_INLINE_BANNER_MARGIN = "0 10px 4px 10px";
const VOICE_INLINE_BANNER_PADDING = "3px 7px";
const VOICE_SUCCESS_VISIBLE_MS = 980;
const VOICE_SUCCESS_FADE_MS = 130;
const VOICE_HIGHLIGHT_VISIBLE_MS = 1850;
const VOICE_HIGHLIGHT_FADE_MS = 260;
const VOICE_HIGHLIGHT_LONG_TEXT_THRESHOLD = 32;
const VOICE_PULSE_ANIMATION = "lum-voice-pulse 1.35s ease-in-out infinite";
const VOICE_BANNER_IN_ANIMATION = "lum-voice-banner-in 140ms ease-out";
const SR_ONLY_STYLE: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const CommandInput = ({
  onCommandSubmit,
  selectedModel,
  xllmOnline,
  context,
}: Props) => {
  const [value, setValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [micHovered, setMicHovered] = useState(false);
  const [voiceSuccessPhase, setVoiceSuccessPhase] = useState<"hidden" | "visible" | "fading">("hidden");
  const [voiceHighlight, setVoiceHighlight] = useState<{ start: number; end: number; phase: "visible" | "fading" } | null>(null);
  const voiceSuccessVisibleTimerRef = useRef<number | null>(null);
  const voiceSuccessFadeTimerRef = useRef<number | null>(null);
  const voiceHighlightVisibleTimerRef = useRef<number | null>(null);
  const voiceHighlightFadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (voiceSuccessVisibleTimerRef.current !== null) {
        window.clearTimeout(voiceSuccessVisibleTimerRef.current);
      }
      if (voiceSuccessFadeTimerRef.current !== null) {
        window.clearTimeout(voiceSuccessFadeTimerRef.current);
      }
      if (voiceHighlightVisibleTimerRef.current !== null) {
        window.clearTimeout(voiceHighlightVisibleTimerRef.current);
      }
      if (voiceHighlightFadeTimerRef.current !== null) {
        window.clearTimeout(voiceHighlightFadeTimerRef.current);
      }
    };
  }, []);

  const clearVoiceHighlight = () => {
    if (voiceHighlightVisibleTimerRef.current !== null) {
      window.clearTimeout(voiceHighlightVisibleTimerRef.current);
      voiceHighlightVisibleTimerRef.current = null;
    }
    if (voiceHighlightFadeTimerRef.current !== null) {
      window.clearTimeout(voiceHighlightFadeTimerRef.current);
      voiceHighlightFadeTimerRef.current = null;
    }
    setVoiceHighlight(null);
  };

  const showVoiceHighlight = (start: number, end: number) => {
    clearVoiceHighlight();
    setVoiceHighlight({ start, end, phase: "visible" });
    voiceHighlightVisibleTimerRef.current = window.setTimeout(() => {
      setVoiceHighlight((prev) => (prev ? { ...prev, phase: "fading" } : prev));
      voiceHighlightVisibleTimerRef.current = null;
      voiceHighlightFadeTimerRef.current = window.setTimeout(() => {
        setVoiceHighlight(null);
        voiceHighlightFadeTimerRef.current = null;
      }, VOICE_HIGHLIGHT_FADE_MS);
    }, VOICE_HIGHLIGHT_VISIBLE_MS);
  };

  const clearVoiceSuccess = () => {
    if (voiceSuccessVisibleTimerRef.current !== null) {
      window.clearTimeout(voiceSuccessVisibleTimerRef.current);
      voiceSuccessVisibleTimerRef.current = null;
    }
    if (voiceSuccessFadeTimerRef.current !== null) {
      window.clearTimeout(voiceSuccessFadeTimerRef.current);
      voiceSuccessFadeTimerRef.current = null;
    }
    setVoiceSuccessPhase("hidden");
  };

  const showVoiceSuccess = () => {
    clearVoiceSuccess();
    setVoiceSuccessPhase("visible");
    voiceSuccessVisibleTimerRef.current = window.setTimeout(() => {
      setVoiceSuccessPhase("fading");
      voiceSuccessVisibleTimerRef.current = null;
      voiceSuccessFadeTimerRef.current = window.setTimeout(() => {
        setVoiceSuccessPhase("hidden");
        voiceSuccessFadeTimerRef.current = null;
      }, VOICE_SUCCESS_FADE_MS);
    }, VOICE_SUCCESS_VISIBLE_MS);
  };

  const injectTranscript = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setValue((prev) => {
      const joined = prev.trim() ? `${prev} ${t}` : t;
      showVoiceHighlight(joined.length - t.length, joined.length);
      return joined;
    });
    showVoiceSuccess();
  };

  const { isRecording, voiceBusy, voiceError, voiceStatus, handleMicToggle, clearVoiceError } = useVoiceInput({
    onTranscript: injectTranscript,
  });
  const voiceStatusLabel =
    voiceError ? "오류" :
    voiceStatus === "listening" ? "듣는 중" :
    voiceStatus === "processing" ? "반영 중" :
    "대기 중";
  const voiceStatusToneClass =
    voiceError ? "text-red-300 bg-red-500/15 border-red-400/25" :
    voiceStatus === "listening" ? "text-emerald-200 bg-emerald-500/18 border-emerald-400/35" :
    voiceStatus === "processing" ? "text-sky-200 bg-sky-500/20 border-sky-400/40" :
    "text-white/75 bg-white/12 border-white/20";
  const micActionLabel =
    !voiceEnabled ? "음성 비활성" :
    voiceBusy ? "음성 입력 준비 중" :
    isRecording ? "음성 녹음 중지" :
    "음성 녹음 시작";
  const micAssistLabel =
    !voiceEnabled ? "비활성" :
    voiceBusy ? "처리 중" :
    `상태 ${voiceStatusLabel}`;
  const voicePulseActive = voiceStatus === "listening" || voiceStatus === "processing";
  const isVoiceProcessing = voiceStatus === "processing";
  const showVoiceStatusBanner =
    !voiceError &&
    voiceSuccessPhase === "hidden" &&
    voiceStatus !== "idle";
  const showInlineVoiceStatus = !voiceError && voiceSuccessPhase === "hidden" && voiceStatus === "idle";
  const voiceLiveMessage =
    voiceError ? `오류: ${voiceError}` :
    voiceSuccessPhase !== "hidden" ? "음성 반영됨" :
      `음성 ${voiceStatusLabel}`;
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // 자동 완성 상태
  const [completions, setCompletions] = useState<string[]>([]);
  const [compIdx, setCompIdx] = useState(0);
  const [showCompletions, setShowCompletions] = useState(false);

  const isAI = value.startsWith("/");

  // 고스트 텍스트 예측 (히스토리 기반)
  const ghostText = useMemo(() => {
    if (!value || isAI || value.trim() === "") return "";
    // 히스토리 중 현재 입력값으로 시작하는 가장 최근 명령어 찾기
    const match = history.find((cmd) => cmd.startsWith(value) && cmd !== value);
    if (match) {
      return match.slice(value.length);
    }
    return "";
  }, [value, history, isAI]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const type = isAI ? "ai" : "shell";
    const cmd = isAI ? trimmed.slice(1).trim() : trimmed;
    if (cmd) {
      // 히스토리 업데이트 (중복 제거 후 맨 앞에 추가)
      setHistory((prev) =>
        [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 100),
      );
      setHistoryIdx(-1);
      onCommandSubmit(cmd, type);
      setValue("");
      setShowCompletions(false);
    }
  };

  const onKeyDown = async (e: React.KeyboardEvent) => {
    if (isVoiceProcessing) {
      if (e.key !== "Tab") {
        e.preventDefault();
      }
      return;
    }
    if (isComposing || e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }

    // Right Arrow로 고스트 텍스트 수락
    if (e.key === "ArrowRight" && ghostText !== "") {
      e.preventDefault();
      setValue(value + ghostText);
      return;
    }

    // 자동 완성 (Tab)
    if (e.key === "Tab") {
      e.preventDefault();
      if (isAI) return;

      if (showCompletions && completions.length > 0) {
        const next = (compIdx + 1) % completions.length;
        setCompIdx(next);
        applyCompletion(completions[next]);
      } else {
        const lastWord = value.split(" ").pop() || "";
        try {
          const results = await invoke<string[]>("get_completions", {
            cwd: context.cwd,
            partial: lastWord,
          });
          if (results.length > 0) {
            setCompletions(results);
            setCompIdx(0);
            setShowCompletions(true);
            applyCompletion(results[0]);
          }
        } catch (err) {}
      }
      return;
    }

    if (e.key === "Escape") {
      setShowCompletions(false);
      return;
    }

    if (e.key === "ArrowUp" && !value) {
      e.preventDefault();
      if (history.length > 0) {
        const i =
          historyIdx === -1 ? 0 : Math.min(history.length - 1, historyIdx + 1);
        setHistoryIdx(i);
        setValue(history[i]);
      }
    }
    if (e.key === "ArrowDown" && historyIdx !== -1) {
      e.preventDefault();
      if (historyIdx > 0) {
        setHistoryIdx(historyIdx - 1);
        setValue(history[historyIdx - 1]);
      } else {
        setHistoryIdx(-1);
        setValue("");
      }
    }

    if (e.key === "Home" && !isComposing && !value && history.length > 0) {
      e.preventDefault();
      const first = 0;
      setHistoryIdx(first);
      setValue(history[first]);
      return;
    }

    if (e.key === "End" && !isComposing && !value && history.length > 0) {
      e.preventDefault();
      const last = history.length - 1;
      setHistoryIdx(last);
      setValue(history[last]);
      return;
    }

    if (
      e.key !== "Tab" &&
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "ArrowRight"
    ) {
      setShowCompletions(false);
    }
  };

  const applyCompletion = (completion: string) => {
    const words = value.split(" ");
    words.pop();
    words.push(completion);
    setValue(words.join(" "));
  };

  useEffect(() => {
    if (!isVoiceProcessing) return;
    const editor = document.getElementById("command-editor-textarea");
    if (editor instanceof HTMLTextAreaElement) {
      editor.focus();
    }
  }, [isVoiceProcessing]);

  const highlight = (code: string) => {
    const escapeHtml = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const renderSegment = (segment: string) => {
      if (!segment) return "";
      if (segment.startsWith("/")) {
        return `<span style="color: #a78bfa">${escapeHtml(segment)}</span>`;
      }
      return Prism.highlight(
        segment,
        Prism.languages.bash || Prism.languages.plain,
        "bash",
      );
    };

    if (voiceHighlight && voiceHighlight.start < voiceHighlight.end && voiceHighlight.end <= code.length) {
      const voiceHighlightLength = voiceHighlight.end - voiceHighlight.start;
      const isLongVoiceHighlight = voiceHighlightLength >= VOICE_HIGHLIGHT_LONG_TEXT_THRESHOLD;
      return [
        renderSegment(code.slice(0, voiceHighlight.start)),
        `<span style="background: ${isLongVoiceHighlight ? "linear-gradient(180deg, rgba(88,166,255,0.20), rgba(88,166,255,0.12))" : "rgba(88,166,255,0.16)"}; border-radius: 4px; box-shadow: ${isLongVoiceHighlight ? "inset 0 0 0 1px rgba(88,166,255,0.20), 0 0 0 1px rgba(88,166,255,0.12)" : "0 0 0 1px rgba(88,166,255,0.18)"}; opacity: ${voiceHighlight.phase === "fading" ? 0 : 1}; transition: opacity ${VOICE_HIGHLIGHT_FADE_MS}ms ease; ${isLongVoiceHighlight ? "padding: 0 2px;" : ""}">${renderSegment(code.slice(voiceHighlight.start, voiceHighlight.end))}</span>`,
        renderSegment(code.slice(voiceHighlight.end)),
      ].join("");
    }

    if (code.startsWith("/")) {
      return `<span style="color: #a78bfa">${escapeHtml(code)}</span>`;
    }
    return Prism.highlight(
      code,
      Prism.languages.bash || Prism.languages.plain,
      "bash",
    );
  };

  return (
    <div className="editor">
      <style>
        {`@keyframes lum-voice-pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(88,166,255,0.28); }
          70% { transform: scale(1.04); box-shadow: 0 0 0 8px rgba(88,166,255,0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(88,166,255,0); }
        }
        @keyframes lum-voice-banner-in {
          0% { opacity: 0; transform: translateY(2px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .lum-voice-mic-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(13,17,23,0.95), 0 0 0 4px rgba(121,192,255,0.52), 0 10px 24px rgba(88,166,255,0.18);
        }`}
      </style>
      <span
        role="status"
        aria-live={voiceError ? "assertive" : "polite"}
        aria-atomic="true"
        style={SR_ONLY_STYLE}
      >
        {voiceLiveMessage}
      </span>
      {showCompletions && completions.length > 1 && (
        <div className="autocomplete-popover">
          {completions.map((c, i) => (
            <div
              key={c}
              className={`autocomplete-item ${i === compIdx ? "active" : ""}`}
            >
              {c}
            </div>
          ))}
        </div>
      )}

      <div className={`editor-box ${isAI ? "editor-box-ai" : ""} ${isRecording ? "recording" : ""}`}>
        <div className="editor-header">
          <IconButton
            tooltip={`${micActionLabel} · ${micAssistLabel}`}
            className={`mic-btn lum-voice-mic-btn ${isRecording ? "active" : ""}`}
            onClick={handleMicToggle}
            disabled={!voiceEnabled || voiceBusy}
            onMouseEnter={() => setMicHovered(true)}
            onMouseLeave={() => setMicHovered(false)}
            aria-pressed={voiceEnabled ? isRecording : undefined}
            aria-label={`${micActionLabel} · ${micAssistLabel}`}
            style={{
              animation: voiceEnabled && voicePulseActive ? VOICE_PULSE_ANIMATION : "none",
              background:
                !voiceEnabled ? "rgba(255,255,255,0.025)" :
                voiceStatus === "processing" ? "rgba(88,166,255,0.18)" :
                micHovered && !voiceBusy ? "rgba(255,255,255,0.10)" :
                undefined,
              color:
                !voiceEnabled ? "rgba(255,255,255,0.40)" :
                voiceStatus === "processing" ? "rgba(121,192,255,0.95)" :
                undefined,
              borderColor:
                !voiceEnabled ? "rgba(255,255,255,0.12)" :
                voiceStatus === "processing" ? "rgba(121,192,255,0.28)" :
                micHovered && !voiceBusy ? "rgba(255,255,255,0.28)" :
                undefined,
              cursor: !voiceEnabled ? "not-allowed" : voiceBusy ? "wait" : "pointer",
              opacity: !voiceEnabled ? 0.72 : voiceBusy ? 0.55 : 1,
              transform: micHovered && voiceEnabled && !voiceBusy ? "translateY(-1px)" : "translateY(0)",
              boxShadow:
                !voiceEnabled || voiceBusy ? "none" :
                micHovered
                  ? "0 6px 16px rgba(0,0,0,0.22)"
                  : "0 0 0 rgba(0,0,0,0)",
              transition: "background 120ms ease, border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
            }}
          >
            {voiceEnabled && isRecording ? <Mic size={14} /> : <MicOff size={14} />}
          </IconButton>
          {showInlineVoiceStatus && (
            <span
              aria-hidden="true"
              className={`inline-flex items-center rounded-full border px-1 py-0.5 text-[10px] leading-none ${voiceStatusToneClass}`}
              style={{
                minHeight: 16,
                justifyContent: "center",
                marginLeft: 6,
                marginRight: 2,
                transform: "translateY(0)",
                opacity: voiceStatus === "idle" ? 0.9 : 0.98,
              }}
            >
              {voiceStatusLabel}
            </span>
          )}
          <span className="editor-path">{shortPath(context.cwd)}</span>
          {context.git_branch && (
            <>
              <span className="editor-on">on</span>
              <span className="editor-branch">{context.git_branch}</span>
            </>
          )}
          {isAI && (xllmOnline || selectedModel.startsWith("gemini-") || selectedModel.startsWith("webgpu-")) && (
            <span
              className={`editor-ai-badge ${selectedModel.startsWith("gemini-") ? "gemini" : selectedModel.startsWith("webgpu-") ? "webgpu" : ""}`}
            >
              <Zap size={10} />
              AI · {selectedModel}
              {selectedModel === "gemini-1.5-flash" && (
                <span className="free-tag">Free</span>
              )}
              {selectedModel.startsWith("webgpu-") && (
                <span className="local-tag">Local GPU</span>
              )}
            </span>
          )}
        </div>
        {voiceError && (
          <div
            role="alert"
            className="voice-error-banner"
            style={{
              margin: "0 10px 6px 10px",
              margin: VOICE_INLINE_BANNER_MARGIN,
              padding: VOICE_INLINE_BANNER_PADDING,
              borderRadius: 6,
              fontSize: VOICE_ERROR_FONT_SIZE,
              lineHeight: 1.3,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              color: "#ff7b72",
              background: "rgba(248,81,73,0.12)",
              border: "1px solid rgba(248,81,73,0.25)",
              whiteSpace: "normal",
              textOverflow: "initial",
              overflow: "hidden",
            }}
            title={voiceError}
          >
            <span className="voice-error-text" style={{ minWidth: 0, flex: 1, paddingRight: 2 }}>
              음성 오류: {voiceError}
            </span>
            <span
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                paddingLeft: 6,
                borderLeft: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <IconButton
                tooltip="복사"
                onClick={() => {
                  if (!voiceError) return;
                  navigator.clipboard?.writeText?.(`음성 오류: ${voiceError}`).catch(() => {});
                }}
                className="p-[3px] rounded text-white/70 hover:text-white/85 hover:bg-white/5 transition-colors shrink-0"
              >
                <Copy size={10} />
              </IconButton>
              <IconButton
                tooltip="다시 시도"
                onClick={handleMicToggle}
                disabled={voiceBusy}
                className="p-[3px] rounded text-red-300 hover:text-red-200 hover:bg-red-500/15 transition-colors shrink-0"
              >
                <RotateCcw size={11} />
              </IconButton>
              <IconButton
                tooltip="닫기"
                onClick={clearVoiceError}
                className="p-[3px] rounded text-white/65 hover:text-white/80 hover:bg-white/5 transition-colors shrink-0"
              >
                <X size={10} />
              </IconButton>
            </span>
          </div>
        )}

        {!voiceError && voiceSuccessPhase !== "hidden" && (
          <div
            role="status"
            className="voice-success-banner"
            style={{
              margin: VOICE_INLINE_BANNER_MARGIN,
              padding: VOICE_INLINE_BANNER_PADDING,
              borderRadius: 6,
              fontSize: VOICE_ERROR_FONT_SIZE,
              lineHeight: 1.3,
              display: "flex",
              alignItems: "center",
              gap: "5px",
              color: "rgba(166,244,180,0.88)",
              background: "rgba(46,160,67,0.08)",
              border: "1px solid rgba(63,185,80,0.12)",
              opacity: voiceSuccessPhase === "fading" ? 0 : 1,
              transform: voiceSuccessPhase === "fading" ? "translateY(-1px)" : "translateY(0)",
              transition: `opacity ${VOICE_SUCCESS_FADE_MS}ms ease, transform ${VOICE_SUCCESS_FADE_MS}ms ease`,
              animation: VOICE_BANNER_IN_ANIMATION,
              boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
            }}
          >
            음성 반영됨
          </div>
        )}

        {showVoiceStatusBanner && (
          <div
            role="status"
            className="voice-status-banner"
            style={{
              margin: VOICE_INLINE_BANNER_MARGIN,
              padding: VOICE_INLINE_BANNER_PADDING,
              borderRadius: 6,
              fontSize: VOICE_ERROR_FONT_SIZE,
              lineHeight: 1.3,
              display: "flex",
              alignItems: "center",
              gap: "5px",
              animation: VOICE_BANNER_IN_ANIMATION,
              boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
            }}
          >
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none ${voiceStatusToneClass}`}>
              {voiceStatusLabel}
            </span>
          </div>
        )}

        <div className="editor-input-row">
          <span className="editor-prompt">
            {isAI ? <Zap size={14} style={{ color: "#a78bfa" }} /> : "$"}
          </span>
          <div
            className="editor-input-wrapper"
            style={{ width: "100%", position: "relative" }}
          >
            <Editor
              value={value}
              onValueChange={(code) => {
                if (isVoiceProcessing) {
                  return;
                }
                if (voiceError) {
                  clearVoiceError();
                }
                if (voiceSuccessPhase !== "hidden") {
                  clearVoiceSuccess();
                }
                if (voiceHighlight) {
                  clearVoiceHighlight();
                }
                setValue(code);
              }}
              highlight={highlight}
              padding={0}
              onKeyDown={onKeyDown}
              readOnly={isVoiceProcessing}
              aria-busy={isVoiceProcessing}
              className="editor-input"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--font-size)",
                lineHeight: "var(--line-height)",
                width: "100%",
                outline: "none",
                background: "transparent",
                zIndex: 2,
                position: "relative",
                cursor: isVoiceProcessing ? "wait" : "text",
                opacity: isVoiceProcessing ? 0.92 : 1,
              }}
              textareaId="command-editor-textarea"
              placeholder={isAI ? "AI에게 질문하세요..." : ""}
              autoFocus
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
            />
            {/* 고스트 텍스트 레이어 */}
            {!isAI && ghostText && value && (
              <div
                className="ghost-text-layer"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--font-size)",
                  lineHeight: "var(--line-height)",
                  pointerEvents: "none",
                  whiteSpace: "pre",
                  zIndex: 1,
                  color: "transparent",
                }}
              >
                {value}
                <span style={{ color: "rgba(255, 255, 255, 0.3)" }}>
                  {ghostText}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandInput;
