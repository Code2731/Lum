import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  useTerminalTheme,
  DEFAULT_TERMINAL_FONT_SIZE,
  getTerminalThemeMeta,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  THEMES,
} from "./useTerminalTheme";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

function Consumer() {
  const { appearance, saveAppearance, xtermTheme } = useTerminalTheme();
  return (
    <div>
      <span>{appearance.themeName}</span>
      <span>{appearance.fontSize}</span>
      <span>{appearance.fontFamily}</span>
      <span>{xtermTheme.background}</span>
      <button
        type="button"
        onClick={() =>
          saveAppearance({
            themeName: "없는 테마",
            fontSize: 999,
            fontFamily: "Unknown Font",
          } as any)
        }
      >
        save-invalid
      </button>
    </div>
  );
}

describe("useTerminalTheme", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("로드 시 저장 설정을 안전하게 정규화한다", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          theme: "없는 테마",
          font_size: 3,
          font_family: "Unknown Font",
        });
      }
      return Promise.resolve(undefined);
    });

    render(<Consumer />);

    await waitFor(() => {
      expect(screen.getByText("GitHub Dark")).toBeInTheDocument();
    });
    expect(screen.getByText(String(MIN_TERMINAL_FONT_SIZE))).toBeInTheDocument();
    expect(screen.getByText("JetBrains Mono")).toBeInTheDocument();
    expect(screen.getByText(THEMES["GitHub Dark"].background)).toBeInTheDocument();
  });

  it("선택된 테마/폰트/크기를 메타로 요약한다", () => {
    expect(
      getTerminalThemeMeta({
        themeName: "Nord",
        fontSize: 15,
        fontFamily: "Menlo",
      }),
    ).toEqual({
      title: "터미널 테마 · Nord",
      badges: ["테마 Nord", "폰트 Menlo", "크기 15px"],
      helper: "현재 터미널 팔레트와 폰트 설정이 적용된 상태입니다. 바꾸면 즉시 프리뷰와 저장 흐름에 반영됩니다.",
    });
  });

  it("saveAppearance도 저장 전에 값을 정규화한다", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_app_config") {
        return Promise.resolve({
          theme: "Nord",
          font_size: DEFAULT_TERMINAL_FONT_SIZE,
          font_family: "Menlo",
        });
      }
      return Promise.resolve(undefined);
    });

    render(<Consumer />);

    await waitFor(() => {
      expect(screen.getByText("Nord")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save-invalid" }));
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_terminal_appearance", {
        theme: "GitHub Dark",
        fontSize: MAX_TERMINAL_FONT_SIZE,
        fontFamily: "JetBrains Mono",
        opacity: null,
      });
    });
    expect(screen.getByText("GitHub Dark")).toBeInTheDocument();
    expect(screen.getByText(String(MAX_TERMINAL_FONT_SIZE))).toBeInTheDocument();
    expect(screen.getByText("JetBrains Mono")).toBeInTheDocument();
  });
});
