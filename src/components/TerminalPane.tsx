import React, { useEffect, useRef, useCallback, useState } from "react";
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
import { parseCommandLines } from "../utils/smartPaste";
import PasteGuardModal from "./PasteGuardModal";
import SmartPasteModal from "./SmartPasteModal";
import TerminalContextMenu from "./TerminalContextMenu";
import WarpInputBar, { type WarpInputBarHandle } from "./WarpInputBar";
import AIBlockStream from "./AIBlockStream";
import { routeInput } from "../utils/inputRouter";
import type { ChatMessage } from "../hooks/useAIChat";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { XtermTheme } from "../hooks/useTerminalTheme";
import type { DangerMatch } from "../utils/pasteGuard";
import type { SshProfile } from "../hooks/useTabManager";

interface PtyData {
  id: string;
  data: string;
}

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
  onAgentTrigger?: (task: string) => void;
  onAskAI?: (question: string) => void;
  aiMessages?: ChatMessage[];
  aiStreaming?: boolean;
  aiError?: string | null;
  onClearAI?: () => void;
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

const DEFAULT_MODEL = "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";

const TerminalPane: React.FC<Props> = ({ id, cwd, sshProfile, model, xtermTheme, fontSize, fontFamily, onOutput, onCwdChange, onReady, onAgentTrigger, onAskAI, aiMessages, aiStreaming, aiError, onClearAI }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const spawnedRef = useRef(false);
  const promptDecorationRef = useRef<IDecoration | null>(null);

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
    if (!term) return;
    const fallback = FONT_FAMILY;
    term.options.fontFamily = fontFamily ? `"${fontFamily}", ${fallback}` : FONT_FAMILY;
  }, [fontFamily]);

  // Paste guard
  const [pasteGuard, setPasteGuard] = useState<{ match: DangerMatch; text: string } | null>(null);

  // Smart paste
  const [smartPaste, setSmartPaste] = useState<{ lines: string[]; rawText: string } | null>(null);
  const writeToPtyRef = useRef<(data: string) => void>(() => {});

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(null);

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

    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      allowTransparency: false,
      scrollback: 5000,
      theme: THEME,
      cols: 80,
      rows: 24,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Cmd+F / Ctrl+F — 검색창 열기
    term.attachCustomKeyEventHandler((e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "f" && e.type === "keydown") {
        openSearch();
        return false;
      }
      return true;
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

      term.write(raw);

      // 프롬프트 시작 → 해당 줄을 배경색 decoration으로 완전히 숨김
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

      // 블록 시작 → 파란 왼쪽 테두리 decoration
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
  }, []);

  // 입력 라우팅: 기본=AI, 알려진 CLI=shell, !/@/#/?/>> = 명시적 오버라이드
  const handleSubmit = useCallback((rawInput: string) => {
    const route = routeInput(rawInput);
    clearAllOverlays();
    switch (route.type) {
      case "empty":
        return;
      case "shell":
        invoke("write_to_pty", { id, data: route.command + "\r" }).catch(() => {});
        return;
      case "ai":
        if (route.question) onAskAIRef.current?.(route.question);
        return;
      case "agent":
        if (route.task) onAgentTriggerRef.current?.(route.task);
        return;
      case "aiCmd":
      case "explain":
        // # / ? 는 인라인 제안 흐름 — 제출 시엔 아무 것도 안 함 (Tab으로 수용)
        return;
    }
  }, [id, clearAllOverlays]);

  const handleInterrupt = useCallback(() => {
    invoke("write_to_pty", { id, data: "\x03" }).catch(() => {});
  }, [id]);

  const handleInputChange = useCallback((buf: string) => {
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
  }, [clearAiGhost, clearExplain, triggerAiCompletion, triggerExplain, updateGhost]);

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

  return (
    <div
      ref={outerRef}
      onContextMenu={handleContextMenu}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: THEME.background,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* xterm 출력 영역 */}
      <div
        style={{ flex: 1, minHeight: 0, padding: `${PANE_PADDING_Y}px ${PANE_PADDING_X}px 0`, position: "relative" }}
      >
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {/* AI 답변 스트림 — xterm과 WarpInputBar 사이 */}
      <AIBlockStream
        messages={aiMessages ?? []}
        streaming={aiStreaming ?? false}
        error={aiError ?? null}
        onClear={onClearAI ?? (() => {})}
        onExecute={(cmd) => invoke("write_to_pty", { id, data: cmd + "\r" }).catch(() => {})}
      />

      {/* Warp 입력바 — 입력 필드, 라우팅은 handleSubmit */}
      <WarpInputBar
        ref={warpInputRef}
        fontFamily={fontFamily ? `"${fontFamily}", ${FONT_FAMILY}` : FONT_FAMILY}
        fontSize={fontSize ?? 13}
        onSubmit={handleSubmit}
        onInterrupt={handleInterrupt}
        onTab={handleTab}
        onChange={handleInputChange}
      />

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
          <button
            onClick={() => setSearchCase(v => !v)}
            title="대소문자 구분"
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
          </button>
          {/* 정규식 */}
          <button
            onClick={() => setSearchRegex(v => !v)}
            title="정규식"
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
          </button>
          {/* 이전/다음 */}
          <button onClick={() => doSearch(searchQuery, false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14, padding: "0 2px" }} title="이전 (Shift+Enter)">‹</button>
          <button onClick={() => doSearch(searchQuery, true)}  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14, padding: "0 2px" }} title="다음 (Enter)">›</button>
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
