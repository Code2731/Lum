import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === "check_onboarding_complete") return Promise.resolve(true);
    if (cmd === "check_xllm_status") return Promise.resolve(false);
    if (cmd === "load_session") return Promise.reject("no session");
    if (cmd === "get_hardware_specs") return Promise.resolve({
      total_memory_gb: 16,
      available_memory_gb: 8,
      cpu_cores: 8,
      gpu_type: "discrete",
      gpu_name: "RTX 3080",
      wgpu_supported: true,
      recommended_engine: "xllm",
      recommended_model: "Qwen2.5-Coder-7B",
      recommendation_reason: "충분한 VRAM",
    });
    return Promise.resolve("{}");
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    startDragging: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(() => {}),
  }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./components/TerminalPane", () => ({
  default: ({ id }: { id: string }) => (
    <div data-testid={`terminal-pane-${id}`}>terminal:{id}</div>
  ),
}));

describe("App (LUM 터미널)", () => {
  it("Phase 66 이후 헤더에 LUM 텍스트 로고 제거됨 — 아이콘만 사용", () => {
    render(<App />);
    // headline에 "LUM" 텍스트가 있어선 안 됨 (툴팁·aria-label은 허용)
    const matches = screen.queryAllByText("LUM");
    expect(matches.length).toBe(0);
  });

  it("기본 뷰가 터미널이어야 함 — TerminalPane이 최소 1개 렌더링됨", () => {
    render(<App />);
    const panes = screen.getAllByTestId(/^terminal-pane-/);
    expect(panes.length).toBeGreaterThan(0);
  });

  it("새 탭 버튼이 툴바에 있어야 함", () => {
    render(<App />);
    expect(screen.getByLabelText("새 탭 (Cmd+T)")).toBeInTheDocument();
  });

  it("SSH 연결 버튼이 툴바에 있어야 함", () => {
    render(<App />);
    expect(screen.getByLabelText("SSH 연결 (Cmd+Shift+H)")).toBeInTheDocument();
  });

  it("AI Chat 버튼은 제거됨 — AI는 WarpInputBar로 통합", () => {
    render(<App />);
    expect(screen.queryByLabelText("AI Chat (Cmd+Shift+A)")).toBeNull();
  });

  it("알림 센터 버튼이 툴바에 있어야 함", () => {
    render(<App />);
    expect(screen.getByLabelText("알림 센터")).toBeInTheDocument();
  });

  it("스크립트 라이브러리 버튼이 툴바에 있어야 함", () => {
    render(<App />);
    // 툴바 그룹화 이후: aria-label은 기능 이름만, 단축키는 Tooltip kbd로 분리
    expect(screen.getByLabelText("스크립트 라이브러리")).toBeInTheDocument();
  });
});
