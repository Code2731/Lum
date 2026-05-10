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

const DEFAULT_MODEL = "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";

const compactPath = (path?: string): string => {
  if (!path) return "루트";
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  if (normalized.length <= 28) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return `…/${parts.slice(-2).join("/")}`;
};

const compactModel = (raw?: string): string => {
  if (!raw) return "unknown";
  const last = raw.match(/[^/\\]+$/)?.[0] ?? raw;
  return last
    .replace(/-Instruct$/i, "")
    .replace(/-Q\d+_K_.+$/i, "")
    .replace(/-\d+\.\d+bpw$/i, "")
    .replace(/-\d+bit$/i, "")
    .slice(0, 26);
};
const compactInputPreview = (raw?: string): string => {
  if (!raw) return "";
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 16) return oneLine;
  return `${oneLine.slice(0, 16)}…`;
};

interface ModeButtonProps {
  label: string;
  title: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
}
const ModeButton: React.FC<ModeButtonProps> = ({ label, title, active, activeColor, onClick }) => (
  <IconButton
    tooltip={title}
    onClick={onClick}
    style={{
      background: active ? `${activeColor}1f` : "rgba(255,255,255,0.02)",
      border: `1px solid ${active ? activeColor + "66" : "rgba(255,255,255,0.12)"}`,
      borderRadius: 999,
      color: active ? activeColor : "rgba(255,255,255,0.58)",
      fontSize: 10.5,
      fontWeight: active ? 700 : 400,
      padding: "2px 10px",
      cursor: "pointer",
      lineHeight: "16px",
      transition: "all 120ms",
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </IconButton>
);

const TerminalPane: React.FC<Props> = ({ id, cwd, sshProfile, model, xtermTheme, fontSize, fontFamily, onOutput, onCwdChange, onReady, onAgentTrigger, onAskAI, aiMessages, aiStreaming, aiError, onClearAI, visionEnabled, showReasoning, onToggleReasoning }) => {
  // 입력 모드 토글 상태 — Heavy(Phase 85b 제거)는 dead, reasoning은 App.tsx props 통해 글로벌 상태 연동
  const [visionMode, setVisionMode] = useState(visionEnabled ?? false);
  const [terminalVisible, setTerminalVisible] = useState(false);

  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    onOutputRef.current = onOutput;
    onReadyRef.current = onReady;
    onCwdChangeRef.current = onCwdChange;
    onAgentTriggerRef.current = onAgentTrigger;
    onAskAIRef.current = onAskAI;
  }, [onOutput, onReady, onCwdChange, onAgentTrigger, onAskAI]);

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
    term.options.fontSize = fontSize ?? 13;
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
  const [showInputTip, setShowInputTip] = useState(() => {
    try {
      return localStorage.getItem(INPUT_TIP_DISMISSED_KEY) !== "1";
    } catch {
      return true;
    }
  });

  // WarpInputBar — 실제 입력 필드
  const warpInputRef = useRef<WarpInputBarHandle>(null);

  // Static CLI ghost text (WarpInputBar 위 오버레이)
  const [ghostText, setGhostText] = useState<string | null>(null);
  const ghostTextRef = useRef<string | null>(null);
  const suggestionRef = useRef<{ suffix: string; insert: string } | null>(null);

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
    if (buf.startsWith("# ") || buf.startsWith("? ") || buf.startsWith(">>")) {
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
      fontSize: fontSizeRef.current ?? 13,
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

  // 입력 라우팅: 기본=AI, 알려진 CLI=shell, !/@/#/?/>> = 명시적 오버라이드
  const handleSubmit = useCallback((rawInput: string) => {
    const route = routeInput(rawInput);
    clearAllOverlays();
    switch (route.type) {
      case "empty":
        return;
      case "shell":
        setLastSubmittedInput(rawInput);
        setTerminalVisible(true);
        invoke("write_to_pty", { id, data: route.command + "\r" }).catch(() => {});
        return;
      case "ai":
        if (route.question) {
          setLastSubmittedInput(rawInput);
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
          setLastSubmittedInput(rawInput);
          onAskAIRef.current?.(route.prompt, undefined, "heavy");
        }
        return;
      case "agent":
        if (route.task) {
          setLastSubmittedInput(rawInput);
          onAgentTriggerRef.current?.(route.task, route.backend);
        }
        return;
      case "aiCmd":
      case "explain":
        return;
    }
  }, [id, clearAllOverlays]);

  const handleInterrupt = useCallback(() => {
    invoke("write_to_pty", { id, data: "\x03" }).catch(() => {});
  }, [id]);

  const handleInputChange = useCallback((buf: string) => {
    setInputBuffer(buf);

    const mentionMatch = /(?:^|\s)@([^\s@]*)$/.exec(buf);
    const isForcePrefix = buf.trimStart().startsWith("@");
    const startsWithMention = mentionMatch?.index === 0;
    if (mentionMatch && !(isForcePrefix && startsWithMention)) {
      setMentionQuery((mentionMatch[1] ?? "").toLowerCase());
      setMentionOpen(true);
      if (!mentionDir && cwd) {
        loadMentionDirectory(cwd, "");
      }
    } else {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionDir(null);
      setMentionTrail("");
      setMentionEntries([]);
      setMentionSelected(0);
    }

    if (buf.startsWith("# ")) {
      clearExplain();
      triggerAiCompletion(buf);
    } else if (buf.startsWith("? ")) {
      clearAiGhost();
      triggerExplain(buf);
    } else if (buf.startsWith(">>")) {
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

  const attachMentionToken = useCallback((tokenPath: string) => {
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
      .replace(/^!!\s?/, "")
      .replace(/^>>\s?/, "")
      .replace(/^\?\s?/, "")
      .replace(/^#\s?/, "")
      .replace(/^!\s?/, "")
  ), []);
  const clearForceAiPrefix = useCallback((raw: string) => {
    if (detectBackendPrefixFromInput(raw)) return clearBackendPrefixFromInput(raw);
    return raw.replace(/^@\s?/, "");
  }, []);
  const toggleQuickModePrefix = useCallback((mode: "shell" | "agent" | "explain" | "aiCmd" | "heavy") => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const isHeavy = /^!!\s?/.test(current);
    const isShell = current.startsWith("!");
    const isAgent = /^>>\s?/.test(current);
    const isExplain = /^\?\s?/.test(current);
    const isAiCmd = /^#\s?/.test(current);
    const body = clearQuickModePrefix(current);
    let next = current;
    if (mode === "heavy") {
      next = isHeavy ? body : `!! ${body}`;
    } else if (mode === "shell") {
      next = isShell ? body : `!${body}`;
    } else if (mode === "agent") {
      next = isAgent ? body : `>> ${body}`;
    } else if (mode === "explain") {
      next = isExplain ? body : `? ${body}`;
    } else {
      next = isAiCmd ? body : `# ${body}`;
    }
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [clearQuickModePrefix, inputBuffer]);
  const toggleForceAiPrefix = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const hasBackend = detectBackendPrefixFromInput(current) !== null;
    const isForceAi = !hasBackend && /^@\s?/.test(current);
    const base = clearForceAiPrefix(clearQuickModePrefix(current));
    const next = isForceAi ? base : `@${base}`;
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [clearForceAiPrefix, clearQuickModePrefix, inputBuffer]);
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
  const normalizeInputToPlain = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = toPlainInput(current);
    if (next === current) return;
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer, toPlainInput]);
  const trimInputQuick = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = current.trim();
    if (next === current) return;
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer]);
  const squashInputSpacesQuick = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = current.replace(/\s{2,}/g, " ");
    if (next === current) return;
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer]);
  const cleanInputQuick = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = current.trim().replace(/\s{2,}/g, " ");
    if (next === current) return;
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer]);
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
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [backendTrail.prev, inputBuffer]);
  const restoreLastBackendQuickPrefix = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const next = applyBackendPrefixToInput(current, backendTrail.last);
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
  }, [backendTrail.last, inputBuffer]);
  const lastBackendLabel = `LAST @${backendTrail.last.toUpperCase()}`;
  const prevBackendLabel = backendTrail.prev
    ? `BACK @${backendTrail.prev.toUpperCase()}`
    : "BACK @-";
  const quickModeShellActive = /^!(?!\!)/.test(inputBuffer);
  const quickModeHeavyActive = /^!!\s?/.test(inputBuffer);
  const quickModeAgentActive = /^>>\s?/.test(inputBuffer);
  const quickModeExplainActive = /^\?\s?/.test(inputBuffer);
  const quickModeAiCmdActive = /^#\s?/.test(inputBuffer);
  const quickModeForceAiActive =
    detectBackendPrefixFromInput(inputBuffer) === null && /^@\s?/.test(inputBuffer);
  const canNormalizeToPlain = toPlainInput(inputBuffer) !== inputBuffer;
  const canTrimInput = inputBuffer !== inputBuffer.trim();
  const canSquashInputSpaces = /\s{2,}/.test(inputBuffer);
  const canCleanInput = inputBuffer !== inputBuffer.trim().replace(/\s{2,}/g, " ");
  const canResetAllQuick = inputBuffer !== "" || clearedInputStack.length > 0 || lastSubmittedInput !== "";
  const lastSubmittedPreview = compactInputPreview(lastSubmittedInput);
  const recallButtonLabel = lastSubmittedPreview ? `RECALL ${lastSubmittedPreview}` : "RECALL";
  const rerunButtonLabel = lastSubmittedPreview ? `RERUN ${lastSubmittedPreview}` : "RERUN";
  const undoButtonLabel = clearedInputStack.length > 0 ? `UNDO ${clearedInputStack.length}` : "UNDO";
  const canSetRecallFromCurrent = inputBuffer.trim() !== "";
  const triggerMentionAttach = useCallback(() => {
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
  const pushUndoSnapshot = useCallback((snapshot: string) => {
    if (snapshot === "") return;
    setClearedInputStack((prev) => {
      if (prev[0] === snapshot) return prev;
      return [snapshot, ...prev].slice(0, 5);
    });
  }, []);
  const clearInputQuick = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    pushUndoSnapshot(current);
    clearAllOverlays();
    warpInputRef.current?.setValue("");
    warpInputRef.current?.focus();
    setInputBuffer("");
  }, [clearAllOverlays, inputBuffer, pushUndoSnapshot]);
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
    if (!lastSubmittedInput) return;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    if (current === lastSubmittedInput) {
      warpInputRef.current?.focus();
      return;
    }
    pushUndoSnapshot(current);
    warpInputRef.current?.setValue(lastSubmittedInput);
    warpInputRef.current?.focus();
    setInputBuffer(lastSubmittedInput);
  }, [inputBuffer, lastSubmittedInput, pushUndoSnapshot]);
  const setRecallFromCurrentQuick = useCallback(() => {
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const normalized = current.trim();
    if (normalized === "") return;
    setLastSubmittedInput(normalized);
    warpInputRef.current?.focus();
  }, [inputBuffer]);
  const swapWithSubmittedInputQuick = useCallback(() => {
    if (!lastSubmittedInput) return;
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
  }, [inputBuffer, lastSubmittedInput, pushUndoSnapshot]);
  const rerunSubmittedInputQuick = useCallback(() => {
    if (!lastSubmittedInput) return;
    handleSubmit(lastSubmittedInput);
  }, [handleSubmit, lastSubmittedInput]);
  const forgetSubmittedInputQuick = useCallback(() => {
    if (!lastSubmittedInput) return;
    setLastSubmittedInput("");
  }, [lastSubmittedInput]);
  const mergeSubmittedInputQuick = useCallback(() => {
    if (!lastSubmittedInput) return;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const base = current.trim();
    const last = lastSubmittedInput.trim();
    if (base && (base === last || base.endsWith(` ${last}`))) {
      warpInputRef.current?.focus();
      return;
    }
    pushUndoSnapshot(current);
    const next = base ? `${base} ${last}` : last;
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer, lastSubmittedInput, pushUndoSnapshot]);
  const prependSubmittedInputQuick = useCallback(() => {
    if (!lastSubmittedInput) return;
    const current = warpInputRef.current?.getValue() ?? inputBuffer;
    const base = current.trim();
    const last = lastSubmittedInput.trim();
    if (base && (base === last || base.startsWith(`${last} `))) {
      warpInputRef.current?.focus();
      return;
    }
    pushUndoSnapshot(current);
    const next = base ? `${last} ${base}` : last;
    warpInputRef.current?.setValue(next);
    warpInputRef.current?.focus();
    setInputBuffer(next);
  }, [inputBuffer, lastSubmittedInput, pushUndoSnapshot]);

  const routeChip = useMemo(() => {
    const route = routeInput(inputBuffer);
    const backendTag = (backend?: AiBackend) => (backend ? ` @${backend.toUpperCase()}` : " AUTO");
    switch (route.type) {
      case "shell":
        return { label: "SHELL", tone: "success" as const };
      case "ai":
        return { label: `AI${backendTag(route.backend)}`, tone: "accent" as const };
      case "agent":
        return { label: `AGENT${backendTag(route.backend)}`, tone: "warn" as const };
      case "aiCmd":
        return { label: "AI CMD #", tone: "accent" as const };
      case "explain":
        return { label: "EXPLAIN ?", tone: "neutral" as const };
      case "heavy":
        return { label: "HEAVY !!", tone: "warn" as const };
      case "empty":
      default:
        return { label: "AUTO 라우팅", tone: "accent" as const };
    }
  }, [inputBuffer]);

  const inputChips: Array<{ id: string; label: string; tone: "neutral" | "accent" | "success" | "warn" }> = [
    { id: "route", label: routeChip.label, tone: routeChip.tone },
    { id: "cwd", label: `CWD ${compactPath(cwd)}`, tone: "neutral" },
    { id: "model", label: `MODEL ${compactModel(modelRef.current)}`, tone: "neutral" },
    { id: "term", label: terminalVisible ? "터미널 ON" : "터미널 OFF", tone: terminalVisible ? "success" : "warn" },
  ];
  const dismissInputTip = useCallback(() => {
    setShowInputTip(false);
    try {
      localStorage.setItem(INPUT_TIP_DISMISSED_KEY, "1");
    } catch {}
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
            onExecute={(cmd) => invoke("write_to_pty", { id, data: cmd + "\r" }).catch(() => {})}
            cwd={cwd}
            fullHeight
            onAskAIForFix={onAskAI}
            visionEnabled={visionEnabled}
          />
        ) : !terminalVisible ? (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 16, color: "rgba(255,255,255,0.18)", userSelect: "none",
          }}>
            <div style={{ fontSize: 36, opacity: 0.5 }}>✨</div>
            <div style={{ textAlign: "center", lineHeight: 1.8 }}>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>LUM AI 터미널</div>
              <div style={{ fontSize: 12 }}>자연어로 질문하거나 명령어를 입력하세요</div>
              <div style={{ fontSize: 11, marginTop: 8, opacity: 0.6 }}>
                <span style={{ color: "#58a6ff" }}>#</span> AI 명령 제안 &nbsp;·&nbsp;
                <span style={{ color: "#3fb950" }}>?</span> 명령어 설명 &nbsp;·&nbsp;
                <span style={{ color: "#ff7b72" }}>{">>"}</span> 에이전트
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="lum-input-dock"
        style={{
          padding: "6px 10px 8px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {showInputTip && (
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
            <span style={{ fontSize: 10, color: "rgba(182,218,255,0.95)", lineHeight: 1.35 }}>
              TIP · Cmd/Ctrl+1~4로 backend 즉시 전환, `/. 정순환, Shift+`/, 역순환
            </span>
            <button
              type="button"
              aria-label="dismiss-input-toolbelt-tip"
              onClick={dismissInputTip}
              style={{
                fontSize: 10,
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
            <span
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              INPUT TOOLBELT
            </span>
            <button
              type="button"
              aria-label="quick-mention-trigger"
              onClick={triggerMentionAttach}
              title="파일 첨부 트리거 삽입 (@)"
              style={{
                fontSize: 10,
                color: "rgba(121,192,255,0.9)",
                border: "1px solid rgba(121,192,255,0.34)",
                background: "rgba(121,192,255,0.12)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              @ 파일 첨부
            </button>
            <button
              type="button"
              aria-label="quick-input-clear"
              onClick={clearInputQuick}
              title="입력/오버레이 빠른 초기화 (Esc)"
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(255,255,255,0.28)",
                background: "rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              CLEAR
            </button>
            <button
              type="button"
              aria-label="quick-input-reset-all"
              onClick={resetAllInputStateQuick}
              disabled={!canResetAllQuick}
              title={canResetAllQuick ? "입력/UNDO/RECALL 상태 전체 초기화" : "초기화할 상태가 없어 비활성화"}
              style={{
                fontSize: 10,
                color: canResetAllQuick ? "rgba(255,225,222,0.95)" : "rgba(255,255,255,0.42)",
                border: canResetAllQuick ? "1px solid rgba(255,123,114,0.58)" : "1px solid rgba(255,255,255,0.18)",
                background: canResetAllQuick ? "rgba(255,123,114,0.14)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: canResetAllQuick ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              RESET
            </button>
            <button
              type="button"
              aria-label="quick-input-stop"
              onClick={handleInterrupt}
              title="현재 실행 인터럽트 (Ctrl/Cmd+C)"
              style={{
                fontSize: 10,
                color: "rgba(255,225,222,0.96)",
                border: "1px solid rgba(255,123,114,0.56)",
                background: "rgba(255,123,114,0.16)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              STOP
            </button>
            <button
              type="button"
              aria-label="quick-input-undo"
              onClick={restoreInputQuick}
              disabled={clearedInputStack.length === 0}
              title={clearedInputStack.length > 0 ? "직전 CLEAR 입력 복원" : "복원할 입력이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: clearedInputStack.length > 0 ? "rgba(220,247,225,0.96)" : "rgba(255,255,255,0.42)",
                border: clearedInputStack.length > 0 ? "1px solid rgba(63,185,80,0.6)" : "1px solid rgba(255,255,255,0.18)",
                background: clearedInputStack.length > 0 ? "rgba(63,185,80,0.18)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: clearedInputStack.length > 0 ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              {undoButtonLabel}
            </button>
            <button
              type="button"
              aria-label="quick-input-forget-undo"
              onClick={forgetUndoStackQuick}
              disabled={clearedInputStack.length === 0}
              title={clearedInputStack.length > 0 ? "CLEAR 복원 이력 비우기" : "비울 복원 이력이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: clearedInputStack.length > 0 ? "rgba(255,225,222,0.95)" : "rgba(255,255,255,0.42)",
                border: clearedInputStack.length > 0 ? "1px solid rgba(255,123,114,0.58)" : "1px solid rgba(255,255,255,0.18)",
                background: clearedInputStack.length > 0 ? "rgba(255,123,114,0.14)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: clearedInputStack.length > 0 ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              FORGET
            </button>
            <button
              type="button"
              aria-label="quick-input-set-recall"
              onClick={setRecallFromCurrentQuick}
              disabled={!canSetRecallFromCurrent}
              title={canSetRecallFromCurrent ? "현재 입력을 RECALL 대상으로 저장" : "저장할 입력이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: canSetRecallFromCurrent ? "rgba(255,244,214,0.95)" : "rgba(255,255,255,0.42)",
                border: canSetRecallFromCurrent ? "1px solid rgba(227,179,65,0.6)" : "1px solid rgba(255,255,255,0.18)",
                background: canSetRecallFromCurrent ? "rgba(227,179,65,0.16)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: canSetRecallFromCurrent ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              SET RECALL
            </button>
            <button
              type="button"
              aria-label="quick-input-recall"
              onClick={recallSubmittedInputQuick}
              disabled={!lastSubmittedInput}
              title={lastSubmittedInput ? `직전 실행 입력 복원: ${lastSubmittedInput}` : "복원할 실행 입력이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: lastSubmittedInput ? "rgba(255,244,214,0.95)" : "rgba(255,255,255,0.42)",
                border: lastSubmittedInput ? "1px solid rgba(227,179,65,0.6)" : "1px solid rgba(255,255,255,0.18)",
                background: lastSubmittedInput ? "rgba(227,179,65,0.16)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: lastSubmittedInput ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              {recallButtonLabel}
            </button>
            <button
              type="button"
              aria-label="quick-input-rerun"
              onClick={rerunSubmittedInputQuick}
              disabled={!lastSubmittedInput}
              title={lastSubmittedInput ? `직전 실행 입력 즉시 재실행: ${lastSubmittedInput}` : "재실행할 입력이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: lastSubmittedInput ? "rgba(255,234,199,0.95)" : "rgba(255,255,255,0.42)",
                border: lastSubmittedInput ? "1px solid rgba(227,179,65,0.62)" : "1px solid rgba(255,255,255,0.18)",
                background: lastSubmittedInput ? "rgba(227,179,65,0.18)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: lastSubmittedInput ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              {rerunButtonLabel}
            </button>
            <button
              type="button"
              aria-label="quick-input-forget-recall"
              onClick={forgetSubmittedInputQuick}
              disabled={!lastSubmittedInput}
              title={lastSubmittedInput ? "직전 실행 입력 기록 비우기" : "비울 실행 입력이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: lastSubmittedInput ? "rgba(255,225,222,0.95)" : "rgba(255,255,255,0.42)",
                border: lastSubmittedInput ? "1px solid rgba(255,123,114,0.58)" : "1px solid rgba(255,255,255,0.18)",
                background: lastSubmittedInput ? "rgba(255,123,114,0.14)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: lastSubmittedInput ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              FORGET RECALL
            </button>
            <button
              type="button"
              aria-label="quick-input-swap"
              onClick={swapWithSubmittedInputQuick}
              disabled={!lastSubmittedInput}
              title={lastSubmittedInput ? "현재 입력과 직전 실행 입력 교환" : "교환할 실행 입력이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: lastSubmittedInput ? "rgba(220,247,225,0.96)" : "rgba(255,255,255,0.42)",
                border: lastSubmittedInput ? "1px solid rgba(63,185,80,0.62)" : "1px solid rgba(255,255,255,0.18)",
                background: lastSubmittedInput ? "rgba(63,185,80,0.16)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: lastSubmittedInput ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              SWAP
            </button>
            <button
              type="button"
              aria-label="quick-input-merge-recall"
              onClick={mergeSubmittedInputQuick}
              disabled={!lastSubmittedInput}
              title={lastSubmittedInput ? "현재 입력 뒤에 직전 실행 입력 붙이기" : "붙일 실행 입력이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: lastSubmittedInput ? "rgba(215,228,255,0.96)" : "rgba(255,255,255,0.42)",
                border: lastSubmittedInput ? "1px solid rgba(121,192,255,0.6)" : "1px solid rgba(255,255,255,0.18)",
                background: lastSubmittedInput ? "rgba(121,192,255,0.16)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: lastSubmittedInput ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              MERGE
            </button>
            <button
              type="button"
              aria-label="quick-input-prepend-recall"
              onClick={prependSubmittedInputQuick}
              disabled={!lastSubmittedInput}
              title={lastSubmittedInput ? "현재 입력 앞에 직전 실행 입력 붙이기" : "붙일 실행 입력이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: lastSubmittedInput ? "rgba(215,228,255,0.96)" : "rgba(255,255,255,0.42)",
                border: lastSubmittedInput ? "1px solid rgba(121,192,255,0.6)" : "1px solid rgba(255,255,255,0.18)",
                background: lastSubmittedInput ? "rgba(121,192,255,0.16)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: lastSubmittedInput ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              PREPEND
            </button>
            <button
              type="button"
              aria-label="quick-input-plain"
              onClick={normalizeInputToPlain}
              disabled={!canNormalizeToPlain}
              title={canNormalizeToPlain ? "강제 프리픽스 제거 후 일반 입력으로 전환" : "제거할 프리픽스가 없어 비활성화"}
              style={{
                fontSize: 10,
                color: canNormalizeToPlain ? "rgba(215,228,255,0.96)" : "rgba(255,255,255,0.42)",
                border: canNormalizeToPlain ? "1px solid rgba(88,166,255,0.6)" : "1px solid rgba(255,255,255,0.18)",
                background: canNormalizeToPlain ? "rgba(88,166,255,0.18)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: canNormalizeToPlain ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              PLAIN
            </button>
            <button
              type="button"
              aria-label="quick-input-trim"
              onClick={trimInputQuick}
              disabled={!canTrimInput}
              title={canTrimInput ? "입력 앞뒤 공백 정리" : "정리할 공백이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: canTrimInput ? "rgba(220,247,225,0.96)" : "rgba(255,255,255,0.42)",
                border: canTrimInput ? "1px solid rgba(63,185,80,0.62)" : "1px solid rgba(255,255,255,0.18)",
                background: canTrimInput ? "rgba(63,185,80,0.16)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: canTrimInput ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              TRIM
            </button>
            <button
              type="button"
              aria-label="quick-input-squash"
              onClick={squashInputSpacesQuick}
              disabled={!canSquashInputSpaces}
              title={canSquashInputSpaces ? "연속 공백을 한 칸으로 압축" : "압축할 연속 공백이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: canSquashInputSpaces ? "rgba(220,247,225,0.96)" : "rgba(255,255,255,0.42)",
                border: canSquashInputSpaces ? "1px solid rgba(63,185,80,0.62)" : "1px solid rgba(255,255,255,0.18)",
                background: canSquashInputSpaces ? "rgba(63,185,80,0.16)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: canSquashInputSpaces ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              SQUASH
            </button>
            <button
              type="button"
              aria-label="quick-input-clean"
              onClick={cleanInputQuick}
              disabled={!canCleanInput}
              title={canCleanInput ? "앞뒤 공백 제거 + 연속 공백 압축" : "정리할 공백이 없어 비활성화"}
              style={{
                fontSize: 10,
                color: canCleanInput ? "rgba(220,247,225,0.96)" : "rgba(255,255,255,0.42)",
                border: canCleanInput ? "1px solid rgba(63,185,80,0.62)" : "1px solid rgba(255,255,255,0.18)",
                background: canCleanInput ? "rgba(63,185,80,0.16)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: canCleanInput ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              CLEAN
            </button>
            <span style={{ fontSize: 10, color: "rgba(227,179,65,0.78)", flexShrink: 0 }}>
              @local/@ollama/@xllm/@gemini
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.58)", flexShrink: 0 }}>
              Cmd/Ctrl+1~4 토글 · 0 해제 · `/. 정순환 · Shift+`/, 역순환
            </span>
            <button
              type="button"
              aria-label="quick-mode-heavy"
              aria-pressed={quickModeHeavyActive}
              onClick={() => toggleQuickModePrefix("heavy")}
              title="Heavy 추론 접두어 토글 (!!)"
              style={{
                fontSize: 10,
                color: quickModeHeavyActive ? "rgba(255,220,212,0.96)" : "rgba(255,255,255,0.86)",
                border: quickModeHeavyActive ? "1px solid rgba(255,123,114,0.64)" : "1px solid rgba(255,255,255,0.24)",
                background: quickModeHeavyActive ? "rgba(255,123,114,0.2)" : "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              !! Heavy
            </button>
            <button
              type="button"
              aria-label="quick-mode-shell"
              aria-pressed={quickModeShellActive}
              onClick={() => toggleQuickModePrefix("shell")}
              title="강제 shell 접두어 토글 (!)"
              style={{
                fontSize: 10,
                color: quickModeShellActive ? "rgba(255,245,219,0.96)" : "rgba(255,255,255,0.86)",
                border: quickModeShellActive ? "1px solid rgba(227,179,65,0.64)" : "1px solid rgba(255,255,255,0.24)",
                background: quickModeShellActive ? "rgba(227,179,65,0.22)" : "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ! Shell
            </button>
            <button
              type="button"
              aria-label="quick-mode-agent"
              aria-pressed={quickModeAgentActive}
              onClick={() => toggleQuickModePrefix("agent")}
              title="강제 agent 접두어 토글 (>>)"
              style={{
                fontSize: 10,
                color: quickModeAgentActive ? "rgba(255,225,222,0.96)" : "rgba(255,255,255,0.86)",
                border: quickModeAgentActive ? "1px solid rgba(255,123,114,0.64)" : "1px solid rgba(255,255,255,0.24)",
                background: quickModeAgentActive ? "rgba(255,123,114,0.2)" : "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {">>"} Agent
            </button>
            <button
              type="button"
              aria-label="quick-mode-explain"
              aria-pressed={quickModeExplainActive}
              onClick={() => toggleQuickModePrefix("explain")}
              title="강제 explain 접두어 토글 (?)"
              style={{
                fontSize: 10,
                color: quickModeExplainActive ? "rgba(220,247,225,0.96)" : "rgba(255,255,255,0.86)",
                border: quickModeExplainActive ? "1px solid rgba(63,185,80,0.64)" : "1px solid rgba(255,255,255,0.24)",
                background: quickModeExplainActive ? "rgba(63,185,80,0.2)" : "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ? Explain
            </button>
            <button
              type="button"
              aria-label="quick-mode-ai-cmd"
              aria-pressed={quickModeAiCmdActive}
              onClick={() => toggleQuickModePrefix("aiCmd")}
              title="AI 명령 제안 접두어 토글 (#)"
              style={{
                fontSize: 10,
                color: quickModeAiCmdActive ? "rgba(215,228,255,0.96)" : "rgba(255,255,255,0.86)",
                border: quickModeAiCmdActive ? "1px solid rgba(88,166,255,0.66)" : "1px solid rgba(255,255,255,0.24)",
                background: quickModeAiCmdActive ? "rgba(88,166,255,0.22)" : "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              # Cmd
            </button>
            <button
              type="button"
              aria-label="quick-mode-force-ai"
              aria-pressed={quickModeForceAiActive}
              onClick={toggleForceAiPrefix}
              title="강제 AI 챗 접두어 토글 (@)"
              style={{
                fontSize: 10,
                color: quickModeForceAiActive ? "rgba(215,228,255,0.96)" : "rgba(255,255,255,0.86)",
                border: quickModeForceAiActive ? "1px solid rgba(121,192,255,0.66)" : "1px solid rgba(255,255,255,0.24)",
                background: quickModeForceAiActive ? "rgba(121,192,255,0.22)" : "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              @ AI
            </button>
            <button
              type="button"
              aria-label="quick-backend-prev"
              onClick={() => cycleBackendQuickPrefix(-1)}
              title="이전 backend 순환 (Cmd/Ctrl+Shift+` 또는 Cmd/Ctrl+,)"
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.86)",
                border: "1px solid rgba(255,255,255,0.24)",
                background: "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 6px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="quick-backend-next"
              onClick={() => cycleBackendQuickPrefix(1)}
              title="다음 backend 순환 (Cmd/Ctrl+` 또는 Cmd/Ctrl+.)"
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.86)",
                border: "1px solid rgba(255,255,255,0.24)",
                background: "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 6px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ▶
            </button>
            <button
              type="button"
              aria-label="quick-backend-auto"
              aria-pressed={activeBackendPrefix === null}
              onClick={clearBackendQuickPrefix}
              title="백엔드 강제 해제 (Cmd/Ctrl+0) · AUTO 상태에서 다시 누르면 LAST 복원"
              style={{
                fontSize: 10,
                color: activeBackendPrefix === null ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.82)",
                border: activeBackendPrefix === null ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(255,255,255,0.25)",
                background: activeBackendPrefix === null ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              AUTO
            </button>
            <button
              type="button"
              aria-label="quick-backend-back"
              onClick={restorePrevBackendQuickPrefix}
              disabled={!backendTrail.prev}
              title={
                backendTrail.prev
                  ? "직전 backend로 복귀"
                  : "직전 backend 기록이 없어서 비활성화"
              }
              style={{
                fontSize: 10,
                color: backendTrail.prev ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.42)",
                border: backendTrail.prev ? "1px solid rgba(255,255,255,0.34)" : "1px solid rgba(255,255,255,0.18)",
                background: backendTrail.prev ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: backendTrail.prev ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              {prevBackendLabel}
            </button>
            <button
              type="button"
              aria-label="quick-backend-last"
              onClick={restoreLastBackendQuickPrefix}
              title="마지막으로 사용한 backend 복원"
              style={{
                fontSize: 10,
                color: "rgba(210,168,255,0.95)",
                border: "1px solid rgba(188,140,255,0.4)",
                background: "rgba(188,140,255,0.14)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {lastBackendLabel}
            </button>
            <button
              type="button"
              aria-label="quick-backend-local"
              aria-pressed={activeBackendPrefix === "local"}
              onClick={() => applyBackendQuickPrefix("local")}
              title="로컬 백엔드로 전환/해제 토글 (Cmd/Ctrl+1)"
              style={{
                fontSize: 10,
                color: "rgba(121,192,255,0.95)",
                border: activeBackendPrefix === "local" ? "1px solid rgba(88,166,255,0.75)" : "1px solid rgba(88,166,255,0.35)",
                background: activeBackendPrefix === "local" ? "rgba(88,166,255,0.24)" : "rgba(88,166,255,0.12)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              @local
            </button>
            <button
              type="button"
              aria-label="quick-backend-ollama"
              aria-pressed={activeBackendPrefix === "ollama"}
              onClick={() => applyBackendQuickPrefix("ollama")}
              title="Ollama 백엔드로 전환/해제 토글 (Cmd/Ctrl+2)"
              style={{
                fontSize: 10,
                color: "rgba(111,227,132,0.95)",
                border: activeBackendPrefix === "ollama" ? "1px solid rgba(63,185,80,0.72)" : "1px solid rgba(63,185,80,0.35)",
                background: activeBackendPrefix === "ollama" ? "rgba(63,185,80,0.24)" : "rgba(63,185,80,0.12)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              @ollama
            </button>
            <button
              type="button"
              aria-label="quick-backend-xllm"
              aria-pressed={activeBackendPrefix === "xllm"}
              onClick={() => applyBackendQuickPrefix("xllm")}
              title="xLLM 백엔드로 전환/해제 토글 (Cmd/Ctrl+3)"
              style={{
                fontSize: 10,
                color: "rgba(121,192,255,0.95)",
                border: activeBackendPrefix === "xllm" ? "1px solid rgba(121,192,255,0.72)" : "1px solid rgba(121,192,255,0.35)",
                background: activeBackendPrefix === "xllm" ? "rgba(121,192,255,0.24)" : "rgba(121,192,255,0.12)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              @xllm
            </button>
            <button
              type="button"
              aria-label="quick-backend-gemini"
              aria-pressed={activeBackendPrefix === "gemini"}
              onClick={() => applyBackendQuickPrefix("gemini")}
              title="Gemini 백엔드로 전환/해제 토글 (Cmd/Ctrl+4)"
              style={{
                fontSize: 10,
                color: "rgba(233,194,105,0.96)",
                border: activeBackendPrefix === "gemini" ? "1px solid rgba(227,179,65,0.72)" : "1px solid rgba(227,179,65,0.35)",
                background: activeBackendPrefix === "gemini" ? "rgba(227,179,65,0.24)" : "rgba(227,179,65,0.12)",
                borderRadius: 999,
                padding: "1px 7px",
                lineHeight: 1.25,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              @gemini
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ModeButton
              label="터미널"
              title="터미널 표시/숨김 (shell 명령 실행 시 자동 표시)"
              active={terminalVisible}
              activeColor="#e3b341"
              onClick={() => setTerminalVisible(v => !v)}
            />
            <ModeButton
              label="Vision"
              title="비전 모드 — 이미지 첨부 활성화"
              active={visionMode}
              activeColor="#58a6ff"
              onClick={() => setVisionMode(v => !v)}
            />
            <ModeButton
              label="추론"
              title="추론 체인 표시 — <think> 블록 보이기 (전역 설정 토글)"
              active={!!showReasoning}
              activeColor="#3fb950"
              onClick={() => onToggleReasoning?.()}
            />
          </div>
        </div>

        {/* Warp 입력바 — 입력 필드, 라우팅은 handleSubmit */}
        <WarpInputBar
          ref={warpInputRef}
          fontFamily={fontFamily ? `"${fontFamily}", ${FONT_FAMILY}` : FONT_FAMILY}
          fontSize={fontSize ?? 13}
          onSubmit={handleSubmit}
          onInterrupt={handleInterrupt}
          onKeyDownIntercept={handleMentionKeyDown}
          onTab={handleTab}
          onChange={handleInputChange}
          contextChips={inputChips}
        />
      </div>

      {mentionOpen && (mentionLoading || mentionItems.length > 0) && (
        <div
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: 70,
            zIndex: 28,
            background: "rgba(10,16,24,0.96)",
            border: "1px solid rgba(121,192,255,0.28)",
            borderRadius: 10,
            boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.48)", padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            컨텍스트 첨부 (@) · {mentionTrail ? mentionTrail : "현재 폴더"}
          </div>
          <div style={{ maxHeight: 184, overflowY: "auto" }}>
            {mentionLoading && (
              <div style={{ padding: "8px 10px", fontSize: 11, color: "rgba(255,255,255,0.52)" }}>
                불러오는 중…
              </div>
            )}
            {!mentionLoading && mentionItems.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 11, color: "rgba(255,255,255,0.52)" }}>
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
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: selected ? "rgba(88,166,255,0.18)" : "transparent",
                      border: "none",
                      color: "rgba(201,209,217,0.9)",
                      padding: "7px 10px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#79c0ff", minWidth: 22 }}>UP</span>
                    <span style={{ fontFamily: FONT_FAMILY }}>.. (상위 폴더)</span>
                  </button>
                );
              }
              const entry = item.entry;
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => applyMentionItem(item)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: selected ? "rgba(88,166,255,0.18)" : "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.84)",
                    padding: "7px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontSize: 10, color: entry.is_dir ? "#79c0ff" : "rgba(255,255,255,0.55)", minWidth: 22 }}>
                    {entry.is_dir ? "DIR" : "FILE"}
                  </span>
                  <span style={{ fontFamily: FONT_FAMILY }}>
                    @{mentionTrail}{entry.name}{entry.is_dir ? "/" : ""}
                  </span>
                </button>
              );
            })}
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
            fontSize: 11,
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
          <span style={{ fontSize: 10, color: aiCmdError ? "#ff7b72" : "#58a6ff", fontFamily: FONT_FAMILY, opacity: 0.9 }}>
            {aiCmdError ? "⚠ AI" : "⚡ AI"}
          </span>
          {aiLoading ? (
            <span style={{ fontSize: 11, color: "rgba(88,166,255,0.5)", fontFamily: FONT_FAMILY }}>
              생성 중…
            </span>
          ) : aiCmdError ? (
            <span style={{ fontSize: 11, color: "rgba(255,123,114,0.85)", fontFamily: FONT_FAMILY, whiteSpace: "pre-wrap" }}>
              {aiCmdError}
            </span>
          ) : (
            <>
              <span style={{ fontSize: 12, color: "rgba(88,166,255,0.85)", fontFamily: FONT_FAMILY, whiteSpace: "pre" }}>
                {aiGhost?.cmd}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: FONT_FAMILY }}>
                Tab
              </span>
            </>
          )}
        </div>
      )}

      {/* ── AI Explain 팝업 (? prefix) ─────────────────────────────────── */}
      {(explainPopup || explainLoading) && (
        <div
          style={{
            position: "absolute",
            left: PANE_PADDING_X,
            bottom: 40,
            zIndex: 25,
            maxWidth: "min(520px, 90%)",
            background: "rgba(13,17,23,0.97)",
            border: "1px solid rgba(63,185,80,0.3)",
            borderRadius: 8,
            padding: "6px 10px",
            pointerEvents: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: explainPopup ? 4 : 0 }}>
            <span style={{ fontSize: 10, color: "#3fb950", fontFamily: FONT_FAMILY }}>? 설명</span>
            {!explainLoading && (
              <button
                onClick={clearExplain}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 11, padding: "0 2px" }}
              >
                ✕
              </button>
            )}
          </div>
          {explainLoading ? (
            <span style={{ fontSize: 11, color: "rgba(63,185,80,0.5)", fontFamily: FONT_FAMILY }}>
              분석 중…
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "rgba(201,209,217,0.85)", fontFamily: FONT_FAMILY, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {explainPopup?.text}
            </span>
          )}
        </div>
      )}

      {/* ── 검색 바 (Cmd+F) ───────────────────────────────────────────── */}
      {searchOpen && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(13,17,23,0.97)",
            border: "1px solid rgba(88,166,255,0.3)",
            borderRadius: 8,
            padding: "4px 6px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); doSearch(e.target.value); }}
            onKeyDown={e => {
              if (e.key === "Enter") doSearch(searchQuery, !e.shiftKey);
              if (e.key === "Escape") closeSearch();
              e.stopPropagation();
            }}
            placeholder="검색…"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#c9d1d9",
              fontSize: 12,
              fontFamily: FONT_FAMILY,
              width: 160,
            }}
          />
          {/* 대소문자 */}
          <IconButton
            tooltip="대소문자 구분"
            onClick={() => setSearchCase(v => !v)}
            style={{
              background: searchCase ? "rgba(88,166,255,0.2)" : "transparent",
              border: "1px solid " + (searchCase ? "rgba(88,166,255,0.5)" : "rgba(255,255,255,0.1)"),
              borderRadius: 4,
              color: searchCase ? "#58a6ff" : "rgba(255,255,255,0.3)",
              cursor: "pointer",
              fontSize: 10,
              padding: "1px 5px",
              fontFamily: FONT_FAMILY,
            }}
          >
            Aa
          </IconButton>
          {/* 정규식 */}
          <IconButton
            tooltip="정규식"
            onClick={() => setSearchRegex(v => !v)}
            style={{
              background: searchRegex ? "rgba(88,166,255,0.2)" : "transparent",
              border: "1px solid " + (searchRegex ? "rgba(88,166,255,0.5)" : "rgba(255,255,255,0.1)"),
              borderRadius: 4,
              color: searchRegex ? "#58a6ff" : "rgba(255,255,255,0.3)",
              cursor: "pointer",
              fontSize: 10,
              padding: "1px 5px",
              fontFamily: FONT_FAMILY,
            }}
          >
            .*
          </IconButton>
          {/* 이전/다음 */}
          <IconButton tooltip="이전 (Shift+Enter)" onClick={() => doSearch(searchQuery, false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>‹</IconButton>
          <IconButton tooltip="다음 (Enter)" onClick={() => doSearch(searchQuery, true)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>›</IconButton>
          <button onClick={closeSearch} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 12, padding: "0 2px" }}>✕</button>
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
