import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TabContextMenu from "./TabContextMenu";

describe("TabContextMenu", () => {
  const baseProps = {
    tabId: "tab-1",
    x: 120,
    y: 120,
    onSetColor: vi.fn(),
    onSetGroup: vi.fn(),
    onClose: vi.fn(),
  };

  it("Escape 키로 메뉴가 닫힌다", () => {
    const onClose = vi.fn();
    render(
      <TabContextMenu
        {...baseProps}
        onClose={onClose}
        onSetColor={vi.fn()}
        onSetGroup={vi.fn()}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("바깥 영역 클릭으로 메뉴가 닫힌다", () => {
    const onClose = vi.fn();
    render(
      <TabContextMenu
        {...baseProps}
        onClose={onClose}
        onSetColor={vi.fn()}
        onSetGroup={vi.fn()}
      />,
    );

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("색상 버튼에서 탭 색상을 변경한다", () => {
    const onSetColor = vi.fn();
    render(
      <TabContextMenu
        {...baseProps}
        onClose={vi.fn()}
        onSetColor={onSetColor}
        onSetGroup={vi.fn()}
        currentColor="blue"
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "탭 색상 red" }));
    expect(onSetColor).toHaveBeenCalledWith("tab-1", "red");
  });

  it("초기화 버튼이 보일 때 접근성 라벨이 있다", () => {
    const onSetColor = vi.fn();
    render(
      <TabContextMenu
        {...baseProps}
        onClose={vi.fn()}
        onSetColor={onSetColor}
        onSetGroup={vi.fn()}
        currentColor="blue"
        currentGroup="frontend"
      />,
    );

    expect(screen.getByLabelText("탭 색상 초기화")).toBeInTheDocument();
    expect(screen.getByLabelText("탭 그룹 초기화")).toBeInTheDocument();
  });

  it("방향키로 색상을 변경하고 Enter로 적용한다", () => {
    const onSetColor = vi.fn();
    const onClose = vi.fn();

    render(
      <TabContextMenu
        {...baseProps}
        onClose={onClose}
        onSetColor={onSetColor}
        onSetGroup={vi.fn()}
      />,
    );

    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onSetColor).toHaveBeenCalledWith("tab-1", "green");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("화면 경계 근처에서 메뉴 위치를 보정한다", () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 220,
      height: 280,
      top: 0,
      left: 0,
      right: 220,
      bottom: 280,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const initialInnerWidth = window.innerWidth;
    const initialInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { value: 240, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 320, configurable: true });

    const { getByRole } = render(
      <TabContextMenu
        {...baseProps}
        x={230}
        y={300}
        onClose={vi.fn()}
        onSetColor={vi.fn()}
        onSetGroup={vi.fn()}
      />,
    );

    const menu = getByRole("menu");
    expect(menu).toHaveStyle({ left: "10px", top: "30px" });
    rectSpy.mockRestore();
    Object.defineProperty(window, "innerWidth", { value: initialInnerWidth, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: initialInnerHeight, configurable: true });
  });
});
