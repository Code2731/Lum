import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Mic, MicOff, Copy, RotateCcw, X } from "lucide-react";
import { tokenizeShell, TOKEN_COLORS } from "../utils/shellSyntax";
import {
  applyBackendPrefixToInput,
  clearBackendPrefixFromInput,
  detectBackendPrefixFromInput,
  isBackendOnlyInput,
} from "../utils/backendPrefix";
import { shortPath } from "../utils";
import { routeInput } from "../utils/inputRouter";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { useVoiceTranscriptHistory } from "../hooks/useVoiceTranscriptHistory";

export interface WarpInputBarHandle {
  focus: () => void;
  setValue: (v: string) => void;
  getValue: () => string;
}

export function getWarpDefaultInputHint(compactContextChips: boolean): string {
  return compactContextChips
    ? "질문·명령 입력 · 필요 시 ! @ >>"
    : "질문은 AI, 명령은 실행 · 필요 시 ! @ >> # ? · 백엔드 선택과 단축키도 바로 지원";
}

export function getWarpActiveModeHint(input: {
  activeBackend: "local" | "ollama" | "xllm" | "gemini" | null;
  isBackendOnly: boolean;
  isHeavy: boolean;
  isAgent: boolean;
  isAICmd: boolean;
  isExplain: boolean;
  isForceShell: boolean;
  isForceAI: boolean;
}): string | null {
  if (input.isBackendOnly && input.activeBackend) {
    return input.activeBackend === "local"
      ? "LOCAL(mistral.rs 엔진)이 선택되었습니다. 설치된 로컬 모델(Qwen 등)로만 처리되며 xLLM에는 연결하지 않습니다."
      : `${input.activeBackend.toUpperCase()} 백엔드가 선택되었습니다. 내용을 입력하고 Enter를 누르면 바로 이 경로로 처리됩니다.`;
  }
  if (input.isHeavy) return "헤비 AI 모드입니다. 긴 작업 지시나 넓은 문맥 분석에 적합합니다.";
  if (input.isAgent) return "에이전트 모드입니다. 작업 지시를 입력하면 ReAct 흐름으로 실행합니다.";
  if (input.isAICmd) return "AI 제안 모드입니다. 질문을 입력하면 제안/명령 추천 흐름으로 이어집니다.";
  if (input.isExplain) return "설명 모드입니다. 개념이나 에러 의미를 해설 중심으로 답합니다.";
  if (input.isForceShell) return "셸 강제 모드입니다. 입력 내용을 바로 터미널 명령으로 실행합니다.";
  if (input.isForceAI) return "AI 강제 모드입니다. 입력 내용을 바로 AI 질의로 보냅니다.";
  return null;
}

export function getWarpModeExample(input: {
  activeBackend: "local" | "ollama" | "xllm" | "gemini" | null;
  isBackendOnly: boolean;
  isHeavy: boolean;
  isAgent: boolean;
  isAICmd: boolean;
  isExplain: boolean;
  isForceShell: boolean;
  isForceAI: boolean;
  looksShell: boolean;
  isEffectivelyEmpty: boolean;
}): string {
  if (input.isBackendOnly && input.activeBackend) {
    return `예: ${input.activeBackend === "local" ? "코드베이스 구조 요약해줘" : "이 에러 원인 분석해줘"}`;
  }
  if (input.isHeavy) return "예: !! 이 저장소의 아키텍처 병목과 리팩터 우선순위를 정리해줘";
  if (input.isAgent) return "예: >> 로그인 모달 접근성 문제를 찾아서 수정해줘";
  if (input.isAICmd) return "예: # 방금 실패한 테스트를 고치기 위한 명령 3개 추천";
  if (input.isExplain) return "예: ? 이 Rust 에러 메시지가 의미하는 바를 설명해줘";
  if (input.isForceShell) return "예: ! npm run tauri dev";
  if (input.isForceAI) return "예: @ 이 컴포넌트 구조를 개선할 방법 제안해줘";
  if (input.looksShell && !input.isEffectivelyEmpty) return "예: git status, npm test, cargo check";
  return "예: 버그 원인 분석해줘 · src/components/AppHeader.tsx 구조 설명해줘 · npm run tauri dev";
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
const VOICE_SCOPE_EXPANDED_STORAGE_KEY = "lum.voiceHistory.warp.scopeExpanded";

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
const loadStoredVoiceScopeExpanded = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(VOICE_SCOPE_EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};
const formatVoiceScopeRecentHint = (ts: number) => {
  if (!ts) return "";
  const diffMs = Math.max(0, Date.now() - ts);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
};
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
  voiceHistoryScope?: string;
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
  ({ fontFamily, fontSize, voiceHistoryScope, onSubmit, onInterrupt, onTab, onChange, onFocusChange, onKeyDownIntercept, voiceEnabled = true, compactContextChips = false, contextChips = [] }, ref) => {
    const [input, setInput] = useState("");
    const [isComposing, setIsComposing] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [micHovered, setMicHovered] = useState(false);
    const [voiceSuccessPhase, setVoiceSuccessPhase] = useState<"hidden" | "visible" | "fading">("hidden");
    const [voiceHighlight, setVoiceHighlight] = useState<{ start: number; end: number; phase: "visible" | "fading" } | null>(null);
    const [lastVoiceTranscript, setLastVoiceTranscript] = useState("");
    const [lastVoicePartialTranscript, setLastVoicePartialTranscript] = useState("");
    const [voiceHistoryQuery, setVoiceHistoryQuery] = useState("");
    const [voiceHistoryScopeOverride, setVoiceHistoryScopeOverride] = useState<string | null>(null);
    const [showAllVoiceHistoryScopes, setShowAllVoiceHistoryScopes] = useState(loadStoredVoiceScopeExpanded);
    const [embeddedModelKey, setEmbeddedModelKey] = useState<string | null>(null);
    const [embeddedLoadState, setEmbeddedLoadState] = useState<"idle" | "loading" | "failed">("idle");
    const [embeddedLoadMessage, setEmbeddedLoadMessage] = useState<string | null>(null);
    const effectiveVoiceHistoryScope = voiceHistoryScopeOverride ?? voiceHistoryScope ?? null;
    const {
      activeVoiceHistoryScope,
      availableVoiceHistoryScopes,
      findMatchingVoiceHistoryScopes,
      pinnedVoiceTranscriptsCollapsed,
      pinnedVoiceTranscripts,
      recentVoiceTranscripts,
      voiceTranscriptHistory,
      showVoiceTranscriptHistory,
      pushVoiceTranscript,
      removeVoiceTranscript,
      clearVoiceTranscripts,
      toggleVoiceTranscriptHistory,
      togglePinnedVoiceTranscriptsCollapsed,
      togglePinVoiceTranscript,
      movePinnedVoiceTranscript,
      movePinnedVoiceTranscriptToEdge,
      setPinnedVoiceTranscriptLabel,
      getPinnedVoiceTranscriptLabel,
      isVoiceTranscriptPinned,
    } = useVoiceTranscriptHistory(effectiveVoiceHistoryScope);
    const [voiceCopyFeedback, setVoiceCopyFeedback] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const voiceSuccessVisibleTimerRef = useRef<number | null>(null);
    const voiceSuccessFadeTimerRef = useRef<number | null>(null);
    const voiceHighlightVisibleTimerRef = useRef<number | null>(null);
    const voiceHighlightFadeTimerRef = useRef<number | null>(null);
    const voiceCopyFeedbackTimerRef = useRef<number | null>(null);
    const previousVoiceHistoryScopeRef = useRef(activeVoiceHistoryScope);
    const history = useRef<string[]>([]);
    const historyIdx = useRef<number>(-1);
    const onChangeRef = useRef(onChange);
    const normalizedVoiceHistoryQuery = React.useMemo(
      () => normalizeVoiceSearchTerm(voiceHistoryQuery),
      [voiceHistoryQuery]
    );
    const matchesScopedVoiceSearch = (text: string) => {
      if (matchesVoiceSearchTerm(text, normalizedVoiceHistoryQuery)) {
        return true;
      }
      const label = getPinnedVoiceTranscriptLabel(text);
      return label.length > 0 && matchesVoiceSearchTerm(label, normalizedVoiceHistoryQuery);
    };
    const filteredPinnedVoiceTranscripts = React.useMemo(
      () => pinnedVoiceTranscripts.filter((item) => matchesScopedVoiceSearch(item)),
      [normalizedVoiceHistoryQuery, pinnedVoiceTranscripts]
    );
    const filteredRecentVoiceTranscripts = React.useMemo(
      () => recentVoiceTranscripts.filter((item) => matchesScopedVoiceSearch(item)),
      [normalizedVoiceHistoryQuery, recentVoiceTranscripts]
    );
    const filteredVoiceTranscriptHistory = React.useMemo(
      () => voiceTranscriptHistory.filter((item) => matchesScopedVoiceSearch(item.text)),
      [normalizedVoiceHistoryQuery, voiceTranscriptHistory]
    );
    const currentVoiceHistoryScopeKey = (voiceHistoryScope ?? "").trim().replace(/\\/g, "/") || "__global__";
    const isVoiceHistoryScopeOverridden = activeVoiceHistoryScope !== currentVoiceHistoryScopeKey;
    const voiceHistoryScopeLabel =
      activeVoiceHistoryScope === "__global__" ? "전역 기록" : shortPath(activeVoiceHistoryScope);
    const visibleVoiceHistoryScopes = showAllVoiceHistoryScopes
      ? availableVoiceHistoryScopes
      : availableVoiceHistoryScopes.slice(0, 4);
    const otherMatchingVoiceHistoryScopes = React.useMemo(
      () =>
        normalizedVoiceHistoryQuery
          ? findMatchingVoiceHistoryScopes(normalizedVoiceHistoryQuery)
              .filter((scopeInfo) => scopeInfo.scopeKey !== activeVoiceHistoryScope)
              .slice(0, 3)
          : [],
      [activeVoiceHistoryScope, findMatchingVoiceHistoryScopes, normalizedVoiceHistoryQuery]
    );
    const collapsedPinnedVoiceSummary = React.useMemo(() => {
      const preview = filteredPinnedVoiceTranscripts
        .slice(0, 2)
        .map((item) => getPinnedVoiceTranscriptLabel(item) || formatVoicePreview(item))
        .join(" · ");
      const suffix = filteredPinnedVoiceTranscripts.length > 2 ? ` +${filteredPinnedVoiceTranscripts.length - 2}` : "";
      return `${filteredPinnedVoiceTranscripts.length}개${preview ? ` · ${preview}${suffix}` : ""}`;
    }, [filteredPinnedVoiceTranscripts, getPinnedVoiceTranscriptLabel]);

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

    useEffect(() => {
      if (previousVoiceHistoryScopeRef.current === activeVoiceHistoryScope) {
        return;
      }
      previousVoiceHistoryScopeRef.current = activeVoiceHistoryScope;
      setVoiceHistoryQuery("");
    }, [activeVoiceHistoryScope]);

    useEffect(() => {
      if (typeof window === "undefined") return;
      try {
        window.sessionStorage.setItem(VOICE_SCOPE_EXPANDED_STORAGE_KEY, showAllVoiceHistoryScopes ? "1" : "0");
      } catch {}
    }, [showAllVoiceHistoryScopes]);

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
    useEffect(() => {
      if (activeBackend !== "local") return;
      let active = true;
      let unlistenProgress: (() => void) | null = null;
      const refreshEmbeddedModelStatus = () => {
        invoke<string | null>("embed_loaded_info")
          .then((key) => {
            if (!active) return;
            setEmbeddedModelKey(key);
            if (key) {
              setEmbeddedLoadState("idle");
              setEmbeddedLoadMessage(null);
            }
          })
          .catch(() => {
            if (active) setEmbeddedModelKey(null);
          });
      };
      refreshEmbeddedModelStatus();
      listen<string>("embed_load_progress", (event) => {
        if (!active) return;
        if (event.payload.startsWith("🔄")) {
          setEmbeddedLoadState("loading");
          setEmbeddedLoadMessage(event.payload);
        } else if (event.payload.startsWith("❌")) {
          setEmbeddedLoadState("failed");
          setEmbeddedLoadMessage(event.payload);
        } else if (event.payload.startsWith("✅")) {
          setEmbeddedLoadState("idle");
          setEmbeddedLoadMessage(event.payload);
          refreshEmbeddedModelStatus();
        }
      }).then((unlisten) => {
        if (active) unlistenProgress = unlisten;
        else unlisten();
      }).catch(() => {});
      // 자동 복원 중일 때만 재확인한다. 준비 완료 뒤에는 이벤트로만 상태를 갱신한다.
      const timer = embeddedModelKey
        ? null
        : window.setInterval(refreshEmbeddedModelStatus, 1500);
      return () => {
        active = false;
        if (timer !== null) window.clearInterval(timer);
        unlistenProgress?.();
      };
    }, [activeBackend, embeddedModelKey]);
    const isBackendOnly =
      isBackendOnlyInput(input);
    const isEffectivelyEmpty = isVisuallyEmpty || isBackendOnly;
    // 실제 실행 경로와 동일한 판정 결과를 노출해, Enter 전에도 자동 라우팅을 예고한다.
    const resolvedRoute = React.useMemo(() => routeInput(input), [input]);
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
    const defaultInputHint = getWarpDefaultInputHint(compactContextChips);
    const activeModeHint = getWarpActiveModeHint({
      activeBackend,
      isBackendOnly,
      isHeavy,
      isAgent,
      isAICmd,
      isExplain,
      isForceShell,
      isForceAI,
    });
    const activeModeExample = getWarpModeExample({
      activeBackend,
      isBackendOnly,
      isHeavy,
      isAgent,
      isAICmd,
      isExplain,
      isForceShell,
      isForceAI,
      looksShell,
      isEffectivelyEmpty,
    });
    const exampleLabel = compactContextChips ? "ex" : "example";
    const visibleModeExample = compactContextChips
      ? activeModeExample
          .replace(/^예:\s*/, "")
          .replace(/\s*·\s*/g, " / ")
      : activeModeExample;
    const voiceHistorySummaryLabel = compactContextChips
      ? `고 ${pinnedVoiceTranscripts.length} · 최 ${recentVoiceTranscripts.length} · 기 ${voiceTranscriptHistory.length}`
      : `고정 ${pinnedVoiceTranscripts.length} · 최근 ${recentVoiceTranscripts.length} · 기록 ${voiceTranscriptHistory.length}`;
    const restoreVoiceScopeLabel = compactContextChips ? "현재로" : "현재 프로젝트로 복귀";
    const compactVoiceHistoryScopeLabel =
      activeVoiceHistoryScope === "__global__" ? "전역" : "프로젝트";
    const hasActiveRouteMode =
      isHeavy || isAgent || isAICmd || isExplain || isForceShell || isForceAI || isBackendOnly || activeBackend !== null;
    const hasTypedInput = input.trim().length > 0;
    // 빈 입력창은 하나의 명확한 입력 행동만 남긴다. 프리픽스/팔레트는 언제든 사용할 수 있고,
    // 실제 입력이나 강제 라우팅이 시작된 경우에만 즉시 전환 버튼을 보여준다.
    const showQuickRouteControls = hasActiveRouteMode || hasTypedInput;
    const showModeSummaryRow = !compactContextChips || hasActiveRouteMode || hasTypedInput;
    const showExampleRow = !compactContextChips || hasActiveRouteMode || hasTypedInput;
    const showPinnedVoiceExpanded = !compactContextChips || !pinnedVoiceTranscriptsCollapsed;
    const showRecentVoiceExpanded = !compactContextChips || showVoiceTranscriptHistory;
    const showVoiceScopeControls =
      !compactContextChips
      || isVoiceHistoryScopeOverridden
      || showVoiceTranscriptHistory
      || normalizedVoiceHistoryQuery.length > 0;
    const showVoiceSearchInput =
      !compactContextChips
      || showVoiceTranscriptHistory
      || normalizedVoiceHistoryQuery.length > 0;

    const activeBackendStyle = activeBackend === "local"
      ? { color: "rgba(121,192,255,0.95)", border: "1px solid rgba(88,166,255,0.35)", background: "rgba(88,166,255,0.12)" }
      : activeBackend === "ollama"
        ? { color: "rgba(111,227,132,0.95)", border: "1px solid rgba(63,185,80,0.35)", background: "rgba(63,185,80,0.12)" }
        : activeBackend === "xllm"
          ? { color: "rgba(121,192,255,0.95)", border: "1px solid rgba(121,192,255,0.35)", background: "rgba(121,192,255,0.12)" }
          : { color: "rgba(233,194,105,0.96)", border: "1px solid rgba(227,179,65,0.35)", background: "rgba(227,179,65,0.12)" };
    const backendQuickActions: Array<{
      id: "local" | "ollama" | "xllm" | "gemini";
      label: string;
      shortLabel: string;
      tone: "accent" | "success" | "warn";
    }> = [
      { id: "local", label: "Local", shortLabel: "L", tone: "accent" },
      { id: "ollama", label: "Ollama", shortLabel: "O", tone: "success" },
      { id: "xllm", label: "xLLM", shortLabel: "X", tone: "accent" },
      { id: "gemini", label: "Gemini", shortLabel: "G", tone: "warn" },
    ];
    const visibleBackendQuickActions = compactContextChips
      ? backendQuickActions.filter((action) =>
          action.id === "local" || action.id === "xllm" || action.id === activeBackend)
      : backendQuickActions;
    const prefixQuickActions: Array<{
      id: "shell" | "ai" | "agent" | "explain" | "aicmd";
      label: string;
      shortLabel: string;
      active: boolean;
      tone: "accent" | "success" | "warn";
      title: string;
    }> = [
      {
        id: "shell",
        label: "!",
        shortLabel: "!",
        active: isForceShell,
        tone: "success",
        title: "셸 강제 모드",
      },
      {
        id: "ai",
        label: "@",
        shortLabel: "@",
        active: isForceAI,
        tone: "accent",
        title: "AI 강제 모드",
      },
      {
        id: "agent",
        label: ">>",
        shortLabel: "≫",
        active: isAgent,
        tone: "warn",
        title: "에이전트 모드",
      },
      {
        id: "explain",
        label: "?",
        shortLabel: "?",
        active: isExplain,
        tone: "success",
        title: "설명 모드",
      },
      {
        id: "aicmd",
        label: "#",
        shortLabel: "#",
        active: isAICmd,
        tone: "accent",
        title: "AI 제안 모드",
      },
    ];
    const visiblePrefixQuickActions = compactContextChips
      ? prefixQuickActions.filter((action) =>
          action.active || action.id === "shell" || action.id === "ai" || action.id === "agent")
      : prefixQuickActions;

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
    const applyQuickRouteMode = (mode: "shell" | "ai" | "agent" | "explain" | "aicmd") => {
      const stripped = input.replace(/^(?:>>|!|@|#|\?)\s*/, "");
      const nextPrefix =
        mode === "shell"
          ? "!"
          : mode === "ai"
            ? "@"
            : mode === "agent"
              ? ">>"
              : mode === "explain"
                ? "?"
                : "#";
      const next = prefixQuickActions.find((action) => action.id === mode)?.active
        ? stripped
        : `${nextPrefix} ${stripped}`.trimEnd();
      setInput(next);
      onChange?.(next);
    };
    const visibleContextChips = React.useMemo(() => {
      if (!compactContextChips) return contextChips;
      const primaryIds = new Set(["route", "backend", "term"]);
      const primary = contextChips.filter((chip) => primaryIds.has(chip.id));
      const emphasized = contextChips.filter(
        (chip) => chip.tone === "accent" || chip.tone === "success" || chip.tone === "warn",
      );
      const visible = [...primary];
      emphasized.forEach((chip) => {
        if (visible.some((item) => item.id === chip.id)) return;
        visible.push(chip);
      });
      const limitedVisible = visible.slice(0, 4);
      const extraCount = contextChips.length - limitedVisible.length;
      if (extraCount <= 0) return limitedVisible;
      return [
        ...limitedVisible,
        {
          id: "__extra_count__",
          label: `추가 ${extraCount}개`,
          tone: "neutral" as const,
        },
      ];
    }, [compactContextChips, contextChips]);
    const modeSummaryChips = React.useMemo(() => {
      const chips: Array<{
        id: string;
        label: string;
        tone: "neutral" | "accent" | "success" | "warn";
        title: string;
      }> = [];

      const routeChip = activeHeavy
        ? {
            id: "mode-heavy",
            label: "헤비 AI",
            tone: "accent" as const,
            title: "긴 작업이나 큰 문맥 분석을 바로 헤비 트랙으로 보냅니다.",
          }
        : isAgent
          ? {
              id: "mode-agent",
              label: "에이전트",
              tone: "warn" as const,
              title: "지시를 입력하면 ReAct 작업 흐름으로 이어집니다.",
            }
          : isAICmd
            ? {
                id: "mode-aicmd",
                label: "AI 제안",
                tone: "accent" as const,
                title: "질문을 입력하면 제안/요약 중심의 AI 응답으로 이어집니다.",
              }
            : isExplain
              ? {
                  id: "mode-explain",
                  label: "설명 모드",
                  tone: "success" as const,
                  title: "설명이 필요한 내용을 입력하면 해설 중심 흐름으로 이어집니다.",
                }
              : isForceShell
                ? {
                    id: "mode-shell",
                    label: "셸 고정",
                    tone: "success" as const,
                    title: "입력 내용을 바로 터미널 명령으로 실행합니다.",
                  }
                : isForceAI
                  ? {
                      id: "mode-ai",
                      label: "AI 고정",
                      tone: "accent" as const,
                      title: "입력 내용을 바로 AI 질의로 보냅니다.",
                    }
                  : isBackendOnly && activeBackend
                    ? {
                        id: "mode-backend-waiting",
                        label: `${activeBackend.toUpperCase()} 대기`,
                        tone: "warn" as const,
                        title: `${activeBackend.toUpperCase()} 백엔드를 먼저 골라 둔 상태입니다. 내용을 입력한 뒤 Enter로 실행합니다.`,
                      }
                    : resolvedRoute.type === "agent"
                      ? {
                          id: "mode-agent-detected",
                          label: "자동 에이전트",
                          tone: "warn" as const,
                          title: "코딩·리뷰·치유 의도로 판단되어 ReAct 작업 흐름으로 실행합니다.",
                        }
                      : resolvedRoute.type === "shell"
                      ? {
                          id: "mode-shell-detected",
                          label: "명령어 입력",
                          tone: "success" as const,
                          title: "터미널 명령으로 판단되어 바로 실행 흐름으로 이어집니다.",
                        }
                      : {
                          id: "mode-auto",
                          label: "자동 라우팅",
                          tone: "neutral" as const,
                          title: "자연어/명령어를 보고 AI 또는 실행 흐름으로 자동 분기합니다.",
                        };

      chips.push(routeChip);

      if (activeBackend) {
        chips.push({
          id: "backend",
          label: activeBackend === "local"
            ? embeddedModelKey
              ? "LOCAL · mistral.rs 준비"
              : embeddedLoadState === "loading"
                ? "LOCAL · mistral.rs 로딩"
                : embeddedLoadState === "failed"
                  ? "LOCAL · mistral.rs 오류"
              : "LOCAL · mistral.rs 미로드"
            : `백엔드 ${activeBackend.toUpperCase()}`,
          tone: activeBackend === "local"
            ? embeddedModelKey ? "success" : embeddedLoadState === "loading" ? "accent" : "warn"
            : activeBackend === "ollama" ? "success" : activeBackend === "gemini" ? "warn" : "accent",
          title: activeBackend === "local"
            ? embeddedModelKey
              ? `mistral.rs 엔진에 로컬 모델이 로드되어 있습니다: ${embeddedModelKey}`
              : embeddedLoadMessage
                ? embeddedLoadMessage
              : "mistral.rs 엔진은 선택됐지만 모델이 아직 로드되지 않았습니다. Enter 시 자동 복원을 시도하며, 실패하면 원인을 직접 표시합니다."
            : `${activeBackend.toUpperCase()} 백엔드가 강제 선택되어 있습니다. Cmd/Ctrl+0 또는 우측 배지 클릭으로 해제할 수 있습니다.`,
        });
      }

      chips.push(
        activeBackend
          ? {
              id: "hint-clear",
              label: "Cmd/Ctrl+0 해제",
              tone: "neutral",
              title: "현재 강제 백엔드를 해제합니다.",
            }
          : {
              id: "hint-prefix",
              label: "! 셸 · @ AI · >> 에이전트",
              tone: "neutral",
              title: "필요하면 접두사로 실행 경로를 즉시 고정할 수 있습니다.",
            },
      );

      return chips;
    }, [
      activeBackend,
      activeHeavy,
      embeddedLoadMessage,
      embeddedLoadState,
      embeddedModelKey,
      isAgent,
      isAICmd,
      isBackendOnly,
      isEffectivelyEmpty,
      isExplain,
      isForceAI,
      isForceShell,
      resolvedRoute.type,
    ]);
    const hasTopMetaRow =
      visibleContextChips.length > 0
      || (showModeSummaryRow && modeSummaryChips.length > 0)
      || showExampleRow;

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
      pushVoiceTranscript(t);
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

    const replaceWithLastVoiceTranscript = () => {
      const t = lastVoiceTranscript.trim();
      if (!t) return;
      setInput(t);
      onChangeRef.current?.(t);
      showVoiceHighlight(0, t.length);
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

    const removeRecentVoiceTranscript = (text: string) => {
      removeVoiceTranscript(text);
    };

    const clearRecentVoiceTranscripts = () => {
      clearVoiceTranscripts();
      setVoiceHistoryQuery("");
    };

    const editPinnedVoiceTranscriptLabel = (text: string) => {
      const currentLabel = getPinnedVoiceTranscriptLabel(text);
      const nextLabel = window.prompt("고정 음성 별칭", currentLabel);
      if (nextLabel === null) {
        return;
      }
      setPinnedVoiceTranscriptLabel(text, nextLabel);
    };

    const applyVoiceTranscriptRoute = (text: string, mode: "ai" | "shell") => {
      const t = text.trim();
      if (!t) return;
      const next = mode === "ai" ? `@ ${t}` : `!${t}`;
      setInput(next);
      onChangeRef.current?.(next);
      showVoiceHighlight(mode === "ai" ? 2 : 1, next.length);
      inputRef.current?.focus();
    };

    const replaceInputWithVoiceTranscript = (text: string) => {
      const t = text.trim();
      if (!t) return;
      setInput(t);
      onChangeRef.current?.(t);
      showVoiceHighlight(0, t.length);
      inputRef.current?.focus();
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
      enabled: voiceEnabled,
      onTranscript: injectTranscript,
    });
    const isVoiceProcessing = voiceStatus === "processing";
    useEffect(() => {
      if (isVoiceProcessing) {
        inputRef.current?.focus();
      }
    }, [isVoiceProcessing]);
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
    const compactVoiceStatusLabel =
      voiceError ? "오류" :
      voiceStatus === "listening" ? "듣는중" :
      voiceStatus === "processing" ? "반영중" :
      "대기";
    const voiceStatusDisplayLabel =
      voiceStatus === "listening" && recordingSeconds > 0
        ? `${voiceStatusLabel} ${formatVoiceDuration(recordingSeconds)}`
        : voiceStatusLabel;
    const compactVoiceStatusDisplayLabel =
      voiceStatus === "listening" && recordingSeconds > 0
        ? `${compactVoiceStatusLabel} ${formatVoiceDuration(recordingSeconds)}`
        : compactVoiceStatusLabel;
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
    const inlineVoiceLabel = !voiceEnabled
      ? (compactContextChips ? "OFF" : "비활성")
      : compactContextChips
        ? compactVoiceStatusDisplayLabel
        : voiceStatusDisplayLabel;
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
    const showOverlayHint = Boolean(modeHint) || input.length === 0;
    const overlayContentTransitionStyle: React.CSSProperties = {
      transition: "opacity 160ms ease, transform 160ms ease, color 160ms ease",
    };

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
          padding: hasTopMetaRow ? (compactContextChips ? "4px 10px" : "6px 12px") : "0 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: hasTopMetaRow ? (compactContextChips ? 3 : 5) : 0,
          minHeight: hasTopMetaRow ? (compactContextChips ? 52 : 60) : 40,
          cursor: "text",
          boxSizing: "border-box",
          position: "relative",
          transition: "border-color 160ms ease, box-shadow 160ms ease, padding 180ms ease, min-height 180ms ease, gap 180ms ease",
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
          {showQuickRouteControls && (
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
              opacity: 1,
              transform: "translateY(0)",
              transition: "opacity 150ms ease, transform 150ms ease",
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
        {showModeSummaryRow && modeSummaryChips.length > 0 && (
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              alignContent: "flex-start",
              columnGap: 6,
              rowGap: 4,
              flexWrap: "wrap",
              opacity: 1,
              transform: "translateY(0)",
              transition: "opacity 160ms ease, transform 160ms ease",
            }}
          >
            {modeSummaryChips.map((chip) => (
              <span
                key={chip.id}
                title={chip.title}
                style={{
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
                    "rgba(255,255,255,0.58)",
                  background:
                    chip.tone === "accent" ? "rgba(88,166,255,0.12)" :
                    chip.tone === "success" ? "rgba(63,185,80,0.12)" :
                    chip.tone === "warn" ? "rgba(227,179,65,0.12)" :
                    "rgba(255,255,255,0.035)",
                }}
              >
                {chip.label}
              </span>
            ))}
          </div>
        )}
        {showExampleRow && (
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              minHeight: compactContextChips ? 14 : 16,
              marginTop: hasTopMetaRow ? -1 : 0,
              opacity: 1,
              transform: "translateY(0)",
              transition: "opacity 180ms ease, transform 180ms ease",
            }}
          >
            <span
              style={{
                flexShrink: 0,
                fontSize: WARP_SMALL_FONT_SIZE,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
              }}
            >
              {exampleLabel}
            </span>
            <span
              style={{
                minWidth: 0,
                fontSize: WARP_SMALL_FONT_SIZE,
                lineHeight: 1.35,
                color: activeModeHint ? "rgba(255,255,255,0.54)" : "rgba(255,255,255,0.42)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={activeModeExample}
            >
              {visibleModeExample}
            </span>
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
              transform: "translateY(-1px) scale(1.01)",
              boxShadow: "0 8px 20px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.04)",
              transition: "transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease, background 160ms ease, border-color 160ms ease",
              animation: VOICE_BANNER_IN_ANIMATION,
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
                  transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.14)",
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
                  transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
                  boxShadow: voiceBusy ? "none" : "0 4px 12px rgba(0,0,0,0.14)",
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
                  transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.14)",
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
              transform: voiceSuccessPhase === "fading" ? "translateY(-2px) scale(1.01)" : "translateY(-1px) scale(1.01)",
              transition: `opacity ${VOICE_SUCCESS_FADE_MS}ms ease, transform ${VOICE_SUCCESS_FADE_MS}ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease`,
              animation: VOICE_BANNER_IN_ANIMATION,
              boxShadow: voiceTranscriptRefined ? "0 8px 20px rgba(16,185,129,0.14), inset 0 0 0 1px rgba(255,255,255,0.04)" : "0 8px 20px rgba(0,0,0,0.14), inset 0 0 0 1px rgba(255,255,255,0.04)",
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
                <button
                  type="button"
                  onClick={replaceWithLastVoiceTranscript}
                  title="현재 입력을 마지막 음성 문장으로 치환"
                  style={{
                    marginLeft: 2,
                    flexShrink: 0,
                    borderRadius: 5,
                    border: "1px solid rgba(63,185,80,0.22)",
                    background: "rgba(46,160,67,0.16)",
                    color: "rgba(230,255,236,0.94)",
                    padding: "0 5px",
                    fontSize: 10,
                    lineHeight: 1.5,
                    cursor: "pointer",
                  }}
                >
                  치환
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

        {!voiceError && (recentVoiceTranscripts.length > 0 || pinnedVoiceTranscripts.length > 0 || voiceTranscriptHistory.length > 0) && voiceStatus === "idle" && (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 6,
              marginTop: 2,
              marginBottom: 1,
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
                title={voiceHistoryScopeLabel}
                style={{
                  borderRadius: 999,
                  border: isVoiceHistoryScopeOverridden
                    ? "1px solid rgba(251,191,36,0.24)"
                    : "1px solid rgba(88,166,255,0.12)",
                  background: isVoiceHistoryScopeOverridden
                    ? "rgba(251,191,36,0.10)"
                    : "rgba(88,166,255,0.06)",
                  color: isVoiceHistoryScopeOverridden
                    ? "rgba(255,244,214,0.88)"
                    : "rgba(214,231,255,0.76)",
                  padding: "2px 7px",
                  fontSize: WARP_SMALL_FONT_SIZE,
                  lineHeight: 1.2,
                }}
              >
                {compactContextChips ? compactVoiceHistoryScopeLabel : voiceHistoryScopeLabel}
              </span>
              {isVoiceHistoryScopeOverridden && (
                <button
                  type="button"
                  onClick={() => setVoiceHistoryScopeOverride(null)}
                  title="현재 프로젝트 기록으로 복귀"
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(88,166,255,0.16)",
                    background: "rgba(88,166,255,0.08)",
                    color: "rgba(214,231,255,0.82)",
                    padding: "2px 7px",
                    fontSize: WARP_SMALL_FONT_SIZE,
                    lineHeight: 1.2,
                    cursor: "pointer",
                  }}
                >
                  {restoreVoiceScopeLabel}
                </button>
              )}
              <span
                style={{
                  fontSize: WARP_SMALL_FONT_SIZE,
                  color: "rgba(255,255,255,0.42)",
                  lineHeight: 1.2,
                }}
              >
                {voiceHistorySummaryLabel}
              </span>
              {showVoiceScopeControls && availableVoiceHistoryScopes.length > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexWrap: "wrap",
                  }}
                >
                  {visibleVoiceHistoryScopes.map((scopeInfo) => {
                    const isActive = scopeInfo.scopeKey === activeVoiceHistoryScope;
                    const label = scopeInfo.scopeKey === "__global__" ? "전역" : shortPath(scopeInfo.scopeKey);
                    const recentHint = formatVoiceScopeRecentHint(scopeInfo.lastAccessedAt);
                    return (
                      <button
                        key={scopeInfo.scopeKey}
                        type="button"
                        onClick={() => setVoiceHistoryScopeOverride(scopeInfo.scopeKey === currentVoiceHistoryScopeKey ? null : scopeInfo.scopeKey)}
                        title={`${label}${recentHint ? ` · 최근 ${recentHint}` : ""} · 고정 ${scopeInfo.pinnedCount} · 최근 ${scopeInfo.recentCount} · 기록 ${scopeInfo.historyCount}`}
                        style={{
                          borderRadius: 999,
                          border: isActive ? "1px solid rgba(88,166,255,0.34)" : "1px solid rgba(255,255,255,0.10)",
                          background: isActive ? "rgba(88,166,255,0.16)" : "rgba(255,255,255,0.04)",
                          color: isActive ? "rgba(214,231,255,0.92)" : "rgba(255,255,255,0.62)",
                          padding: "2px 7px",
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.2,
                          cursor: "pointer",
                          boxShadow: isActive ? "0 0 0 1px rgba(88,166,255,0.08) inset" : "none",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span>{label}</span>
                          {recentHint && (
                            <span style={{ color: isActive ? "rgba(214,231,255,0.62)" : "rgba(255,255,255,0.42)" }}>
                              {recentHint}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  {availableVoiceHistoryScopes.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllVoiceHistoryScopes((prev) => !prev)}
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.04)",
                        color: "rgba(255,255,255,0.62)",
                        padding: "2px 7px",
                        fontSize: WARP_SMALL_FONT_SIZE,
                        lineHeight: 1.2,
                        cursor: "pointer",
                      }}
                    >
                      {showAllVoiceHistoryScopes ? "접기" : `더보기 +${availableVoiceHistoryScopes.length - 4}`}
                    </button>
                  )}
                </div>
              )}
              {showVoiceSearchInput ? (
                <>
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
                          fontSize: WARP_SMALL_FONT_SIZE,
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
                </>
              ) : compactContextChips ? (
                <span
                  style={{
                    fontSize: WARP_SMALL_FONT_SIZE,
                    color: "rgba(255,255,255,0.34)",
                    lineHeight: 1.2,
                  }}
                >
                  기록 펼치기 시 검색과 scope 전환이 표시됩니다.
                </span>
              ) : null}
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
                    fontSize: WARP_SMALL_FONT_SIZE,
                    color: "rgba(255,215,100,0.78)",
                    lineHeight: 1.2,
                    flexShrink: 0,
                  }}
                >
                  고정 음성
                </span>
                <button
                  type="button"
                  onClick={togglePinnedVoiceTranscriptsCollapsed}
                  title="고정 음성 접기/펼치기"
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(255,215,100,0.14)",
                    background: "rgba(255,215,100,0.06)",
                    color: "rgba(255,230,160,0.78)",
                    padding: "0 6px",
                    fontSize: 9,
                    lineHeight: 1.5,
                    cursor: "pointer",
                  }}
                >
                  {pinnedVoiceTranscriptsCollapsed ? "펼치기" : "접기"}
                </button>
                {pinnedVoiceTranscriptsCollapsed && (
                  <span
                    style={{
                      fontSize: WARP_SMALL_FONT_SIZE,
                      color: "rgba(255,230,160,0.72)",
                      lineHeight: 1.2,
                    }}
                  >
                    {collapsedPinnedVoiceSummary}
                  </span>
                )}
                {showPinnedVoiceExpanded && filteredPinnedVoiceTranscripts.map((item) => {
                  const pinnedIndex = pinnedVoiceTranscripts.indexOf(item);
                  const canMoveToTop = pinnedIndex > 0;
                  const canMoveUp = pinnedIndex > 0;
                  const canMoveDown = pinnedIndex >= 0 && pinnedIndex < pinnedVoiceTranscripts.length - 1;
                  const canMoveToBottom = pinnedIndex >= 0 && pinnedIndex < pinnedVoiceTranscripts.length - 1;
                  const pinnedLabel = getPinnedVoiceTranscriptLabel(item);
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
                        padding: "1px 5px 1px 7px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => reuseRecentVoiceTranscript(item)}
                        title={item}
                        style={{
                          color: "rgba(255,244,214,0.92)",
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.2,
                          cursor: "pointer",
                          maxWidth: 196,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                        }}
                      >
                        {pinnedLabel ? `${pinnedLabel} · ${formatVoicePreview(item)}` : formatVoicePreview(item)}
                      </button>
                      <button
                        type="button"
                        onClick={() => editPinnedVoiceTranscriptLabel(item)}
                        title="고정 음성 별칭 편집"
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(255,215,100,0.14)",
                          background: "rgba(255,215,100,0.06)",
                          color: "rgba(255,230,160,0.78)",
                          padding: "0 5px",
                          fontSize: 9,
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        {pinnedLabel ? "이름" : "별칭"}
                      </button>
                      <button
                        type="button"
                        disabled={!canMoveToTop}
                        onClick={() => movePinnedVoiceTranscriptToEdge(item, "start")}
                        title="맨 위로 이동"
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.05)",
                          color: canMoveToTop ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.28)",
                          padding: "0 4px",
                          fontSize: 9,
                          lineHeight: 1.4,
                          cursor: canMoveToTop ? "pointer" : "default",
                        }}
                      >
                        맨위
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
                        disabled={!canMoveToBottom}
                        onClick={() => movePinnedVoiceTranscriptToEdge(item, "end")}
                        title="맨 아래로 이동"
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.05)",
                          color: canMoveToBottom ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.28)",
                          padding: "0 4px",
                          fontSize: 9,
                          lineHeight: 1.4,
                          cursor: canMoveToBottom ? "pointer" : "default",
                        }}
                      >
                        맨아래
                      </button>
                      <button
                        type="button"
                        onClick={() => copyVoiceTranscriptItem(item)}
                        title="고정 음성 복사"
                        style={{
                          flexShrink: 0,
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
                  fontSize: WARP_SMALL_FONT_SIZE,
                  color: "rgba(255,255,255,0.42)",
                  lineHeight: 1.2,
                  flexShrink: 0,
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
                    fontSize: WARP_SMALL_FONT_SIZE,
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
                  fontSize: WARP_SMALL_FONT_SIZE,
                  lineHeight: 1.2,
                  cursor: "pointer",
                }}
              >
                전체 지우기
              </button>
              {showRecentVoiceExpanded && filteredRecentVoiceTranscripts.map((item) => (
                <span
                  key={item}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(88,166,255,0.14)",
                    background: "rgba(88,166,255,0.08)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "1px 5px 1px 7px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => reuseRecentVoiceTranscript(item)}
                    title={item}
                    style={{
                      color: "rgba(214,231,255,0.88)",
                      fontSize: WARP_SMALL_FONT_SIZE,
                      lineHeight: 1.2,
                      cursor: "pointer",
                      maxWidth: 164,
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
              {compactContextChips && !showVoiceTranscriptHistory && filteredRecentVoiceTranscripts.length > 0 && (
                <span
                  style={{
                    fontSize: WARP_SMALL_FONT_SIZE,
                    color: "rgba(214,231,255,0.66)",
                    lineHeight: 1.2,
                  }}
                >
                  최근 {filteredRecentVoiceTranscripts.length}개
                </span>
              )}
            </div>
            {showVoiceTranscriptHistory && voiceTranscriptHistory.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  padding: "8px 10px",
                }}
              >
                {filteredVoiceTranscriptHistory.length > 0 ? filteredVoiceTranscriptHistory.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(0,0,0,0.10)",
                      padding: "6px 8px",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.2,
                          color: "rgba(255,255,255,0.42)",
                        }}
                      >
                        <span>{formatVoiceHistoryTime(item.createdAt)}</span>
                        <span>세션 기록</span>
                        {isVoiceTranscriptPinned(item.text) && <span style={{ color: "rgba(255,215,100,0.82)" }}>고정됨</span>}
                        {getPinnedVoiceTranscriptLabel(item.text) && (
                          <span
                            style={{
                              borderRadius: 999,
                              border: "1px solid rgba(255,215,100,0.14)",
                              background: "rgba(255,215,100,0.06)",
                              color: "rgba(255,244,214,0.80)",
                              padding: "1px 6px",
                              fontSize: 9,
                              lineHeight: 1.1,
                            }}
                          >
                            {getPinnedVoiceTranscriptLabel(item.text)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => reuseRecentVoiceTranscript(item.text)}
                        title={item.text}
                        style={{
                          maxWidth: "100%",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: "rgba(241,245,249,0.90)",
                          fontSize: 11,
                          lineHeight: 1.35,
                          cursor: "pointer",
                          textAlign: "left",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.text}
                      </button>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        flexShrink: 0,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => applyVoiceTranscriptRoute(item.text, "ai")}
                        style={{
                          borderRadius: 6,
                          border: "1px solid rgba(217,70,239,0.18)",
                          background: "rgba(217,70,239,0.10)",
                          color: "rgba(250,232,255,0.86)",
                          padding: "1px 6px",
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        AI
                      </button>
                      <button
                        type="button"
                        onClick={() => applyVoiceTranscriptRoute(item.text, "shell")}
                        style={{
                          borderRadius: 6,
                          border: "1px solid rgba(251,191,36,0.18)",
                          background: "rgba(251,191,36,0.10)",
                          color: "rgba(255,247,214,0.86)",
                          padding: "1px 6px",
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        셸
                      </button>
                      <button
                        type="button"
                        onClick={() => reuseRecentVoiceTranscript(item.text)}
                        style={{
                          borderRadius: 6,
                          border: "1px solid rgba(88,166,255,0.18)",
                          background: "rgba(88,166,255,0.10)",
                          color: "rgba(214,231,255,0.88)",
                          padding: "1px 6px",
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        다시 넣기
                      </button>
                      <button
                        type="button"
                        onClick={() => replaceInputWithVoiceTranscript(item.text)}
                        style={{
                          borderRadius: 6,
                          border: "1px solid rgba(63,185,80,0.18)",
                          background: "rgba(46,160,67,0.12)",
                          color: "rgba(230,255,236,0.88)",
                          padding: "1px 6px",
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        치환
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePinVoiceTranscript(item.text)}
                        style={{
                          borderRadius: 6,
                          border: isVoiceTranscriptPinned(item.text)
                            ? "1px solid rgba(255,215,100,0.20)"
                            : "1px solid rgba(255,215,100,0.14)",
                          background: isVoiceTranscriptPinned(item.text)
                            ? "rgba(255,215,100,0.12)"
                            : "rgba(255,215,100,0.06)",
                          color: isVoiceTranscriptPinned(item.text)
                            ? "rgba(255,244,214,0.90)"
                            : "rgba(255,230,160,0.78)",
                          padding: "1px 6px",
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        {isVoiceTranscriptPinned(item.text) ? "고정 해제" : "고정"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyVoiceTranscriptItem(item.text)}
                        style={{
                          borderRadius: 6,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.05)",
                          color: "rgba(255,255,255,0.72)",
                          padding: "1px 6px",
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        복사
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecentVoiceTranscript(item.text)}
                        style={{
                          borderRadius: 6,
                          border: "1px solid rgba(248,81,73,0.16)",
                          background: "rgba(248,81,73,0.10)",
                          color: "rgba(255,208,206,0.84)",
                          padding: "1px 6px",
                          fontSize: WARP_SMALL_FONT_SIZE,
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )) : (
                  <div
                    style={{
                      borderRadius: 8,
                      border: "1px dashed rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.10)",
                      padding: "8px",
                      fontSize: 11,
                      lineHeight: 1.35,
                      color: "rgba(255,255,255,0.46)",
                    }}
                  >
                    <div>검색 결과가 없습니다.</div>
                    {otherMatchingVoiceHistoryScopes.length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            color: "rgba(255,255,255,0.28)",
                          }}
                        >
                          다른 scope
                        </span>
                        {otherMatchingVoiceHistoryScopes.map((scopeInfo) => (
                          <button
                            key={scopeInfo.scopeKey}
                            type="button"
                            onClick={() => setVoiceHistoryScopeOverride(scopeInfo.scopeKey === currentVoiceHistoryScopeKey ? null : scopeInfo.scopeKey)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              maxWidth: "100%",
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(255,255,255,0.06)",
                              color: "rgba(255,255,255,0.62)",
                              padding: "4px 8px",
                              fontSize: 10,
                              lineHeight: 1.2,
                              cursor: "pointer",
                            }}
                          >
                            <span
                              style={{
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {scopeInfo.scopeKey === "__global__" ? "전역 기록" : shortPath(scopeInfo.scopeKey)}
                            </span>
                            <span
                              style={{
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.08)",
                                padding: "1px 5px",
                                color: "rgba(255,255,255,0.44)",
                              }}
                            >
                              {scopeInfo.matchedCount}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 32,
            border: isFocused
              ? `1px solid ${promptColor}55`
              : input.trim().length > 0
                ? `1px solid ${promptColor}2a`
                : "1px solid rgba(255,255,255,0.12)",
            background: isFocused
              ? `color-mix(in srgb, ${promptColor} 12%, rgba(255,255,255,0.04))`
              : input.trim().length > 0
                ? `color-mix(in srgb, ${promptColor} 7%, rgba(255,255,255,0.04))`
                : "rgba(255,255,255,0.04)",
            borderRadius: 10,
            padding: "6px 10px",
            boxShadow: isFocused
              ? `0 0 0 1px ${promptColor}22, 0 10px 24px ${promptColor}1c`
              : input.trim().length > 0
                ? `inset 0 1px 0 rgba(255,255,255,0.03), 0 6px 16px ${promptColor}12`
                : "inset 0 1px 0 rgba(255,255,255,0.03)",
            transform: isFocused || input.trim().length > 0 ? "translateY(-1px)" : "translateY(0)",
            transition: "border-color 160ms ease, background 160ms ease, box-shadow 160ms ease, transform 160ms ease",
          }}
        >
          <span style={{
            color: promptColor,
            fontFamily,
            fontSize,
            opacity: isFocused || input.trim().length > 0 ? 1 : 0.85,
            flexShrink: 0,
            transform: isFocused || input.trim().length > 0 ? "translateY(-1px) scale(1.04)" : "translateY(0) scale(1)",
            textShadow: isFocused || input.trim().length > 0 ? `0 0 12px ${promptColor}33` : "0 0 0 transparent",
            transition: "opacity 160ms ease, transform 160ms ease, text-shadow 160ms ease, color 160ms ease",
          }}>
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
              transform:
                voiceEnabled && !voiceBusy && (micHovered || isRecording || voiceStatus === "processing")
                  ? "translateY(-1px) scale(1.02)"
                  : "translateY(0) scale(1)",
              boxShadow:
                !voiceEnabled || voiceBusy ? "none" :
                (micHovered || isRecording || voiceStatus === "processing")
                  ? "0 6px 16px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.06)"
                  : "0 0 0 rgba(0,0,0,0)",
              transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease, color 160ms ease",
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
                transform:
                  !voiceEnabled || voiceStatus === "idle"
                    ? "translateY(0) scale(1)"
                    : "translateY(-1px) scale(1.02)",
                opacity: !voiceEnabled ? 0.78 : voiceStatus === "idle" ? 0.9 : 0.98,
                boxShadow:
                  !voiceEnabled || voiceStatus === "idle"
                    ? "0 0 0 rgba(0,0,0,0)"
                    : "0 6px 16px rgba(0,0,0,0.16), inset 0 0 0 1px rgba(255,255,255,0.05)",
                transition: "transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease",
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
              opacity: isVoiceProcessing ? 0.78 : showOverlayHint ? 0.94 : 1,
              transform: showOverlayHint ? "translateY(0.5px)" : "translateY(0)",
              transition: "opacity 160ms ease, transform 160ms ease",
            }}
          >
            {modeHint ? (
              <span style={{ color: "rgba(255,255,255,0.28)", ...overlayContentTransitionStyle }}>
                {modeHint}
              </span>
            ) : input.length === 0 ? (
              <span style={{ color: "rgba(255,255,255,0.26)", ...overlayContentTransitionStyle }}>
                {defaultInputHint}
              </span>
            ) : body !== null ? (
              <span style={{ color: TOKEN_COLORS.text, ...overlayContentTransitionStyle }}>{body}</span>
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
              caretColor: promptColor,
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

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
              marginLeft: 2,
            }}
          >
            {visiblePrefixQuickActions.map((action) => {
              const toneStyles =
                action.tone === "success"
                  ? {
                      color: "rgba(111,227,132,0.95)",
                      border: "1px solid rgba(63,185,80,0.35)",
                      background: action.active ? "rgba(63,185,80,0.18)" : "rgba(63,185,80,0.08)",
                    }
                  : action.tone === "warn"
                    ? {
                        color: "rgba(233,194,105,0.96)",
                        border: "1px solid rgba(227,179,65,0.35)",
                        background: action.active ? "rgba(227,179,65,0.18)" : "rgba(227,179,65,0.08)",
                      }
                    : {
                        color: "rgba(121,192,255,0.95)",
                        border: "1px solid rgba(88,166,255,0.35)",
                        background: action.active ? "rgba(88,166,255,0.18)" : "rgba(88,166,255,0.08)",
                      };

              return (
                <button
                  key={action.id}
                  type="button"
                  aria-pressed={action.active}
                  onClick={() => applyQuickRouteMode(action.id)}
                  style={{
                    minWidth: compactContextChips ? 20 : action.id === "agent" ? 28 : 22,
                    height: 22,
                    borderRadius: 7,
                    padding: compactContextChips ? "0 5px" : "0 6px",
                    fontSize: WARP_SMALL_FONT_SIZE,
                    lineHeight: 1,
                    fontWeight: action.active ? 700 : 600,
                    cursor: "pointer",
                    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease, color 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
                    transform: action.active ? "translateY(-1px) scale(1.02)" : "translateY(0) scale(1)",
                    opacity: action.active ? 1 : 0.82,
                    boxShadow: action.active ? "0 6px 16px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.06)" : "0 0 0 rgba(0,0,0,0)",
                    ...toneStyles,
                  }}
                  title={`${action.title} ${action.active ? "해제" : "선택"}`}
                >
                  {compactContextChips ? action.shortLabel : action.label}
                </button>
              );
            })}
            {visibleBackendQuickActions.map((backendAction) => {
              const selected = activeBackend === backendAction.id;
              const toneStyles =
                backendAction.tone === "success"
                  ? {
                      color: "rgba(111,227,132,0.95)",
                      border: "1px solid rgba(63,185,80,0.35)",
                      background: selected ? "rgba(63,185,80,0.18)" : "rgba(63,185,80,0.08)",
                    }
                  : backendAction.tone === "warn"
                    ? {
                        color: "rgba(233,194,105,0.96)",
                        border: "1px solid rgba(227,179,65,0.35)",
                        background: selected ? "rgba(227,179,65,0.18)" : "rgba(227,179,65,0.08)",
                      }
                    : {
                        color: "rgba(121,192,255,0.95)",
                        border: "1px solid rgba(88,166,255,0.35)",
                        background: selected ? "rgba(88,166,255,0.18)" : "rgba(88,166,255,0.08)",
                      };

              return (
                <button
                  key={backendAction.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => applyBackendPrefix(backendAction.id)}
                  style={{
                    minWidth: compactContextChips ? 20 : 26,
                    height: 22,
                    borderRadius: 7,
                    padding: compactContextChips ? "0 5px" : "0 7px",
                    fontSize: WARP_SMALL_FONT_SIZE,
                    lineHeight: 1,
                    fontWeight: selected ? 700 : 600,
                    cursor: "pointer",
                    transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease, color 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
                    transform: selected ? "translateY(-1px) scale(1.02)" : "translateY(0) scale(1)",
                    opacity: selected ? 1 : 0.86,
                    boxShadow: selected ? "0 6px 16px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.06)" : "0 0 0 rgba(0,0,0,0)",
                    ...toneStyles,
                  }}
                  title={`${backendAction.label} 백엔드 ${selected ? "선택 해제" : "바로 선택"} (Cmd/Ctrl+${backendAction.id === "local" ? "1" : backendAction.id === "ollama" ? "2" : backendAction.id === "xllm" ? "3" : "4"})`}
                >
                  {compactContextChips ? backendAction.shortLabel : backendAction.label}
                </button>
              );
            })}
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
                  borderRadius: 7,
                  padding: compactContextChips ? "0 6px" : "1px 7px",
                  lineHeight: 1.2,
                  background: activeBackendStyle.background,
                  cursor: "pointer",
                  height: 22,
                  transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.14)",
                }}
                title="현재 백엔드 강제 상태 해제 (Cmd/Ctrl+0)"
              >
                해제
              </button>
            )}
          </div>
          )}
        </div>

      </div>
    );
  },
);

WarpInputBar.displayName = "WarpInputBar";
export default WarpInputBar;
