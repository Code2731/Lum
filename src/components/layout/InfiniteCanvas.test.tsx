import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InfiniteCanvas, {
  getInfiniteCanvasEmptyFlowSummary,
  getInfiniteCanvasGuideFlowSummary,
} from "./InfiniteCanvas";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    children,
    nodes,
    onNodeDragStop,
  }: {
    children: React.ReactNode;
    nodes: Array<{ id: string; position: { x: number; y: number } }>;
    onNodeDragStop?: (_event: unknown, node: { id: string; position: { x: number; y: number } }) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => nodes[0] && onNodeDragStop?.(null, { id: nodes[0].id, position: { x: 120, y: 48 } })}
      >
        drag-stop
      </button>
      {children}
    </div>
  ),
  Background: () => <div>background</div>,
  Controls: () => <div>controls</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MarkerType: { ArrowClosed: "arrow" },
}));

describe("InfiniteCanvas", () => {
  it("캔버스 흐름 요약을 계산한다", () => {
    expect(getInfiniteCanvasEmptyFlowSummary()).toEqual({
      badges: ["먼저 블록 생성", "다음 위치 정리", "마지막 연결 추적"],
      helper: "터미널 블록이 생기면 먼저 캔버스에 배치하고, 위치를 정리한 뒤 링크 흐름을 따라 작업 맥락을 확인합니다.",
    });

    expect(getInfiniteCanvasGuideFlowSummary(2, 3)).toEqual({
      badges: ["블록 2개", "연결 3개", "드래그·줌 탐색"],
      helper: "드래그로 블록을 재배치하고, 휠로 줌을 조정한 뒤 연결선을 따라 명령 흐름과 AI 응답 맥락을 빠르게 확인합니다.",
    });
  });

  it("빈 상태에서 시작 가이드와 흐름 안내를 보여준다", () => {
    render(<InfiniteCanvas blocks={[]} onNodeMove={vi.fn()} />);

    expect(screen.getByText("스페이셜 워크스페이스를 시작할 준비가 됐습니다")).toBeInTheDocument();
    expect(screen.getByText("먼저 블록 생성")).toBeInTheDocument();
    expect(screen.getByText("다음 위치 정리")).toBeInTheDocument();
    expect(screen.getByText("마지막 연결 추적")).toBeInTheDocument();
    expect(screen.getByText("드래그·줌 탐색")).toBeInTheDocument();
    expect(screen.getByText("블록 0개 · 연결 0개")).toBeInTheDocument();
    expect(screen.getByText("캔버스 조작 가이드")).toBeInTheDocument();
  });

  it("블록 수/연결 수를 표시하고 드래그 종료를 전달한다", () => {
    const onNodeMove = vi.fn();
    render(
      <InfiniteCanvas
        onNodeMove={onNodeMove}
        blocks={[
          {
            id: "block-1",
            command: "npm test",
            output: "line1",
            position: { x: 0, y: 0 },
            status: "done",
            type: "command",
            links: ["block-2", "block-3"],
          },
        ] as any}
      />,
    );

    expect(screen.getByText("블록 1개 · 연결 2개")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "drag-stop" }));
    expect(onNodeMove).toHaveBeenCalledWith("block-1", 120, 48);
  });
});
