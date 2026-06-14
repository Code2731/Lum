import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { getRovingMenuNextIndex } from "../utils/menuRoving";
import { isEventTargetWithinSelector } from "../utils/pointerGuard";
import { isTextInputTarget } from "../utils/event";
import { useInspectorMenuControls } from "./useInspectorMenuControls";
import type { InspectorDensity, InspectorTab } from "../components/InspectorPanel/types";

interface UseInspectorPanelControllerOptions {
  inspectorTab: InspectorTab;
  setInspectorTab: Dispatch<SetStateAction<InspectorTab>>;
  inspectorDensity: InspectorDensity;
  inspectorCommandMenuIndex: number | null;
  setInspectorCommandMenuIndex: Dispatch<SetStateAction<number | null>>;
  inspectorTabRefs: MutableRefObject<Record<InspectorTab, HTMLButtonElement | null>>;
  inspectorMoreButtonRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorMenuFirstActionRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorQuickActionsAdvancedRef: RefObject<HTMLDivElement>;
  inspectorQuickActionsToggleRef: MutableRefObject<HTMLButtonElement | null>;
  inspectorToggleButtonRef: MutableRefObject<HTMLButtonElement | null>;
  setShowInspector: Dispatch<SetStateAction<boolean>>;
  setShowRagPanel: Dispatch<SetStateAction<boolean>>;
  setShowScriptPanel: Dispatch<SetStateAction<boolean>>;
  setShowSysmon: Dispatch<SetStateAction<boolean>>;
  showInspectorQuickActionsExpanded: boolean;
  setShowInspectorQuickActionsExpanded: Dispatch<SetStateAction<boolean>>;
  showInspector: boolean;
}

interface UseInspectorPanelControllerResult {
  inspectorTabs: readonly { id: InspectorTab; label: string; shortcut: string }[];
  isInspectorCompact: boolean;
  openInspectorTab: (tab: InspectorTab) => void;
  closeInspector: () => void;
  handleInspectorTabKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  closeInspectorQuickActions: (restoreFocus?: boolean) => void;
  handleInspectorQuickActionsToggle: () => void;
  handleInspectorQuickActionsToggleKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  closeInspectorCommandMenu: (restoreFocus?: boolean) => void;
  openInspectorCompactMenu: (index: number) => void;
  handleInspectorCompactMenuKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>, rowIndex: number) => void;
  handleInspectorSuggestedCommandRowBlurCapture: (
    e: FocusEvent<HTMLDivElement>,
    rowIndex: number,
  ) => void;
  handleInspectorQuickActionsAdvancedKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  handleInspectorTabShortcut: (e: globalThis.KeyboardEvent) => boolean;
}

export function useInspectorPanelController({
  inspectorTab,
  setInspectorTab,
  inspectorDensity,
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
}: UseInspectorPanelControllerOptions): UseInspectorPanelControllerResult {
  const isInspectorCompact = inspectorDensity === "compact";

  const inspectorTabs = useMemo(() => [
    { id: "summary", label: "개요", shortcut: "1" },
    { id: "rag", label: "RAG", shortcut: "2" },
    { id: "scripts", label: "Scripts", shortcut: "3" },
    { id: "sysmon", label: "System", shortcut: "4" },
  ] as const, []);

  const openInspectorTab = useCallback((tab: InspectorTab) => {
    setShowInspector(true);
    setInspectorTab(tab);
    setShowRagPanel(tab === "rag");
    setShowScriptPanel(tab === "scripts");
    setShowSysmon(tab === "sysmon");
    requestAnimationFrame(() => {
      inspectorTabRefs.current[tab]?.focus();
    });
  }, [inspectorTabRefs, setInspectorTab, setShowInspector, setShowRagPanel, setShowScriptPanel, setShowSysmon]);

  const handleInspectorTabKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const activeIndex = inspectorTabs.findIndex((item) => item.id === inspectorTab);
    const next = getRovingMenuNextIndex(
      e.key as "ArrowRight" | "ArrowLeft" | "Home" | "End",
      inspectorTabs.length,
      activeIndex,
    );
    if (next < 0) return;
    const nextTab = inspectorTabs[next].id;
    openInspectorTab(nextTab);
    requestAnimationFrame(() => {
      inspectorTabRefs.current[nextTab]?.focus();
    });
  }, [inspectorTab, inspectorTabs, inspectorTabRefs, openInspectorTab]);

  const closeInspectorQuickActions = useCallback((restoreFocus = true) => {
    setShowInspectorQuickActionsExpanded(false);
    if (restoreFocus) {
      requestAnimationFrame(() => {
        inspectorQuickActionsToggleRef.current?.focus();
      });
    }
  }, [setShowInspectorQuickActionsExpanded, inspectorQuickActionsToggleRef]);

  const handleInspectorQuickActionsToggle = useCallback(() => {
    setShowInspectorQuickActionsExpanded((prev) => !prev);
  }, [setShowInspectorQuickActionsExpanded]);

  const handleInspectorQuickActionsToggleKeyDown = useCallback((
    e: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleInspectorQuickActionsToggle();
      return;
    }

    if (e.key === "ArrowDown" && !showInspectorQuickActionsExpanded) {
      e.preventDefault();
      handleInspectorQuickActionsToggle();
      return;
    }
  }, [handleInspectorQuickActionsToggle, showInspectorQuickActionsExpanded]);

  const {
    closeInspectorCommandMenu,
    openInspectorCompactMenu,
    handleInspectorCompactMenuKeyDown,
    handleInspectorSuggestedCommandRowBlurCapture,
    handleInspectorQuickActionsAdvancedKeyDown,
  } = useInspectorMenuControls({
    isInspectorCompact,
    inspectorCommandMenuIndex,
    setInspectorCommandMenuIndex,
    inspectorMoreButtonRefs,
    inspectorMenuFirstActionRefs,
    inspectorQuickActionsAdvancedRef,
    showInspectorQuickActionsExpanded,
    closeInspectorQuickActions,
  });

  useEffect(() => {
    if (!showInspectorQuickActionsExpanded) return;
    requestAnimationFrame(() => {
      const firstAction = inspectorQuickActionsAdvancedRef.current?.querySelector("button");
      firstAction?.focus();
    });
  }, [showInspectorQuickActionsExpanded]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!showInspectorQuickActionsExpanded) return;
      if (isEventTargetWithinSelector(e.target, "[data-inspector-quick-actions-advanced]")) return;
      if (isEventTargetWithinSelector(e.target, "[data-inspector-quick-actions-toggle]")) return;
      closeInspectorQuickActions();
    };
    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, [closeInspectorQuickActions, showInspectorQuickActionsExpanded]);

  useEffect(() => {
    if (!showInspector && showInspectorQuickActionsExpanded) {
      closeInspectorQuickActions(false);
    }
  }, [closeInspectorQuickActions, showInspectorQuickActionsExpanded, showInspector]);

  const closeInspector = useCallback(() => {
    setShowInspector(false);
    setShowRagPanel(false);
    setShowScriptPanel(false);
    setShowSysmon(false);
    requestAnimationFrame(() => {
      inspectorToggleButtonRef.current?.focus();
    });
  }, [setShowInspector, setShowRagPanel, setShowScriptPanel, setShowSysmon, inspectorToggleButtonRef]);

  const handleInspectorTabShortcut = useCallback((e: globalThis.KeyboardEvent) => {
    if (isTextInputTarget(e.target)) return false;
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
    const tab = (() => {
      switch (e.key) {
        case "1":
          return "summary" as const;
        case "2":
          return "rag" as const;
        case "3":
          return "scripts" as const;
        case "4":
          return "sysmon" as const;
        default:
          return null;
      }
    })();
    if (!tab) return false;
    e.preventDefault();
    openInspectorTab(tab);
    requestAnimationFrame(() => {
      inspectorTabRefs.current[tab]?.focus();
    });
    return true;
  }, [openInspectorTab, inspectorTabRefs]);

  return {
    inspectorTabs,
    isInspectorCompact,
    openInspectorTab,
    closeInspector,
    handleInspectorTabKeyDown,
    closeInspectorQuickActions,
    handleInspectorQuickActionsToggle,
    handleInspectorQuickActionsToggleKeyDown,
    closeInspectorCommandMenu,
    openInspectorCompactMenu,
    handleInspectorCompactMenuKeyDown,
    handleInspectorSuggestedCommandRowBlurCapture,
    handleInspectorQuickActionsAdvancedKeyDown,
    handleInspectorTabShortcut,
  };
}
