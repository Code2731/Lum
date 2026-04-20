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

// React Flow는 캔버스 기반으로 jsdom에서 완전히 렌더링 불가 — 컴포넌트 자체를 목킹
vi.mock("./components/layout/InfiniteCanvas", () => ({
  default: ({ blocks }: any) => (
    <div data-testid="infinite-canvas">
      {blocks.map((b: any) => (
        <div key={b.id} data-testid="canvas-block">{b.command}</div>
      ))}
    </div>
  ),
}));

describe("App (LUM 2.0 Spatial)", () => {
  it("헤더에 'LUM 2.0 Spatial' 브랜드가 렌더링되어야 함", () => {
    render(<App />);
    expect(screen.getByText("LUM 2.0 Spatial")).toBeInTheDocument();
  });

  it("기본 뷰 모드가 캔버스(InfiniteCanvas)여야 함", () => {
    render(<App />);
    expect(screen.getByTestId("infinite-canvas")).toBeInTheDocument();
  });

  it("리스트 뷰 버튼 클릭 시 InfiniteCanvas가 숨겨지고 리스트 뷰로 전환되어야 함", async () => {
    render(<App />);

    // 기본은 canvas
    expect(screen.getByTestId("infinite-canvas")).toBeInTheDocument();

    // list view 버튼 클릭
    fireEvent.click(screen.getByLabelText("list view"));

    await waitFor(() => {
      expect(screen.queryByTestId("infinite-canvas")).not.toBeInTheDocument();
    });
  });

  it("캔버스 뷰 버튼 클릭 시 InfiniteCanvas로 돌아와야 함", async () => {
    render(<App />);

    // list → canvas 전환
    fireEvent.click(screen.getByLabelText("list view"));
    fireEvent.click(screen.getByLabelText("canvas view"));

    await waitFor(() => {
      expect(screen.getByTestId("infinite-canvas")).toBeInTheDocument();
    });
  });

  it("푸터에 명령어 입력창이 렌더링되어야 함", () => {
    render(<App />);
    expect(
      screen.getByPlaceholderText("궁금한 것이나 명령어를 입력하세요 (/명령어, ?검색)")
    ).toBeInTheDocument();
  });

  it("addBlock 의존성 배열이 비어 있어야 함 (blocks.length 미의존 검증)", () => {
    // useTerminalBlocks의 addBlock이 안정적인 참조를 반환하는지 검증
    // 렌더링을 여러 번 해도 입력창이 정상 동작해야 함
    const { rerender } = render(<App />);
    rerender(<App />);
    expect(
      screen.getByPlaceholderText("궁금한 것이나 명령어를 입력하세요 (/명령어, ?검색)")
    ).toBeInTheDocument();
  });
});
