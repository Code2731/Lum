import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import QuickActionsBar, { getQuickActionsBarFlowSummary } from "./QuickActionsBar";

describe("QuickActionsBar", () => {
  it("빈 상태 흐름 요약을 계산한다", () => {
    expect(getQuickActionsBarFlowSummary([])).toEqual({
      badges: ["현재 비어 있음", "다음 액션 추가", "마지막 즉시 실행 준비"],
      helper: "빠른 액션이 아직 비어 있습니다. 편집 버튼에서 명령을 추가하고 단축키까지 연결해 두면 다음부터는 한 번에 실행할 수 있습니다.",
    });
  });

  it("단축키 연결 수를 포함한 흐름 요약을 계산한다", () => {
    expect(
      getQuickActionsBarFlowSummary([
        { id: "a1", label: "빌드", command: "npm run build", shortcut: 1 },
        { id: "a2", label: "테스트", command: "npm test" },
      ]),
    ).toEqual({
      badges: ["현재 액션 2개", "단축키 1개 연결", "마지막 편집에서 정리"],
      helper: "등록된 빠른 액션을 바로 실행할 수 있습니다. 필요하면 편집에서 순서와 단축키를 함께 다듬어 흐름을 유지합니다.",
    });
  });

  it("빈 상태에서 빠른 액션 시작 흐름 안내를 보여준다", () => {
    render(
      <QuickActionsBar
        actions={[]}
        onExecute={vi.fn()}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
      />,
    );

    expect(screen.getByText("등록 0개")).toBeInTheDocument();
    expect(screen.getByText("현재 비어 있음")).toBeInTheDocument();
    expect(screen.getByText("다음 액션 추가")).toBeInTheDocument();
    expect(screen.getByText("마지막 즉시 실행 준비")).toBeInTheDocument();
    expect(
      screen.getByText("빠른 액션이 아직 비어 있습니다. 편집 버튼에서 명령을 추가하고 단축키까지 연결해 두면 다음부터는 한 번에 실행할 수 있습니다."),
    ).toBeInTheDocument();
  });

  it("Quick Action 단축키를 Cmd/Ctrl 형식으로 표시한다", () => {
    render(
      <QuickActionsBar
        actions={[
          { id: "a1", label: "빌드", command: "npm run build", shortcut: 1 },
        ]}
        onExecute={vi.fn()}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
      />,
    );

    expect(screen.getByText("등록 1개")).toBeInTheDocument();
    expect(screen.getByText("Cmd/Ctrl+1")).toBeInTheDocument();
    expect(screen.getByText("현재 액션 1개")).toBeInTheDocument();
    expect(screen.getByText("단축키 1개 연결")).toBeInTheDocument();
    expect(screen.getByText("마지막 편집에서 정리")).toBeInTheDocument();
  });

  it("액션 버튼 클릭 시 command를 실행한다", () => {
    const onExecute = vi.fn();

    render(
      <QuickActionsBar
        actions={[
          { id: "a1", label: "테스트", command: "npm test", shortcut: 2 },
        ]}
        onExecute={onExecute}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /테스트/ }));
    expect(onExecute).toHaveBeenCalledWith("npm test");
  });
});
