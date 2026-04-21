import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  }),
}));

vi.mock("./components/TerminalPane", () => ({
  default: ({ id }: { id: string }) => (
    <div data-testid={`terminal-pane-${id}`}>terminal:{id}</div>
  ),
}));

vi.mock("./components/layout/InfiniteCanvas", () => ({
  default: ({ blocks }: { blocks: { id: string; command: string }[] }) => (
    <div data-testid="infinite-canvas">
      {blocks.map((b) => (
        <div key={b.id} data-testid="canvas-block">{b.command}</div>
      ))}
    </div>
  ),
}));

describe("App (LUM 터미널)", () => {
  it("헤더에 'LUM' 브랜드가 렌더링되어야 함", () => {
    render(<App />);
    expect(screen.getByText("LUM")).toBeInTheDocument();
  });

  it("기본 뷰가 터미널이어야 함 — TerminalPane이 최소 1개 렌더링됨", () => {
    render(<App />);
    const panes = screen.getAllByTestId(/^terminal-pane-/);
    expect(panes.length).toBeGreaterThan(0);
  });

  it("리스트 뷰 버튼 클릭 시 InfiniteCanvas가 숨겨짐", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("리스트"));
    await waitFor(() => {
      expect(screen.queryByTestId("infinite-canvas")).not.toBeInTheDocument();
    });
  });

  it("캔버스 뷰 버튼 클릭 시 InfiniteCanvas가 렌더링됨", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("캔버스"));
    await waitFor(() => {
      expect(screen.getByTestId("infinite-canvas")).toBeInTheDocument();
    });
  });

  it("캔버스 → 터미널 전환 시 TerminalPane이 다시 표시됨", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("캔버스"));
    fireEvent.click(screen.getByLabelText("터미널"));
    await waitFor(() => {
      expect(screen.getAllByTestId(/^terminal-pane-/).length).toBeGreaterThan(0);
    });
  });

  it("뷰 전환 버튼이 3개 렌더링됨 (터미널/리스트/캔버스)", () => {
    render(<App />);
    expect(screen.getByLabelText("터미널")).toBeInTheDocument();
    expect(screen.getByLabelText("리스트")).toBeInTheDocument();
    expect(screen.getByLabelText("캔버스")).toBeInTheDocument();
  });
});
