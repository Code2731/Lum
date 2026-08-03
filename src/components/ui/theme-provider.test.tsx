import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { getThemeLabel, ThemeProvider, useTheme } from "./theme-provider";

function Consumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span>{theme}</span>
      <button type="button" onClick={() => setTheme("light")}>light</button>
      <button type="button" onClick={() => setTheme("dark")}>dark</button>
      <button type="button" onClick={() => setTheme("system")}>system</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("테마 라벨을 안정적으로 반환한다", () => {
    expect(getThemeLabel("dark")).toBe("dark");
    expect(getThemeLabel("light")).toBe("light");
    expect(getThemeLabel("system")).toBe("system");
  });

  it("잘못된 저장값이 있어도 기본 테마로 안전하게 시작한다", () => {
    window.localStorage.setItem("lum-ui-theme", "invalid");

    render(
      <ThemeProvider defaultTheme="dark">
        <Consumer />
      </ThemeProvider>,
    );

    expect(screen.getByText("dark")).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("setTheme 호출 시 저장값과 document 테마를 함께 갱신한다", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <Consumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "light" }));

    expect(screen.getByText("light")).toBeInTheDocument();
    expect(window.localStorage.getItem("lum-ui-theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("system 테마는 시스템 변경을 추적한다", () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: true,
      addEventListener: vi.fn((_event: string, listener: () => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_event: string, listener: () => void) => {
        listeners.delete(listener);
      }),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => media));

    render(
      <ThemeProvider defaultTheme="system">
        <Consumer />
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    media.matches = false;
    listeners.forEach((listener) => listener());

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
