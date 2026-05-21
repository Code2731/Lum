import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import QuickActionsBar from "./QuickActionsBar";

describe("QuickActionsBar", () => {
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

    expect(screen.getByText("Cmd/Ctrl+1")).toBeInTheDocument();
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
