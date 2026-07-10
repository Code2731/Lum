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
import { useVoiceTranscriptHistory } from "../hooks/useVoiceTranscriptHistory";

interface Props {
  onCommandSubmit: (cmd: string, type: "shell" | "ai") => void;
  selectedModel: string;
  xllmOnline: boolean;
  context: { cwd: string; git_branch: string | null };
}

const VOICE_ERROR_FONT_SIZE = 11;
const VOICE_INLINE_BANNER_MARGIN = "0 10px 4px 10px";
const VOICE_INLINE_BANNER_PADDING = "3px 7px";
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
const normalizeVoiceSearchTerm = (text: string) => normalizeVoiceComparisonText(text).toLocaleLowerCase();
const matchesVoiceSearchTerm = (text: string, query: string) =>
  query.length === 0 || normalizeVoiceSearchTerm(text).includes(query);
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
  const [lastVoiceTranscript, setLastVoiceTranscript] = useState("");
  const [lastVoicePartialTranscript, setLastVoicePartialTranscript] = useState("");
  const [voiceHistoryQuery, setVoiceHistoryQuery] = useState("");
  const {
    pinnedVoiceTranscripts,
    recentVoiceTranscripts,
    voiceTranscriptHistory,
    showVoiceTranscriptHistory,
    pushVoiceTranscript,
    removeVoiceTranscript,
    clearVoiceTranscripts,
    toggleVoiceTranscriptHistory,
    togglePinVoiceTranscript,
    movePinnedVoiceTranscript,
    isVoiceTranscriptPinned,
  } = useVoiceTranscriptHistory(context.cwd);
  const [voiceCopyFeedback, setVoiceCopyFeedback] = useState(false);
  const voiceSuccessVisibleTimerRef = useRef<number | null>(null);
  const voiceSuccessFadeTimerRef = useRef<number | null>(null);
  const voiceHighlightVisibleTimerRef = useRef<number | null>(null);
  const voiceHighlightFadeTimerRef = useRef<number | null>(null);
  const voiceCopyFeedbackTimerRef = useRef<number | null>(null);
  const normalizedVoiceHistoryQuery = useMemo(
    () => normalizeVoiceSearchTerm(voiceHistoryQuery),
    [voiceHistoryQuery]
  );
  const filteredPinnedVoiceTranscripts = useMemo(
    () => pinnedVoiceTranscripts.filter((item) => matchesVoiceSearchTerm(item, normalizedVoiceHistoryQuery)),
    [normalizedVoiceHistoryQuery, pinnedVoiceTranscripts]
  );
  const filteredRecentVoiceTranscripts = useMemo(
    () => recentVoiceTranscripts.filter((item) => matchesVoiceSearchTerm(item, normalizedVoiceHistoryQuery)),
    [normalizedVoiceHistoryQuery, recentVoiceTranscripts]
  );
  const filteredVoiceTranscriptHistory = useMemo(
    () => voiceTranscriptHistory.filter((item) => matchesVoiceSearchTerm(item.text, normalizedVoiceHistoryQuery)),
    [normalizedVoiceHistoryQuery, voiceTranscriptHistory]
  );
  const voiceHistoryScopeLabel = context.cwd ? shortPath(context.cwd) : "전역 기록";

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
    setLastVoiceTranscript(t);
    pushVoiceTranscript(t);
    setValue((prev) => {
      const joined = prev.trim() ? `${prev} ${t}` : t;
      showVoiceHighlight(joined.length - t.length, joined.length);
      return joined;
    });
    showVoiceSuccess();
  };

  const restoreLastVoiceTranscript = () => {
    const t = lastVoiceTranscript.trim();
    if (!t) return;
    setValue((prev) => {
      const joined = prev.trim() ? `${prev} ${t}` : t;
      showVoiceHighlight(joined.length - t.length, joined.length);
      return joined;
    });
    const editor = document.getElementById("command-editor-textarea");
    if (editor instanceof HTMLTextAreaElement) {
      editor.focus();
    }
  };

  const replaceWithLastVoiceTranscript = () => {
    const t = lastVoiceTranscript.trim();
    if (!t) return;
    setValue(t);
    showVoiceHighlight(0, t.length);
    const editor = document.getElementById("command-editor-textarea");
    if (editor instanceof HTMLTextAreaElement) {
      editor.focus();
    }
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
    setValue((prev) => {
      const joined = prev.trim() ? `${prev} ${t}` : t;
      showVoiceHighlight(joined.length - t.length, joined.length);
      return joined;
    });
    const editor = document.getElementById("command-editor-textarea");
    if (editor instanceof HTMLTextAreaElement) {
      editor.focus();
    }
  };

  const removeRecentVoiceTranscript = (text: string) => {
    removeVoiceTranscript(text);
  };

  const clearRecentVoiceTranscripts = () => {
    clearVoiceTranscripts();
    setVoiceHistoryQuery("");
  };

  const submitVoiceTranscript = (text: string, type: "shell" | "ai") => {
    const t = text.trim();
    if (!t) return;
    const historyValue = type === "ai" ? `/ ${t}` : t;
    setHistory((prev) =>
      [historyValue, ...prev.filter((item) => item !== historyValue)].slice(0, 100),
    );
    setHistoryIdx(-1);
    onCommandSubmit(t, type);
    setValue("");
    setShowCompletions(false);
  };

  const replaceInputWithVoiceTranscript = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setValue(t);
    showVoiceHighlight(0, t.length);
    const editor = document.getElementById("command-editor-textarea");
    if (editor instanceof HTMLTextAreaElement) {
      editor.focus();
    }
  };

  const copyVoiceTranscriptItem = (text: string) => {
    const t = text.trim();
    if (!t) return;
    navigator.clipboard?.writeText?.(t).catch(() => {});
  };

  const formatVoiceHistoryTime = (createdAt: number) =>
    new Date(createdAt).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const { isRecording, voiceBusy, voiceError, voicePartialTranscript, voiceStatus, handleMicToggle, clearVoiceError } = useVoiceInput({
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
  const voiceStatusToneClass =
    voiceError ? "text-red-300 bg-red-500/15 border-red-400/25" :
    voiceStatus === "listening" ? "text-emerald-200 bg-emerald-500/18 border-emerald-400/35" :
    voiceStatus === "processing" ? "text-sky-200 bg-sky-500/20 border-sky-400/40" :
    "text-white/75 bg-white/12 border-white/20";
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
  const voicePulseActive = voiceStatus === "listening" || voiceStatus === "processing";
  const isVoiceProcessing = voiceStatus === "processing";
  const showVoiceStatusBanner =
    !voiceError &&
    voiceSuccessPhase === "hidden" &&
    voiceStatus !== "idle";
  const showInlineVoiceStatus = !voiceError && voiceSuccessPhase === "hidden" && voiceStatus === "idle";
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
                opacity: !voiceEnabled ? 0.82 : voiceStatus === "idle" ? 0.9 : 0.98,
                gap: 3,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background:
                    !voiceEnabled ? "rgba(255,255,255,0.46)" :
                    voiceStatus === "listening" ? "rgba(142,241,160,0.98)" :
                    voiceStatus === "processing" ? "rgba(145,205,255,0.98)" :
                    "rgba(255,255,255,0.72)",
                  flexShrink: 0,
                  animation:
                    voiceEnabled && (voiceStatus === "listening" || voiceStatus === "processing")
                      ? VOICE_PULSE_ANIMATION
                      : "none",
                }}
              />
              <span>{voiceStatusDisplayLabel}</span>
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
            <span className="voice-error-text" style={{ minWidth: 0, flex: 1, paddingRight: 3 }}>
              음성 오류: {voiceError}
            </span>
            <span
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                paddingLeft: 6,
                paddingRight: 4,
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                transform: "translateY(0.5px)",
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
            title={voiceSuccessTitle}
            style={{
              margin: VOICE_INLINE_BANNER_MARGIN,
              padding: VOICE_INLINE_BANNER_PADDING,
              borderRadius: 6,
              fontSize: VOICE_ERROR_FONT_SIZE,
              lineHeight: 1.3,
              display: "flex",
              alignItems: "center",
              gap: "5px",
              color: voiceTranscriptRefined ? "rgba(198,255,208,0.96)" : "rgba(166,244,180,0.88)",
              background: voiceTranscriptRefined ? "rgba(46,160,67,0.12)" : "rgba(46,160,67,0.08)",
              border: voiceTranscriptRefined ? "1px solid rgba(63,185,80,0.22)" : "1px solid rgba(63,185,80,0.12)",
              opacity: voiceSuccessPhase === "fading" ? 0 : 1,
              transform: voiceSuccessPhase === "fading" ? "translateY(-1px)" : "translateY(0)",
              transition: `opacity ${VOICE_SUCCESS_FADE_MS}ms ease, transform ${VOICE_SUCCESS_FADE_MS}ms ease`,
              animation: VOICE_BANNER_IN_ANIMATION,
              boxShadow: voiceTranscriptRefined ? "0 8px 20px rgba(16,185,129,0.14)" : "0 6px 16px rgba(0,0,0,0.12)",
            }}
          >
            <span style={{ minWidth: 0, flex: 1 }}>{voiceSuccessMessage}</span>
            {lastVoiceTranscript && (
              <>
                <button
                  type="button"
                  onClick={copyLastVoiceTranscript}
                  className="shrink-0 rounded border border-emerald-400/16 bg-emerald-500/8 px-1.5 py-0.5 text-[10px] text-emerald-50/90 hover:bg-emerald-500/16 transition-colors"
                  title="마지막 음성 문장을 복사"
                >
                  {voiceCopyFeedback ? "복사됨" : "복사"}
                </button>
                <button
                  type="button"
                  onClick={restoreLastVoiceTranscript}
                  className="shrink-0 rounded border border-emerald-400/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-100 hover:bg-emerald-500/20 transition-colors"
                  title="마지막 음성 문장을 다시 입력창에 넣기"
                >
                  다시 넣기
                </button>
                <button
                  type="button"
                  onClick={replaceWithLastVoiceTranscript}
                  className="shrink-0 rounded border border-emerald-400/24 bg-emerald-500/14 px-1.5 py-0.5 text-[10px] text-emerald-100 hover:bg-emerald-500/24 transition-colors"
                  title="현재 입력을 마지막 음성 문장으로 치환"
                >
                  치환
                </button>
              </>
            )}
          </div>
        )}

        {!voiceError && (recentVoiceTranscripts.length > 0 || pinnedVoiceTranscripts.length > 0 || voiceTranscriptHistory.length > 0) && voiceStatus === "idle" && (
          <div
            style={{
              margin: VOICE_INLINE_BANNER_MARGIN,
              marginTop: "0",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(88,166,255,0.12)",
                  background: "rgba(88,166,255,0.06)",
                  color: "rgba(214,231,255,0.76)",
                  padding: "2px 7px",
                  fontSize: 10,
                  lineHeight: 1.2,
                }}
              >
                {voiceHistoryScopeLabel}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.42)",
                  lineHeight: 1.2,
                }}
              >
                고정 {pinnedVoiceTranscripts.length} · 최근 {recentVoiceTranscripts.length} · 기록 {voiceTranscriptHistory.length}
              </span>
              <input
                type="text"
                value={voiceHistoryQuery}
                onChange={(event) => setVoiceHistoryQuery(event.target.value)}
                placeholder="고정/기록 검색"
                style={{
                  minWidth: 0,
                  flex: "1 1 180px",
                  maxWidth: 260,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.86)",
                  padding: "4px 9px",
                  fontSize: 11,
                  lineHeight: 1.3,
                  outline: "none",
                }}
              />
              {normalizedVoiceHistoryQuery && (
                <>
                  <span
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.48)",
                      lineHeight: 1.2,
                    }}
                  >
                    {filteredPinnedVoiceTranscripts.length + filteredRecentVoiceTranscripts.length + filteredVoiceTranscriptHistory.length}개 표시
                  </span>
                  <button
                    type="button"
                    onClick={() => setVoiceHistoryQuery("")}
                    title="음성 검색 지우기"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      color: "rgba(255,255,255,0.64)",
                      cursor: "pointer",
                    }}
                  >
                    <X size={10} />
                  </button>
                </>
              )}
            </div>
            {filteredPinnedVoiceTranscripts.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "rgba(255,215,100,0.78)",
                    lineHeight: 1.2,
                  }}
                >
                  고정 음성
                </span>
                {filteredPinnedVoiceTranscripts.map((item) => {
                  const pinnedIndex = pinnedVoiceTranscripts.indexOf(item);
                  const canMoveUp = pinnedIndex > 0;
                  const canMoveDown = pinnedIndex >= 0 && pinnedIndex < pinnedVoiceTranscripts.length - 1;
                  return (
                    <span
                      key={`pinned-${item}`}
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(255,215,100,0.18)",
                        background: "rgba(255,215,100,0.08)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 5px 2px 7px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => reuseRecentVoiceTranscript(item)}
                        title={item}
                        style={{
                          color: "rgba(255,244,214,0.92)",
                          fontSize: 10,
                          lineHeight: 1.2,
                          cursor: "pointer",
                          maxWidth: 156,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                        }}
                      >
                        {formatVoicePreview(item)}
                      </button>
                      <button
                        type="button"
                        disabled={!canMoveUp}
                        onClick={() => movePinnedVoiceTranscript(item, -1)}
                        title="위로 이동"
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.05)",
                          color: canMoveUp ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.28)",
                          padding: "0 4px",
                          fontSize: 9,
                          lineHeight: 1.4,
                          cursor: canMoveUp ? "pointer" : "default",
                        }}
                      >
                        위
                      </button>
                      <button
                        type="button"
                        disabled={!canMoveDown}
                        onClick={() => movePinnedVoiceTranscript(item, 1)}
                        title="아래로 이동"
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.05)",
                          color: canMoveDown ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.28)",
                          padding: "0 4px",
                          fontSize: 9,
                          lineHeight: 1.4,
                          cursor: canMoveDown ? "pointer" : "default",
                        }}
                      >
                        아래
                      </button>
                      <button
                        type="button"
                        onClick={() => copyVoiceTranscriptItem(item)}
                        title="고정 음성 복사"
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(255,255,255,0.06)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          color: "rgba(255,255,255,0.72)",
                          cursor: "pointer",
                        }}
                      >
                        <Copy size={8} />
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePinVoiceTranscript(item)}
                        title="고정 해제"
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(255,215,100,0.16)",
                          background: "rgba(255,215,100,0.10)",
                          color: "rgba(255,230,160,0.86)",
                          padding: "0 5px",
                          fontSize: 9,
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        해제
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.44)",
                  lineHeight: 1.2,
                }}
              >
                최근 음성
              </span>
              {voiceTranscriptHistory.length > 0 && (
                <button
                  type="button"
                  onClick={toggleVoiceTranscriptHistory}
                  title="세션 음성 기록 펼치기"
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(88,166,255,0.14)",
                    background: showVoiceTranscriptHistory ? "rgba(88,166,255,0.12)" : "rgba(88,166,255,0.06)",
                    color: "rgba(214,231,255,0.74)",
                    padding: "1px 6px",
                    fontSize: 10,
                    lineHeight: 1.2,
                    cursor: "pointer",
                  }}
                >
                  {showVoiceTranscriptHistory ? "기록 접기" : `기록 ${voiceTranscriptHistory.length}개`}
                </button>
              )}
              <button
                type="button"
                onClick={clearRecentVoiceTranscripts}
                title="최근 음성 전체 지우기"
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.56)",
                  padding: "1px 6px",
                  fontSize: 10,
                  lineHeight: 1.2,
                  cursor: "pointer",
                }}
              >
                전체 지우기
              </button>
              {filteredRecentVoiceTranscripts.map((item) => (
                <span
                  key={item}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(88,166,255,0.16)",
                    background: "rgba(88,166,255,0.08)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 5px 2px 7px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => reuseRecentVoiceTranscript(item)}
                    title={item}
                    style={{
                      color: "rgba(214,231,255,0.88)",
                      fontSize: 10,
                      lineHeight: 1.2,
                      cursor: "pointer",
                      maxWidth: 156,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                    }}
                  >
                    {formatVoicePreview(item)}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyVoiceTranscriptItem(item)}
                    title="이 음성 문장 복사"
                    style={{
                      flexShrink: 0,
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.72)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <Copy size={8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRecentVoiceTranscript(item)}
                    title="이 음성 문장 숨기기"
                    style={{
                      flexShrink: 0,
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.60)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <X size={8} />
                  </button>
                </span>
              ))}
            </div>
            {showVoiceTranscriptHistory && voiceTranscriptHistory.length > 0 && (
              <div
                className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {filteredVoiceTranscriptHistory.length > 0 ? filteredVoiceTranscriptHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-white/6 bg-black/10 px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2 text-[10px] leading-none text-white/42">
                        <span>{formatVoiceHistoryTime(item.createdAt)}</span>
                        <span>세션 기록</span>
                        {isVoiceTranscriptPinned(item.text) && <span className="text-amber-200/80">고정됨</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => reuseRecentVoiceTranscript(item.text)}
                        title={item.text}
                        className="block max-w-full truncate bg-transparent p-0 text-left text-[11px] text-slate-100/90 transition-colors hover:text-slate-50"
                      >
                        {item.text}
                      </button>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => submitVoiceTranscript(item.text, "ai")}
                        className="rounded border border-fuchsia-300/16 bg-fuchsia-400/8 px-1.5 py-0.5 text-[10px] text-fuchsia-100/84 transition-colors hover:bg-fuchsia-400/16"
                      >
                        AI 전송
                      </button>
                      <button
                        type="button"
                        onClick={() => submitVoiceTranscript(item.text, "shell")}
                        className="rounded border border-amber-300/16 bg-amber-400/8 px-1.5 py-0.5 text-[10px] text-amber-100/84 transition-colors hover:bg-amber-400/16"
                      >
                        셸 전송
                      </button>
                      <button
                        type="button"
                        onClick={() => reuseRecentVoiceTranscript(item.text)}
                        className="rounded border border-sky-400/15 bg-sky-500/8 px-1.5 py-0.5 text-[10px] text-sky-100/88 transition-colors hover:bg-sky-500/16"
                      >
                        다시 넣기
                      </button>
                      <button
                        type="button"
                        onClick={() => replaceInputWithVoiceTranscript(item.text)}
                        className="rounded border border-emerald-400/18 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-100/88 transition-colors hover:bg-emerald-500/18"
                      >
                        치환
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePinVoiceTranscript(item.text)}
                        className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                          isVoiceTranscriptPinned(item.text)
                            ? "border-amber-300/20 bg-amber-400/10 text-amber-100/88 hover:bg-amber-400/18"
                            : "border-amber-300/14 bg-amber-400/6 text-amber-100/72 hover:bg-amber-400/14"
                        }`}
                      >
                        {isVoiceTranscriptPinned(item.text) ? "고정 해제" : "고정"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyVoiceTranscriptItem(item.text)}
                        className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/72 transition-colors hover:bg-white/10"
                      >
                        복사
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecentVoiceTranscript(item.text)}
                        className="rounded border border-rose-400/14 bg-rose-500/8 px-1.5 py-0.5 text-[10px] text-rose-100/80 transition-colors hover:bg-rose-500/16"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-md border border-dashed border-white/8 bg-black/10 px-2 py-2 text-[11px] text-white/46">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            )}
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
              {voiceStatusDisplayLabel}
            </span>
            {voicePartialPreview && (
              <span
                style={{
                  minWidth: 0,
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                {voicePartialPreview}
              </span>
            )}
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
