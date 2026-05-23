import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string; red: string; green: string; yellow: string;
  blue: string; magenta: string; cyan: string; white: string;
  brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string;
  brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string;
}

export interface TerminalAppearance {
  themeName: string;
  fontSize: number;
  fontFamily: string;
}

export const FONT_FAMILIES = [
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "Cascadia Code",
  "Menlo",
  "Consolas",
] as const;

export const DEFAULT_TERMINAL_FONT_SIZE = 13;

export const THEMES: Record<string, XtermTheme> = {
  "GitHub Dark": {
    background: "#0d1117", foreground: "#c9d1d9",
    cursor: "#58a6ff", cursorAccent: "#0d1117",
    selectionBackground: "#264f7855",
    black: "#484f58", red: "#ff7b72", green: "#3fb950", yellow: "#d29922",
    blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf", white: "#b1bac4",
    brightBlack: "#6e7681", brightRed: "#ffa198", brightGreen: "#56d364",
    brightYellow: "#e3b341", brightBlue: "#79c0ff", brightMagenta: "#d2a8ff",
    brightCyan: "#56d4dd", brightWhite: "#f0f6fc",
  },
  "Dracula": {
    background: "#282a36", foreground: "#f8f8f2",
    cursor: "#f8f8f2", cursorAccent: "#282a36",
    selectionBackground: "#44475a88",
    black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
    blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
    brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94",
    brightYellow: "#ffffa5", brightBlue: "#d6acff", brightMagenta: "#ff92df",
    brightCyan: "#a4ffff", brightWhite: "#ffffff",
  },
  "Tokyo Night": {
    background: "#1a1b26", foreground: "#a9b1d6",
    cursor: "#7aa2f7", cursorAccent: "#1a1b26",
    selectionBackground: "#283457aa",
    black: "#32344a", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
    blue: "#7aa2f7", magenta: "#ad8ee6", cyan: "#449dab", white: "#787c99",
    brightBlack: "#444b6a", brightRed: "#ff7a93", brightGreen: "#b9f27c",
    brightYellow: "#ff9e64", brightBlue: "#7da6ff", brightMagenta: "#bb9af7",
    brightCyan: "#0db9d7", brightWhite: "#acb0d0",
  },
  "One Dark": {
    background: "#282c34", foreground: "#abb2bf",
    cursor: "#528bff", cursorAccent: "#282c34",
    selectionBackground: "#3e445366",
    black: "#3f4451", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
    blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
    brightBlack: "#4f5666", brightRed: "#be5046", brightGreen: "#98c379",
    brightYellow: "#d19a66", brightBlue: "#61afef", brightMagenta: "#c678dd",
    brightCyan: "#56b6c2", brightWhite: "#ffffff",
  },
  "Solarized Dark": {
    background: "#002b36", foreground: "#839496",
    cursor: "#268bd2", cursorAccent: "#002b36",
    selectionBackground: "#073642aa",
    black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
    blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
    brightBlack: "#586e75", brightRed: "#cb4b16", brightGreen: "#586e75",
    brightYellow: "#657b83", brightBlue: "#839496", brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
  },
};

const DEFAULT_APPEARANCE: TerminalAppearance = {
  themeName: "GitHub Dark",
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  fontFamily: "JetBrains Mono",
};

export function useTerminalTheme() {
  const [appearance, setAppearance] = useState<TerminalAppearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    invoke<{ theme?: string; font_size?: number; font_family?: string }>("load_app_config")
      .then(cfg => {
        setAppearance({
          themeName: cfg.theme && THEMES[cfg.theme] ? cfg.theme : DEFAULT_APPEARANCE.themeName,
          fontSize: cfg.font_size ?? DEFAULT_APPEARANCE.fontSize,
          fontFamily: cfg.font_family ?? DEFAULT_APPEARANCE.fontFamily,
        });
      })
      .catch(() => {});
  }, []);

  const saveAppearance = useCallback(async (next: TerminalAppearance) => {
    setAppearance(next);
    await invoke("save_terminal_appearance", {
      theme: next.themeName,
      fontSize: next.fontSize,
      fontFamily: next.fontFamily,
      opacity: null,
    }).catch(() => {});
  }, []);

  return { appearance, saveAppearance, xtermTheme: THEMES[appearance.themeName] ?? THEMES["GitHub Dark"] };
}
