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

const IS_WINDOWS = navigator.userAgent.includes("Windows");
const FONT_FAMILY = IS_WINDOWS
  ? '"JetBrains Mono", "Cascadia Code", "Consolas", "Courier New", monospace'
  : '"JetBrains Mono", "Menlo", "Monaco", monospace';

// GitHub Dark 팔레트
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
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);

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
      allowTransparency: false, // 투명도 끔 — 캔버스 렌더링 안정화
      scrollback: 5000,
      theme: THEME,
      // 최소 크기 보장
      cols: 80,
      rows: 24,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // xterm.js open 직후에는 레이아웃이 아직 확정되지 않았을 수 있음
    // 두 번 fit: 즉시 + 100ms 후 (레이아웃 완료 보장)
    const doInitialFit = () => {
      try { fitAddon.fit(); } catch {}

      const { cols, rows } = term;
      invoke("spawn_pty", {
        id,
        cwd: cwd ?? "",
        cols,
        rows,
      }).catch((e: unknown) => {
        term.write(`\r\n\x1b[31m[PTY 오류: ${e}]\x1b[0m\r\n`);
      });
    };

    // 첫 번째 fit: requestAnimationFrame
    requestAnimationFrame(() => {
      // 두 번째 fit: 레이아웃 완전히 확정된 후
      setTimeout(doInitialFit, 80);
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
      term.write("\r\n\x1b[2m[프로세스 종료 — 새 탭을 열어주세요]\x1b[0m\r\n");
    });

    // 사용자 키 입력 → PTY 전달
    term.onData((data) => {
      invoke("write_to_pty", { id, data }).catch(() => {});
    });

    // 컨테이너 크기 변경 → fit + resize_pty
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
  }, [id, cwd, onOutput, doFitAndResize]);

  return (
    // outerRef: ResizeObserver 감지 대상 (전체 영역)
    <div
      ref={outerRef}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: THEME.background,
        overflow: "hidden",
      }}
    >
      {/* containerRef: xterm.js가 마운트되는 실제 컨테이너 */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          padding: "6px 10px",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
};

export default TerminalPane;
