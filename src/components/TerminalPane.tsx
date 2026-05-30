import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { Terminal } from "@xterm/xterm";
import type { IDecoration } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { findCompletion } from "../utils/ghostText";
import { parseOsc7 } from "../utils/tabIcon";
import { checkPasteDanger } from "../utils/pasteGuard";
import { classifyTerminalKey } from "../utils/terminalKeys";
import { parseCommandLines } from "../utils/smartPaste";
import PasteGuardModal from "./PasteGuardModal";
import SmartPasteModal from "./SmartPasteModal";
import TerminalContextMenu from "./TerminalContextMenu";
import WarpInputBar, { type WarpInputBarHandle } from "./WarpInputBar";
import AIBlockStream from "./AIBlockStream";
import { routeInput, type AiBackend } from "../utils/inputRouter";
import {
  applyBackendPrefixToInput,
  clearBackendPrefixFromInput,
  detectBackendPrefixFromInput,
} from "../utils/backendPrefix";
import type { ChatMessage } from "../hooks/useAIChat";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { XtermTheme } from "../hooks/useTerminalTheme";
import { DEFAULT_TERMINAL_FONT_SIZE } from "../hooks/useTerminalTheme";
import type { DangerMatch } from "../utils/pasteGuard";
import type { SshProfile } from "../hooks/useTabManager";
import { IconButton } from "@/components/ui/icon-button";

interface PtyData {
  id: string;
  data: string;
}

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

interface MentionItemParent {
  kind: "parent";
}

interface MentionItemEntry {
  kind: "entry";
  entry: DirEntry;
}

type MentionItem = MentionItemParent | MentionItemEntry;

interface Props {
  id: string;
  cwd?: string;
  sshProfile?: SshProfile;
  model?: string;
  xtermTheme?: XtermTheme;
  fontSize?: number;
  fontFamily?: string;
  onOutput?: (data: string) => void;
  onCwdChange?: (cwd: string) => void;
  onReady?: (write: (data: string) => void) => void;
  onAgentTrigger?: (task: string, backend?: AiBackend) => void;
  onAskAI?: (
    question: string,
    images?: string[],
    engine?: "heavy" | "fast",
    backend?: AiBackend,
  ) => void;
  aiMessages?: ChatMessage[];
  aiStreaming?: boolean;
  aiError?: string | null;
  onClearAI?: () => void;
  onCancelAI?: () => void;
  visionEnabled?: boolean;
  showReasoning?: boolean;
  onToggleReasoning?: () => void;
}

const IS_WINDOWS = navigator.userAgent.includes("Windows");
const IS_MAC = navigator.userAgent.includes("Mac");
// 한글(CJK) 폴백 글꼴을 명시적으로 포함해 xterm.js 캔버스 렌더러의 글자 깨짐 방지
const FONT_FAMILY = IS_WINDOWS
  ? '"JetBrains Mono", "Cascadia Code", "Malgun Gothic", "Consolas", monospace'
  : IS_MAC
    ? '"JetBrains Mono", "Menlo", "Apple SD Gothic Neo", "Monaco", monospace'
    : '"JetBrains Mono", "Menlo", "Noto Sans CJK KR", "DejaVu Sans Mono", monospace';

const THEME = {
  background: "#0d1117",
  foreground: "#c9d1d9",
  cursor: "#58a6ff",
  cursorAccent: "#0d1117",
  selectionBackground: "#264f7855",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

const PANE_PADDING_X = 10;
const PANE_PADDING_Y = 6;
const INPUT_TIP_DISMISSED_KEY = "lum_input_toolbelt_tip_dismissed";
const INPUT_HISTORY_KEY = "lum_input_submit_history";
const LEGACY_TOOLBELT_TIP_KEY = INPUT_TIP_DISMISSED_KEY;

const DEFAULT_MODEL = "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";
const UI_TEXT_MICRO = "var(--lum-ui-text-micro)";
const MICRO_FONT_SIZE = 10;
const SMALL_FONT_SIZE = 11;
const BASE_FONT_SIZE = 12;
const TITLE_FONT_SIZE = 14;
const HERO_FONT_SIZE = 36;

const hasExecutableRecallRoute = (raw: string): boolean => {
  const normalized = raw.trim();
  if (normalized === "") return false;
  const route = routeInput(raw);
  if (route.type === "empty" || route.type === "aiCmd" || route.type === "explain") return false;
  if (route.type === "ai" && route.question === "") return false;
  if (route.type === "agent" && route.task === "") return false;
  if (route.type === "heavy" && route.prompt === "") return false;
  return true;
};

const TerminalPane: React.FC<Props> = ({ id, cwd, sshProfile, model, xtermTheme, fontSize, fontFamily, onOutput, onCwdChange, onReady, onAgentTrigger, onAskAI, aiMessages, aiStreaming, aiError, onClearAI, onCancelAI, visionEnabled, showReasoning, onToggleReasoning }) => {
  // 입력 모드 토글 상태 — Heavy(Phase 85b 제거)는 dead, reasoning은 App.tsx props 통해 글로벌 상태 연동
  const [visionMode, setVisionMode] = useState(visionEnabled ?? false);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [actionPaletteOpen, setActionPaletteOpen] = useState(false);
  const [actionPaletteQuery, setActionPaletteQuery] = useState("");
  const [actionPaletteSelected, setActionPaletteSelected] = useState(0);
  const [inputHistoryOpen, setInputHistoryOpen] = useState(false);
  const [inputHistoryQuery, setInputHistoryQuery] = useState("");
  const [inputHistorySelected, setInputHistorySelected] = useState(0);
  const [inputHistoryRangeAnchor, setInputHistoryRangeAnchor] = useState<number | null>(null);
  const [inputHistoryMultiSelected, setInputHistoryMultiSelected] = useState<string[]>([]);

  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const actionPaletteInputRef = useRef<HTMLInputElement>(null);
  const inputHistoryInputRef = useRef<HTMLInputElement>(null);
  const inputDockRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const spawnedRef = useRef(false);
  const promptDecorationRef = useRef<IDecoration | null>(null);

  const xtermThemeRef = useRef(xtermTheme);
  xtermThemeRef.current = xtermTheme;
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const fontFamilyRef = useRef(fontFamily);
  fontFamilyRef.current = fontFamily;

  const onOutputRef = useRef(onOutput);
  const onReadyRef = useRef(onReady);
  const onCwdChangeRef = useRef(onCwdChange);
  const onAgentTriggerRef = useRef(onAgentTrigger);
  const onAskAIRef = useRef(onAskAI);
  const onCancelAIRef = useRef(onCancelAI);
  useEffect(() => {
    onOutputRef.current = onOutput;
    onReadyRef.current = onReady;
    onCwdChangeRef.current = onCwdChange;
    onAgentTriggerRef.current = onAgentTrigger;
    onAskAIRef.current = onAskAI;
    onCancelAIRef.current = onCancelAI;
  }, [onOutput, onReady, onCwdChange, onAgentTrigger, onAskAI, onCancelAI]);

  // ── Search (Cmd+F) ─────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchCase, setSearchCase] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback((q: string, forward = true) => {
    const s = searchAddonRef.current;
    if (!s || !q) return;
    const opts = { regex: searchRegex, caseSensitive: searchCase, decorations: { matchBackground: "#264f78", matchBorder: "#58a6ff", matchOverviewRuler: "#58a6ff", activeMatchBackground: "#58a6ff55", activeMatchBorder: "#58a6ff", activeMatchColorOverviewRuler: "#58a6ff" } };
    if (forward) s.findNext(q, opts); else s.findPrevious(q, opts);
  }, [searchRegex, searchCase]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    searchAddonRef.current?.clearDecorations?.();
    termRef.current?.focus();
  }, []);

  // ── AI Explain (? prefix) ──────────────────────────────────────────────
  const [explainPopup, setExplainPopup] = useState<{ text: string; y: number } | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const explainDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modelRef = useRef(model ?? DEFAULT_MODEL);
  const cwdRef = useRef(cwd ?? "");
  useEffect(() => {
    modelRef.current = model ?? DEFAULT_MODEL;
    cwdRef.current = cwd ?? "";
  }, [model, cwd]);

  // 테마/폰트 동적 적용
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (xtermTheme) term.options.theme = xtermTheme;
  }, [xtermTheme]);

  useEffect(() => {
    const term = termRef.current;
    const fit = fitAddonRef.current;
    if (!term || !fit) return;
    term.options.fontSize = fontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
    try { fit.fit(); } catch {}
    invoke("resize_pty", { id, cols: term.cols, rows: term.rows }).catch(() => {});
  }, [fontSize, id]);

  useEffect(() => {
    const term = termRef.current;
    const fit = fitAddonRef.current;
    if (!term) return;
    term.options.fontFamily = fontFamily ? `"${fontFamily}", ${FONT_FAMILY}` : FONT_FAMILY;
    try { fit?.fit(); } catch {}
  }, [fontFamily]);

  // Paste guard
  const [pasteGuard, setPasteGuard] = useState<{ match: DangerMatch; text: string } | null>(null);

  // Smart paste
  const [smartPaste, setSmartPaste] = useState<{ lines: string[]; rawText: string } | null>(null);
  const writeToPtyRef = useRef<(data: string) => void>(() => {});

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [inputBuffer, setInputBuffer] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionDir, setMentionDir] = useState<string | null>(null);
  const [mentionTrail, setMentionTrail] = useState("");
  const [mentionEntries, setMentionEntries] = useState<DirEntry[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionSelected, setMentionSelected] = useState(0);
  const [clearedInputStack, setClearedInputStack] = useState<string[]>([]);
  const [lastSubmittedInput, setLastSubmittedInput] = useState("");
  const recallHydratedRef = useRef(false);
  const [submittedInputHistory, setSubmittedInputHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(INPUT_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v): v is string => typeof v === "string").slice(0, 20);
    } catch {
      return [];
    }
  });
  const [showInputTip, setShowInputTip] = useState(() => {
    try {
      return localStorage.getItem(LEGACY_TOOLBELT_TIP_KEY) === "0";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const clearLegacyToolbeltSettings = () => {
      try {
        localStorage.removeItem(LEGACY_TOOLBELT_TIP_KEY);
        localStorage.removeItem("lum_toolbelt_show_advanced");
        localStorage.removeItem("lum_toolbelt_show_backend");
      } catch {
        /* noop */
      }
    };
    const readLegacySettings = () => {
      const showInput = (() => {
        try {
          return localStorage.getItem(LEGACY_TOOLBELT_TIP_KEY) === "0";
        } catch {
          return false;
        }
      })();
      return { showInput };
    };

    let mounted = true;
    (async () => {
      const legacy = readLegacySettings();
      try {
        const cfg = await invoke<{
          ui_show_input_toolbelt_tip?: boolean;
        }>("load_app_config");
        if (!mounted) return;

        const patch: Record<string, boolean> = {};
        if (typeof cfg.ui_show_input_toolbelt_tip === "boolean") {
          setShowInputTip(cfg.ui_show_input_toolbelt_tip);
        } else {
          patch.showInputToolbeltTip = legacy.showInput;
          setShowInputTip(legacy.showInput);
        }
        if (Object.keys(patch).length > 0) {
          invoke("save_ui_preferences", patch).catch(() => {});
        }
        clearLegacyToolbeltSettings();
      } catch {
        if (!mounted) return;
        setShowInputTip(legacy.showInput);
        invoke("save_ui_preferences", {
          showInputToolbeltTip: legacy.showInput,
        }).catch(() => {});
        clearLegacyToolbeltSettings();
      }
    })();

    return () => { mounted = false; };
  }, []);
  const [warpInputFocused, setWarpInputFocused] = useState(false);
  const [inputDockHeight, setInputDockHeight] = useState(70);
  const [inputDockWidth, setInputDockWidth] = useState(960);
  const overlayBottomOffset = Math.max(70, inputDockHeight + 8);
  const overlayTopGap = 10;
  const overlayMaxHeight = `calc(100% - ${overlayBottomOffset + overlayTopGap}px)`;
  const inputDockNarrow = inputDockWidth < 1080;
  const inputDockCompact = inputDockWidth < 840;

  // WarpInputBar — 실제 입력 필드
  const warpInputRef = useRef<WarpInputBarHandle>(null);

  // Static CLI ghost text (WarpInputBar 위 오버레이)
  const [ghostText, setGhostText] = useState<string | null>(null);
  const ghostTextRef = useRef<string | null>(null);
  const suggestionRef = useRef<{ suffix: string; insert: string } | null>(null);
  const forceMentionAttachRef = useRef(false);

  // AI inline edit (# prefix) — WarpInputBar 위 팝업
  const [aiGhost, setAiGhost] = useState<{ cmd: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCmdError, setAiCmdError] = useState<string | null>(null);
  const aiSuggestionRef = useRef<string | null>(null);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMentionDirectory = useCallback(async (dir: string, trail: string) => {
    setMentionLoading(true);
    try {
      const entries = await invoke<DirEntry[]>("list_directory", { path: dir });
      setMentionEntries(Array.isArray(entries) ? entries : []);
      setMentionDir(dir);
      setMentionTrail(trail);
      setMentionSelected(0);
    } catch {
      setMentionEntries([]);
      setMentionDir(dir);
      setMentionTrail(trail);
      setMentionSelected(0);
    } finally {
      setMentionLoading(false);
    }
  }, []);

  const clearExplain = useCallback(() => {
    if (explainDebounceRef.current) clearTimeout(explainDebounceRef.current);
    setExplainPopup(null);
    setExplainLoading(false);
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const handler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text) return;
      const danger = checkPasteDanger(text);
      if (danger) {
        e.preventDefault();
        e.stopPropagation();
        setPasteGuard({ match: danger, text });
        return;
      }
      // parseCommandLines를 한 번만 호출해 결과를 재사용 (이전엔 isMultiLineCommand 내부 + 여기서 중복 호출)
      const lines = parseCommandLines(text);
      if (lines.length >= 2) {
        e.preventDefault();
        e.stopPropagation();
        setSmartPaste({ lines, rawText: text });
      }
    };
    el.addEventListener("paste", handler, { capture: true });
    return () => el.removeEventListener("paste", handler, { capture: true });
  }, []);

  const doFitAndResize = useCallback(() => {
    const fit = fitAddonRef.current;
    const term = termRef.current;
    if (!fit || !term) return;
    try {
      fit.fit();
      invoke("resize_pty", { id, cols: term.cols, rows: term.rows }).catch(() => {});
    } catch {}
  }, [id]);

  const clearAiGhost = useCallback(() => {
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    aiSuggestionRef.current = null;
    setAiGhost(null);
    setAiCmdError(null);
  }, []);

  const updateGhost = useCallback((buf: string) => {
    const trimmedBuf = buf.trimStart();
    if (/^#\s/.test(trimmedBuf) || /^\?\s/.test(trimmedBuf) || trimmedBuf.startsWith(">>")) {
      if (ghostTextRef.current !== null) {
        ghostTextRef.current = null;
        setGhostText(null);
        suggestionRef.current = null;
      }
      return;
    }
    const suggestion = findCompletion(buf);
    suggestionRef.current = suggestion;
    if (!suggestion) {
      if (ghostTextRef.current !== null) {
        ghostTextRef.current = null;
        setGhostText(null);
      }
      return;
    }
    ghostTextRef.current = suggestion.suffix;
    setGhostText(suggestion.suffix);
  }, []);

  const triggerExplain = useCallback((buf: string) => {
    if (explainDebounceRef.current) clearTimeout(explainDebounceRef.current);
    const query = buf.slice(2).trim();
    if (!query) { setExplainPopup(null); setExplainLoading(false); return; }
    explainDebounceRef.current = setTimeout(async () => {
      setExplainLoading(true);
      setExplainPopup(null);
      try {
        const explanation = await invoke<string>("explain_command", {
          command: query,
          model: modelRef.current,
        });
        setExplainLoading(false);
        setExplainPopup({ text: explanation.trim(), y: 0 });
      } catch {
        setExplainLoading(false);
      }
    }, 500);
  }, []);

  const triggerAiCompletion = useCallback((buf: string) => {
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    const prompt = buf.slice(2).trim();
    if (!prompt) { clearAiGhost(); return; }

    aiDebounceRef.current = setTimeout(async () => {
      setAiLoading(true);
      try {
        const [projectCtx, recentHistory] = await Promise.all([
          invoke<string>("get_project_context", { cwd: cwdRef.current }).catch(() => ""),
          invoke<Array<{ command: string }>>("get_recent_history", { limit: 5 }).catch(() => []),
        ]);
        const recentCmds = recentHistory.map((h) => h.command).join(", ");
        const context = [projectCtx, recentCmds ? `recent: ${recentCmds}` : ""]
          .filter((s) => s)
          .join(" | ");

        const raw = await invoke<string>("generate_ai_command", {
          prompt,
          model: modelRef.current,
          context,
          imageData: null,
        });
        const cmd: string = JSON.parse(raw)?.command ?? "";
        if (!cmd) { setAiLoading(false); return; }
        aiSuggestionRef.current = cmd;
        setAiLoading(false);
        setAiGhost({ cmd });
      } catch (e) {
        setAiLoading(false);
        setAiCmdError(String(e).slice(0, 200));
      }
    }, 600);
  }, [clearAiGhost]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || spawnedRef.current) return;
    spawnedRef.current = true;

    const initFontFamily = fontFamilyRef.current
      ? `"${fontFamilyRef.current}", ${FONT_FAMILY}`
      : FONT_FAMILY;
    const term = new Terminal({
      fontFamily: initFontFamily,
      fontSize: fontSizeRef.current ?? DEFAULT_TERMINAL_FONT_SIZE,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      allowTransparency: false,
      scrollback: 5000,
      theme: xtermThemeRef.current ?? THEME,
      cols: 80,
      rows: 24,
      // xterm 6.x — registerDecoration가 proposed API에 속해 명시적 허용 필요
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // 키 분기 로직은 classifyTerminalKey로 분리됨 (terminalKeys.ts) — 단위 테스트 가능.
    // 여기선 동작만 수행: copy/paste/search/passthrough.
    term.attachCustomKeyEventHandler((e) => {
      const action = classifyTerminalKey(e, term.getSelection());
      switch (action.kind) {
        case "search":
          openSearch();
          return false;
        case "copy":
          navigator.clipboard.writeText(action.selection).catch(() => {});
          term.clearSelection();
          return false; // xterm 기본 SIGINT 막음
        case "paste":
          navigator.clipboard.readText().then((text) => {
            if (!text) return;
            const danger = checkPasteDanger(text);
            if (danger) {
              setPasteGuard({ match: danger, text });
              return;
            }
            const lines = parseCommandLines(text);
            if (lines.length >= 2) {
              setSmartPaste({ lines, rawText: text });
              return;
            }
            writeToPtyRef.current(text);
          }).catch(() => {});
          return false;
        case "passthrough":
          return true;
      }
    });

    const doInitialFit = () => {
      try { fitAddon.fit(); } catch {}
      const { cols, rows } = term;
      if (sshProfile) {
        invoke("spawn_ssh_pty", {
          id,
          host: sshProfile.host,
          port: sshProfile.port,
          username: sshProfile.username,
          keyPath: sshProfile.keyPath,
          cols,
          rows,
        }).catch((e: unknown) => {
          term.write(`\r\n\x1b[31m[SSH 오류: ${e}]\x1b[0m\r\n`);
        });
      } else {
        invoke("spawn_pty", { id, cwd: cwd ?? "", cols, rows }).catch((e: unknown) => {
          term.write(`\r\n\x1b[31m[PTY 오류: ${e}]\x1b[0m\r\n`);
        });
      }
    };

    requestAnimationFrame(() => { setTimeout(doInitialFit, 80); });

    const unlistenData = listen<PtyData>("pty_data", (event) => {
      if (event.payload.id !== id) return;
      const raw = event.payload.data;

      const hasPromptStart = raw.includes("\x1b]133;A");
      const hasCmdStart    = raw.includes("\x1b]133;C");

      // 명령 실행 시작 → 프롬프트 숨김 해제 (명령어 라인이 보이게)
      if (hasCmdStart) {
        promptDecorationRef.current?.dispose();
        promptDecorationRef.current = null;
      }

      // term.write는 비동기 — 콜백 안에서 marker/decoration 등록해야
      // 프롬프트 렌더 후의 정확한 커서 줄에 decoration이 붙는다
      term.write(raw, () => {
        if (hasPromptStart) {
          const marker = term.registerMarker(0);
          if (marker) {
            promptDecorationRef.current?.dispose();
            const dec = term.registerDecoration({ marker, width: term.cols, x: 0, layer: "top" });
            if (dec) {
              dec.onRender((el) => {
                el.style.backgroundColor = THEME.background;
                el.style.width = "100%";
                el.style.height = "100%";
              });
              promptDecorationRef.current = dec;
            }
          }
        }

        if (hasCmdStart) {
          const marker = term.registerMarker(0);
          if (marker) {
            const dec = term.registerDecoration({ marker, width: 2, x: 0 });
            if (dec) {
              dec.onRender((el) => {
                el.style.borderLeft = "2px solid rgba(88,166,255,0.35)";
                el.style.height = "100%";
              });
            }
          }
        }
      });

      onOutputRef.current?.(raw);
      const newCwd = parseOsc7(raw);
      if (newCwd) onCwdChangeRef.current?.(newCwd);
    });

    const unlistenExit = listen<string>("pty_exit", (event) => {
      if (event.payload !== id) return;
      term.write("\r\n\x1b[2m[프로세스 종료 — 새 탭을 열어주세요]\x1b[0m\r\n");
    });

    // xterm을 직접 포커스한 경우에만 발생 (보통은 WarpInputBar가 입력 경로).
    // interactive CLI(vim, less 등)에서 사용자가 xterm에 포커스를 옮길 때만 사용.
    term.onData((data) => {
      invoke("write_to_pty", { id, data }).catch(() => {});
    });

    writeToPtyRef.current = (data) => invoke("write_to_pty", { id, data }).catch(() => {});

    onReadyRef.current?.((data) => {
      invoke("write_to_pty", { id, data }).catch(() => {});
    });

    const resizeObserver = new ResizeObserver(() => doFitAndResize());
    if (outerRef.current) resizeObserver.observe(outerRef.current);
    window.addEventListener("resize", doFitAndResize);

    return () => {
      if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
      if (explainDebounceRef.current) clearTimeout(explainDebounceRef.current);
      promptDecorationRef.current?.dispose();
      promptDecorationRef.current = null;
      unlistenData.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      resizeObserver.disconnect();
      window.removeEventListener("resize", doFitAndResize);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      spawnedRef.current = false;
    };
  }, [id, doFitAndResize, openSearch]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const selected = termRef.current?.getSelection().trim() ?? "";
    if (!selected) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, text: selected });
  }, []);

  const isPathOrUrl = (text: string) =>
    /^https?:\/\//.test(text) ||
    /^[/~]/.test(text) ||
    /^\.[./]/.test(text);

  const ctxExplain = useCallback(async (text: string) => {
    try {
      setExplainLoading(true);
      setExplainPopup(null);
      const explanation = await invoke<string>("explain_command", {
        command: text,
        model: modelRef.current,
      });
      setExplainLoading(false);
      setExplainPopup({ text: explanation.trim(), y: 0 });
    } catch {
      setExplainLoading(false);
    }
  }, []);

  const clearAllOverlays = useCallback(() => {
    ghostTextRef.current = null;
    setGhostText(null);
    suggestionRef.current = null;
    forceMentionAttachRef.current = false;
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    if (explainDebounceRef.current) clearTimeout(explainDebounceRef.current);
    aiSuggestionRef.current = null;
    setAiGhost(null);
    setAiLoading(false);
    setAiCmdError(null);
    setExplainPopup(null);
    setExplainLoading(false);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionDir(null);
    setMentionTrail("");
    setMentionEntries([]);
    setMentionSelected(0);
  }, []);
  const persistInputHistory = useCallback((next: string[]) => {
    try {
      localStorage.setItem(INPUT_HISTORY_KEY, JSON.stringify(next));
    } catch {}
  }, []);
  const recordSubmittedInput = useCallback((rawInput: string) => {
    setLastSubmittedInput(rawInput);
    setSubmittedInputHistory((prev) => {
      const next = [rawInput, ...prev.filter((item) => item !== rawInput)].slice(0, 20);
      persistInputHistory(next);
      return next;
    });
  }, [persistInputHistory]);
  const applyHistoryInput = useCallback((rawInput: string) => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    if (current !== rawInput) {
      if (current !== "") {
        setClearedInputStack((prev) => {
          if (prev[0] === current) return prev;
          return [current, ...prev].slice(0, 5);
        });
      }
      warpInputRef.current?.setValue(rawInput);
      setInputBuffer(rawInput);
    }
    setInputHistoryOpen(false);
    setInputHistoryQuery("");
    setInputHistorySelected(0);
    setInputHistoryRangeAnchor(null);
    setInputHistoryMultiSelected([]);
    warpInputRef.current?.focus();
  }, [inputBuffer]);
  const clearSubmittedInputHistory = useCallback(() => {
    setSubmittedInputHistory([]);
    persistInputHistory([]);
    setLastSubmittedInput("");
    setInputHistorySelected(0);
    setInputHistoryRangeAnchor(null);
    setInputHistoryMultiSelected([]);
  }, [persistInputHistory]);
  const removeSubmittedInputHistoryEntries = useCallback((entries: string[]) => {
    if (entries.length === 0) return;
    const removeSet = new Set(entries);
    setSubmittedInputHistory((prev) => {
      const next = prev.filter((item) => !removeSet.has(item));
      persistInputHistory(next);
      if (lastSubmittedInput && removeSet.has(lastSubmittedInput)) {
        const nextRecall = next.find((item) => hasExecutableRecallRoute(item)) ?? "";
        setLastSubmittedInput(nextRecall);
      }
      return next;
    });
    setInputHistorySelected(0);
    setInputHistoryRangeAnchor(null);
    setInputHistoryMultiSelected([]);
  }, [lastSubmittedInput, persistInputHistory]);
  const removeSubmittedInputHistoryEntry = useCallback((entry: string) => {
    removeSubmittedInputHistoryEntries([entry]);
  }, [removeSubmittedInputHistoryEntries]);
  const clearInputHistoryMultiSelection = useCallback(() => {
    setInputHistoryRangeAnchor(null);
    setInputHistoryMultiSelected([]);
  }, []);
  const filteredSubmittedInputHistory = useMemo(() => {
    const query = inputHistoryQuery.trim().toLowerCase();
    if (!query) return submittedInputHistory;
    return submittedInputHistory.filter((entry) => entry.toLowerCase().includes(query));
  }, [inputHistoryQuery, submittedInputHistory]);
  const inputHistoryMultiSelectedPreview = useMemo(() => {
    if (inputHistoryMultiSelected.length <= 1) return "";
    const tokens = inputHistoryMultiSelected.slice(0, 2).map((entry) => (
      entry.length > 24 ? `${entry.slice(0, 21)}…` : entry
    ));
    if (inputHistoryMultiSelected.length > 2) {
      tokens.push(`+${inputHistoryMultiSelected.length - 2}`);
    }
    return tokens.join(" · ");
  }, [inputHistoryMultiSelected]);
  const handleInputHistoryKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      e.preventDefault();
      if (inputHistoryMultiSelected.length > 1) {
        clearInputHistoryMultiSelection();
        return;
      }
      setInputHistoryOpen(false);
      setInputHistoryQuery("");
      setInputHistorySelected(0);
      setInputHistoryRangeAnchor(null);
      setInputHistoryMultiSelected([]);
      warpInputRef.current?.focus();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (filteredSubmittedInputHistory.length === 0) return;
      setInputHistoryRangeAnchor(0);
      setInputHistorySelected(filteredSubmittedInputHistory.length - 1);
      setInputHistoryMultiSelected(filteredSubmittedInputHistory);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredSubmittedInputHistory.length === 0) return;
      const next = (inputHistorySelected + 1) % filteredSubmittedInputHistory.length;
      if (e.shiftKey) {
        const anchor = inputHistoryRangeAnchor ?? inputHistorySelected;
        const min = Math.min(anchor, next);
        const max = Math.max(anchor, next);
        setInputHistoryRangeAnchor(anchor);
        setInputHistoryMultiSelected(filteredSubmittedInputHistory.slice(min, max + 1));
      } else {
        setInputHistoryRangeAnchor(next);
        setInputHistoryMultiSelected([]);
      }
      setInputHistorySelected(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredSubmittedInputHistory.length === 0) return;
      const next = (inputHistorySelected - 1 + filteredSubmittedInputHistory.length) % filteredSubmittedInputHistory.length;
      if (e.shiftKey) {
        const anchor = inputHistoryRangeAnchor ?? inputHistorySelected;
        const min = Math.min(anchor, next);
        const max = Math.max(anchor, next);
        setInputHistoryRangeAnchor(anchor);
        setInputHistoryMultiSelected(filteredSubmittedInputHistory.slice(min, max + 1));
      } else {
        setInputHistoryRangeAnchor(next);
        setInputHistoryMultiSelected([]);
      }
      setInputHistorySelected(next);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      if (filteredSubmittedInputHistory.length === 0) return;
      const next = e.key === "Home" ? 0 : filteredSubmittedInputHistory.length - 1;
      setInputHistorySelected(next);
      setInputHistoryRangeAnchor(null);
      setInputHistoryMultiSelected([]);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredSubmittedInputHistory[inputHistorySelected];
      if (target) applyHistoryInput(target);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (inputHistoryMultiSelected.length > 1) {
        removeSubmittedInputHistoryEntries(inputHistoryMultiSelected);
        return;
      }
      const target = filteredSubmittedInputHistory[inputHistorySelected];
      if (!target) return;
      removeSubmittedInputHistoryEntries([target]);
    }
  }, [
    applyHistoryInput,
    clearInputHistoryMultiSelection,
    filteredSubmittedInputHistory,
    inputHistoryMultiSelected,
    inputHistoryRangeAnchor,
    inputHistorySelected,
    removeSubmittedInputHistoryEntries,
  ]);

  // 입력 라우팅: 기본=AI, 알려진 CLI=shell, !/@/#/?/>> = 명시적 오버라이드
  const handleSubmit = useCallback((rawInput: string) => {
    const route = routeInput(rawInput);
    clearAllOverlays();
    switch (route.type) {
      case "empty":
        return;
      case "shell":
        recordSubmittedInput(rawInput);
        setTerminalVisible(true);
        invoke("write_to_pty", { id, data: route.command + "\r" }).catch(() => {});
        return;
      case "ai":
        if (route.question) {
          recordSubmittedInput(rawInput);
          if (route.backend) {
            onAskAIRef.current?.(route.question, undefined, undefined, route.backend);
          } else {
            onAskAIRef.current?.(route.question);
          }
        }
        return;
      case "heavy":
        // !! Heavy Track — engine="heavy" 명시 전달 → 백엔드가 mistral.rs로 라우팅
        if (route.prompt) {
          recordSubmittedInput(rawInput);
          onAskAIRef.current?.(route.prompt, undefined, "heavy");
        }
        return;
      case "agent":
        if (route.task) {
          recordSubmittedInput(rawInput);
          onAgentTriggerRef.current?.(route.task, route.backend);
        }
        return;
      case "aiCmd":
      case "explain":
        return;
    }
  }, [id, clearAllOverlays, recordSubmittedInput]);

  const handleInterrupt = useCallback(() => {
    onCancelAIRef.current?.();
    invoke("write_to_pty", { id, data: "\x03" }).catch(() => {});
  }, [id]);

  const handleInputChange = useCallback((buf: string) => {
    setInputBuffer(buf);

    const mentionMatch = /(?:^|\s)@([^\s@]*)$/.exec(buf);
    const isForcePrefix = buf.trimStart().startsWith("@");
    const leadingWs = buf.length - buf.trimStart().length;
    const mentionTokenStart = mentionMatch
      ? mentionMatch.index + (mentionMatch[0].startsWith(" ") ? 1 : 0)
      : -1;
    const startsWithMention = mentionTokenStart === leadingWs;
    const isForceMentionOpen = isForcePrefix && startsWithMention && forceMentionAttachRef.current;
    if (mentionMatch && (!isForcePrefix || !startsWithMention || isForceMentionOpen)) {
      setMentionQuery((mentionMatch[1] ?? "").toLowerCase());
      setMentionOpen(true);
      if (!mentionDir && cwd) {
        loadMentionDirectory(cwd, "");
      }
    } else {
      if (forceMentionAttachRef.current) {
        forceMentionAttachRef.current = false;
      }
      setMentionOpen(false);
      setMentionQuery("");
      setMentionDir(null);
      setMentionTrail("");
      setMentionEntries([]);
      setMentionSelected(0);
    }

    const trimmedBuf = buf.trimStart();
    if (/^#\s/.test(trimmedBuf)) {
      clearExplain();
      triggerAiCompletion(trimmedBuf);
    } else if (/^\?\s/.test(trimmedBuf)) {
      clearAiGhost();
      triggerExplain(trimmedBuf);
    } else if (trimmedBuf.startsWith(">>")) {
      clearAiGhost();
      clearExplain();
      if (ghostTextRef.current !== null) { ghostTextRef.current = null; setGhostText(null); }
    } else {
      clearAiGhost();
      clearExplain();
      updateGhost(buf);
    }
  }, [clearAiGhost, clearExplain, triggerAiCompletion, triggerExplain, updateGhost, mentionDir, cwd, loadMentionDirectory]);

  const canGoMentionParent = !!mentionOpen && !!mentionDir && !!cwd && mentionDir !== cwd;
  const filteredMentions = mentionEntries
    .filter((e) => mentionQuery === "" || e.name.toLowerCase().includes(mentionQuery))
    .slice(0, 8);

  const mentionItems: MentionItem[] = [
    ...(canGoMentionParent ? [{ kind: "parent" as const }] : []),
    ...filteredMentions.map((entry) => ({ kind: "entry" as const, entry })),
  ];

  useEffect(() => {
    if (!mentionOpen) return;
    if (
      mentionItems.length > 1 &&
      mentionSelected === 0 &&
      mentionItems[0].kind === "parent"
    ) {
      setMentionSelected(1);
      return;
    }
    if (mentionSelected >= mentionItems.length) {
      setMentionSelected(Math.max(0, mentionItems.length - 1));
    }
  }, [mentionItems, mentionOpen, mentionSelected]);
  useEffect(() => {
    if (!actionPaletteOpen) return;
    actionPaletteInputRef.current?.focus();
    actionPaletteInputRef.current?.select();
  }, [actionPaletteOpen]);
  useEffect(() => {
    if (!inputHistoryOpen) return;
    inputHistoryInputRef.current?.focus();
    inputHistoryInputRef.current?.select();
  }, [inputHistoryOpen]);
  useEffect(() => {
    const dock = inputDockRef.current;
    if (!dock) return;
    const update = () => {
      const rect = dock.getBoundingClientRect();
      setInputDockHeight(Math.ceil(rect.height));
      setInputDockWidth(Math.ceil(rect.width));
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(() => update());
    observer.observe(dock);
    return () => observer.disconnect();
  }, [showInputTip]);

  const attachMentionToken = useCallback((tokenPath: string) => {
    forceMentionAttachRef.current = false;
    const token = `@${tokenPath}`;
    const next = inputBuffer.replace(
      /(?:^|\s)@[^\s@]*$/,
      (whole) => (whole.startsWith(" ") ? ` ${token} ` : `${token} `),
    );
    warpInputRef.current?.setValue(next);
    setInputBuffer(next);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionDir(null);
    setMentionTrail("");
    setMentionEntries([]);
    setMentionSelected(0);
  }, [inputBuffer]);

  const goMentionParent = useCallback(async () => {
    if (!mentionDir || !cwd) return;
    try {
      const parent = await invoke<string | null>("parent_directory", { path: mentionDir });
      if (!parent || !parent.startsWith(cwd)) return;
      const trimmed = mentionTrail.endsWith("/") ? mentionTrail.slice(0, -1) : mentionTrail;
      const idx = trimmed.lastIndexOf("/");
      const nextTrail = idx >= 0 ? trimmed.slice(0, idx + 1) : "";
      await loadMentionDirectory(parent, nextTrail);
      setMentionQuery("");
    } catch {
      // noop
    }
  }, [mentionDir, cwd, mentionTrail, loadMentionDirectory]);

  const applyMentionItem = useCallback(async (item: MentionItem) => {
    if (item.kind === "parent") {
      await goMentionParent();
      return;
    }
    const entry = item.entry;
    if (entry.is_dir) {
      const nextTrail = `${mentionTrail}${entry.name}/`;
      await loadMentionDirectory(entry.path, nextTrail);
      setMentionQuery("");
      return;
    }
    attachMentionToken(`${mentionTrail}${entry.name}`);
  }, [mentionTrail, loadMentionDirectory, attachMentionToken, goMentionParent]);

  const handleMentionKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!mentionOpen || mentionItems.length === 0) return false;
    if (e.key === "ArrowDown") {
      setMentionSelected((prev) => (prev + 1) % mentionItems.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      setMentionSelected((prev) => (prev - 1 + mentionItems.length) % mentionItems.length);
      return true;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setMentionSelected(0);
      return true;
    }
    if (e.key === "End") {
      e.preventDefault();
      setMentionSelected(mentionItems.length - 1);
      return true;
    }
    if (e.key === "Escape") {
      setMentionOpen(false);
      setMentionQuery("");
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      const item = mentionItems[mentionSelected];
      if (item) {
        applyMentionItem(item).catch(() => {});
        return true;
      }
    }
    return false;
  }, [mentionOpen, mentionItems, mentionSelected, applyMentionItem]);

  const handleTab = useCallback((buf: string): boolean => {
    // AI 제안 있으면 전체 교체
    if (aiSuggestionRef.current) {
      warpInputRef.current?.setValue(aiSuggestionRef.current);
      aiSuggestionRef.current = null;
      setAiGhost(null);
      return true;
    }
    // Ghost text 완성
    if (suggestionRef.current) {
      warpInputRef.current?.setValue(buf + suggestionRef.current.insert);
      suggestionRef.current = null;
      ghostTextRef.current = null;
      setGhostText(null);
      return true;
    }
    return false;
  }, []);

  const activeBackendPrefix = useMemo(
    () => detectBackendPrefixFromInput(inputBuffer),
    [inputBuffer],
  );
  const isBackendOnlyInput =
    activeBackendPrefix !== null && clearBackendPrefixFromInput(inputBuffer).trim() === "";
  const [backendTrail, setBackendTrail] = useState<{ last: AiBackend; prev: AiBackend | null }>({
    last: "local",
    prev: null,
  });
  useEffect(() => {
    if (activeBackendPrefix) {
      setBackendTrail((trail) => {
        if (trail.last === activeBackendPrefix) return trail;
        return { last: activeBackendPrefix, prev: trail.last };
      });
    }
  }, [activeBackendPrefix]);

  const applyBackendQuickPrefix = useCallback((backend: AiBackend) => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const active = detectBackendPrefixFromInput(current);
    const next = active === backend
      ? clearBackendPrefixFromInput(current)
      : applyBackendPrefixToInput(current, backend);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [inputBuffer]);
  const clearBackendQuickPrefix = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const active = detectBackendPrefixFromInput(current);
    const next = active === null
      ? applyBackendPrefixToInput(current, backendTrail.last)
      : clearBackendPrefixFromInput(current);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [backendTrail.last, inputBuffer]);
  const clearQuickModePrefix = useCallback((raw: string) => (
    raw
      .replace(/^(\s*)!!\s?/, "$1")
      .replace(/^(\s*)>>\s?/, "$1")
      .replace(/^(\s*)\?\s*/, "$1")
      .replace(/^(\s*)#\s*/, "$1")
      .replace(/^(\s*)!\s?/, "$1")
  ), []);
  const clearForceAiPrefix = useCallback((raw: string) => {
    if (detectBackendPrefixFromInput(raw)) return clearBackendPrefixFromInput(raw);
    return raw.replace(/^(\s*)@\s?/, "$1");
  }, []);
  const hasForceAiPrefix = useCallback((raw: string) => (
    detectBackendPrefixFromInput(raw) === null && /^\s*@\s?/.test(raw)
  ), []);
  const toggleQuickModePrefix = useCallback((mode: "shell" | "agent" | "explain" | "aiCmd" | "heavy") => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const leading = current.match(/^\s*/)?.[0] ?? "";
    const isHeavy = /^\s*!!\s?/.test(current);
    const isShell = /^\s*!(?!\!)/.test(current);
    const isAgent = /^\s*>>\s?/.test(current);
    const isExplain = /^\s*\?\s+/.test(current);
    const isAiCmd = /^\s*#\s+/.test(current);
    const body = clearQuickModePrefix(current);
    const bodyAfterLeading = body.slice(leading.length);
    let next = current;
    if (mode === "heavy") {
      next = isHeavy ? body : `${leading}!! ${bodyAfterLeading}`;
    } else if (mode === "shell") {
      next = isShell ? body : `${leading}!${bodyAfterLeading}`;
    } else if (mode === "agent") {
      next = isAgent ? body : `${leading}>> ${bodyAfterLeading}`;
    } else if (mode === "explain") {
      const explainBody = bodyAfterLeading.replace(/^\?\s*/, "");
      next = isExplain ? body : `${leading}? ${explainBody}`;
    } else {
      const aiCmdBody = bodyAfterLeading.replace(/^#\s*/, "");
      next = isAiCmd ? body : `${leading}# ${aiCmdBody}`;
    }
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [clearQuickModePrefix, inputBuffer]);
  const toggleForceAiPrefix = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const isForceAi = hasForceAiPrefix(current);
    const leading = current.match(/^\s*/)?.[0] ?? "";
    const base = clearForceAiPrefix(clearQuickModePrefix(current));
    const bodyAfterLeading = base.slice(leading.length);
    const next = isForceAi ? base : `${leading}@${bodyAfterLeading}`;
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [clearForceAiPrefix, clearQuickModePrefix, hasForceAiPrefix, inputBuffer]);
  const toPlainInput = useCallback((raw: string) => {
    let next = raw;
    for (let i = 0; i < 3; i += 1) {
      const prev = next;
      next = clearQuickModePrefix(next);
      next = clearForceAiPrefix(next);
      if (next === prev) break;
    }
    return next;
  }, [clearForceAiPrefix, clearQuickModePrefix]);
  const pushUndoSnapshot = useCallback((snapshot: string) => {
    if (snapshot === "") return;
    setClearedInputStack((prev) => {
      if (prev[0] === snapshot) return prev;
      return [snapshot, ...prev].slice(0, 5);
    });
  }, []);
  const normalizeInputToPlain = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = toPlainInput(current);
    if (next === current) return;
    pushUndoSnapshot(current);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer, pushUndoSnapshot, toPlainInput]);
  const trimInputQuick = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = current.trim();
    if (next === current) return;
    pushUndoSnapshot(current);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer, pushUndoSnapshot]);
  const squashInputSpacesQuick = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = current.replace(/\s{2,}/g, " ");
    if (next === current) return;
    pushUndoSnapshot(current);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer, pushUndoSnapshot]);
  const cleanInputQuick = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = current.trim().replace(/\s{2,}/g, " ");
    if (next === current) return;
    pushUndoSnapshot(current);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer, pushUndoSnapshot]);
  const cycleBackendQuickPrefix = useCallback((dir: 1 | -1) => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const order: AiBackend[] = ["local", "ollama", "xllm", "gemini"];
    const active = detectBackendPrefixFromInput(current);
    if (!active) {
      const next = applyBackendPrefixToInput(current, dir > 0 ? order[0] : order[order.length - 1]);
      warpInputRef.current?.setValue(next);
      warpInputRef.current?.focus();
      return;
    }
    const idx = order.indexOf(active);
    if (idx < 0) {
      const next = clearBackendPrefixFromInput(current);
      warpInputRef.current?.setValue(next);
      warpInputRef.current?.focus();
      return;
    }
    const nextIdx = idx + dir;
    const next = nextIdx < 0 || nextIdx >= order.length
      ? clearBackendPrefixFromInput(current)
      : applyBackendPrefixToInput(current, order[nextIdx]);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [inputBuffer]);
  const restorePrevBackendQuickPrefix = useCallback(() => {
    if (!backendTrail.prev) return;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = applyBackendPrefixToInput(current, backendTrail.prev);
    if (next === current) {
      warpInputRef.current?.focus();
      return;
    }
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [backendTrail.prev, inputBuffer]);
  const restoreLastBackendQuickPrefix = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = applyBackendPrefixToInput(current, backendTrail.last);
    if (next === current) {
      warpInputRef.current?.focus();
      return;
    }
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [backendTrail.last, inputBuffer]);
  const canRestorePrevBackendQuick = useMemo(() => {
    if (!backendTrail.prev) return false;
    return applyBackendPrefixToInput(inputBuffer, backendTrail.prev) !== inputBuffer;
  }, [backendTrail.prev, inputBuffer]);
  const canRestoreLastBackendQuick = useMemo(
    () => applyBackendPrefixToInput(inputBuffer, backendTrail.last) !== inputBuffer,
    [backendTrail.last, inputBuffer],
  );
  const canNormalizeToPlain = toPlainInput(inputBuffer) !== inputBuffer;
  const canTrimInput = inputBuffer !== inputBuffer.trim();
  const canSquashInputSpaces = /\s{2,}/.test(inputBuffer);
  const canCleanInput = inputBuffer !== inputBuffer.trim().replace(/\s{2,}/g, " ");
  const hasClearableOverlay =
    ghostText !== null ||
    aiGhost !== null ||
    aiLoading ||
    aiCmdError !== null ||
    explainPopup !== null ||
    explainLoading ||
    mentionOpen ||
    mentionQuery !== "" ||
    mentionDir !== null ||
    mentionTrail !== "" ||
    mentionEntries.length > 0 ||
    mentionLoading;
  const canClearInputQuick = inputBuffer !== "" || hasClearableOverlay;
  const canResetAllQuick = inputBuffer !== "" || clearedInputStack.length > 0 || lastSubmittedInput !== "";
  const getRecallCandidate = useCallback((raw: string): string => {
    const normalized = raw.trim();
    if (!hasExecutableRecallRoute(raw)) return "";
    return normalized;
  }, []);
  const normalizedRecallCandidate = getRecallCandidate(inputBuffer);
  const normalizedLastSubmittedCandidate = getRecallCandidate(lastSubmittedInput);
  useEffect(() => {
    if (recallHydratedRef.current) return;
    recallHydratedRef.current = true;
    if (lastSubmittedInput !== "") return;
    const firstExecutable = submittedInputHistory.find((entry) => getRecallCandidate(entry) !== "") ?? "";
    if (firstExecutable === "") return;
    setLastSubmittedInput(firstExecutable);
  }, [getRecallCandidate, lastSubmittedInput, submittedInputHistory]);
  const canSetRecallFromCurrent =
    normalizedRecallCandidate !== "" && normalizedRecallCandidate !== normalizedLastSubmittedCandidate;
  const canRerunSubmittedInput = normalizedLastSubmittedCandidate !== "";
  const canRecallSubmittedInput =
    normalizedLastSubmittedCandidate !== "" && inputBuffer !== lastSubmittedInput;
  const canSwapSubmittedInput =
    normalizedLastSubmittedCandidate !== "" &&
    normalizedRecallCandidate !== "" &&
    normalizedRecallCandidate !== normalizedLastSubmittedCandidate;
  const triggerMentionAttach = useCallback(() => {
    forceMentionAttachRef.current = true;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    if (/(?:^|\s)@[^\s@]*$/.test(current)) {
      warpInputRef.current?.focus();
      return;
    }
    const padded = current === "" || /\s$/.test(current) ? current : `${current} `;
    const next = `${padded}@`;
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [inputBuffer]);
  const clearInputQuick = useCallback(() => {
    if (!canClearInputQuick) return;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    pushUndoSnapshot(current);
    clearAllOverlays();
    warpInputRef.current?.setValue("");
    warpInputRef.current?.focus();
    setInputBuffer("");
  }, [canClearInputQuick, clearAllOverlays, inputBuffer, pushUndoSnapshot]);
  const resetAllInputStateQuick = useCallback(() => {
    if (!canResetAllQuick) return;
    clearAllOverlays();
    warpInputRef.current?.setValue("");
    warpInputRef.current?.focus();
    setInputBuffer("");
    setClearedInputStack([]);
    setLastSubmittedInput("");
  }, [canResetAllQuick, clearAllOverlays]);
  const restoreInputQuick = useCallback(() => {
    if (clearedInputStack.length === 0) return;
    const [head, ...rest] = clearedInputStack;
    warpInputRef.current?.setValue(head);
    warpInputRef.current?.focus();
    setInputBuffer(head);
    setClearedInputStack(rest);
  }, [clearedInputStack]);
  const forgetUndoStackQuick = useCallback(() => {
    if (clearedInputStack.length === 0) return;
    setClearedInputStack([]);
  }, [clearedInputStack]);
  const recallSubmittedInputQuick = useCallback(() => {
    if (!canRecallSubmittedInput) return;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    if (current === lastSubmittedInput) {
      warpInputRef.current?.focus();
      return;
    }
    pushUndoSnapshot(current);
    warpInputRef.current?.setValue(lastSubmittedInput);
    warpInputRef.current?.focus();
    setInputBuffer(lastSubmittedInput);
  }, [canRecallSubmittedInput, inputBuffer, lastSubmittedInput, pushUndoSnapshot]);
  const setRecallFromCurrentQuick = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const normalized = getRecallCandidate(current);
    if (normalized === "") return;
    recordSubmittedInput(normalized);
    warpInputRef.current?.focus();
  }, [getRecallCandidate, inputBuffer, recordSubmittedInput]);
  const swapWithSubmittedInputQuick = useCallback(() => {
    if (!canSwapSubmittedInput) return;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    if (current === lastSubmittedInput) {
      warpInputRef.current?.focus();
      return;
    }
    pushUndoSnapshot(current);
    warpInputRef.current?.setValue(lastSubmittedInput);
    warpInputRef.current?.focus();
    setInputBuffer(lastSubmittedInput);
    setLastSubmittedInput(current);
  }, [canSwapSubmittedInput, inputBuffer, lastSubmittedInput, pushUndoSnapshot]);
  const rerunSubmittedInputQuick = useCallback(() => {
    if (!canRerunSubmittedInput) return;
    handleSubmit(lastSubmittedInput);
  }, [canRerunSubmittedInput, handleSubmit, lastSubmittedInput]);
  const forgetSubmittedInputQuick = useCallback(() => {
    if (!lastSubmittedInput) return;
    setLastSubmittedInput("");
  }, [lastSubmittedInput]);
  const computeMergeRecallNext = useCallback((current: string, recall: string): string | null => {
    const base = current.trim();
    const last = recall.trim();
    if (!last) return null;
    if (base && (base === last || base.endsWith(` ${last}`))) return null;
    return base ? `${base} ${last}` : last;
  }, []);
  const computePrependRecallNext = useCallback((current: string, recall: string): string | null => {
    const base = current.trim();
    const last = recall.trim();
    if (!last) return null;
    if (base && (base === last || base.startsWith(`${last} `))) return null;
    return base ? `${last} ${base}` : last;
  }, []);
  const mergeSubmittedInputQuick = useCallback(() => {
    if (normalizedLastSubmittedCandidate === "") return;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = computeMergeRecallNext(current, normalizedLastSubmittedCandidate);
    if (!next) {
      warpInputRef.current?.focus();
      return;
    }
    pushUndoSnapshot(current);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [computeMergeRecallNext, inputBuffer, normalizedLastSubmittedCandidate, pushUndoSnapshot]);
  const prependSubmittedInputQuick = useCallback(() => {
    if (normalizedLastSubmittedCandidate === "") return;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = computePrependRecallNext(current, normalizedLastSubmittedCandidate);
    if (!next) {
      warpInputRef.current?.focus();
      return;
    }
    pushUndoSnapshot(current);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [computePrependRecallNext, inputBuffer, normalizedLastSubmittedCandidate, pushUndoSnapshot]);
  const canMergeRecall =
    normalizedLastSubmittedCandidate !== "" &&
    computeMergeRecallNext(inputBuffer, normalizedLastSubmittedCandidate) !== null;
  const canPrependRecall =
    normalizedLastSubmittedCandidate !== "" &&
    computePrependRecallNext(inputBuffer, normalizedLastSubmittedCandidate) !== null;
  const actionPaletteActions = useMemo(() => ([
    {
      id: "history_open",
      label: "Open Input History",
      keywords: "history recent",
      run: () => {
        setInputHistoryOpen(true);
        setInputHistoryQuery("");
        setInputHistorySelected(0);
        setInputHistoryRangeAnchor(null);
        setInputHistoryMultiSelected([]);
      },
      disabled: submittedInputHistory.length === 0,
    },
    { id: "clear", label: "Clear Input", keywords: "clear", run: clearInputQuick, disabled: !canClearInputQuick },
    { id: "interrupt", label: "Interrupt Running Task", keywords: "interrupt stop cancel", run: handleInterrupt, disabled: false },
    { id: "undo", label: "Undo Clear", keywords: "undo restore", run: restoreInputQuick, disabled: clearedInputStack.length === 0 },
    { id: "set_recall", label: "Set Recall From Current Input", keywords: "set recall save current", run: setRecallFromCurrentQuick, disabled: !canSetRecallFromCurrent },
    { id: "recall", label: "Recall Last Input", keywords: "recall", run: recallSubmittedInputQuick, disabled: !canRecallSubmittedInput },
    { id: "rerun", label: "Rerun Last Input", keywords: "rerun repeat", run: rerunSubmittedInputQuick, disabled: !canRerunSubmittedInput },
    { id: "forget_recall", label: "Forget Recall Input", keywords: "forget recall drop", run: forgetSubmittedInputQuick, disabled: !lastSubmittedInput },
    { id: "swap_recall", label: "Swap Current/Recall Input", keywords: "swap recall", run: swapWithSubmittedInputQuick, disabled: !canSwapSubmittedInput },
    { id: "merge_recall", label: "Merge Recall Input", keywords: "merge recall", run: mergeSubmittedInputQuick, disabled: !canMergeRecall },
    { id: "prepend_recall", label: "Prepend Recall Input", keywords: "prepend recall", run: prependSubmittedInputQuick, disabled: !canPrependRecall },
    { id: "reset", label: "Reset Input State", keywords: "reset", run: resetAllInputStateQuick, disabled: !canResetAllQuick },
    { id: "toggle_terminal", label: "Toggle Terminal View", keywords: "terminal view", run: () => setTerminalVisible((v) => !v), disabled: false },
    { id: "toggle_vision", label: "Toggle Vision Mode", keywords: "vision image", run: () => setVisionMode((v) => !v), disabled: false },
    { id: "toggle_reasoning", label: showReasoning ? "Hide Reasoning View" : "Show Reasoning View", keywords: "reasoning think", run: () => onToggleReasoning?.(), disabled: false },
    { id: "mention_attach", label: "Attach File Mention", keywords: "mention attach file @", run: triggerMentionAttach, disabled: false },
    { id: "plain", label: "Normalize to Plain Input", keywords: "plain normalize prefix", run: normalizeInputToPlain, disabled: !canNormalizeToPlain },
    { id: "trim", label: "Trim Input", keywords: "trim whitespace", run: trimInputQuick, disabled: !canTrimInput },
    { id: "squash", label: "Squash Spaces", keywords: "squash spaces", run: squashInputSpacesQuick, disabled: !canSquashInputSpaces },
    { id: "clean", label: "Clean Input (Trim + Squash)", keywords: "clean trim squash", run: cleanInputQuick, disabled: !canCleanInput },
    { id: "mode_heavy", label: "Toggle Heavy Mode (!!)", keywords: "mode heavy !!", run: () => toggleQuickModePrefix("heavy"), disabled: false },
    { id: "mode_shell", label: "Toggle Shell Mode (!)", keywords: "mode shell !", run: () => toggleQuickModePrefix("shell"), disabled: false },
    { id: "mode_agent", label: "Toggle Agent Mode (>>)", keywords: "mode agent >>", run: () => toggleQuickModePrefix("agent"), disabled: false },
    { id: "mode_explain", label: "Toggle Explain Mode (?)", keywords: "mode explain ?", run: () => toggleQuickModePrefix("explain"), disabled: false },
    { id: "mode_ai_cmd", label: "Toggle AI Cmd Mode (#)", keywords: "mode ai cmd #", run: () => toggleQuickModePrefix("aiCmd"), disabled: false },
    { id: "mode_force_ai", label: "Toggle Force AI Mode (@)", keywords: "mode force ai @", run: toggleForceAiPrefix, disabled: false },
    { id: "backend_auto", label: "Backend Auto Toggle", keywords: "backend auto", run: clearBackendQuickPrefix, disabled: false },
    { id: "backend_back", label: "Backend Back", keywords: "backend back", run: restorePrevBackendQuickPrefix, disabled: !canRestorePrevBackendQuick },
    { id: "backend_last", label: "Backend Last", keywords: "backend last", run: restoreLastBackendQuickPrefix, disabled: !canRestoreLastBackendQuick },
  ]), [
    canClearInputQuick,
    canSetRecallFromCurrent,
    canRecallSubmittedInput,
    canRerunSubmittedInput,
    lastSubmittedInput,
    canSwapSubmittedInput,
    canMergeRecall,
    canPrependRecall,
    canResetAllQuick,
    canRestoreLastBackendQuick,
    canRestorePrevBackendQuick,
    clearBackendQuickPrefix,
    clearInputQuick,
    clearedInputStack.length,
    handleInterrupt,
    toggleQuickModePrefix,
    toggleForceAiPrefix,
    normalizeInputToPlain,
    trimInputQuick,
    squashInputSpacesQuick,
    cleanInputQuick,
    canNormalizeToPlain,
    canTrimInput,
    canSquashInputSpaces,
    canCleanInput,
    submittedInputHistory.length,
    setRecallFromCurrentQuick,
    recallSubmittedInputQuick,
    rerunSubmittedInputQuick,
    forgetSubmittedInputQuick,
    swapWithSubmittedInputQuick,
    mergeSubmittedInputQuick,
    prependSubmittedInputQuick,
    resetAllInputStateQuick,
    restoreInputQuick,
    restoreLastBackendQuickPrefix,
    restorePrevBackendQuickPrefix,
    onToggleReasoning,
    triggerMentionAttach,
    setInputHistoryMultiSelected,
    setInputHistoryOpen,
    setInputHistoryQuery,
    setInputHistoryRangeAnchor,
    setInputHistorySelected,
  ]);
  const actionPaletteFiltered = useMemo(() => {
    const query = actionPaletteQuery.trim().toLowerCase();
    if (!query) return actionPaletteActions;
    return actionPaletteActions.filter((action) => (
      action.label.toLowerCase().includes(query) || action.keywords.includes(query)
    ));
  }, [actionPaletteActions, actionPaletteQuery]);
  const executePaletteAction = useCallback((index: number) => {
    const action = actionPaletteFiltered[index];
    if (!action || action.disabled) return;
    action.run();
    setActionPaletteOpen(false);
    setActionPaletteQuery("");
    setActionPaletteSelected(0);
    warpInputRef.current?.focus();
  }, [actionPaletteFiltered]);
  const handleActionPaletteKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setActionPaletteOpen(false);
      setActionPaletteQuery("");
      setActionPaletteSelected(0);
      warpInputRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActionPaletteSelected((prev) => {
        if (actionPaletteFiltered.length === 0) return 0;
        return (prev + 1) % actionPaletteFiltered.length;
      });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActionPaletteSelected((prev) => {
        if (actionPaletteFiltered.length === 0) return 0;
        return (prev - 1 + actionPaletteFiltered.length) % actionPaletteFiltered.length;
      });
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActionPaletteSelected(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActionPaletteSelected(Math.max(0, actionPaletteFiltered.length - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      executePaletteAction(actionPaletteSelected);
    }
  }, [actionPaletteFiltered.length, actionPaletteSelected, executePaletteAction]);
  const handleInputKeyDownIntercept = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    const lowered = e.key.toLowerCase();
    if (e.key === "Escape" && inputHistoryOpen) {
      if (inputHistoryMultiSelected.length > 1) {
        clearInputHistoryMultiSelection();
        return true;
      }
      setInputHistoryOpen(false);
      setInputHistoryQuery("");
      setInputHistorySelected(0);
      setInputHistoryRangeAnchor(null);
      setInputHistoryMultiSelected([]);
      return true;
    }
    if (mod && !e.shiftKey && !e.altKey && (lowered === "k" || e.code === "KeyK")) {
      setActionPaletteOpen((open) => !open);
      setActionPaletteQuery("");
      setActionPaletteSelected(0);
      return true;
    }
    if (e.key === "Escape" && shortcutHelpOpen) {
      setShortcutHelpOpen(false);
      return true;
    }
    if (mod && !e.altKey && (e.key === "/" || e.code === "Slash")) {
      setShortcutHelpOpen((open) => !open);
      return true;
    }
    if (mod && e.shiftKey && !e.altKey) {
      if (e.key === "ArrowLeft") {
        cycleBackendQuickPrefix(-1);
        return true;
      }
      if (e.key === "ArrowRight") {
        cycleBackendQuickPrefix(1);
        return true;
      }
      if (lowered === "c") {
        handleInterrupt();
        return true;
      }
      if (e.key === "1" || e.code === "Digit1") {
        applyBackendQuickPrefix("local");
        return true;
      }
      if (e.key === "2" || e.code === "Digit2") {
        applyBackendQuickPrefix("ollama");
        return true;
      }
      if (e.key === "3" || e.code === "Digit3") {
        applyBackendQuickPrefix("xllm");
        return true;
      }
      if (e.key === "4" || e.code === "Digit4") {
        applyBackendQuickPrefix("gemini");
        return true;
      }
      if (e.key === "0" || e.code === "Digit0") {
        clearBackendQuickPrefix();
        return true;
      }
      if (lowered === "k") {
        if (!canClearInputQuick) return true;
        clearInputQuick();
        return true;
      }
      if (lowered === "z") {
        if (clearedInputStack.length === 0) return true;
        restoreInputQuick();
        return true;
      }
      if (lowered === "r") {
        if (!canRecallSubmittedInput) return true;
        recallSubmittedInputQuick();
        return true;
      }
      if (lowered === "l") {
        if (!canCleanInput) return true;
        cleanInputQuick();
        return true;
      }
      if (lowered === "m") {
        if (!canMergeRecall) return true;
        mergeSubmittedInputQuick();
        return true;
      }
      if (lowered === "p") {
        if (!canPrependRecall) return true;
        prependSubmittedInputQuick();
        return true;
      }
      if (lowered === "s") {
        if (!canSetRecallFromCurrent) return true;
        setRecallFromCurrentQuick();
        return true;
      }
      if (lowered === "f") {
        if (!lastSubmittedInput) return true;
        forgetSubmittedInputQuick();
        return true;
      }
      if (lowered === "x") {
        if (!canResetAllQuick) return true;
        resetAllInputStateQuick();
        return true;
      }
      if (lowered === "d") {
        if (clearedInputStack.length === 0) return true;
        forgetUndoStackQuick();
        return true;
      }
      if (lowered === "e") {
        if (!canRerunSubmittedInput) return true;
        rerunSubmittedInputQuick();
        return true;
      }
      if (lowered === "w") {
        if (!canSwapSubmittedInput) return true;
        swapWithSubmittedInputQuick();
        return true;
      }
      if (lowered === "b") {
        if (!canRestorePrevBackendQuick) return true;
        restorePrevBackendQuickPrefix();
        return true;
      }
      if (lowered === "n") {
        if (!canRestoreLastBackendQuick) return true;
        restoreLastBackendQuickPrefix();
        return true;
      }
      if (lowered === "g") {
        if (!canNormalizeToPlain) return true;
        normalizeInputToPlain();
        return true;
      }
      if (lowered === "t") {
        if (!canTrimInput) return true;
        trimInputQuick();
        return true;
      }
      if (lowered === "q") {
        if (!canSquashInputSpaces) return true;
        squashInputSpacesQuick();
        return true;
      }
      if (lowered === "a") {
        triggerMentionAttach();
        return true;
      }
      if (lowered === "o") {
        clearBackendQuickPrefix();
        return true;
      }
      if (lowered === "h") {
        toggleQuickModePrefix("heavy");
        return true;
      }
      if (lowered === "y") {
        toggleQuickModePrefix("shell");
        return true;
      }
      if (lowered === "j") {
        toggleQuickModePrefix("agent");
        return true;
      }
      if (lowered === "u") {
        toggleQuickModePrefix("explain");
        return true;
      }
      if (lowered === "v") {
        toggleQuickModePrefix("aiCmd");
        return true;
      }
      if (lowered === "i") {
        toggleForceAiPrefix();
        return true;
      }
    }
    return handleMentionKeyDown(e);
  }, [
    applyBackendQuickPrefix,
    cleanInputQuick,
    canCleanInput,
    canClearInputQuick,
    canMergeRecall,
    canPrependRecall,
    canRecallSubmittedInput,
    canRerunSubmittedInput,
    canResetAllQuick,
    canRestoreLastBackendQuick,
    canRestorePrevBackendQuick,
    canSetRecallFromCurrent,
    canSquashInputSpaces,
    canSwapSubmittedInput,
    canTrimInput,
    clearBackendQuickPrefix,
    clearInputHistoryMultiSelection,
    clearInputQuick,
    clearedInputStack.length,
    cycleBackendQuickPrefix,
    forgetUndoStackQuick,
    forgetSubmittedInputQuick,
    handleMentionKeyDown,
    mergeSubmittedInputQuick,
    prependSubmittedInputQuick,
    recallSubmittedInputQuick,
    rerunSubmittedInputQuick,
    restoreLastBackendQuickPrefix,
    restorePrevBackendQuickPrefix,
    handleInterrupt,
    canNormalizeToPlain,
    normalizeInputToPlain,
    resetAllInputStateQuick,
    restoreInputQuick,
    setRecallFromCurrentQuick,
    squashInputSpacesQuick,
    shortcutHelpOpen,
    inputHistoryOpen,
    inputHistoryMultiSelected.length,
    lastSubmittedInput,
    swapWithSubmittedInputQuick,
    toggleForceAiPrefix,
    toggleQuickModePrefix,
    triggerMentionAttach,
    trimInputQuick,
    setActionPaletteOpen,
    setActionPaletteQuery,
    setActionPaletteSelected,
    setInputHistoryQuery,
    setInputHistoryMultiSelected,
    setInputHistoryRangeAnchor,
    setInputHistorySelected,
  ]);

  const routeMeta = useMemo(() => {
    const route = routeInput(inputBuffer);
    const trimmed = inputBuffer.trimStart();
    const forcedBackend = detectBackendPrefixFromInput(inputBuffer);
    const backendTag = (backend?: AiBackend) => (backend ? ` @${backend.toUpperCase()}` : " AUTO");
    let reason = "WHY DEFAULT";
    if (trimmed.startsWith("!!")) reason = "WHY PREFIX !!";
    else if (trimmed.startsWith(">>")) reason = "WHY PREFIX >>";
    else if (/^\?\s/.test(trimmed)) reason = "WHY PREFIX ?";
    else if (/^#\s/.test(trimmed)) reason = "WHY PREFIX #";
    else if (trimmed.startsWith("@") && forcedBackend === null) reason = "WHY PREFIX @";
    else if (forcedBackend) reason = `WHY BACKEND @${forcedBackend.toUpperCase()}`;
    else if (route.type === "shell") reason = "WHY HEURISTIC CLI";
    else if (route.type === "ai" || route.type === "agent") reason = "WHY HEURISTIC INTENT";
    switch (route.type) {
      case "shell":
        return { label: "SHELL", tone: "success" as const, reason };
      case "ai":
        return { label: `AI${backendTag(route.backend)}`, tone: "accent" as const, reason };
      case "agent":
        return { label: `AGENT${backendTag(route.backend)}`, tone: "warn" as const, reason };
      case "aiCmd":
        return { label: "AI CMD #", tone: "accent" as const, reason };
      case "explain":
        return { label: "EXPLAIN ?", tone: "neutral" as const, reason };
      case "heavy":
        return { label: "HEAVY !!", tone: "warn" as const, reason };
      case "empty":
      default:
        return { label: "AUTO 라우팅", tone: "accent" as const, reason: "WHY EMPTY" };
    }
  }, [inputBuffer]);

  const inputChips: Array<{ id: string; label: string; tone: "neutral" | "accent" | "success" | "warn" }> = [
    { id: "route", label: routeMeta.label, tone: routeMeta.tone },
    { id: "why", label: routeMeta.reason, tone: "neutral" },
    {
      id: "backend",
      label: activeBackendPrefix
        ? `BACKEND FORCED @${activeBackendPrefix.toUpperCase()}`
        : "BACKEND AUTO (LOCAL→OLLAMA→XLLM→GEMINI)",
      tone: activeBackendPrefix ? "warn" : "neutral",
    },
    { id: "term", label: terminalVisible ? "터미널 ON" : "터미널 OFF", tone: terminalVisible ? "success" : "warn" },
  ];
  const visibleInputChips = inputChips;

  const inputFocusCompact =
    warpInputFocused &&
    inputBuffer.trim() !== "" &&
    !isBackendOnlyInput &&
    !actionPaletteOpen &&
    !inputHistoryOpen &&
    !mentionOpen &&
    !shortcutHelpOpen;
  const inputToolbeltTipText = inputDockNarrow
    ? "TIP · Cmd/Ctrl+1~4 backend · Shift+A @첨부 · Shift+B/N BACK/LAST · Shift+K/Z/R/L/M/P 편집"
    : "TIP · Cmd/Ctrl+1~4 backend 전환 · Cmd/Ctrl+Shift+A @첨부 · Cmd/Ctrl+Shift+B/N BACK/LAST · Cmd/Ctrl+Shift+K/Z/R/L/M/P 입력 편집";
  const dismissInputTip = useCallback(() => {
    setShowInputTip(false);
    try {
      localStorage.setItem(INPUT_TIP_DISMISSED_KEY, "1");
    } catch {}
    invoke("save_ui_preferences", { showInputToolbeltTip: false }).catch(() => {});
  }, []);
  return (
    <div
      ref={outerRef}
      onContextMenu={handleContextMenu}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: xtermTheme?.background ?? THEME.background,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* xterm — DOM 항상 유지 (PTY 연결 보존), 터미널 모드일 때만 표시 */}
      <div
        style={{
          flex: terminalVisible && (!aiMessages || aiMessages.length === 0) ? 1 : 0,
          minHeight: 0,
          padding: terminalVisible && (!aiMessages || aiMessages.length === 0) ? `${PANE_PADDING_Y}px ${PANE_PADDING_X}px 0` : 0,
          position: "relative",
          overflow: "hidden",
          display: terminalVisible && (!aiMessages || aiMessages.length === 0) ? "block" : "none",
        }}
      >
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {/* AI 답변 스트림 — 메시지 있을 때 or 터미널 숨김일 때 표시 */}
      <div style={{ flex: (!terminalVisible || (aiMessages && aiMessages.length > 0)) ? 1 : 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {aiMessages && aiMessages.length > 0 ? (
          <AIBlockStream
            messages={aiMessages}
            streaming={aiStreaming ?? false}
            error={aiError ?? null}
            onClear={onClearAI ?? (() => {})}
            onCancel={onCancelAI}
            onExecute={(cmd) => invoke("write_to_pty", { id, data: cmd + "\r" }).catch(() => {})}
            cwd={cwd}
            fullHeight
            onAskAIForFix={onAskAI}
            visionEnabled={visionMode}
          />
        ) : !terminalVisible ? (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 16, color: "rgba(255,255,255,0.18)", userSelect: "none",
          }}>
            <div style={{ fontSize: HERO_FONT_SIZE, opacity: 0.5 }}>✨</div>
            <div style={{ textAlign: "center", lineHeight: 1.8 }}>
              <div style={{ fontSize: TITLE_FONT_SIZE, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>LUM AI 터미널</div>
              <div style={{ fontSize: BASE_FONT_SIZE }}>자연어로 질문하거나 명령어를 입력하세요</div>
              <div style={{ fontSize: SMALL_FONT_SIZE, marginTop: 8, opacity: 0.6 }}>
                <span style={{ color: "#58a6ff" }}>#</span> AI 명령 제안 &nbsp;·&nbsp;
                <span style={{ color: "#3fb950" }}>?</span> 명령어 설명 &nbsp;·&nbsp;
                <span style={{ color: "#ff7b72" }}>{">>"}</span> 에이전트
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div
        ref={inputDockRef}
        className={`lum-input-dock ${inputDockNarrow ? "lum-input-dock--narrow" : ""} ${inputDockCompact ? "lum-input-dock--compact" : ""} ${inputFocusCompact ? "lum-input-dock--focus" : ""}`}
        style={{
          padding: "6px 10px 8px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {showInputTip && !inputFocusCompact && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "4px 8px",
              border: "1px solid rgba(88,166,255,0.28)",
              background: "rgba(88,166,255,0.09)",
              borderRadius: 8,
            }}
          >
            <span className="lum-toolbelt-secondary-hint" style={{ fontSize: UI_TEXT_MICRO, color: "rgba(182,218,255,0.95)", lineHeight: 1.35 }}>
              {inputToolbeltTipText}
            </span>
            <button
              type="button"
              aria-label="dismiss-input-toolbelt-tip"
              onClick={dismissInputTip}
              style={{
                fontSize: MICRO_FONT_SIZE,
                color: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 6px",
                lineHeight: 1.2,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              닫기
            </button>
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: inputDockNarrow ? "column" : "row",
            alignItems: inputDockNarrow ? "stretch" : "center",
            justifyContent: "space-between",
            gap: inputDockNarrow ? 6 : 8,
          }}
        >
          <div
            className={`lum-toolbelt-rail ${inputDockNarrow ? "lum-toolbelt-rail--narrow" : ""} ${inputDockCompact ? "lum-toolbelt-rail--compact" : ""} ${inputFocusCompact ? "lum-toolbelt-rail--focus" : ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              alignContent: "flex-start",
              columnGap: inputDockCompact ? 4 : 6,
              rowGap: inputDockNarrow ? 4 : 0,
              flexWrap: inputDockNarrow ? "wrap" : "nowrap",
              overflowX: inputDockNarrow ? "visible" : "auto",
              scrollbarWidth: "none",
            }}
          >
            <button
              type="button"
              aria-label="quick-input-action-palette"
              onClick={() => {
                setActionPaletteOpen(true);
                setActionPaletteQuery("");
                setActionPaletteSelected(0);
              }}
              title="Action Palette 열기 (Cmd/Ctrl+K)"
              style={{
                fontSize: MICRO_FONT_SIZE,
                color: "rgba(215,228,255,0.96)",
                border: "1px solid rgba(121,192,255,0.5)",
                background: "rgba(121,192,255,0.16)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              K
            </button>
          </div>
        </div>
        {/* Warp 입력바 — 입력 필드, 라우팅은 handleSubmit */}
        <WarpInputBar
          ref={warpInputRef}
          fontFamily={fontFamily ? `"${fontFamily}", ${FONT_FAMILY}` : FONT_FAMILY}
          fontSize={fontSize ?? DEFAULT_TERMINAL_FONT_SIZE}
          onSubmit={handleSubmit}
          onInterrupt={handleInterrupt}
          onKeyDownIntercept={handleInputKeyDownIntercept}
          onTab={handleTab}
          onChange={handleInputChange}
          onFocusChange={setWarpInputFocused}
          contextChips={visibleInputChips}
          compactContextChips={inputFocusCompact}
        />
      </div>

      {actionPaletteOpen && (
        <div
          className="lum-overlay-panel lum-overlay-panel--accent lum-overlay-panel--full"
          style={{
            bottom: overlayBottomOffset,
            zIndex: 31,
            maxHeight: overlayMaxHeight,
          }}
        >
          <div className="lum-overlay-header lum-overlay-header--bordered">
            <span className="lum-overlay-title">
              ACTION PALETTE
            </span>
            <button
              className="lum-overlay-close lum-overlay-close-btn"
              type="button"
              aria-label="action-palette-close"
              onClick={() => setActionPaletteOpen(false)}
            >
              닫기
            </button>
          </div>
          <div className="lum-overlay-search-row">
            <input
              ref={actionPaletteInputRef}
              className="lum-overlay-input"
              aria-label="action-palette-input"
              value={actionPaletteQuery}
              onChange={(e) => {
                setActionPaletteQuery(e.target.value);
                setActionPaletteSelected(0);
              }}
              onKeyDown={handleActionPaletteKeyDown}
              placeholder="액션 검색 (예: clear, recall, backend)"
            />
          </div>
          <div className="lum-overlay-list">
            {actionPaletteFiltered.length === 0 && (
              <div className="lum-overlay-empty">
                일치하는 액션이 없습니다.
              </div>
            )}
            {actionPaletteFiltered.map((action, idx) => {
              const active = idx === actionPaletteSelected;
              return (
                <button
                  key={action.id}
                  type="button"
                  className={`lum-overlay-item ${active ? "is-active" : ""} ${action.disabled ? "is-disabled" : ""}`}
                  aria-label={`action-palette-item-${action.id}`}
                  disabled={action.disabled}
                  onClick={() => executePaletteAction(idx)}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {inputHistoryOpen && (
        <div
          className="lum-overlay-panel lum-overlay-panel--blue lum-overlay-panel--full"
          style={{
            bottom: overlayBottomOffset,
            zIndex: 30,
            maxHeight: overlayMaxHeight,
          }}
        >
          <div className="lum-overlay-header lum-overlay-header--bordered">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="lum-overlay-title">
                INPUT HISTORY
              </span>
              {inputHistoryMultiSelected.length > 1 && (
                <>
                  <span aria-label="input-history-selected-count" className="lum-overlay-pill">
                    {inputHistoryMultiSelected.length} selected
                  </span>
                  <span
                    aria-label="input-history-selected-preview"
                    className="lum-overlay-pill-preview"
                    title={inputHistoryMultiSelected.join(", ")}
                  >
                    {inputHistoryMultiSelectedPreview}
                  </span>
                  <button
                    type="button"
                    className="lum-overlay-pill-btn"
                    aria-label="quick-input-history-clear-selection"
                    onClick={clearInputHistoryMultiSelection}
                  >
                    SELECTION CLEAR
                  </button>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                aria-label="quick-input-history-clear"
                onClick={clearSubmittedInputHistory}
                disabled={submittedInputHistory.length === 0}
                className={`lum-overlay-danger-btn ${submittedInputHistory.length === 0 ? "is-disabled" : ""}`}
              >
                CLEAR
              </button>
              <button
                className="lum-overlay-close lum-overlay-close-btn"
                type="button"
                aria-label="quick-input-history-close"
                onClick={() => {
                  setInputHistoryOpen(false);
                  setInputHistoryQuery("");
                  setInputHistorySelected(0);
                  setInputHistoryRangeAnchor(null);
                  setInputHistoryMultiSelected([]);
                }}
              >
                닫기
              </button>
            </div>
          </div>
          <div className="lum-overlay-search-row">
            <input
              ref={inputHistoryInputRef}
              className="lum-overlay-input"
              aria-label="input-history-search"
              value={inputHistoryQuery}
              onChange={(e) => {
                setInputHistoryQuery(e.target.value);
                setInputHistorySelected(0);
                setInputHistoryRangeAnchor(null);
                setInputHistoryMultiSelected([]);
              }}
              onKeyDown={handleInputHistoryKeyDown}
              placeholder="히스토리 검색 (↑↓ 선택, Enter 복원, Esc 닫기)"
            />
            <div
              aria-label="input-history-shortcuts"
              className="lum-overlay-shortcuts"
            >
              <span>↑/↓ 이동</span>
              <span>Shift+↑/↓ 범위 선택</span>
              <span>Shift+클릭 범위 선택</span>
              <span>Cmd/Ctrl+A 전체 선택</span>
              <span>Enter 복원</span>
              <span>Del/Backspace 삭제</span>
              <span>Esc 선택해제/닫기</span>
            </div>
          </div>
          <div className="lum-overlay-list">
            {filteredSubmittedInputHistory.length === 0 && (
              <div className="lum-overlay-empty">
                기록된 실행 입력이 없습니다.
              </div>
            )}
            {filteredSubmittedInputHistory.map((entry, idx) => {
              const inMultiSelection = inputHistoryMultiSelected.includes(entry);
              const selected = idx === inputHistorySelected;
              return (
                <div
                  key={`${entry}-${idx}`}
                  className={`lum-overlay-split-row ${inMultiSelection ? "is-multi" : ""} ${selected ? "is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="lum-overlay-item lum-overlay-item--split-main"
                    aria-label={`quick-input-history-item-${idx}`}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        const anchor = inputHistoryRangeAnchor ?? inputHistorySelected;
                        const min = Math.min(anchor, idx);
                        const max = Math.max(anchor, idx);
                        setInputHistoryRangeAnchor(anchor);
                        setInputHistorySelected(idx);
                        setInputHistoryMultiSelected(filteredSubmittedInputHistory.slice(min, max + 1));
                        return;
                      }
                      applyHistoryInput(entry);
                    }}
                  >
                    {entry}
                  </button>
                  <button
                    type="button"
                    className="lum-overlay-item lum-overlay-item--split-del"
                    aria-label={`quick-input-history-remove-${idx}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeSubmittedInputHistoryEntry(entry);
                    }}
                    title="이 항목 삭제"
                  >
                    DEL
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mentionOpen && (mentionLoading || mentionDir !== null) && (
        <div
          className="lum-overlay-panel lum-overlay-panel--blue lum-overlay-panel--full"
          style={{
            bottom: overlayBottomOffset,
            zIndex: 28,
            maxHeight: overlayMaxHeight,
          }}
        >
          <div className="lum-overlay-caption">
            컨텍스트 첨부 (@) · {mentionTrail ? mentionTrail : "현재 폴더"}
          </div>
          <div className="lum-overlay-list lum-overlay-list--mention">
            {mentionLoading && (
              <div className="lum-overlay-empty">
                불러오는 중…
              </div>
            )}
            {!mentionLoading && mentionItems.length === 0 && (
              <div className="lum-overlay-empty">
                일치하는 항목이 없습니다.
              </div>
            )}
            {!mentionLoading && mentionItems.map((item, idx) => {
              const selected = idx === mentionSelected;
              if (item.kind === "parent") {
                return (
                  <button
                    key="mention-parent"
                    type="button"
                    onClick={() => applyMentionItem(item)}
                    className={`lum-overlay-item lum-overlay-item--mention ${selected ? "is-active" : ""}`}
                  >
                    <span className="lum-overlay-item-kicker lum-overlay-item-kicker--dir">UP</span>
                    <span className="lum-overlay-item-text">.. (상위 폴더)</span>
                  </button>
                );
              }
              const entry = item.entry;
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => applyMentionItem(item)}
                  className={`lum-overlay-item lum-overlay-item--mention ${selected ? "is-active" : ""}`}
                >
                  <span className={`lum-overlay-item-kicker ${entry.is_dir ? "lum-overlay-item-kicker--dir" : ""}`}>
                    {entry.is_dir ? "DIR" : "FILE"}
                  </span>
                  <span className="lum-overlay-item-text">
                    @{mentionTrail}{entry.name}{entry.is_dir ? "/" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {shortcutHelpOpen && (
        <div
          className="lum-overlay-panel lum-overlay-panel--cheatsheet lum-overlay-panel--sheet"
          style={{
            bottom: overlayBottomOffset,
            zIndex: 30,
            maxHeight: overlayMaxHeight,
          }}
        >
          <div className="lum-overlay-header">
            <span className="lum-overlay-title">
              SHORTCUT CHEATSHEET
            </span>
            <button
              className="lum-overlay-close lum-overlay-close-btn"
              type="button"
              aria-label="shortcut-help-close"
              onClick={() => setShortcutHelpOpen(false)}
            >
              닫기
            </button>
          </div>
          <div className="lum-cheatsheet-grid">
            <span>Cmd/Ctrl+/ · 치트시트 토글</span><span>Cmd/Ctrl+Shift+C · 인터럽트</span>
            <span>Cmd/Ctrl+Shift+1~4/0 · backend 지정/해제</span><span>Cmd/Ctrl+Shift+←/→ · backend 순환</span>
            <span>Cmd/Ctrl+Shift+B/N · BACK/LAST</span><span>Cmd/Ctrl+Shift+O · AUTO 토글</span>
            <span>Cmd/Ctrl+Shift+K/Z/R · CLEAR/UNDO/RECALL</span><span>Cmd/Ctrl+Shift+S/F · SET/FORGET RECALL</span>
            <span>Cmd/Ctrl+Shift+E/W · RERUN/SWAP</span><span>Cmd/Ctrl+Shift+M/P · MERGE/PREPEND</span>
            <span>Cmd/Ctrl+Shift+G/T/Q/L · PLAIN/TRIM/SQUASH/CLEAN</span><span>Cmd/Ctrl+Shift+A · @ 첨부</span>
            <span>Cmd/Ctrl+Shift+H/Y/J/U/V/I · 모드 토글</span><span>Esc · 오버레이 닫기</span>
          </div>
        </div>
      )}

      {ghostText && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: PANE_PADDING_X,
            bottom: 40,
            fontSize: SMALL_FONT_SIZE,
            fontFamily: FONT_FAMILY,
            color: "rgba(201,209,217,0.35)",
            pointerEvents: "none",
            whiteSpace: "pre",
            zIndex: 10,
            background: "rgba(13,17,23,0.85)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          ↹ {ghostText}
        </div>
      )}

      {(aiGhost || aiLoading || aiCmdError) && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: PANE_PADDING_X,
            bottom: 40,
            pointerEvents: "none",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(13,17,23,0.95)",
            border: `1px solid ${aiCmdError ? "rgba(255,123,114,0.4)" : "rgba(88,166,255,0.25)"}`,
            borderRadius: 6,
            padding: "3px 8px",
            maxWidth: "90%",
          }}
        >
          <span style={{ fontSize: MICRO_FONT_SIZE, color: aiCmdError ? "#ff7b72" : "#58a6ff", fontFamily: FONT_FAMILY, opacity: 0.9 }}>
            {aiCmdError ? "⚠ AI" : "⚡ AI"}
          </span>
          {aiLoading ? (
            <span style={{ fontSize: SMALL_FONT_SIZE, color: "rgba(88,166,255,0.5)", fontFamily: FONT_FAMILY }}>
              생성 중…
            </span>
          ) : aiCmdError ? (
            <span style={{ fontSize: SMALL_FONT_SIZE, color: "rgba(255,123,114,0.85)", fontFamily: FONT_FAMILY, whiteSpace: "pre-wrap" }}>
              {aiCmdError}
            </span>
          ) : (
            <>
              <span style={{ fontSize: BASE_FONT_SIZE, color: "rgba(88,166,255,0.85)", fontFamily: FONT_FAMILY, whiteSpace: "pre" }}>
                {aiGhost?.cmd}
              </span>
              <span style={{ fontSize: MICRO_FONT_SIZE, color: "rgba(255,255,255,0.25)", fontFamily: FONT_FAMILY }}>
                Tab
              </span>
            </>
          )}
        </div>
      )}

      {/* ── AI Explain 팝업 (? prefix) ─────────────────────────────────── */}
      {(explainPopup || explainLoading) && (
        <div
          className="lum-inline-popup lum-inline-popup--explain"
          style={{
            position: "absolute",
            left: PANE_PADDING_X,
            bottom: 40,
            zIndex: 25,
            maxWidth: "min(520px, 90%)",
            pointerEvents: "auto",
          }}
        >
          <div
            className="lum-inline-popup-header"
            style={{ marginBottom: explainPopup ? 4 : 0 }}
          >
            <span className="lum-inline-popup-kicker">? 설명</span>
            {!explainLoading && (
              <button
                type="button"
                className="lum-inline-popup-close"
                aria-label="ai-explain-close"
                onClick={clearExplain}
              >
                ✕
              </button>
            )}
          </div>
          {explainLoading ? (
            <span className="lum-inline-popup-loading">
              분석 중…
            </span>
          ) : (
            <span className="lum-inline-popup-content">
              {explainPopup?.text}
            </span>
          )}
        </div>
      )}

      {/* ── 검색 바 (Cmd+F) ───────────────────────────────────────────── */}
      {searchOpen && (
        <div
          className="lum-inline-popup lum-inline-popup--search"
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            zIndex: 30,
          }}
        >
          <input
            className="lum-searchbar-input"
            ref={searchInputRef}
            aria-label="search-input"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); doSearch(e.target.value); }}
            onKeyDown={e => {
              if (e.key === "Enter") doSearch(searchQuery, !e.shiftKey);
              if (e.key === "Escape") closeSearch();
              e.stopPropagation();
            }}
            placeholder="검색…"
          />
          {/* 대소문자 */}
          <IconButton
            tooltip="대소문자 구분"
            onClick={() => setSearchCase(v => !v)}
            className={`lum-searchbar-toggle ${searchCase ? "is-active" : ""}`}
          >
            Aa
          </IconButton>
          {/* 정규식 */}
          <IconButton
            tooltip="정규식"
            onClick={() => setSearchRegex(v => !v)}
            className={`lum-searchbar-toggle ${searchRegex ? "is-active" : ""}`}
          >
            .*
          </IconButton>
          {/* 이전/다음 */}
          <IconButton
            tooltip="이전 (Shift+Enter)"
            onClick={() => doSearch(searchQuery, false)}
            className="lum-searchbar-nav"
            aria-label="search-prev"
          >
            ‹
          </IconButton>
          <IconButton
            tooltip="다음 (Enter)"
            onClick={() => doSearch(searchQuery, true)}
            className="lum-searchbar-nav"
            aria-label="search-next"
          >
            ›
          </IconButton>
          <button type="button" onClick={closeSearch} className="lum-searchbar-close" aria-label="search-close">
            ✕
          </button>
        </div>
      )}

      {contextMenu && (
        <TerminalContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          text={contextMenu.text}
          isPathOrUrl={isPathOrUrl(contextMenu.text)}
          onClose={() => setContextMenu(null)}
          onCopy={() => navigator.clipboard.writeText(contextMenu.text)}
          onRun={() => writeToPtyRef.current(contextMenu.text + "\r")}
          onExplain={() => ctxExplain(contextMenu.text)}
          onWebSearch={() => openUrl(`https://www.google.com/search?q=${encodeURIComponent(contextMenu.text)}`)}
          onOpen={() => openUrl(
            /^https?:\/\//.test(contextMenu.text)
              ? contextMenu.text
              : `file://${contextMenu.text.replace(/^~/, "")}`,
          )}
        />
      )}

      {smartPaste && (
        <SmartPasteModal
          lines={smartPaste.lines}
          rawText={smartPaste.rawText}
          onRunAll={() => {
            for (const line of smartPaste.lines) {
              writeToPtyRef.current(line + "\r");
            }
            setSmartPaste(null);
          }}
          onPasteText={() => {
            writeToPtyRef.current(smartPaste.rawText.replace(/\r\n/g, "\n"));
            setSmartPaste(null);
          }}
          onClose={() => setSmartPaste(null)}
          writeLine={(line) => writeToPtyRef.current(line + "\r")}
        />
      )}
      {pasteGuard && (
        <PasteGuardModal
          match={pasteGuard.match}
          onConfirm={() => {
            invoke("write_to_pty", { id, data: pasteGuard.text }).catch(() => {});
            setPasteGuard(null);
          }}
          onCancel={() => setPasteGuard(null)}
        />
      )}
    </div>
  );
};

export default TerminalPane;
