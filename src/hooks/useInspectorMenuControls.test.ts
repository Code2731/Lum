import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type FocusEvent, type KeyboardEvent, useState } from "react";
import { useInspectorMenuControls } from "./useInspectorMenuControls";

describe("useInspectorMenuControls", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("compact 메뉴에서 방향 키 이동 시 다음 메뉴 항목에 포커스를 이동한다", () => {
    const menu = document.createElement("div");
    const buttons: HTMLButtonElement[] = [];
    for (let i = 0; i < 3; i += 1) {
      const btn = document.createElement("button");
      btn.setAttribute("role", "menuitem");
      btn.textContent = `item-${i + 1}`;
      buttons.push(btn);
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    buttons[0].focus();

    const moreRef = { current: { 0: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(0);
      const controls = useInspectorMenuControls({
        isInspectorCompact: true,
        inspectorCommandMenuIndex,
        setInspectorCommandMenuIndex,
        inspectorMoreButtonRefs: moreRef,
        inspectorMenuFirstActionRefs: firstActionRefs,
        inspectorQuickActionsAdvancedRef: quickActionsAdvancedRef,
        showInspectorQuickActionsExpanded: false,
        closeInspectorQuickActions: closeQuickActions,
      });
      return { controls, inspectorCommandMenuIndex };
    });

    const e = {
      key: "ArrowRight",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: menu,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorCompactMenuKeyDown(e, 0);
    });

    expect(document.activeElement).toBe(buttons[1]);
    expect(result.current.inspectorCommandMenuIndex).toBe(0);
  });

  it("compact 메뉴 행 blur 시 포커스가 행 내부로 이동하면 메뉴가 닫히지 않는다", () => {
    const menuRow = document.createElement("div");
    const relatedInside = document.createElement("button");
    menuRow.appendChild(relatedInside);

    const moreRef = { current: { 0: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(0);
      const controls = useInspectorMenuControls({
        isInspectorCompact: true,
        inspectorCommandMenuIndex,
        setInspectorCommandMenuIndex,
        inspectorMoreButtonRefs: moreRef,
        inspectorMenuFirstActionRefs: firstActionRefs,
        inspectorQuickActionsAdvancedRef: quickActionsAdvancedRef,
        showInspectorQuickActionsExpanded: false,
        closeInspectorQuickActions: closeQuickActions,
      });
      return { controls, inspectorCommandMenuIndex };
    });

    const e = {
      currentTarget: menuRow,
      relatedTarget: relatedInside,
    } as unknown as FocusEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorSuggestedCommandRowBlurCapture(e, 0);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(0);
  });

  it("compact 메뉴 행 blur 시 메뉴 바깥으로 포커스가 이동하면 메뉴를 닫는다", () => {
    const menuRow = document.createElement("div");
    const relatedOutside = document.createElement("button");

    const moreRef = { current: { 0: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(0);
      const controls = useInspectorMenuControls({
        isInspectorCompact: true,
        inspectorCommandMenuIndex,
        setInspectorCommandMenuIndex,
        inspectorMoreButtonRefs: moreRef,
        inspectorMenuFirstActionRefs: firstActionRefs,
        inspectorQuickActionsAdvancedRef: quickActionsAdvancedRef,
        showInspectorQuickActionsExpanded: false,
        closeInspectorQuickActions: closeQuickActions,
      });
      return { controls, inspectorCommandMenuIndex };
    });

    const e = {
      currentTarget: menuRow,
      relatedTarget: relatedOutside,
    } as unknown as FocusEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorSuggestedCommandRowBlurCapture(e, 0);
    });

    expect(result.current.inspectorCommandMenuIndex).toBeNull();
  });

  it("퀵액션 패널 열림 상태에서 키보드 이동으로 다음 버튼으로 이동한다", () => {
    const actionContainer = document.createElement("div");
    const first = document.createElement("button");
    const second = document.createElement("button");
    actionContainer.appendChild(first);
    actionContainer.appendChild(second);
    document.body.appendChild(actionContainer);
    first.focus();

    const quickActionsAdvancedRef = { current: actionContainer };
    const moreRef = { current: {} as Record<number, HTMLButtonElement | null> };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(null);
      const controls = useInspectorMenuControls({
        isInspectorCompact: true,
        inspectorCommandMenuIndex,
        setInspectorCommandMenuIndex,
        inspectorMoreButtonRefs: moreRef,
        inspectorMenuFirstActionRefs: firstActionRefs,
        inspectorQuickActionsAdvancedRef: quickActionsAdvancedRef,
        showInspectorQuickActionsExpanded: true,
        closeInspectorQuickActions: closeQuickActions,
      });
      return { controls };
    });

    const e = {
      key: "ArrowRight",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: actionContainer,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorQuickActionsAdvancedKeyDown(e);
    });

    expect(document.activeElement).toBe(second);
  });

  it("퀵액션 패널이 닫혀 있으면 키보드 방향키 이동 로직이 실행되지 않는다", () => {
    const actionContainer = document.createElement("div");
    const first = document.createElement("button");
    const second = document.createElement("button");
    actionContainer.appendChild(first);
    actionContainer.appendChild(second);
    document.body.appendChild(actionContainer);
    first.focus();

    const quickActionsAdvancedRef = { current: actionContainer };
    const moreRef = { current: {} as Record<number, HTMLButtonElement | null> };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(null);
      const controls = useInspectorMenuControls({
        isInspectorCompact: true,
        inspectorCommandMenuIndex,
        setInspectorCommandMenuIndex,
        inspectorMoreButtonRefs: moreRef,
        inspectorMenuFirstActionRefs: firstActionRefs,
        inspectorQuickActionsAdvancedRef: quickActionsAdvancedRef,
        showInspectorQuickActionsExpanded: false,
        closeInspectorQuickActions: closeQuickActions,
      });
      return { controls };
    });

    const e = {
      key: "ArrowRight",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: actionContainer,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorQuickActionsAdvancedKeyDown(e);
    });

    expect(document.activeElement).toBe(first);
  });

  it("컴팩트 메뉴가 열려 있으면 바깥 포인터다운 시 메뉴를 닫는다", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const insideRow = document.createElement("div");
    insideRow.setAttribute("data-inspector-command-menu-row", "1");
    document.body.appendChild(insideRow);

    const closeQuickActions = vi.fn();
    const moreRef = { current: { 0: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(0);
      const controls = useInspectorMenuControls({
        isInspectorCompact: true,
        inspectorCommandMenuIndex,
        setInspectorCommandMenuIndex,
        inspectorMoreButtonRefs: moreRef,
        inspectorMenuFirstActionRefs: firstActionRefs,
        inspectorQuickActionsAdvancedRef: quickActionsAdvancedRef,
        showInspectorQuickActionsExpanded: false,
        closeInspectorQuickActions: closeQuickActions,
      });
      return { controls, inspectorCommandMenuIndex };
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(0);

    act(() => {
      insideRow.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(0);

    act(() => {
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(result.current.inspectorCommandMenuIndex).toBeNull();
  });

  it("컴팩트 메뉴가 열려 있을 때 메뉴 컨테이너 내부 포인터다운은 메뉴를 닫지 않는다", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const insideMenu = document.createElement("div");
    insideMenu.setAttribute("data-inspector-command-menu", "compact");
    document.body.appendChild(insideMenu);
    const insideButton = document.createElement("button");
    insideMenu.appendChild(insideButton);

    const closeQuickActions = vi.fn();
    const moreRef = { current: { 0: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(0);
      const controls = useInspectorMenuControls({
        isInspectorCompact: true,
        inspectorCommandMenuIndex,
        setInspectorCommandMenuIndex,
        inspectorMoreButtonRefs: moreRef,
        inspectorMenuFirstActionRefs: firstActionRefs,
        inspectorQuickActionsAdvancedRef: quickActionsAdvancedRef,
        showInspectorQuickActionsExpanded: false,
        closeInspectorQuickActions: closeQuickActions,
      });
      return { controls, inspectorCommandMenuIndex };
    });

    act(() => {
      insideButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(0);
  });

  it("compact 모드가 아니게 되면 열린 메뉴가 닫힌다", () => {
    const moreRef = { current: { 0: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const { result, rerender } = renderHook(
      ({ isInspectorCompact }) => {
        const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(0);
        const controls = useInspectorMenuControls({
          isInspectorCompact,
          inspectorCommandMenuIndex,
          setInspectorCommandMenuIndex,
          inspectorMoreButtonRefs: moreRef,
          inspectorMenuFirstActionRefs: firstActionRefs,
          inspectorQuickActionsAdvancedRef: quickActionsAdvancedRef,
          showInspectorQuickActionsExpanded: false,
          closeInspectorQuickActions: closeQuickActions,
        });
        return { controls, inspectorCommandMenuIndex };
      },
      {
        initialProps: {
          isInspectorCompact: true,
        },
      },
    );

    expect(result.current.inspectorCommandMenuIndex).toBe(0);

    act(() => {
      rerender({ isInspectorCompact: false });
    });

    expect(result.current.inspectorCommandMenuIndex).toBeNull();
    expect(closeQuickActions).not.toHaveBeenCalled();
  });
});
