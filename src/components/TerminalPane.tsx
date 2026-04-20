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

// Approximate cell dimensions for ghost text positioning
const CELL_W = 7.8;
const CELL_H = 18.2;
const PANE_PADDING_X = 10;
const PANE_PADDING_Y = 6;

const TerminalPane: React.FC<Props> = ({ id, cwd, onOutput, onReady }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);

  // Ghost text state
  const [ghostText, setGhostText] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const inputBufRef = useRef("");
  const suggestionRef = useRef<{ suffix: string; insert: string } | null>(null);

  const doFitAndResize = useCallback(() => {
    const fit = fitAddonRef.current;
    const term = termRef.current;
    if (!fit || !term) return;
    try {
      fit.fit();
      invoke("resize_pty", { id, cols: term.cols, rows: term.rows }).catch(() => {});
    } catch {
      // fit 실패는 무시 (언마운트 중일 수 있음)
    }
  }, [id]);

  const ghostTextRef = useRef<string | null>(null);

  const updateGhost = useCallback((term: Terminal, inputBuf: string) => {
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

    requestAnimationFrame(() => {
      setTimeout(doInitialFit, 80);
    });

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
      // Tab intercept — accept ghost text suggestion
      if (data === "\t" && suggestionRef.current) {
        invoke("write_to_pty", { id, data: suggestionRef.current.insert }).catch(() => {});
        inputBufRef.current += suggestionRef.current.insert;
        suggestionRef.current = null;
        setGhostText(null);
        return;
      }

      // Track input buffer for ghost text
      if (data === "\r" || data === "\n") {
        // Command submitted — clear buffer
        inputBufRef.current = "";
        setGhostText(null);
        suggestionRef.current = null;
      } else if (data === "\x7f" || data === "\b") {
        // Backspace
        inputBufRef.current = inputBufRef.current.slice(0, -1);
        updateGhost(term, inputBufRef.current);
      } else if (data.length === 1 && data >= " ") {
        // Printable character
        inputBufRef.current += data;
        updateGhost(term, inputBufRef.current);
      } else if (data === "\x03" || data === "\x04") {
        inputBufRef.current = "";
        ghostTextRef.current = null;
        setGhostText(null);
        suggestionRef.current = null;
      } else if (data.startsWith("\x1b")) {
        // ESC sequences (arrow keys, word-jump, etc.) move cursor without updating inputBuf
        // Reset buffer to avoid stale ghost text
        inputBufRef.current = "";
        if (ghostTextRef.current !== null) {
          ghostTextRef.current = null;
          setGhostText(null);
          suggestionRef.current = null;
        }
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
      unlistenData.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      resizeObserver.disconnect();
      window.removeEventListener("resize", doFitAndResize);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      spawnedRef.current = false;
    };
  }, [id, cwd, onOutput, onReady, doFitAndResize, updateGhost]);

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
    </div>
  );
};

export default TerminalPane;
