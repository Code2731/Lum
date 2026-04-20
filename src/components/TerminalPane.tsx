import React, { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

interface PtyData {
  id: string;
  data: string;
}

interface Props {
  id: string;
  cwd?: string;
  onOutput?: (data: string) => void;
}

// GitHub Dark 테마 팔레트
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

const TerminalPane: React.FC<Props> = ({ id, cwd, onOutput }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);

  const doResize = useCallback(() => {
    const term = termRef.current;
    const fit = fitAddonRef.current;
    if (!term || !fit) return;
    try {
      fit.fit();
      invoke("resize_pty", { id, cols: term.cols, rows: term.rows }).catch(() => {});
    } catch {
      // 터미널이 아직 마운트 중일 수 있음
    }
  }, [id]);

  useEffect(() => {
    if (!containerRef.current || spawnedRef.current) return;
    spawnedRef.current = true;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Menlo", "Monaco", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      allowTransparency: true,
      scrollback: 5000,
      theme: THEME,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // 초기 렌더 후 fit
    requestAnimationFrame(() => {
      fitAddon.fit();
      const { cols, rows } = term;

      // PTY 생성
      invoke("spawn_pty", {
        id,
        cwd: cwd ?? "",
        cols,
        rows,
      }).catch((e) => {
        term.write(`\r\n\x1b[31m[PTY 오류: ${e}]\x1b[0m\r\n`);
      });
    });

    // PTY 출력 수신
    const unlistenData = listen<PtyData>("pty_data", (event) => {
      if (event.payload.id !== id) return;
      term.write(event.payload.data);
      onOutput?.(event.payload.data);
    });

    // PTY 종료 수신
    const unlistenExit = listen<string>("pty_exit", (event) => {
      if (event.payload !== id) return;
      term.write("\r\n\x1b[2m[프로세스 종료]\x1b[0m\r\n");
    });

    // 사용자 키 입력 → PTY 전송
    term.onData((data) => {
      invoke("write_to_pty", { id, data }).catch(() => {});
    });

    // 창 크기 변경 감지
    const resizeObserver = new ResizeObserver(() => doResize());
    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", doResize);

    return () => {
      unlistenData.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      resizeObserver.disconnect();
      window.removeEventListener("resize", doResize);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      spawnedRef.current = false;
    };
  }, [id, cwd, onOutput, doResize]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        padding: "4px 8px",
        boxSizing: "border-box",
        backgroundColor: THEME.background,
      }}
    />
  );
};

export default TerminalPane;
