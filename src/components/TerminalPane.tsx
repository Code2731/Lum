import React, { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { findCompletion } from "../utils/ghostText";

interface PtyData {
  id: string;
  data: string;
}

interface Props {
  id: string;
  cwd?: string;
  model?: string;
  onOutput?: (data: string) => void;
  onReady?: (write: (data: string) => void) => void;
}

const IS_WINDOWS = navigator.userAgent.includes("Windows");
const FONT_FAMILY = IS_WINDOWS
  ? '"JetBrains Mono", "Cascadia Code", "Consolas", "Courier New", monospace'
  : '"JetBrains Mono", "Menlo", "Monaco", monospace';

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

const CELL_W = 7.8;
const CELL_H = 18.2;
const PANE_PADDING_X = 10;
const PANE_PADDING_Y = 6;

const DEFAULT_MODEL = "Qwen2.5-Coder-7B-Instruct-EXL2-4bpw";

const TerminalPane: React.FC<Props> = ({ id, cwd, model, onOutput, onReady }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);

  // useEffect 재실행 없이 최신 prop 값 참조
  const modelRef = useRef(model ?? DEFAULT_MODEL);
  useEffect(() => { modelRef.current = model ?? DEFAULT_MODEL; }, [model]);
  const cwdRef = useRef(cwd ?? "");
  useEffect(() => { cwdRef.current = cwd ?? ""; }, [cwd]);

  // Static CLI ghost text
  const [ghostText, setGhostText] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const ghostTextRef = useRef<string | null>(null);
  const inputBufRef = useRef("");
  const suggestionRef = useRef<{ suffix: string; insert: string } | null>(null);

  // AI inline edit (# prefix)
  const [aiGhost, setAiGhost] = useState<{ cmd: string; y: number } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiSuggestionRef = useRef<string | null>(null);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, []);

  // Enter / Ctrl+C / Ctrl+D / ESC 등 입력 라인 전체 리셋
  const resetInputState = useCallback(() => {
    inputBufRef.current = "";
    if (ghostTextRef.current !== null) {
      ghostTextRef.current = null;
      setGhostText(null);
      suggestionRef.current = null;
    }
    clearAiGhost();
  }, [clearAiGhost]);

  const updateGhost = useCallback((term: Terminal, inputBuf: string) => {
    if (inputBuf.startsWith("# ")) return;

    const suggestion = findCompletion(inputBuf);
    suggestionRef.current = suggestion;

    if (!suggestion) {
      if (ghostTextRef.current !== null) {
        ghostTextRef.current = null;
        setGhostText(null);
      }
      return;
    }

    const cursorX = term.buffer.active.cursorX;
    const cursorY = term.buffer.active.cursorY;
    setGhostPos({
      x: PANE_PADDING_X + cursorX * CELL_W,
      y: PANE_PADDING_Y + cursorY * CELL_H,
    });
    ghostTextRef.current = suggestion.suffix;
    setGhostText(suggestion.suffix);
  }, []);

  const triggerAiCompletion = useCallback((term: Terminal, inputBuf: string) => {
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);

    const prompt = inputBuf.slice(2).trim();
    if (!prompt) {
      clearAiGhost();
      return;
    }

    const cursorY = term.buffer.active.cursorY;

    aiDebounceRef.current = setTimeout(async () => {
      setAiLoading(true);
      try {
        // 프로젝트 컨텍스트 + 최근 히스토리 병렬 조회
        const [projectCtx, recentHistory] = await Promise.all([
          invoke<string>("get_project_context", { cwd: cwdRef.current }),
          invoke<Array<{ command: string }>>("get_recent_history", { limit: 5 }).catch(() => []),
        ]);
        const recentCmds = recentHistory.map((h) => h.command).filter(Boolean).join(", ");
        const context = [projectCtx, recentCmds ? `recent: ${recentCmds}` : ""]
          .filter(Boolean)
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
        setAiGhost({ cmd, y: PANE_PADDING_Y + (cursorY + 1) * CELL_H });
      } catch {
        setAiLoading(false);
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
    term.loadAddon(fitAddon);
    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const doInitialFit = () => {
      try { fitAddon.fit(); } catch {}
      const { cols, rows } = term;
      invoke("spawn_pty", { id, cwd: cwd ?? "", cols, rows }).catch((e: unknown) => {
        term.write(`\r\n\x1b[31m[PTY 오류: ${e}]\x1b[0m\r\n`);
      });
    };

    requestAnimationFrame(() => { setTimeout(doInitialFit, 80); });

    const unlistenData = listen<PtyData>("pty_data", (event) => {
      if (event.payload.id !== id) return;
      term.write(event.payload.data);
      onOutput?.(event.payload.data);
    });

    const unlistenExit = listen<string>("pty_exit", (event) => {
      if (event.payload !== id) return;
      term.write("\r\n\x1b[2m[프로세스 종료 — 새 탭을 열어주세요]\x1b[0m\r\n");
    });

    term.onData((data) => {
      if (data === "\t") {
        if (aiSuggestionRef.current) {
          invoke("write_to_pty", { id, data: "\x15" + aiSuggestionRef.current }).catch(() => {});
          inputBufRef.current = aiSuggestionRef.current;
          aiSuggestionRef.current = null;
          setAiGhost(null);
          return;
        }
        if (suggestionRef.current) {
          invoke("write_to_pty", { id, data: suggestionRef.current.insert }).catch(() => {});
          inputBufRef.current += suggestionRef.current.insert;
          suggestionRef.current = null;
          ghostTextRef.current = null;
          setGhostText(null);
          return;
        }
      }

      if (data === "\r" || data === "\n") {
        resetInputState();
      } else if (data === "\x7f" || data === "\b") {
        inputBufRef.current = inputBufRef.current.slice(0, -1);
        const buf = inputBufRef.current;
        if (buf.startsWith("# ")) {
          triggerAiCompletion(term, buf);
        } else {
          clearAiGhost();
          updateGhost(term, buf);
        }
      } else if (data.length === 1 && data >= " ") {
        inputBufRef.current += data;
        const buf = inputBufRef.current;
        if (buf.startsWith("# ")) {
          if (ghostTextRef.current !== null) { ghostTextRef.current = null; setGhostText(null); }
          suggestionRef.current = null;
          triggerAiCompletion(term, buf);
        } else {
          clearAiGhost();
          updateGhost(term, buf);
        }
      } else if (data === "\x03" || data === "\x04" || data.startsWith("\x1b")) {
        resetInputState();
      }

      invoke("write_to_pty", { id, data }).catch(() => {});
    });

    onReady?.((data) => {
      invoke("write_to_pty", { id, data }).catch(() => {});
    });

    const resizeObserver = new ResizeObserver(() => doFitAndResize());
    if (outerRef.current) resizeObserver.observe(outerRef.current);
    window.addEventListener("resize", doFitAndResize);

    return () => {
      if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
      unlistenData.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      resizeObserver.disconnect();
      window.removeEventListener("resize", doFitAndResize);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      spawnedRef.current = false;
    };
  }, [id, cwd, onOutput, onReady, doFitAndResize, updateGhost, triggerAiCompletion, clearAiGhost, resetInputState]);

  return (
    <div
      ref={outerRef}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: THEME.background,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          padding: `${PANE_PADDING_Y}px ${PANE_PADDING_X}px`,
          boxSizing: "border-box",
        }}
      />

      {ghostText && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: ghostPos.x,
            top: ghostPos.y,
            height: CELL_H,
            lineHeight: `${CELL_H}px`,
            fontSize: 13,
            fontFamily: FONT_FAMILY,
            color: "rgba(201,209,217,0.35)",
            pointerEvents: "none",
            whiteSpace: "pre",
            zIndex: 10,
          }}
        >
          {ghostText}
        </div>
      )}

      {(aiGhost || aiLoading) && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: PANE_PADDING_X,
            top: aiGhost ? aiGhost.y : PANE_PADDING_Y + CELL_H * 2,
            pointerEvents: "none",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(13,17,23,0.92)",
            border: "1px solid rgba(88,166,255,0.25)",
            borderRadius: 6,
            padding: "3px 8px",
            maxWidth: "90%",
          }}
        >
          <span style={{ fontSize: 10, color: "#58a6ff", fontFamily: FONT_FAMILY, opacity: 0.8 }}>
            ⚡ AI
          </span>
          {aiLoading ? (
            <span style={{ fontSize: 11, color: "rgba(88,166,255,0.5)", fontFamily: FONT_FAMILY }}>
              생성 중…
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
    </div>
  );
};

export default TerminalPane;
