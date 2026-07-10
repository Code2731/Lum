import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Mic, MicOff, Copy, RotateCcw, X } from "lucide-react";
import { tokenizeShell, TOKEN_COLORS } from "../utils/shellSyntax";
import {
  applyBackendPrefixToInput,
  clearBackendPrefixFromInput,
  detectBackendPrefixFromInput,
  isBackendOnlyInput,
} from "../utils/backendPrefix";
import { useVoiceInput } from "../hooks/useVoiceInput";

export interface WarpInputBarHandle {
  focus: () => void;
  setValue: (v: string) => void;
  getValue: () => string;
}

const WARP_SMALL_FONT_SIZE = 10;
const VOICE_FLOATING_BANNER_TOP = -24;
const VOICE_FLOATING_STATUS_BANNER_TOP = -23;
const VOICE_FLOATING_BANNER_RIGHT = 10;
const VOICE_FLOATING_SUCCESS_BANNER_RIGHT = 9;
const VOICE_SUCCESS_VISIBLE_MS = 900;
const VOICE_SUCCESS_FADE_MS = 110;
const VOICE_HIGHLIGHT_VISIBLE_MS = 1850;
const VOICE_HIGHLIGHT_FADE_MS = 260;
const VOICE_HIGHLIGHT_LONG_TEXT_THRESHOLD = 32;
const VOICE_PREVIEW_SOFT_LIMIT = 18;
const VOICE_PREVIEW_HARD_LIMIT = 26;
const VOICE_PREVIEW_BACKTRACK_LIMIT = 8;
const VOICE_PULSE_ANIMATION = "lum-voice-pulse 1.35s ease-in-out infinite";
const VOICE_BANNER_IN_ANIMATION = "lum-voice-banner-in 140ms ease-out";
const formatVoiceDuration = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
const VOICE_PREVIEW_SENTENCE_BOUNDARY = /[.!?。！？]/;
const VOICE_PREVIEW_WORD_BOUNDARY = /\s/;
const normalizeVoiceComparisonText = (text: string) => text.replace(/\s+/g, " ").trim();
const formatVoicePreview = (text: string) => {
  const normalized = normalizeVoiceComparisonText(text);
  if (normalized.length <= VOICE_PREVIEW_SOFT_LIMIT) {
    return normalized;
  }

  let cutIndex = -1;
  const backtrackStart = Math.max(0, VOICE_PREVIEW_SOFT_LIMIT - VOICE_PREVIEW_BACKTRACK_LIMIT);

  for (let i = VOICE_PREVIEW_SOFT_LIMIT - 1; i >= backtrackStart; i -= 1) {
    const char = normalized[i] ?? "";
    if (VOICE_PREVIEW_SENTENCE_BOUNDARY.test(char)) {
      cutIndex = i + 1;
      break;
    }
    if (VOICE_PREVIEW_WORD_BOUNDARY.test(char)) {
      cutIndex = i;
      break;
    }
  }

  if (cutIndex < 0) {
    const forwardLimit = Math.min(normalized.length, VOICE_PREVIEW_HARD_LIMIT);
    for (let i = VOICE_PREVIEW_SOFT_LIMIT; i < forwardLimit; i += 1) {
      const char = normalized[i] ?? "";
      if (VOICE_PREVIEW_SENTENCE_BOUNDARY.test(char)) {
        cutIndex = i + 1;
        break;
      }
      if (VOICE_PREVIEW_WORD_BOUNDARY.test(char)) {
        cutIndex = i;
        break;
      }
    }
  }

  if (cutIndex < 0) {
    cutIndex = VOICE_PREVIEW_SOFT_LIMIT;
  }

  return `${normalized.slice(0, cutIndex).trimEnd()}...`;
};
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
    const [micHovered, setMicHovered] = useState(false);
    const [voiceSuccessPhase, setVoiceSuccessPhase] = useState<"hidden" | "visible" | "fading">("hidden");
    const [voiceHighlight, setVoiceHighlight] = useState<{ start: number; end: number; phase: "visible" | "fading" } | null>(null);
    const [lastVoiceTranscript, setLastVoiceTranscript] = useState("");
    const [lastVoicePartialTranscript, setLastVoicePartialTranscript] = useState("");
    const [recentVoiceTranscripts, setRecentVoiceTranscripts] = useState<string[]>([]);
    const [voiceCopyFeedback, setVoiceCopyFeedback] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const voiceSuccessVisibleTimerRef = useRef<number | null>(null);
    const voiceSuccessFadeTimerRef = useRef<number | null>(null);
    const voiceHighlightVisibleTimerRef = useRef<number | null>(null);
    const voiceHighlightFadeTimerRef = useRef<number | null>(null);
    const voiceCopyFeedbackTimerRef = useRef<number | null>(null);
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
        if (voiceCopyFeedbackTimerRef.current !== null) {
          window.clearTimeout(voiceCopyFeedbackTimerRef.current);
        }
      };
    }, []);

    // 시각적 prompt char — 라우팅 로직은 상위에서
    const trimmedInput = input.trimStart();
    const isHeavy      = trimmedInput.startsWith("!!");
    const isAgent      = trimmedInput.startsWith(">>");
    const isAICmd      = /^#\s/.test(trimmedInput);
    const isExplain    = /^\?\s/.test(trimmedInput);
    const isForceShell = trimmedInput.startsWith("!") && !isHeavy;
    const isForceAI    = trimmedInput.startsWith("@");
    const isVisuallyEmpty = input.trim() === "";
    const activeBackend = detectBackendPrefixFromInput(input);
    const isBackendOnly =
      isBackendOnlyInput(input);
    const isEffectivelyEmpty = isVisuallyEmpty || isBackendOnly;
    const activeHeavy  = isHeavy;
    // 첫 토큰에서 `ls` 등 shell 냄새 풍기면 $, 아니면 기본값을 "AI 모드"로 표시 (★)
    const firstTok = trimmedInput.split(/\s+/)[0] ?? "";
    const looksShell = /^[a-z][a-z0-9._-]*$/i.test(firstTok) && firstTok.length <= 20;
    const promptColor =
      activeHeavy  ? "#bc8cff" :
      isAgent      ? "#ff7b72" :
      isAICmd      ? "#58a6ff" :
      isExplain    ? "#3fb950" :
      isForceShell ? "#d29922" :
      isForceAI    ? "#bc8cff" :
      isVisuallyEmpty ? "#58a6ff" :
      looksShell   ? "#3fb950" : "#58a6ff";
    const promptChar =
      activeHeavy  ? "!!" :
      isAgent      ? ">>" :
      isAICmd      ? "#" :
      isExplain    ? "?" :
      isForceShell ? "!" :
      isForceAI    ? "@" :
      isVisuallyEmpty ? "✨" :
      looksShell   ? "$" : "✨";
    const activeBackendLabel = activeBackend ? activeBackend.toUpperCase() : null;
    const defaultInputHint =
      compactContextChips
        ? "자연어=AI · 명령어=실행 · !/@/>>/#/?"
        : "자연어는 AI · 명령어는 실행 · !/@/>>/#/? · 백엔드 @local/@ollama/@xllm/@gemini · Cmd/Ctrl+1~4/0 선택·해제 · Cmd/Ctrl+./, 순환";
    const activeModeHint =
      isBackendOnly && activeBackend
        ? `${activeBackend.toUpperCase()} 백엔드가 선택되어 있습니다. 엔터로 질의를 입력하면 ${activeBackend}로 처리됩니다. Cmd/Ctrl+0으로 해제하고 Cmd/Ctrl+./,로 순환할 수 있습니다.`
        : isHeavy
          ? "헤비 모드: AI에게 긴 컨텍스트 작업 지시를 입력하세요."
          : isAgent
            ? "에이전트 모드: 작업 지시를 입력하면 ReAct가 실행합니다."
            : isAICmd
              ? "AI 제안 모드: # 뒤에 질의할 내용을 입력하세요."
              : isExplain
                ? "설명 모드: ? 뒤에 설명이 필요한 내용을 입력하세요."
                : isForceShell
                  ? "셸 강제 모드: ! 뒤에 실행할 명령어를 입력하세요."
                  : isForceAI
                    ? "AI 강제 모드: @ 뒤에 질의할 내용을 입력하세요."
                    : null;

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
    const visibleContextChips = React.useMemo(() => {
      if (!compactContextChips) return contextChips;
      const primaryIds = new Set(["route", "backend", "term"]);
      const primary = contextChips.filter((chip) => primaryIds.has(chip.id));
      const extraCount = contextChips.length - primary.length;
      if (extraCount <= 0) return primary;
      return [
        ...primary,
        {
          id: "__extra_count__",
          label: `+${extraCount} more`,
          tone: "neutral" as const,
        },
      ];
    }, [compactContextChips, contextChips]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (isVoiceProcessing) {
        if (e.key !== "Tab") {
          e.preventDefault();
        }
        return;
      }
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
        if (activeBackend && isBackendOnly) {
          const normalized = `@${activeBackend} `;
          setInput(normalized);
          onChange?.(normalized);
          return;
        }
        if (isVisuallyEmpty) {
          setInput("");
          onChange?.("");
          return;
        }
        const trimmed = input.trim();
        if (trimmed) {
          history.current.push(input);
          historyIdx.current = history.current.length;
        }
        onSubmit(input);
        // @backend 질의/태스크 실행 후에는 같은 backend prefix를 유지해 연속 작업 속도를 높인다.
        if (activeBackend) {
          const keep = `@${activeBackend} `;
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

      if (
        e.key.toLowerCase() === "c"
        && (e.ctrlKey || e.metaKey)
        && !e.altKey
        && isEffectivelyEmpty
      ) {
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

      if (e.key === "Home" && isEffectivelyEmpty && history.current.length > 0) {
        e.preventDefault();
        historyIdx.current = 0;
        const v = history.current[historyIdx.current] ?? "";
        setInput(v);
        onChange?.(v);
        return;
      }

      if (e.key === "End" && isEffectivelyEmpty && history.current.length > 0) {
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
          if (rest.trim() !== "") {
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isVoiceProcessing) return;
      const v = e.target.value;
      if (voiceError) {
        clearVoiceError();
      }
      if (voiceSuccessPhase !== "hidden") {
        clearVoiceSuccess();
      }
      if (voiceHighlight) {
        clearVoiceHighlight();
      }
      setInput(v);
      onChange?.(v);
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
      setLastVoiceTranscript(t);
      setRecentVoiceTranscripts((prev) => [t, ...prev.filter((item) => item !== t)].slice(0, 3));
      setInput((prev) => {
        const joined = prev.trim() ? `${prev} ${t}` : t;
        showVoiceHighlight(joined.length - t.length, joined.length);
        onChangeRef.current?.(joined);
        return joined;
      });
      showVoiceSuccess();
      inputRef.current?.focus();
    };

    const restoreLastVoiceTranscript = () => {
      const t = lastVoiceTranscript.trim();
      if (!t) return;
      setInput((prev) => {
        const joined = prev.trim() ? `${prev} ${t}` : t;
        showVoiceHighlight(joined.length - t.length, joined.length);
        onChangeRef.current?.(joined);
        return joined;
      });
      inputRef.current?.focus();
    };

    const copyLastVoiceTranscript = () => {
      const t = lastVoiceTranscript.trim();
      if (!t) return;
      navigator.clipboard?.writeText?.(t)
        .then(() => {
          setVoiceCopyFeedback(true);
          if (voiceCopyFeedbackTimerRef.current !== null) {
            window.clearTimeout(voiceCopyFeedbackTimerRef.current);
          }
          voiceCopyFeedbackTimerRef.current = window.setTimeout(() => {
            setVoiceCopyFeedback(false);
            voiceCopyFeedbackTimerRef.current = null;
          }, 1200);
        })
        .catch(() => {});
    };

    const reuseRecentVoiceTranscript = (text: string) => {
      const t = text.trim();
      if (!t) return;
      setInput((prev) => {
        const joined = prev.trim() ? `${prev} ${t}` : t;
        showVoiceHighlight(joined.length - t.length, joined.length);
        onChangeRef.current?.(joined);
        return joined;
      });
      inputRef.current?.focus();
    };

    useEffect(() => {
      if (isVoiceProcessing) {
        inputRef.current?.focus();
      }
    }, [isVoiceProcessing]);

    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const { isRecording, voiceBusy, voiceError, voicePartialTranscript, voiceStatus, handleMicToggle, clearVoiceError } = useVoiceInput({
      enabled: voiceEnabled,
      onTranscript: injectTranscript,
    });
    useEffect(() => {
      if (isRecording) {
        setLastVoicePartialTranscript("");
      }
    }, [isRecording]);
    useEffect(() => {
      const partial = voicePartialTranscript.trim();
      if (!partial) return;
      setLastVoicePartialTranscript(partial);
    }, [voicePartialTranscript]);
    useEffect(() => {
      if (!isRecording) {
        setRecordingSeconds(0);
        return;
      }
      const startedAt = Date.now();
      setRecordingSeconds(0);
      const timer = window.setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);
      return () => window.clearInterval(timer);
    }, [isRecording]);
    const voiceStatusLabel =
      voiceError ? "오류" :
      voiceStatus === "listening" ? "듣는 중" :
      voiceStatus === "processing" ? "반영 중" :
      "대기 중";
    const voiceStatusDisplayLabel =
      voiceStatus === "listening" && recordingSeconds > 0
        ? `${voiceStatusLabel} ${formatVoiceDuration(recordingSeconds)}`
        : voiceStatusLabel;
    const voiceStatusTone =
      voiceError ? {
        color: "#ff7b72",
        background: "rgba(248,81,73,0.15)",
        border: "1px solid rgba(248,81,73,0.24)",
      } :
      voiceStatus === "listening" ? {
        color: "rgba(142,241,160,0.98)",
        background: "rgba(46,160,67,0.20)",
        border: "1px solid rgba(63,185,80,0.30)",
      } :
      voiceStatus === "processing" ? {
        color: "rgba(145,205,255,0.98)",
        background: "rgba(56,139,253,0.22)",
        border: "1px solid rgba(88,166,255,0.34)",
      } : {
        color: "rgba(255,255,255,0.78)",
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.16)",
      };
    const voiceDisabledTone = {
      color: "rgba(255,255,255,0.58)",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
    };
    const voicePulseActive = voiceStatus === "listening" || voiceStatus === "processing";
    const isVoiceProcessing = voiceStatus === "processing";
    const showVoiceStatusBanner =
      !voiceError &&
      voiceEnabled &&
      voiceSuccessPhase === "hidden" &&
      voiceStatus !== "idle";
    const showInlineVoiceStatus =
      (!voiceError && voiceSuccessPhase === "hidden" && voiceStatus === "idle") || !voiceEnabled;
    const micActionLabel =
      !voiceEnabled ? "음성 비활성" :
      voiceBusy ? "음성 준비 중" :
      isRecording ? "음성 녹음 중지" :
      "음성 녹음 시작";
    const micAssistLabel =
      !voiceEnabled ? "설정 필요" :
      voiceBusy ? "처리 중" :
      voicePartialTranscript && voiceStatus !== "idle"
        ? `상태 ${voiceStatusDisplayLabel} · ${formatVoicePreview(voicePartialTranscript)}`
        : `상태 ${voiceStatusDisplayLabel}`;
    const inlineVoiceLabel = !voiceEnabled ? "비활성" : voiceStatusDisplayLabel;
    const inlineVoiceTone = !voiceEnabled ? voiceDisabledTone : voiceStatusTone;
    const voicePartialPreview =
      voicePartialTranscript && voiceStatus !== "idle"
        ? formatVoicePreview(voicePartialTranscript)
        : "";
    const normalizedFinalVoiceTranscript = normalizeVoiceComparisonText(lastVoiceTranscript);
    const normalizedLastVoicePartialTranscript = normalizeVoiceComparisonText(lastVoicePartialTranscript);
    const voiceTranscriptRefined =
      Boolean(normalizedFinalVoiceTranscript) &&
      Boolean(normalizedLastVoicePartialTranscript) &&
      normalizedFinalVoiceTranscript !== normalizedLastVoicePartialTranscript &&
      !normalizedFinalVoiceTranscript.startsWith(normalizedLastVoicePartialTranscript);
    const voiceSuccessMessage =
      lastVoiceTranscript
        ? voiceTranscriptRefined
          ? `음성 반영 완료 · 최종 보정 ${formatVoicePreview(lastVoiceTranscript)}`
          : `음성 반영 완료 · ${formatVoicePreview(lastVoiceTranscript)}`
        : "음성 반영 완료";
    const voiceSuccessTitle =
      voiceTranscriptRefined
        ? `중간 인식: ${lastVoicePartialTranscript}\n최종 인식: ${lastVoiceTranscript}`
        : lastVoiceTranscript || "음성 반영 완료";
    const voiceLiveMessage =
      !voiceEnabled ? "음성 비활성" :
      voiceError ? `음성 오류: ${voiceError}` :
      voiceSuccessPhase !== "hidden" ? voiceSuccessMessage :
      voicePartialPreview ? `음성 ${voiceStatusDisplayLabel} · ${voicePartialPreview}` :
      `음성 ${voiceStatusDisplayLabel}`;
    const voiceHighlightLength = voiceHighlight ? voiceHighlight.end - voiceHighlight.start : 0;
    const isLongVoiceHighlight = voiceHighlightLength >= VOICE_HIGHLIGHT_LONG_TEXT_THRESHOLD;

    const body =
      isHeavy      ? trimmedInput.slice(2).trimStart() :
      isAgent      ? trimmedInput.replace(/^>>\s?/, "") :
      isAICmd      ? trimmedInput.slice(2) :
      isExplain    ? trimmedInput.slice(2) :
      isForceShell ? trimmedInput.slice(1).trimStart() :
      isForceAI    ? trimmedInput.slice(1).trimStart() :
      null;
    const modeHint = isVisuallyEmpty || isBackendOnly
      ? isBackendOnly
        ? activeModeHint
        : defaultInputHint
      : body !== null && body.trim() === "" && activeModeHint
        ? activeModeHint
        : null;

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
          padding: visibleContextChips.length > 0 ? (compactContextChips ? "4px 10px" : "6px 12px") : "0 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: visibleContextChips.length > 0 ? (compactContextChips ? 3 : 5) : 0,
          minHeight: visibleContextChips.length > 0 ? (compactContextChips ? 48 : 56) : 40,
          cursor: "text",
          boxSizing: "border-box",
          position: "relative",
          transition: "border-color 120ms",
        }}
      >
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
        {visibleContextChips.length > 0 && (
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              alignContent: "flex-start",
              columnGap: 6,
              rowGap: compactContextChips ? 3 : 0,
              flexWrap: compactContextChips ? "wrap" : "nowrap",
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            {visibleContextChips.map((chip) => {
              const primaryChip = chip.id === "route" || chip.id === "backend" || chip.id === "term";
              const summaryChip = chip.id === "__extra_count__";
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
                  fontSize: WARP_SMALL_FONT_SIZE,
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
                  opacity: compactContextChips && summaryChip ? 0.72 : 1,
                  maxWidth: compactContextChips && summaryChip ? 96 : undefined,
                  overflow: compactContextChips && summaryChip ? "hidden" : undefined,
                  textOverflow: compactContextChips && summaryChip ? "ellipsis" : undefined,
                  whiteSpace: compactContextChips && summaryChip ? "nowrap" : undefined,
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
              top: VOICE_FLOATING_STATUS_BANNER_TOP,
              right: VOICE_FLOATING_SUCCESS_BANNER_RIGHT,
              fontSize: WARP_SMALL_FONT_SIZE,
              color: "#ff7b72",
              background: "rgba(248,81,73,0.12)",
              border: "1px solid rgba(248,81,73,0.25)",
              borderRadius: 6,
              padding: "2px 6px 2px 8px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              maxWidth: 420,
            }}
            title={voiceError}
          >
            <span
              style={{
                minWidth: 0,
                flex: 1,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              음성 오류: {voiceError}
            </span>
            <span
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                paddingLeft: 4,
                borderLeft: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <button
                type="button"
                aria-label="복사"
                title="복사"
                onClick={() => {
                  navigator.clipboard?.writeText?.(`음성 오류: ${voiceError}`).catch(() => {});
                }}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 14,
                  height: 14,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.78)",
                  cursor: "pointer",
                  padding: 0,
                  opacity: 0.9,
                }}
              >
                <Copy size={9} />
              </button>
              <button
                type="button"
                aria-label="다시 시도"
                title="다시 시도"
                onClick={handleMicToggle}
                disabled={voiceBusy}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 14,
                  height: 14,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.24)",
                  background: "rgba(255,255,255,0.07)",
                  color: "rgba(248,81,73,0.95)",
                  cursor: voiceBusy ? "wait" : "pointer",
                  padding: 0,
                  opacity: voiceBusy ? 0.55 : 0.98,
                }}
              >
                <RotateCcw size={10} />
              </button>
              <button
                type="button"
                aria-label="닫기"
                title="닫기"
                onClick={clearVoiceError}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 14,
                  height: 14,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.72)",
                  cursor: "pointer",
                  padding: 0,
                  opacity: 0.9,
                }}
              >
                <X size={9} />
              </button>
            </span>
          </div>
        )}

        {!voiceError && voiceSuccessPhase !== "hidden" && (
          <div
            title={voiceSuccessTitle}
            style={{
              position: "absolute",
              top: VOICE_FLOATING_STATUS_BANNER_TOP,
              right: VOICE_FLOATING_BANNER_RIGHT,
              fontSize: WARP_SMALL_FONT_SIZE,
              color: voiceTranscriptRefined ? "rgba(198,255,208,0.96)" : "rgba(166,244,180,0.88)",
              background: voiceTranscriptRefined ? "rgba(46,160,67,0.12)" : "rgba(46,160,67,0.08)",
              border: voiceTranscriptRefined ? "1px solid rgba(63,185,80,0.22)" : "1px solid rgba(63,185,80,0.12)",
              borderRadius: 6,
              padding: "2px 6px",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
              opacity: voiceSuccessPhase === "fading" ? 0 : 1,
              transform: voiceSuccessPhase === "fading" ? "translateY(-1px)" : "translateY(0)",
              transition: `opacity ${VOICE_SUCCESS_FADE_MS}ms ease, transform ${VOICE_SUCCESS_FADE_MS}ms ease`,
              animation: VOICE_BANNER_IN_ANIMATION,
              boxShadow: voiceTranscriptRefined ? "0 8px 20px rgba(16,185,129,0.14)" : "0 6px 16px rgba(0,0,0,0.10)",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background: "rgba(166,244,180,0.88)",
                flexShrink: 0,
              }}
            />
            <span>{voiceSuccessMessage}</span>
            {lastVoiceTranscript && (
              <>
                <button
                  type="button"
                  onClick={copyLastVoiceTranscript}
                  title="마지막 음성 문장을 복사"
                  style={{
                    marginLeft: 2,
                    flexShrink: 0,
                    borderRadius: 5,
                    border: "1px solid rgba(63,185,80,0.14)",
                    background: "rgba(46,160,67,0.08)",
                    color: "rgba(230,255,236,0.82)",
                    padding: "0 5px",
                    fontSize: 10,
                    lineHeight: 1.5,
                    cursor: "pointer",
                  }}
                >
                  {voiceCopyFeedback ? "복사됨" : "복사"}
                </button>
                <button
                  type="button"
                  onClick={restoreLastVoiceTranscript}
                  title="마지막 음성 문장을 다시 입력창에 넣기"
                  style={{
                    marginLeft: 2,
                    flexShrink: 0,
                    borderRadius: 5,
                    border: "1px solid rgba(63,185,80,0.18)",
                    background: "rgba(46,160,67,0.12)",
                    color: "rgba(230,255,236,0.92)",
                    padding: "0 5px",
                    fontSize: 10,
                    lineHeight: 1.5,
                    cursor: "pointer",
                  }}
                >
                  다시 넣기
                </button>
              </>
            )}
          </div>
        )}

        {showVoiceStatusBanner && (
          <div
            style={{
              position: "absolute",
              top: VOICE_FLOATING_BANNER_TOP,
              right: VOICE_FLOATING_BANNER_RIGHT,
              fontSize: WARP_SMALL_FONT_SIZE,
              borderRadius: 6,
              padding: "2px 6px",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
              animation: VOICE_BANNER_IN_ANIMATION,
              boxShadow: "0 6px 16px rgba(0,0,0,0.10)",
              ...voiceStatusTone,
            }}
          >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: voiceStatusTone.color,
                  flexShrink: 0,
                  animation:
                    voiceStatus === "listening" || voiceStatus === "processing"
                      ? VOICE_PULSE_ANIMATION
                      : "none",
                }}
              />
            <span>{voiceStatusDisplayLabel}</span>
            {voicePartialPreview && (
              <span
                style={{
                  minWidth: 0,
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                {voicePartialPreview}
              </span>
            )}
          </div>
        )}

        {!voiceError && recentVoiceTranscripts.length > 0 && voiceStatus === "idle" && (
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              marginTop: 2,
              marginBottom: 1,
            }}
          >
            <span
              style={{
                fontSize: WARP_SMALL_FONT_SIZE,
                color: "rgba(255,255,255,0.42)",
                lineHeight: 1.2,
                flexShrink: 0,
              }}
            >
              최근 음성
            </span>
            {recentVoiceTranscripts.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => reuseRecentVoiceTranscript(item)}
                title={item}
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(88,166,255,0.14)",
                  background: "rgba(88,166,255,0.08)",
                  color: "rgba(214,231,255,0.88)",
                  padding: "1px 7px",
                  fontSize: WARP_SMALL_FONT_SIZE,
                  lineHeight: 1.2,
                  cursor: "pointer",
                  maxWidth: 190,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {formatVoicePreview(item)}
              </button>
            ))}
          </div>
        )}

        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, minHeight: 32 }}>
          <span style={{ color: promptColor, fontFamily, fontSize, opacity: 0.85, flexShrink: 0 }}>
            {promptChar}
          </span>

          <button
            className="lum-voice-mic-btn"
            type="button"
            onClick={handleMicToggle}
            disabled={!voiceEnabled || voiceBusy}
            onMouseEnter={() => setMicHovered(true)}
            onMouseLeave={() => setMicHovered(false)}
            aria-label={`${micActionLabel} · ${micAssistLabel}`}
            aria-pressed={voiceEnabled ? isRecording : undefined}
            title={`${micActionLabel} · ${micAssistLabel}`}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              border:
                !voiceEnabled ? "1px solid rgba(255,255,255,0.10)" :
                voiceStatus === "processing" ? "1px solid rgba(121,192,255,0.28)" :
                micHovered && !voiceBusy ? "1px solid rgba(255,255,255,0.28)" :
                "1px solid rgba(255,255,255,0.16)",
              background:
                !voiceEnabled ? "rgba(255,255,255,0.025)" :
                voiceStatus === "processing" ? "rgba(88,166,255,0.18)" :
                micHovered && !voiceBusy ? "rgba(255,255,255,0.10)" :
                isRecording ? "rgba(248,81,73,0.22)" :
                "rgba(255,255,255,0.06)",
              color:
                !voiceEnabled ? "rgba(255,255,255,0.36)" :
                voiceStatus === "processing" ? "rgba(121,192,255,0.95)" :
                isRecording ? "#ff7b72" :
                "rgba(255,255,255,0.78)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              cursor: !voiceEnabled ? "not-allowed" : voiceBusy ? "wait" : "pointer",
              opacity: !voiceEnabled ? 0.72 : voiceBusy ? 0.55 : 1,
              animation: voiceEnabled && voicePulseActive ? VOICE_PULSE_ANIMATION : "none",
              transform: micHovered && voiceEnabled && !voiceBusy ? "translateY(-1px)" : "translateY(0)",
              boxShadow:
                !voiceEnabled || voiceBusy ? "none" :
                micHovered
                  ? "0 6px 16px rgba(0,0,0,0.22)"
                  : "0 0 0 rgba(0,0,0,0)",
              transition: "background 120ms ease, border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
            }}
          >
            {voiceEnabled && isRecording ? <Mic size={12} /> : <MicOff size={12} />}
          </button>

          {showInlineVoiceStatus && (
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                fontSize: WARP_SMALL_FONT_SIZE,
                lineHeight: 1,
                minHeight: 17,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "1px 6px",
                marginLeft: 2,
                marginRight: 2,
                borderRadius: 999,
                transform: "translateY(0)",
                opacity: !voiceEnabled ? 0.78 : voiceStatus === "idle" ? 0.9 : 0.98,
                ...inlineVoiceTone,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: inlineVoiceTone.color,
                  flexShrink: 0,
                  animation:
                    voiceEnabled && (voiceStatus === "listening" || voiceStatus === "processing")
                      ? VOICE_PULSE_ANIMATION
                      : "none",
                }}
              />
              <span>{inlineVoiceLabel}</span>
            </span>
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
              opacity: isVoiceProcessing ? 0.78 : 1,
              transition: "opacity 120ms ease",
            }}
          >
            {modeHint ? (
              <span style={{ color: "rgba(255,255,255,0.28)" }}>
                {modeHint}
              </span>
            ) : body !== null ? (
              <span style={{ color: TOKEN_COLORS.text }}>{body}</span>
            ) : voiceHighlight && voiceHighlight.start < voiceHighlight.end ? (
              <>
                {tokenizeShell(input.slice(0, voiceHighlight.start)).map((t, idx) => (
                  <span key={`before-${idx}`} style={{ color: TOKEN_COLORS[t.type] }}>{t.text}</span>
                ))}
                <span
                  style={{
                    background: isLongVoiceHighlight
                      ? "linear-gradient(180deg, rgba(88,166,255,0.20), rgba(88,166,255,0.12))"
                      : "rgba(88,166,255,0.16)",
                    borderRadius: 4,
                    boxShadow: isLongVoiceHighlight
                      ? "inset 0 0 0 1px rgba(88,166,255,0.20), 0 0 0 1px rgba(88,166,255,0.12)"
                      : "0 0 0 1px rgba(88,166,255,0.18)",
                    opacity: voiceHighlight.phase === "fading" ? 0 : 1,
                    transition: `opacity ${VOICE_HIGHLIGHT_FADE_MS}ms ease`,
                    padding: isLongVoiceHighlight ? "0 2px" : undefined,
                  }}
                >
                  {tokenizeShell(input.slice(voiceHighlight.start, voiceHighlight.end)).map((t, idx) => (
                    <span key={`focus-${idx}`} style={{ color: TOKEN_COLORS[t.type] }}>{t.text}</span>
                  ))}
                </span>
                {tokenizeShell(input.slice(voiceHighlight.end)).map((t, idx) => (
                  <span key={`after-${idx}`} style={{ color: TOKEN_COLORS[t.type] }}>{t.text}</span>
                ))}
              </>
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
            data-lum-main-input="true"
            value={input}
            readOnly={isVoiceProcessing}
            aria-busy={isVoiceProcessing}
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
              cursor: isVoiceProcessing ? "wait" : "text",
              opacity: isVoiceProcessing ? 0.92 : 1,
            }}
          />
          </div>

          {activeBackendLabel && (
            <button
              type="button"
              aria-label="clear-backend-badge"
              onClick={clearBackendPrefix}
              style={{
                flexShrink: 0,
                fontSize: WARP_SMALL_FONT_SIZE,
                color: activeBackendStyle.color,
                border: activeBackendStyle.border,
                borderRadius: 6,
                padding: "1px 6px",
                lineHeight: 1.2,
                background: activeBackendStyle.background,
                cursor: "pointer",
              }}
              title="현재 백엔드 강제 상태 (Cmd/Ctrl+1~4/0 직접 지정·해제, Cmd/Ctrl+./, 직접 순환, 클릭으로 해제)"
            >
              백엔드 {activeBackendLabel}
            </button>
          )}
        </div>

      </div>
    );
  },
);

WarpInputBar.displayName = "WarpInputBar";
export default WarpInputBar;
