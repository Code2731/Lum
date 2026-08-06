import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export function getThemeLabel(theme: Theme): string {
  switch (theme) {
    case "dark":
      return "dark";
    case "light":
      return "light";
    default:
      return "system";
  }
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const isTheme = (value: unknown): value is Theme =>
  value === "dark" || value === "light" || value === "system";

const readStoredTheme = (storageKey: string, fallback: Theme): Theme => {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null;
    return isTheme(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

const getSystemTheme = (): "dark" | "light" =>
  typeof window.matchMedia === "function" && !window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "light"
    : "dark";

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "lum-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme(storageKey, defaultTheme));

  useEffect(() => {
    const root = window.document.documentElement;
    const media = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

    const applyTheme = (nextTheme: "dark" | "light") => {
      root.classList.remove("light", "dark");
      root.classList.add(nextTheme);
      root.style.colorScheme = nextTheme;
    };

    if (theme === "system") {
      applyTheme(getSystemTheme());

      const onChange = () => applyTheme(getSystemTheme());
      if (typeof media?.addEventListener === "function") {
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
      }
      media?.addListener?.(onChange);
      return () => media?.removeListener?.(onChange);
    }

    applyTheme(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      try {
        localStorage.setItem(storageKey, theme);
      } catch {
        // noop
      }
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
