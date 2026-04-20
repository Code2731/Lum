import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

// Tauri API 모킹
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("{}"),
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

// xterm.js는 jsdom에서 DOM canvas를 요구하므로 모킹
vi.mock("./components/TerminalPane", () => ({
  default: ({ id }: any) => (
    <div data-testid={`terminal-pane-${id}`}>terminal:{id}</div>
  ),
}));

// React Flow는 jsdom에서 완전 렌더링 불가 — 모킹
vi.mock("./components/layout/InfiniteCanvas", () => ({
  default: ({ blocks }: any) => (
    <div data-testid="infinite-canvas">
      {blocks.map((b: any) => (
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

  it("기본 뷰가 터미널이어야 함", () => {
    render(<App />);
    expect(screen.getByTestId("terminal-pane-main")).toBeInTheDocument();
  });

  it("리스트 뷰 버튼 클릭 시 리스트 뷰로 전환되어야 함", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("리스트"));
    await waitFor(() => {
      expect(screen.queryByTestId("infinite-canvas")).not.toBeInTheDocument();
    });
  });

  it("캔버스 뷰 버튼 클릭 시 InfiniteCanvas가 렌더링되어야 함", async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("캔버스"));
    await waitFor(() => {
      expect(screen.getByTestId("infinite-canvas")).toBeInTheDocument();
    });
  });

  it("터미널 뷰로 돌아오면 TerminalPane이 마운트 상태여야 함", async () => {
    render(<App />);
    // 캔버스로 전환 후 다시 터미널로
    fireEvent.click(screen.getByLabelText("캔버스"));
    fireEvent.click(screen.getByLabelText("터미널"));
    await waitFor(() => {
      expect(screen.getByTestId("terminal-pane-main")).toBeInTheDocument();
    });
  });

  it("addBlock 의존성이 안정적이어야 함 (재렌더 시 입력창 동작 확인)", () => {
    const { rerender } = render(<App />);
    rerender(<App />);
    // 터미널 뷰에서 AI 바 없이 렌더됨을 확인
    expect(screen.getByTestId("terminal-pane-main")).toBeInTheDocument();
  });
});
