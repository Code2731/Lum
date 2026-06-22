import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInspectorPanelController } from "./useInspectorPanelController";

type InspectorTab = "summary" | "rag" | "scripts" | "sysmon";

function setupHook() {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const requestAnimationFrameSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      callback(0);
      return 0;
    });

  const inspectorTabRefs = {
    current: {
      summary: document.createElement("button"),
      rag: document.createElement("button"),
      scripts: document.createElement("button"),
      sysmon: document.createElement("button"),
    } as Record<InspectorTab, HTMLButtonElement | null>,
  };
  const inspectorMoreButtonRefs = { current: {} as Record<number, HTMLButtonElement | null> };
  const inspectorMenuFirstActionRefs = { current: {} as Record<number, HTMLButtonElement | null> };
  const inspectorQuickActionsAdvancedRef = { current: null as HTMLDivElement | null };
  const inspectorQuickActionsToggleRef = { current: null as HTMLButtonElement | null };
  const inspectorToggleButtonRef = { current: null as HTMLButtonElement | null };

  const result = renderHook(() => {
    const [showInspector, setShowInspector] = useState(true);
    const [showRagPanel, setShowRagPanel] = useState(false);
    const [showScriptPanel, setShowScriptPanel] = useState(false);
    const [showSysmon, setShowSysmon] = useState(false);
    const [inspectorTab, setInspectorTab] = useState<InspectorTab>("summary");
    const [inspectorCommandMenuIndex, setInspectorCommandMenuIndex] = useState<number | null>(null);
    const [showInspectorQuickActionsExpanded, setShowInspectorQuickActionsExpanded] = useState(false);

    const controller = useInspectorPanelController({
      inspectorTab,
      setInspectorTab,
      inspectorDensity: "cozy",
      inspectorCommandMenuIndex,
      setInspectorCommandMenuIndex,
      inspectorTabRefs,
      inspectorMoreButtonRefs,
      inspectorMenuFirstActionRefs,
      inspectorQuickActionsAdvancedRef,
      inspectorQuickActionsToggleRef,
      inspectorToggleButtonRef,
      setShowInspector,
      setShowRagPanel,
      setShowScriptPanel,
      setShowSysmon,
      showInspectorQuickActionsExpanded,
      setShowInspectorQuickActionsExpanded,
      showInspector,
    });

    return {
      controller,
      showRagPanel,
      showScriptPanel,
      showSysmon,
      inspectorTab,
      inspectorTabRefs,
    };
  });

  return { ...result, inspectorTabRefs, requestAnimationFrameSpy, restoreRaf: () => {
    requestAnimationFrameSpy.mockRestore();
    window.requestAnimationFrame = originalRequestAnimationFrame;
  } };
}

describe("useInspectorPanelController", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Alt+숫자 단축키로 Inspector 탭이 전환된다", () => {
    const { result, inspectorTabRefs, restoreRaf } = setupHook();
    const focusSpy = vi.spyOn(result.current.inspectorTabRefs.current.rag!, "focus");
    const preventDefault = vi.fn();

    const e = {
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "2",
      target: document.body,
      preventDefault,
    } as globalThis.KeyboardEvent;

    act(() => {
      const handled = result.current.controller.handleInspectorTabShortcut(e);
      expect(handled).toBe(true);
    });

    expect(result.current.showRagPanel).toBe(true);
    expect(result.current.showScriptPanel).toBe(false);
    expect(result.current.showSysmon).toBe(false);
    expect(result.current.inspectorTab).toBe("rag");

    restoreRaf();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(2);
    expect(inspectorTabRefs.current.rag).toBe(result.current.inspectorTabRefs.current.rag);
  });

  it("텍스트 입력 요소에서 Alt+숫자 키는 무시된다", () => {
    const { result, restoreRaf } = setupHook();

    const preventDefault = vi.fn();
    const input = document.createElement("input");
    const e = {
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "2",
      target: input,
      preventDefault,
    } as globalThis.KeyboardEvent;

    act(() => {
      const handled = result.current.controller.handleInspectorTabShortcut(e);
      expect(handled).toBe(false);
      expect(result.current.inspectorTab).toBe("summary");
    });

    restoreRaf();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("지원하지 않는 키는 핸들하지 않는다", () => {
    const { result, restoreRaf } = setupHook();
    const preventDefault = vi.fn();
    const e = {
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "8",
      target: document.body,
      preventDefault,
    } as globalThis.KeyboardEvent;

    act(() => {
      const handled = result.current.controller.handleInspectorTabShortcut(e);
      expect(handled).toBe(false);
      expect(result.current.inspectorTab).toBe("summary");
    });
    restoreRaf();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
