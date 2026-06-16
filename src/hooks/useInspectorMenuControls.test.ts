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

  it("compact 메뉴 키다운 시 이벤트가 전달된 행과 현재 열린 행이 다르면 열린 행 인덱스를 동기화한다", () => {
    const menu = document.createElement("div");
    const buttons: HTMLButtonElement[] = [];
    for (let i = 0; i < 2; i += 1) {
      const btn = document.createElement("button");
      btn.setAttribute("role", "menuitem");
      btn.textContent = `item-${i + 1}`;
      buttons.push(btn);
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    buttons[0].focus();

    const moreRef = { current: { 0: document.createElement("button"), 1: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(1);
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
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
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

  it("compact 메뉴 행 blur에서 currentTarget이 Element가 아니어도 메뉴 바깥 이동이면 닫힘이 적용된다", () => {
    const menuRowTextNode = document.createTextNode("row");
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
      currentTarget: menuRowTextNode as unknown as HTMLDivElement,
      relatedTarget: relatedOutside,
    } as unknown as FocusEvent<HTMLDivElement>;

    expect(() => {
      act(() => {
        result.current.controls.handleInspectorSuggestedCommandRowBlurCapture(e, 0);
      });
    }).not.toThrow();

    expect(result.current.inspectorCommandMenuIndex).toBeNull();
  });

  it("compact 메뉴가 열려 있지 않으면 row blur에서 메뉴를 닫지 않는다", () => {
    const menuRow = document.createElement("div");
    const relatedOutside = document.createElement("button");

    const moreRef = { current: { 0: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
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

  it("compact 메뉴 열린 행과 blur 이벤트의 행이 다르면 메뉴를 닫지 않는다", () => {
    const menuRow = document.createElement("div");
    const relatedOutside = document.createElement("button");

    const moreRef = { current: { 0: document.createElement("button"), 1: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(1);
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

    expect(result.current.inspectorCommandMenuIndex).toBe(1);
  });

  it("compact 메뉴가 다른 행에 열려 있고 관련 타겟이 없어도 메뉴를 닫지 않는다", () => {
    const menuRow = document.createElement("div");

    const moreRef = { current: { 0: document.createElement("button"), 1: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(1);
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
      relatedTarget: null,
    } as unknown as FocusEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorSuggestedCommandRowBlurCapture(e, 0);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(1);
  });

  it("다른 행에서 blur가 발생해도 메뉴 유지 후 바깥 포인터다운에서만 닫힘", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const menuRow = document.createElement("div");
    menuRow.setAttribute("data-inspector-command-menu-row", "2");
    document.body.appendChild(menuRow);

    const moreRef = { current: { 0: document.createElement("button"), 1: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(1);
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
      relatedTarget: outside,
    } as unknown as FocusEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorSuggestedCommandRowBlurCapture(e, 0);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(1);

    act(() => {
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
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

  it("컴팩트 메뉴가 열려 있는데 다른 행(data-inspector-command-menu-row) 포인터다운은 닫힘을 트리거하지 않는다", () => {
    const otherRow = document.createElement("div");
    otherRow.setAttribute("data-inspector-command-menu-row", "2");
    document.body.appendChild(otherRow);

    const closeQuickActions = vi.fn();
    const moreRef = { current: { 0: document.createElement("button"), 1: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(1);
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
      otherRow.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(1);
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

  it("compact 메뉴에서 Escape를 누르면 열린 메뉴가 닫히고 원래 트리거로 포커스를 되돌린다", () => {
    const menu = document.createElement("div");
    const moreButton = document.createElement("button");
    const spyScroll = vi.spyOn(moreButton, "focus");
    const moreRef = { current: { 0: moreButton } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

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
      key: "Escape",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: menu,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorCompactMenuKeyDown(e, 0);
    });

    expect(result.current.inspectorCommandMenuIndex).toBeNull();
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(spyScroll).toHaveBeenCalledTimes(1);

    requestAnimationFrameSpy.mockRestore();
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("퀵액션 패널에서 Escape를 누르면 닫기 핸들러가 호출된다", () => {
    const actionContainer = document.createElement("div");
    const first = document.createElement("button");
    const second = document.createElement("button");
    actionContainer.appendChild(first);
    actionContainer.appendChild(second);

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
      key: "Escape",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: actionContainer,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorQuickActionsAdvancedKeyDown(e);
    });

    expect(closeQuickActions).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(0);
  });

  it("openInspectorCompactMenu는 전달 인덱스 메뉴를 열고 트리거 버튼을 스크롤한다", () => {
    const targetButton = document.createElement("button");
    const scrollSpy = vi.spyOn(targetButton, "scrollIntoView");
    const moreRef = { current: { 1: targetButton } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
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
      return { controls, inspectorCommandMenuIndex };
    });

    act(() => {
      result.current.controls.openInspectorCompactMenu(1);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });
  });

  it("openInspectorCompactMenu는 존재하지 않는 인덱스를 전달해도 크래시 없이 상태만 갱신된다", () => {
    const moreRef = { current: {} as Record<number, HTMLButtonElement | null> };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
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
      return { controls, inspectorCommandMenuIndex };
    });

    act(() => {
      result.current.controls.openInspectorCompactMenu(999);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(999);
  });

  it("open/close를 분리된 act에서 호출해도 메뉴 인덱스와 ref 동기화가 일치한다", () => {
    const moreButton = document.createElement("button");
    const focusSpy = vi.spyOn(moreButton, "focus");
    const moreRef = { current: { 0: moreButton } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

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
      return { controls, inspectorCommandMenuIndex, openRef: controls.inspectorCommandMenuOpenRef };
    });

    act(() => {
      result.current.controls.openInspectorCompactMenu(0);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(0);
    expect(result.current.openRef.current).toBe(0);

    act(() => {
      result.current.controls.closeInspectorCommandMenu(true);
    });

    expect(result.current.inspectorCommandMenuIndex).toBeNull();
    expect(result.current.openRef.current).toBeNull();
    expect(focusSpy).toHaveBeenCalledTimes(1);

    requestAnimationFrameSpy.mockRestore();
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("메뉴 열기 직후 첫 번째 액션이 있을 때 포커스가 첫 액션으로 이동한다", () => {
    const targetButton = document.createElement("button");
    const firstActionButton = document.createElement("button");
    const focusSpy = vi.spyOn(firstActionButton, "focus");
    const firstActionRefs = {
      current: {
        1: firstActionButton,
      } as Record<number, HTMLButtonElement | null>,
    };
    const scrollSpy = vi.spyOn(targetButton, "scrollIntoView");
    const moreRef = { current: { 1: targetButton } };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

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
      return { controls, inspectorCommandMenuIndex };
    });

    act(() => {
      result.current.controls.openInspectorCompactMenu(1);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });
    expect(focusSpy).toHaveBeenCalledTimes(1);

    requestAnimationFrameSpy.mockRestore();
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("메뉴 열기 시 첫 액션 참조가 없으면 자동 포커스 이동이 발생하지 않는다", () => {
    const targetButton = document.createElement("button");
    const firstActionButton = document.createElement("button");
    const focusSpy = vi.spyOn(firstActionButton, "focus");
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const scrollSpy = vi.spyOn(targetButton, "scrollIntoView");
    const moreRef = { current: { 1: targetButton } };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

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
      return { controls, inspectorCommandMenuIndex };
    });

    act(() => {
      result.current.controls.openInspectorCompactMenu(1);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });
    expect(focusSpy).not.toHaveBeenCalled();

    requestAnimationFrameSpy.mockRestore();
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("포인터다운 타겟이 document일 때도 메뉴가 닫힌다", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);

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
      document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(result.current.inspectorCommandMenuIndex).toBeNull();
    expect(outside).toBeDefined();
  });

  it("퀵액션에서 Tab 키는 방향키 처리에서 제외되어 이동이 발생하지 않는다", () => {
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
      key: "Tab",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: actionContainer,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorQuickActionsAdvancedKeyDown(e);
    });

    expect(document.activeElement).toBe(first);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("compact 메뉴에서 비-네비게이션 키 입력은 메뉴 상태를 변경하지 않는다", () => {
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
      key: "Enter",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: menu,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorCompactMenuKeyDown(e, 0);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(0);
    expect(e.preventDefault).toHaveBeenCalledTimes(0);
  });

  it("compact 모드가 아니면 메뉴 row blur 핸들러가 더 이상 메뉴 닫힘을 수행하지 않는다", () => {
    const menuRow = document.createElement("div");
    const relatedOutside = document.createElement("button");

    const moreRef = { current: { 0: document.createElement("button") } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const { result } = renderHook(() => {
      const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(0);
      const controls = useInspectorMenuControls({
        isInspectorCompact: false,
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

    expect(result.current.inspectorCommandMenuIndex).toBe(0);
  });

  it("closeInspectorCommandMenu는 restoreFocus=false일 때 트리거 포커스를 복원하지 않는다", () => {
    const moreButton = document.createElement("button");
    const moreRef = { current: { 0: moreButton } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();
    const focusSpy = vi.spyOn(moreButton, "focus");

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

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
      result.current.controls.closeInspectorCommandMenu(false);
    });

    expect(result.current.inspectorCommandMenuIndex).toBeNull();
    expect(focusSpy).not.toHaveBeenCalled();

    requestAnimationFrameSpy.mockRestore();
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("compact 메뉴 키다운 핸들러는 currentTarget이 비정상이어도 안전하게 종료한다", () => {
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
      currentTarget: null,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    expect(() => {
      act(() => {
        result.current.controls.handleInspectorCompactMenuKeyDown(e, 0);
      });
    }).not.toThrow();

    expect(result.current.inspectorCommandMenuIndex).toBe(0);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("compact 메뉴 키다운 핸들러는 currentTarget이 Element가 아니면 메뉴 인덱스를 변경하지 않는다", () => {
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
      currentTarget: document.createTextNode("x") as unknown as HTMLDivElement,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorCompactMenuKeyDown(e, 0);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(0);
    expect(e.preventDefault).toHaveBeenCalledTimes(0);
  });

  it("퀵액션 패널 참조가 null이면 핸들러가 안전하게 종료된다", () => {
    const actionRef = { current: null as HTMLDivElement | null };
    const moreRef = { current: { 0: document.createElement("button") } };
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
        inspectorQuickActionsAdvancedRef: actionRef,
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
      currentTarget: document.createElement("div"),
    } as unknown as KeyboardEvent<HTMLDivElement>;

    expect(() => {
      act(() => {
        result.current.controls.handleInspectorQuickActionsAdvancedKeyDown(e);
      });
    }).not.toThrow();
  });

  it("퀵액션 패널에 버튼이 없으면 인덱스 이동은 발생하지 않는다", () => {
    const actionContainer = document.createElement("div");
    const quickActionsAdvancedRef = { current: actionContainer };
    const moreRef = { current: { 0: document.createElement("button") } };
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
      key: "ArrowLeft",
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: actionContainer,
    } as unknown as KeyboardEvent<HTMLDivElement>;

    act(() => {
      result.current.controls.handleInspectorQuickActionsAdvancedKeyDown(e);
    });

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it("compact 메뉴를 연달아 열면 마지막 호출 인덱스가 유지된다", () => {
    const button0 = document.createElement("button");
    const button1 = document.createElement("button");
    const scrollSpy0 = vi.spyOn(button0, "scrollIntoView");
    const scrollSpy1 = vi.spyOn(button1, "scrollIntoView");
    const moreRef = { current: { 0: button0, 1: button1 } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
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
      return { controls, inspectorCommandMenuIndex };
    });

    act(() => {
      result.current.controls.openInspectorCompactMenu(0);
      result.current.controls.openInspectorCompactMenu(1);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(1);
    expect(scrollSpy0).toHaveBeenCalledTimes(1);
    expect(scrollSpy1).toHaveBeenCalledTimes(1);
  });

  it("메뉴를 닫고 바로 다시 열어도 최종 상태가 일관된다", () => {
    const button0 = document.createElement("button");
    const button1 = document.createElement("button");
    const focusSpy0 = vi.spyOn(button0, "focus");
    const scrollSpy1 = vi.spyOn(button1, "scrollIntoView");
    const moreRef = { current: { 0: button0, 1: button1 } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

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
      return { controls, inspectorCommandMenuIndex };
    });

    act(() => {
      result.current.controls.openInspectorCompactMenu(0);
      result.current.controls.closeInspectorCommandMenu(true);
      result.current.controls.openInspectorCompactMenu(1);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(1);
    expect(focusSpy0).toHaveBeenCalledTimes(1);
    expect(scrollSpy1).toHaveBeenCalledTimes(1);

    requestAnimationFrameSpy.mockRestore();
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("메뉴 열기 후 inspectorCommandMenuOpenRef가 열림 인덱스로 동기화된다", () => {
    const button = document.createElement("button");
    const moreRef = { current: { 2: button } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
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
      return { controls, inspectorCommandMenuIndex, menuOpenRef: controls.inspectorCommandMenuOpenRef };
    });

    act(() => {
      result.current.controls.openInspectorCompactMenu(2);
    });

    expect(result.current.inspectorCommandMenuIndex).toBe(2);
    expect(result.current.menuOpenRef.current).toBe(2);
  });

  it("메뉴 닫기 후 inspectorCommandMenuOpenRef가 null로 동기화된다", () => {
    const button = document.createElement("button");
    const buttonFocusSpy = vi.spyOn(button, "focus");
    const moreRef = { current: { 0: button } };
    const firstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
    const quickActionsAdvancedRef = { current: null as HTMLDivElement | null };
    const closeQuickActions = vi.fn();

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });

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
      return { controls, inspectorCommandMenuIndex, menuOpenRef: controls.inspectorCommandMenuOpenRef };
    });

    act(() => {
      result.current.controls.closeInspectorCommandMenu(true);
    });

    expect(result.current.inspectorCommandMenuIndex).toBeNull();
    expect(result.current.menuOpenRef.current).toBeNull();
    expect(buttonFocusSpy).toHaveBeenCalledTimes(1);

    requestAnimationFrameSpy.mockRestore();
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });
});
