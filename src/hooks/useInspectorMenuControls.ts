import {
  useCallback,
  useEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  getActiveFocusableIndex,
  isEventTargetWithinSelector,
  isTargetInsideTargets,
} from "../utils/pointerGuard";
import {
  getRovingMenuNextIndex,
  isRovingMenuInputKey,
  normalizeRovingMenuNavKey,
} from "../utils/menuRoving";

interface UseInspectorMenuControlsOptions {
  isInspectorCompact: boolean;
  inspectorCommandMenuIndex: number | null;
  setInspectorCommandMenuIndex: Dispatch<SetStateAction<number | null>>;
  inspectorMoreButtonRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorMenuFirstActionRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorQuickActionsAdvancedRef: RefObject<HTMLDivElement>;
  showInspectorQuickActionsExpanded: boolean;
  closeInspectorQuickActions: (restoreFocus?: boolean) => void;
}

interface UseInspectorMenuControlsResult {
  inspectorCommandMenuOpenRef: MutableRefObject<number | null>;
  closeInspectorCommandMenu: (restoreFocus?: boolean) => void;
  openInspectorCompactMenu: (index: number) => void;
  handleInspectorCompactMenuKeyDown: (e: KeyboardEvent<HTMLDivElement>, rowIndex: number) => void;
  handleInspectorSuggestedCommandRowBlurCapture: (
    e: FocusEvent<HTMLDivElement>,
    rowIndex: number,
  ) => void;
  handleInspectorQuickActionsAdvancedKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

export function useInspectorMenuControls({
  isInspectorCompact,
  inspectorCommandMenuIndex,
  setInspectorCommandMenuIndex,
  inspectorMoreButtonRefs,
  inspectorMenuFirstActionRefs,
  inspectorQuickActionsAdvancedRef,
  showInspectorQuickActionsExpanded,
  closeInspectorQuickActions,
}: UseInspectorMenuControlsOptions): UseInspectorMenuControlsResult {
  const inspectorCommandMenuOpenRef = useRef<number | null>(null);

  useEffect(() => {
    inspectorCommandMenuOpenRef.current = inspectorCommandMenuIndex;
  }, [inspectorCommandMenuIndex]);

  const closeInspectorCommandMenu = useCallback((restoreFocus = false) => {
    setInspectorCommandMenuIndex((prev) => {
      if (restoreFocus && prev != null) {
        requestAnimationFrame(() => {
          inspectorMoreButtonRefs.current[prev]?.focus();
        });
      }
      return null;
    });
  }, [inspectorMoreButtonRefs, setInspectorCommandMenuIndex]);

  useEffect(() => {
    if (inspectorCommandMenuIndex == null) return;
    requestAnimationFrame(() => {
      inspectorMenuFirstActionRefs.current[inspectorCommandMenuIndex]?.focus();
    });
  }, [inspectorCommandMenuIndex, inspectorMenuFirstActionRefs]);

  const handleInspectorCompactMenuKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>, rowIndex: number) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeInspectorCommandMenu(true);
      return;
    }
    if (!isRovingMenuInputKey(e.key)) {
      return;
    }
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']"),
    );
    if (items.length === 0) return;
    const currentIdx = getActiveFocusableIndex(items, document.activeElement);
    const navKey = normalizeRovingMenuNavKey(e.key, e.shiftKey);
    const nextIdx = getRovingMenuNextIndex(navKey, items.length, currentIdx);
    if (nextIdx < 0) return;
    e.preventDefault();
    e.stopPropagation();
    items[nextIdx]?.focus();
    if (inspectorCommandMenuOpenRef.current !== rowIndex) {
      setInspectorCommandMenuIndex(rowIndex);
    }
  }, [closeInspectorCommandMenu, setInspectorCommandMenuIndex]);

  const openInspectorCompactMenu = useCallback((index: number) => {
    const triggerButton = inspectorMoreButtonRefs.current[index];
    triggerButton?.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    setInspectorCommandMenuIndex(index);
  }, [inspectorMoreButtonRefs, setInspectorCommandMenuIndex]);

  const handleInspectorSuggestedCommandRowBlurCapture = useCallback((
    e: FocusEvent<HTMLDivElement>,
    rowIndex: number,
  ) => {
    if (!isInspectorCompact || inspectorCommandMenuIndex !== rowIndex) return;
    const next = e.relatedTarget;
    if (!next) {
      closeInspectorCommandMenu();
      return;
    }
    const menuContainerFocused = isEventTargetWithinSelector(
      next,
      "[data-inspector-command-menu='compact']",
    );
    const currentRowFocused = isTargetInsideTargets(next, [e.currentTarget]);
    if (!currentRowFocused && !menuContainerFocused) {
      closeInspectorCommandMenu();
    }
  }, [closeInspectorCommandMenu, inspectorCommandMenuIndex, isInspectorCompact]);

  const handleInspectorQuickActionsAdvancedKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!showInspectorQuickActionsExpanded) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeInspectorQuickActions();
      return;
    }
    if (!isRovingMenuInputKey(e.key)) return;
    if (e.key === "Tab") return;
    const buttons = Array.from(inspectorQuickActionsAdvancedRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (buttons.length === 0) return;
    const currentIdx = getActiveFocusableIndex(buttons, document.activeElement);
    const navKey = normalizeRovingMenuNavKey(e.key, e.shiftKey);
    const nextIdx = getRovingMenuNextIndex(
      navKey,
      buttons.length,
      currentIdx,
    );
    if (nextIdx < 0) return;
    e.preventDefault();
    buttons[nextIdx]?.focus();
  }, [
    closeInspectorQuickActions,
    showInspectorQuickActionsExpanded,
    inspectorQuickActionsAdvancedRef,
  ]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (inspectorCommandMenuOpenRef.current == null) return;
      if (isEventTargetWithinSelector(e.target, "[data-inspector-command-menu-row]")) return;
      if (isEventTargetWithinSelector(e.target, "[data-inspector-command-menu='compact']")) return;
      closeInspectorCommandMenu();
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [closeInspectorCommandMenu]);

  useEffect(() => {
    if (!isInspectorCompact && inspectorCommandMenuIndex != null) {
      closeInspectorCommandMenu();
    }
  }, [isInspectorCompact, inspectorCommandMenuIndex, closeInspectorCommandMenu]);

  return {
    inspectorCommandMenuOpenRef,
    closeInspectorCommandMenu,
    openInspectorCompactMenu,
    handleInspectorCompactMenuKeyDown,
    handleInspectorSuggestedCommandRowBlurCapture,
    handleInspectorQuickActionsAdvancedKeyDown,
  };
}
