import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { isPointerOutsideTargets } from "../utils/pointerGuard";
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

  it("바깥 클릭 판정은 ref가 null이어도 안전하게 동작한다", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    expect(isPointerOutsideTargets(target, [null])).toBe(true);
    expect(isPointerOutsideTargets(null, [null])).toBe(false);
  });

  it("바깥 클릭 판정은 메뉴 내부/외부를 구분한다", () => {
    const menu = document.createElement("div");
    const child = document.createElement("button");
    const outside = document.createElement("div");
    menu.appendChild(child);
    document.body.appendChild(menu);
    document.body.appendChild(outside);

    expect(isPointerOutsideTargets(child, [menu])).toBe(false);
    expect(isPointerOutsideTargets(outside, [menu])).toBe(true);
  });

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

  it("Escape 키는 상위 keydown으로 전파되지 않는다", () => {
    const onClose = vi.fn();
    const parentKeyDown = vi.fn();
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") parentKeyDown();
    };

    document.addEventListener("keydown", onWindowKeyDown);
    try {
      render(
        <TerminalContextMenu
          {...baseProps}
          onClose={onClose}
          isPathOrUrl={false}
        />,
      );

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(parentKeyDown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", onWindowKeyDown);
    }
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

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("메뉴 내부 포인터 다운은 바깥 클릭으로 처리되지 않는다", () => {
    const onClose = vi.fn();
    render(
      <TerminalContextMenu
        {...baseProps}
        onClose={onClose}
        isPathOrUrl={false}
      />,
    );

    const menu = document.querySelector('[role="menu"]');
    if (!menu) throw new Error("컨텍스트 메뉴를 찾지 못했습니다.");
    fireEvent.pointerDown(menu);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).toBeInTheDocument();
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

    const menu = document.querySelector('[role="menu"]');
    if (!menu) throw new Error("컨텍스트 메뉴를 찾지 못했습니다.");

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

    expect(screen.getByLabelText("열기")).toBeInTheDocument();
  });

  it("복사 항목은 Cmd/Ctrl+C 단축키 힌트를 표시한다", () => {
    render(
      <TerminalContextMenu
        {...baseProps}
        isPathOrUrl={false}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Cmd/Ctrl+C")).toBeInTheDocument();
  });

  it("Home/End 키로 메뉴 항목 포커스를 끝/처음으로 이동한다", () => {
    render(
      <TerminalContextMenu
        {...baseProps}
        isPathOrUrl={false}
        onClose={vi.fn()}
      />,
    );

    const menu = document.querySelector('[role="menu"]');
    if (!menu) throw new Error("컨텍스트 메뉴를 찾지 못했습니다.");

    const items = document.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBeGreaterThan(0);

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Home" });
    expect(items[0]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "End" });
    expect(items[items.length - 1]).toHaveFocus();
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
    const firstItem = screen.getByLabelText("복사");
    expect(firstItem).toHaveFocus();

    const menu = document.querySelector('[role="menu"]');
    if (!menu) throw new Error("컨텍스트 메뉴를 찾지 못했습니다.");

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "원본" })).toHaveFocus();
  });
});
