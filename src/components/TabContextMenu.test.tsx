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

    fireEvent.click(screen.getByRole("menuitem", { name: "탭 색상 red" }));
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
});
