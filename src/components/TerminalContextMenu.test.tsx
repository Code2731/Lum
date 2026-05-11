import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TerminalContextMenu from "./TerminalContextMenu";

describe("TerminalContextMenu", () => {
  const baseProps = {
    x: 120,
    y: 120,
    text: "npm install",
    onClose: vi.fn(),
    onCopy: vi.fn(),
    onRun: vi.fn(),
    onExplain: vi.fn(),
    onWebSearch: vi.fn(),
    onOpen: vi.fn(),
  };

  it("Escape 키로 메뉴가 닫힌다", () => {
    const onClose = vi.fn();
    render(
      <TerminalContextMenu
        {...baseProps}
        onClose={onClose}
        isPathOrUrl={false}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("바깥 클릭으로 메뉴가 닫힌다", () => {
    const onClose = vi.fn();
    render(
      <TerminalContextMenu
        {...baseProps}
        onClose={onClose}
        isPathOrUrl={false}
      />,
    );

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("방향키로 항목을 이동하고 Enter로 실행한다", () => {
    const onRun = vi.fn();
    const onCopy = vi.fn();
    render(
      <TerminalContextMenu
        {...baseProps}
        isPathOrUrl={false}
        onRun={onRun}
        onCopy={onCopy}
        onClose={vi.fn()}
      />,
    );

    const menu = screen.getByRole("menu", { name: "터미널 컨텍스트 메뉴" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it("path URL일 때 열기 항목이 존재한다", () => {
    render(
      <TerminalContextMenu
        {...baseProps}
        isPathOrUrl
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("menuitem", { name: "열기" })).toBeInTheDocument();
  });

  it("메뉴가 열리면 첫 항목에 포커스되고 닫힘 시 이전 포커스로 복귀한다", () => {
    const onClose = vi.fn();
    const App = () => {
      const [open, setOpen] = React.useState(true);
      return (
        <div>
          <button type="button" autoFocus>
            원본
          </button>
          {open && (
            <TerminalContextMenu
              {...baseProps}
              isPathOrUrl={false}
              onClose={() => {
                setOpen(false);
                onClose();
              }}
            />
          )}
        </div>
      );
    };

    render(<App />);
    const firstItem = screen.getByRole("menuitem", { name: "복사" });
    expect(firstItem).toHaveFocus();

    const menu = screen.getByRole("menu", { name: "터미널 컨텍스트 메뉴" });
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "원본" })).toHaveFocus();
  });
});
