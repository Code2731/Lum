// Phase 126 — App.tsx 분해 1차: 헤더 추출.
// 툴바 버튼 그룹·모델 배지·Privacy Ledger 등 헤더 전체.
// state는 App.tsx가 소유, 여기는 props로 받아 렌더 + 상호작용만.

import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  Cpu, Loader2, TerminalSquare, LayoutList, MousePointer2,
  Package, Database, X, SlidersHorizontal, GitCompareArrows, Palette,
  BookOpen, Bell, Activity, FolderTree, Brain, PlugZap, Users, Sparkles, Library, Hammer, Layers, BookMarked, GitBranch,
  PanelRightOpen,
} from "lucide-react";
import { ToolbarIconButton, ToolbarSeparator } from "@/components/ui/toolbar-icon-button";
import WindowControls from "./WindowControls";
import PrivacyLedgerBadge from "./PrivacyLedgerBadge";
import NotificationCenter from "./NotificationCenter";
import type { usePanelVisibility } from "../hooks/usePanelVisibility";
import type { useSquads } from "../hooks/useSquads";
import type { usePrivacyLedger } from "../hooks/usePrivacyLedger";
import type { useNotificationCenter } from "../hooks/useNotificationCenter";
import type { useScriptLibrary } from "../hooks/useScriptLibrary";
import type { useHardwareSpecs } from "../hooks/useHardwareSpecs";

type ViewMode = "terminal" | "canvas" | "list";

const VIEW_BUTTONS: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
  { mode: "terminal", icon: <TerminalSquare size={14} />, label: "터미널" },
  { mode: "list", icon: <LayoutList size={14} />, label: "리스트" },
  { mode: "canvas", icon: <MousePointer2 size={14} />, label: "캔버스" },
];

// Phase 126 — Advanced 팝오버 안에서 "신규" 배지를 띄울 기능 ID 목록.
// 사용자가 클릭하면 영구 dismiss(→ ui_seen_advanced_features 누적). 새 페이즈 출시 시 추가/회전.
// Phase 127: Skills 추가.
export const NEW_ADVANCED_FEATURES = ["skills", "healing", "recall", "lora"] as const;
export type NewFeatureId = typeof NEW_ADVANCED_FEATURES[number];

type AdvancedAction = {
  id: string;
  label: string;
  icon: (size: number) => React.ReactNode;
  active: boolean;
  /** 신규 feature 배지 대상 ID */
  newFeatureId?: NewFeatureId;
  /** 메뉴용 배지 (예: 활성 Squad 존재) */
  badge?: boolean;
  /** 툴바 인라인 버튼 클릭 동작 */
  onActivate: () => void;
  /** 툴팁용 단축키 */
  shortcut?: string;
  tone?: "accent" | "cyan";
};

type QuickAccessAction = {
  id: string;
  label: string;
  icon: (size: number) => React.ReactNode;
  active?: boolean;
  shortcut?: string;
  onActivate: () => void;
};

interface Props {
  // hardware
  specs: ReturnType<typeof useHardwareSpecs>["specs"];
  specsLoading: boolean;
  // view
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  // model badges
  loadedModelId: string | null;
  heavyModelId: string | null;
  heavyEnabled: boolean;
  // stores
  privacyLedger: ReturnType<typeof usePrivacyLedger>;
  squadStore: ReturnType<typeof useSquads>;
  notifCenter: ReturnType<typeof useNotificationCenter>;
  scriptLib: ReturnType<typeof useScriptLibrary>;
  // panel visibility (bundle)
  panels: ReturnType<typeof usePanelVisibility>;
  // file explorer (App-local state, not in panels hook)
  showFileExplorer: boolean;
  setShowFileExplorer: React.Dispatch<React.SetStateAction<boolean>>;
  showInspector: boolean;
  onToggleInspector: () => void;
  inspectorToggleButtonRef?: React.Ref<HTMLButtonElement>;
  // reasoning toggle
  showReasoning: boolean;
  toggleReasoning: () => void;
  compactMode: boolean;
  toggleCompactMode: () => void;
  // toolbar advanced mode
  toolbarShowAdvanced: boolean;
  toggleToolbarAdvanced: () => void;
  showAdvancedOverflow: boolean;
  setShowAdvancedOverflow: React.Dispatch<React.SetStateAction<boolean>>;
  // workspace loader
  loadWorkspaces: () => void;
  // Phase 126 — Advanced popover dot 배지 상태
  seenAdvancedFeatures: string[];
  onMarkAdvancedSeen: (id: string) => void;
}

type PopupPlacement = "down" | "up";

type PopupPosition = {
  x: number;
  y: number;
  width?: number;
};

const clampValue = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

const POPUP_FALLBACK_WIDTH = {
  advanced: 256,
  notif: 320,
};
const POPUP_FALLBACK_HEIGHT = 440;
const POPUP_EDGE_GUTTER = 8;

const AppHeader: React.FC<Props> = ({
  specs, specsLoading,
  viewMode, setViewMode,
  loadedModelId, heavyModelId, heavyEnabled,
  privacyLedger, squadStore, notifCenter, scriptLib,
  panels,
  showFileExplorer, setShowFileExplorer,
  showInspector, onToggleInspector,
  inspectorToggleButtonRef,
  showReasoning, toggleReasoning,
  compactMode, toggleCompactMode,
  toolbarShowAdvanced, toggleToolbarAdvanced,
  showAdvancedOverflow, setShowAdvancedOverflow,
  loadWorkspaces,
  seenAdvancedFeatures, onMarkAdvancedSeen,
}) => {
  const isNew = (id: string) =>
    (NEW_ADVANCED_FEATURES as readonly string[]).includes(id) && !seenAdvancedFeatures.includes(id);
  const hasUnseenAdvanced = NEW_ADVANCED_FEATURES.some((id) => !seenAdvancedFeatures.includes(id));
  const unseenAdvancedCount = NEW_ADVANCED_FEATURES.reduce((acc, id) => (isNew(id) ? acc + 1 : acc), 0);
  const advancedBadgeLabel = hasUnseenAdvanced
    ? "새 고급 기능이 있습니다"
    : squadStore.squads.length > 0
      ? "활성 Squad가 있습니다"
      : undefined;
  const {
    setShowModelManager,
    showRagPanel, setShowRagPanel,
    setShowXllmPanel,
    showDiffReview, setShowDiffReview,
    showThemePanel, setShowThemePanel,
    showWorkspace, setShowWorkspace,
    showScriptPanel, setShowScriptPanel,
    showSysmon, setShowSysmon,
    showNotifCenter, setShowNotifCenter,
    showMcpPanel, setShowMcpPanel,
    showSquadPanel, setShowSquadPanel,
    showHealingDataset, setShowHealingDataset,
    showHistoryGraph, setShowHistoryGraph,
    showRecall, setShowRecall,
    showLoraForge, setShowLoraForge,
    showSkills, setShowSkills,
  } = panels;

  const advancedActions = React.useMemo<AdvancedAction[]>(() => [
    {
      id: "mcp",
      label: "MCP 서버",
      icon: (size) => <PlugZap size={size} />,
      active: showMcpPanel,
      onActivate: () => setShowMcpPanel(v => !v),
    },
    {
      id: "squad",
      label: "Worktree Squad",
      icon: (size) => <Users size={size} />,
      active: showSquadPanel,
      badge: squadStore.squads.length > 0,
      onActivate: () => {
        setShowSquadPanel(v => !v);
        if (!showSquadPanel) squadStore.load();
      },
    },
    {
      id: "healing",
      label: "Auto-Heal 학습 데이터셋",
      icon: (size) => <Sparkles size={size} className={size <= 13 ? "text-cyan-300" : undefined} />,
      active: showHealingDataset,
      newFeatureId: "healing",
      onActivate: () => {
        onMarkAdvancedSeen("healing");
        setShowHealingDataset(v => !v);
      },
      tone: "cyan",
    },
    {
      id: "history",
      label: "시맨틱 히스토리 그래프",
      icon: (size) => <GitBranch size={size} />,
      active: showHistoryGraph,
      onActivate: () => setShowHistoryGraph(v => !v),
      tone: "cyan",
    },
    {
      id: "recall",
      label: "메모리 검색 (history/healing/memory)",
      icon: (size) => <Library size={size} className={size <= 13 ? "text-cyan-300" : undefined} />,
      active: showRecall,
      newFeatureId: "recall",
      onActivate: () => {
        onMarkAdvancedSeen("recall");
        setShowRecall(v => !v);
      },
      tone: "cyan",
    },
    {
      id: "lora",
      label: "LoRA Forge — 내 데이터로 모델 학습",
      icon: (size) => <Hammer size={size} className={size <= 13 ? "text-cyan-300" : undefined} />,
      active: showLoraForge,
      newFeatureId: "lora",
      onActivate: () => {
        onMarkAdvancedSeen("lora");
        setShowLoraForge(v => !v);
      },
      tone: "cyan",
    },
    {
      id: "skills",
      label: "Skills — 절차 라이브러리",
      icon: (size) => <BookMarked size={size} className={size <= 13 ? "text-cyan-300" : undefined} />,
      active: showSkills,
      newFeatureId: "skills",
      onActivate: () => {
        onMarkAdvancedSeen("skills");
        setShowSkills(v => !v);
      },
      tone: "cyan",
    },
    {
      id: "rag",
      label: "RAG 코드 검색",
      icon: (size) => <Database size={size} />,
      active: showRagPanel,
      onActivate: () => setShowRagPanel(v => !v),
    },
    {
      id: "xllm",
      label: "xLLM 최적화 설정",
      icon: (size) => <SlidersHorizontal size={size} />,
      active: false,
      onActivate: () => setShowXllmPanel(true),
    },
  ], [
    showMcpPanel,
    showSquadPanel,
    squadStore.squads.length,
    showHealingDataset,
    showHistoryGraph,
    showRecall,
    showLoraForge,
    showSkills,
    showRagPanel,
    onMarkAdvancedSeen,
    squadStore.load,
    setShowMcpPanel,
    setShowSquadPanel,
    setShowHealingDataset,
    setShowHistoryGraph,
    setShowRecall,
    setShowLoraForge,
    setShowSkills,
    setShowRagPanel,
    setShowXllmPanel,
  ]);

  const compactQuickAccessActions = React.useMemo<QuickAccessAction[]>(() => [
    {
      id: "workspace",
      label: "워크스페이스",
      shortcut: "⌘⇧S",
      active: showWorkspace,
      icon: (size) => <Layers size={size} />,
      onActivate: () => {
        setShowWorkspace(true);
        loadWorkspaces();
      },
    },
    {
      id: "scripts",
      label: "스크립트 라이브러리",
      shortcut: "⌘⇧L",
      active: showScriptPanel,
      icon: (size) => <BookOpen size={size} />,
      onActivate: () => {
        setShowScriptPanel(v => {
          if (!v) scriptLib.loadScripts();
          return !v;
        });
      },
    },
    {
      id: "diffReview",
      label: "AI Diff 리뷰",
      icon: (size) => <GitCompareArrows size={size} />,
      active: showDiffReview,
      onActivate: () => setShowDiffReview(true),
    },
    {
      id: "sysmon",
      label: "시스템 모니터",
      icon: (size) => <Activity size={size} />,
      active: showSysmon,
      onActivate: () => setShowSysmon(v => !v),
    },
    {
      id: "theme",
      label: "터미널 테마",
      icon: (size) => <Palette size={size} />,
      active: showThemePanel,
      onActivate: () => setShowThemePanel(true),
    },
  ], [
    showWorkspace,
    showScriptPanel,
    showDiffReview,
    showSysmon,
    showThemePanel,
    loadWorkspaces,
    setShowWorkspace,
    setShowScriptPanel,
    scriptLib.loadScripts,
    setShowDiffReview,
    setShowSysmon,
    setShowThemePanel,
  ]);

  const orderedOverflowActions = React.useMemo(() => {
    return [...advancedActions]
      .map((action, index) => {
        const isActionNew = action.newFeatureId != null && isNew(action.newFeatureId);
        const score = (action.active ? 200 : 0) + (isActionNew ? 80 : 0) - index;
        return { action, score, index };
      })
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.index - b.index;
      })
      .map((entry) => entry.action);
  }, [advancedActions, seenAdvancedFeatures]);


  // 모델명 짧게 — 마지막 segment에서 흔한 suffix 제거
  const shortName = (n?: string | null) => {
    if (!n) return "";
    const last = n.match(/[^/\\]+$/)?.[0] ?? n;
    return last
      .replace(/-Instruct$/i, "")
      .replace(/-exl2$/i, "")
      .replace(/-MLX-?\d*bit$/i, "")
      .replace(/-\d+bit$/i, "")
      .replace(/-\d+\.\d+bpw$/i, "")
      .replace(/-\d+_\d+$/i, "");
  };
  const fastEmpty = !loadedModelId;
  const fast = fastEmpty ? "Empty Model" : shortName(loadedModelId);
  const heavy = shortName(heavyModelId);
  const advancedOverflowRef = React.useRef<HTMLDivElement>(null);
  const advancedOverflowButtonRef = React.useRef<HTMLButtonElement>(null);
  const advancedOverflowPanelRef = React.useRef<HTMLDivElement>(null);
  const notifCenterPopupRef = React.useRef<HTMLDivElement>(null);
  const notifCenterButtonRef = React.useRef<HTMLButtonElement>(null);
  const notifCenterPanelRef = React.useRef<HTMLDivElement>(null);
  const [advancedOverflowPlacement, setAdvancedOverflowPlacement] = React.useState<PopupPlacement>("down");
  const [notifCenterPlacement, setNotifCenterPlacement] = React.useState<PopupPlacement>("down");
  const [advancedOverflowMaxHeight, setAdvancedOverflowMaxHeight] = React.useState(440);
  const [notifCenterMaxHeight, setNotifCenterMaxHeight] = React.useState(440);
  const [advancedOverflowPosition, setAdvancedOverflowPosition] = React.useState<PopupPosition>({ x: 0, y: 0 });
  const [notifCenterPosition, setNotifCenterPosition] = React.useState<PopupPosition>({ x: 0, y: 0 });
  const [hasAdvancedPosition, setHasAdvancedPosition] = React.useState(false);
  const [hasNotifCenterPosition, setHasNotifCenterPosition] = React.useState(false);
  const ADVANCED_OVERFLOW_PANEL_ID = "advanced-overflow-panel";
  const NOTIF_CENTER_PANEL_ID = "notification-center-panel";
  const POPUP_GUTTER = 8;
  const POPUP_ESTIMATE_HEIGHT = POPUP_FALLBACK_HEIGHT;
  const popupFocusables = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
  const clampPopupHeight = (placement: PopupPlacement, triggerRect: DOMRect | null): number => {
    if (!triggerRect) return POPUP_ESTIMATE_HEIGHT;
    const spaceAbove = triggerRect.top - POPUP_GUTTER;
    const spaceBelow = window.innerHeight - triggerRect.bottom - POPUP_GUTTER;
    const preferredSpace = placement === "up" ? spaceAbove : spaceBelow;
    const safeSpace = Math.max(96, preferredSpace - 4);
    return Math.min(POPUP_ESTIMATE_HEIGHT, safeSpace);
  };
  const measurePopupPlacement = React.useCallback((trigger: HTMLElement | null, panelRef?: React.RefObject<HTMLDivElement | null>): PopupPlacement => {
    if (typeof window === "undefined" || !trigger) return "down";

    const rect = trigger.getBoundingClientRect();
    const spaceAbove = rect.top - POPUP_GUTTER;
    const spaceBelow = window.innerHeight - rect.bottom - POPUP_GUTTER;
    const panelRectHeight = panelRef?.current?.getBoundingClientRect().height;
    const panelHeight = (typeof panelRectHeight === "number" && Number.isFinite(panelRectHeight) && panelRectHeight > 0)
      ? Math.min(panelRectHeight, POPUP_ESTIMATE_HEIGHT)
      : POPUP_ESTIMATE_HEIGHT;
    const canOpenUp = spaceAbove >= panelHeight;
    const canOpenDown = spaceBelow >= panelHeight;

    if (canOpenUp && canOpenDown) {
      return spaceAbove > spaceBelow ? "up" : "down";
    }
    if (canOpenUp) {
      return "up";
    }
    if (canOpenDown) {
      return "down";
    }
    return spaceAbove > spaceBelow ? "up" : "down";
  }, []);
  const updatePopupPlacement = React.useCallback((options: {
    trigger: HTMLElement | null;
    panelRef?: React.RefObject<HTMLDivElement | null>;
    setPlacement: (placement: PopupPlacement) => void;
    setMaxHeight: (height: number) => void;
    setPosition: (position: PopupPosition) => void;
    fallbackWidth: number;
    onReady: () => void;
  }) => {
    const placement = measurePopupPlacement(options.trigger, options.panelRef);
    options.setPlacement(placement);
    const nextHeight = clampPopupHeight(placement, options.trigger?.getBoundingClientRect() ?? null);
    options.setMaxHeight(nextHeight);

    if (typeof window === "undefined" || !options.trigger) {
      return;
    }

    const triggerRect = options.trigger.getBoundingClientRect();
    const panelRect = options.panelRef?.current?.getBoundingClientRect();
    const panelWidth = (panelRect?.width && Number.isFinite(panelRect.width) && panelRect.width > 0)
      ? panelRect.width
      : options.fallbackWidth;
    const safeViewportWidth = Math.max(POPUP_EDGE_GUTTER * 2 + 1, window.innerWidth - POPUP_EDGE_GUTTER * 2);
    const clampedPanelWidth = Math.min(panelWidth, safeViewportWidth);
    const panelHeight = nextHeight;

    const nextY = placement === "up"
      ? triggerRect.top - panelHeight - POPUP_EDGE_GUTTER
      : triggerRect.bottom + POPUP_EDGE_GUTTER;

    const nextX = triggerRect.right - clampedPanelWidth;
    const maxTop = Math.max(POPUP_EDGE_GUTTER, window.innerHeight - panelHeight - POPUP_EDGE_GUTTER);
    const maxLeft = Math.max(POPUP_EDGE_GUTTER, window.innerWidth - clampedPanelWidth - POPUP_EDGE_GUTTER);

    options.setPosition({
      x: clampValue(nextX, POPUP_EDGE_GUTTER, maxLeft),
      y: clampValue(nextY, POPUP_EDGE_GUTTER, maxTop),
      width: clampedPanelWidth,
    });
    options.onReady();
  }, [measurePopupPlacement]);

  const advancedOverflowPanelStyle: React.CSSProperties = {
    left: `${advancedOverflowPosition.x}px`,
    top: `${advancedOverflowPosition.y}px`,
    width: typeof advancedOverflowPosition.width === "number" ? `${advancedOverflowPosition.width}px` : undefined,
    opacity: hasAdvancedPosition ? 1 : 0,
    visibility: hasAdvancedPosition ? "visible" : "hidden",
    pointerEvents: hasAdvancedPosition ? "auto" : "none",
  };

  const advancedOverflowPanelOrigin = advancedOverflowPlacement === "up" ? "bottom right" : "top right";
  const advancedOverflowPanelOffsetY = advancedOverflowPlacement === "up" ? 4 : -4;

  const notifCenterPanelStyle: React.CSSProperties = {
    left: `${notifCenterPosition.x}px`,
    top: `${notifCenterPosition.y}px`,
    width: typeof notifCenterPosition.width === "number" ? `${notifCenterPosition.width}px` : undefined,
    opacity: hasNotifCenterPosition ? 1 : 0,
    visibility: hasNotifCenterPosition ? "visible" : "hidden",
    pointerEvents: hasNotifCenterPosition ? "auto" : "none",
  };
  const notifCenterPanelOrigin = notifCenterPlacement === "up" ? "bottom right" : "top right";
  const notifCenterPanelOffsetY = notifCenterPlacement === "up" ? 4 : -4;

  const getPopupElements = (panelRef: React.RefObject<HTMLDivElement | null>): HTMLElement[] => {
    if (!panelRef.current) return [];
    return Array.from(panelRef.current.querySelectorAll<HTMLElement>(popupFocusables));
  };

  const handlePopupTabTrap = (
    e: React.KeyboardEvent,
    panelRef: React.RefObject<HTMLDivElement | null>,
  ): boolean => {
    if (e.key !== "Tab") return false;

    const focusables = getPopupElements(panelRef);
    if (focusables.length === 0) return false;

    const active = document.activeElement;
    const currentIndex = focusables.indexOf(active as HTMLElement);
    const nextIndex = (() => {
      if (currentIndex < 0) {
        return 0;
      }
      if (e.shiftKey) {
        return (currentIndex - 1 + focusables.length) % focusables.length;
      }
      return (currentIndex + 1) % focusables.length;
    })();

    e.preventDefault();
    focusables[nextIndex]?.focus();
    return true;
  };

  const handlePopupArrowNav = (
    e: React.KeyboardEvent,
    panelRef: React.RefObject<HTMLDivElement | null>,
  ): boolean => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return false;

    const focusables = getPopupElements(panelRef);
    if (focusables.length === 0) return false;

    const active = document.activeElement;
    const currentIndex = focusables.indexOf(active as HTMLElement);
    const nextIndex = (() => {
      if (currentIndex < 0) {
        return 0;
      }
      if (e.key === "ArrowDown") {
        return (currentIndex + 1) % focusables.length;
      }
      return (currentIndex - 1 + focusables.length) % focusables.length;
    })();

    e.preventDefault();
    focusables[nextIndex]?.focus();
    return true;
  };

  const focusFirstPopupElement = React.useCallback((panelRef: React.RefObject<HTMLDivElement | null>) => {
    const focusables = getPopupElements(panelRef);
    if (focusables.length === 0) return;
    focusables[0]?.focus();
  }, []);

  const closeAdvancedOverflow = React.useCallback(() => {
    setHasAdvancedPosition(false);
    setShowAdvancedOverflow(false);
    requestAnimationFrame(() => {
      advancedOverflowButtonRef.current?.focus();
    });
  }, [setShowAdvancedOverflow]);

  const closeNotifCenter = React.useCallback(() => {
    setHasNotifCenterPosition(false);
    setShowNotifCenter(false);
    requestAnimationFrame(() => {
      notifCenterButtonRef.current?.focus();
    });
  }, [setShowNotifCenter]);

  const toggleAdvancedOverflow = React.useCallback(() => {
    setShowNotifCenter(false);
    setHasAdvancedPosition(false);
    setShowAdvancedOverflow((prev) => {
      return !prev;
    });
  }, [setShowAdvancedOverflow, setShowNotifCenter]);

  const toggleNotifCenter = React.useCallback(() => {
    setShowAdvancedOverflow(false);
    setHasNotifCenterPosition(false);
    setShowNotifCenter((prev) => {
      const next = !prev;
      if (next) notifCenter.markAllRead();
      return next;
    });
  }, [notifCenter, setShowAdvancedOverflow, setShowNotifCenter]);

  React.useLayoutEffect(() => {
    if (!showAdvancedOverflow) return;

    const handleClose = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        (advancedOverflowRef.current && !advancedOverflowRef.current.contains(target))
        && (advancedOverflowPanelRef.current && !advancedOverflowPanelRef.current.contains(target))
      ) {
        closeAdvancedOverflow();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeAdvancedOverflow();
      }
    };

    document.addEventListener("pointerdown", handleClose);
    document.addEventListener("keydown", handleEscape, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handleClose);
      document.removeEventListener("keydown", handleEscape, { capture: true });
    };
  }, [showAdvancedOverflow, closeAdvancedOverflow]);

  React.useEffect(() => {
    if (!showAdvancedOverflow) return;

    const updatePlacement = () => {
      updatePopupPlacement({
        trigger: advancedOverflowButtonRef.current,
        panelRef: advancedOverflowPanelRef,
        setPlacement: setAdvancedOverflowPlacement,
        setMaxHeight: setAdvancedOverflowMaxHeight,
        setPosition: setAdvancedOverflowPosition,
        fallbackWidth: POPUP_FALLBACK_WIDTH.advanced,
        onReady: () => setHasAdvancedPosition(true),
      });
    };

    updatePlacement();

    const observer = (() => {
      if (typeof ResizeObserver === "undefined") return null;

      const next = new ResizeObserver(() => {
        updatePlacement();
      });
      if (advancedOverflowPanelRef.current) {
        next.observe(advancedOverflowPanelRef.current);
      }
      return next;
    })();

    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [showAdvancedOverflow, updatePopupPlacement]);

  React.useLayoutEffect(() => {
    if (!showNotifCenter) return;

    const handleClose = (e: PointerEvent) => {
      if (notifCenterPopupRef.current && !notifCenterPopupRef.current.contains(e.target as Node)) {
        closeNotifCenter();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeNotifCenter();
      }
    };

    document.addEventListener("pointerdown", handleClose);
    document.addEventListener("keydown", handleEscape, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handleClose);
      document.removeEventListener("keydown", handleEscape, { capture: true });
    };
  }, [showNotifCenter, closeNotifCenter]);

  React.useEffect(() => {
    if (!showNotifCenter) return;

    const updatePlacement = () => {
      updatePopupPlacement({
        trigger: notifCenterButtonRef.current,
        panelRef: notifCenterPanelRef,
        setPlacement: setNotifCenterPlacement,
        setMaxHeight: setNotifCenterMaxHeight,
        setPosition: setNotifCenterPosition,
        fallbackWidth: POPUP_FALLBACK_WIDTH.notif,
        onReady: () => setHasNotifCenterPosition(true),
      });
    };

    updatePlacement();

    const observer = (() => {
      if (typeof ResizeObserver === "undefined") return null;

      const next = new ResizeObserver(() => {
        updatePlacement();
      });
      if (notifCenterPanelRef.current) {
        next.observe(notifCenterPanelRef.current);
      }
      return next;
    })();

    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [showNotifCenter, updatePopupPlacement]);

  React.useLayoutEffect(() => {
    if (!showAdvancedOverflow) return;

    focusFirstPopupElement(advancedOverflowPanelRef);
  }, [showAdvancedOverflow, focusFirstPopupElement]);

  React.useLayoutEffect(() => {
    if (!showNotifCenter) return;

    focusFirstPopupElement(notifCenterPanelRef);
  }, [showNotifCenter, focusFirstPopupElement]);

  return (
    <header
      data-tauri-drag-region
      className="lum-topbar h-11 border-b border-white/10 flex items-center justify-between px-3.5 shrink-0 select-none gap-2 min-w-0 shadow-[0_10px_28px_rgba(0,0,0,0.25)]"
    >
      <div data-tauri-drag-region className="flex items-center gap-3 shrink-0">
        <WindowControls />
        <div data-tauri-drag-region className="flex items-center gap-1.5 text-xs text-white/55 font-medium shrink-0 whitespace-nowrap">
          <Cpu size={12} />
          {specsLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : specs ? (
            <span title={specs.recommendation_reason}>
              {(() => {
                if (specs.gpu_vram_gb && specs.gpu_vram_gb > 0) {
                  return `${specs.gpu_vram_gb}GB VRAM`;
                }
                const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
                if (specs.gpu_type === "integrated" || isMac) {
                  return `${specs.total_memory_gb}GB 통합메모리`;
                }
                return `${specs.total_memory_gb}GB RAM`;
              })()}
            </span>
          ) : null}
        </div>

        <div className="flex bg-white/[0.04] border border-white/[0.08] p-0.5 rounded-lg">
          {VIEW_BUTTONS.map(({ mode, icon, label }) => (
            <button
              key={mode}
              aria-label={label}
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={`p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                viewMode === mode ? "bg-accent/20 text-accent" : "text-white/45 hover:text-white/80 hover:bg-white/[0.06]"
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div data-tauri-drag-region className="flex-1 h-full" />

      <div data-tauri-drag-region className="flex items-center gap-1 min-w-0">
        <div data-tauri-drag-region className="flex items-center gap-1 min-w-0 overflow-hidden mr-1">
          <div
            data-tauri-drag-region
            className={`text-[11px] px-2 py-1 rounded-md truncate max-w-[148px] border ${
              fastEmpty
                ? "bg-white/[0.04] border-white/10 text-white/35 italic"
                : "bg-emerald-400/10 border-emerald-400/25 text-emerald-300"
            }`}
            title={
              fastEmpty
                ? "TabbyAPI에 로드된 모델이 없습니다 — XllmPanel에서 모델을 [사용]하세요"
                : `Fast (TabbyAPI): ${loadedModelId}`
            }
          >
            {fastEmpty ? "EMPTY" : "FAST"} · {fast}
          </div>
          {heavyEnabled && heavy && (
            <div
              data-tauri-drag-region
              className="text-[11px] px-2 py-1 rounded-md bg-amber-400/10 border border-amber-400/25 text-amber-200 truncate max-w-[148px]"
              title={`Heavy Track (mistral.rs): ${heavyModelId}`}
            >
              HEAVY · {heavy}
            </div>
          )}
        </div>

        <PrivacyLedgerBadge
          state={privacyLedger.state}
          isAllOnDevice={privacyLedger.isAllOnDevice}
          onReset={privacyLedger.reset}
        />
        <ToolbarSeparator />

        {/* 그룹 1 — 워크스페이스 / 탐색 */}
        <ToolbarIconButton
          label="파일 탐색기"
          shortcut="⌘B"
          active={showFileExplorer}
          onClick={() => setShowFileExplorer(v => {
            const next = !v;
            invoke("save_ui_preferences", { showFileExplorer: next }).catch(() => {});
            return next;
          })}
        >
          <FolderTree size={14} />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Inspector"
          shortcut="⌘I"
          active={showInspector}
          ref={inspectorToggleButtonRef}
          onClick={onToggleInspector}
        >
          <PanelRightOpen size={14} />
        </ToolbarIconButton>
        {!compactMode && compactQuickAccessActions
          .slice(0, 2)
          .map((action) => (
            <ToolbarIconButton
              key={`quick-inline-${action.id}`}
              label={action.label}
              shortcut={action.shortcut}
              active={action.active}
              onClick={action.onActivate}
            >
              {action.icon(14)}
            </ToolbarIconButton>
          ))}

        <ToolbarSeparator />

        {/* 그룹 2 기본 — 매일 쓰는 AI/모델 액션 */}
        <ToolbarIconButton
          label={`추론 토큰 ${showReasoning ? "표시 중" : "숨김"}`}
          tone="cyan"
          active={showReasoning}
          onClick={toggleReasoning}
        >
          <Brain size={14} />
        </ToolbarIconButton>
        <ToolbarIconButton
          label="모델 관리"
          onClick={() => setShowModelManager(true)}
        >
          <Package size={14} />
        </ToolbarIconButton>

        <ToolbarSeparator />

        {/* 그룹 2 고급 — toolbar_show_advanced=true면 인라인, 아니면 "더보기" 팝오버 */}
        {toolbarShowAdvanced && !compactMode && (
          <>
            {advancedActions.map((action) => (
              <ToolbarIconButton
                key={`advanced-inline-${action.id}`}
                label={action.label}
                active={action.active}
                tone={action.tone}
                badge={action.badge}
                onClick={action.onActivate}
              >
                {action.icon(14)}
              </ToolbarIconButton>
            ))}
            <ToolbarSeparator />
          </>
        )}

        {(!toolbarShowAdvanced || compactMode) && (
          <div className="relative" ref={advancedOverflowRef}>
            <ToolbarIconButton
              ref={advancedOverflowButtonRef}
              label={compactMode
                ? "기능 메뉴"
                : "고급 기능 (MCP / Squad / Healing / Recall / LoRA / RAG / xLLM)"
              }
              active={showAdvancedOverflow}
              badge={squadStore.squads.length > 0 || hasUnseenAdvanced}
              badgeLabel={advancedBadgeLabel}
              aria-controls={ADVANCED_OVERFLOW_PANEL_ID}
              aria-expanded={showAdvancedOverflow}
              onClick={toggleAdvancedOverflow}
            >
              <SlidersHorizontal size={14} />
            </ToolbarIconButton>
            <AnimatePresence>
              {showAdvancedOverflow && (
                <motion.div
                  ref={advancedOverflowPanelRef}
                  id={ADVANCED_OVERFLOW_PANEL_ID}
                  key="advanced-overflow"
                  role="menu"
                  aria-label="고급 기능 메뉴"
                  onKeyDown={(e) => {
                    const handled = handlePopupTabTrap(e, advancedOverflowPanelRef)
                      || handlePopupArrowNav(e, advancedOverflowPanelRef);
                    if (handled) {
                      e.stopPropagation();
                    }
                  }}
                  initial={{ opacity: 0, scale: 0.96, y: advancedOverflowPanelOffsetY }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: advancedOverflowPanelOffsetY }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  style={{
                    transformOrigin: advancedOverflowPanelOrigin,
                    maxHeight: `${advancedOverflowMaxHeight}px`,
                    ...advancedOverflowPanelStyle,
                  }}
                  className="fixed z-50 w-64 max-h-[min(440px,calc(100vh-3.5rem))] overflow-y-auto rounded-xl border border-white/[0.12] bg-[#0f1620]/95 backdrop-blur-md shadow-xl p-2 space-y-0.5"
                >
                  {hasUnseenAdvanced && (
                    <div className="px-2 py-1.5 mb-1 border-b border-white/10">
                      <p className="text-[9px] font-semibold tracking-[0.06em] text-amber-300 uppercase">
                        NEW FEATURE
                      </p>
                      <p className="text-[10px] text-white/65 mt-0.5">
                        신규 기능 {unseenAdvancedCount}개를 확인해 보세요.
                      </p>
                    </div>
                  )}
                  {orderedOverflowActions.map((action) => (
                    <AdvancedRow
                      key={`advanced-overflow-${action.id}`}
                      icon={action.icon(13)}
                      label={action.label}
                      badge={action.badge}
                      isNew={action.newFeatureId ? isNew(action.newFeatureId) : false}
                      onClick={() => {
                        setShowAdvancedOverflow(false);
                        action.onActivate();
                      }}
                    />
                  ))}
                  {compactMode && (
                    <>
                      <p className="px-2 py-1.5 text-[9px] font-semibold tracking-[0.06em] text-white/50 uppercase">
                        QUICK ACCESS
                      </p>
                      {compactQuickAccessActions.map((action) => (
                        <AdvancedRow
                          key={`quick-access-${action.id}`}
                          icon={action.icon(13)}
                          label={action.label}
                          onClick={() => {
                            setShowAdvancedOverflow(false);
                            action.onActivate();
                          }}
                        />
                      ))}
                    </>
                  )}
                  <div className="h-px bg-white/8 my-1" />
                  {!compactMode && (
                    <button
                      type="button"
                      onClick={() => {
                        toggleToolbarAdvanced();
                        setShowAdvancedOverflow(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded text-[10.5px] text-white/55 hover:text-white/85 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      툴바에 항상 표시 (고급 기능 펼치기)
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {toolbarShowAdvanced && !compactMode && (
          <ToolbarIconButton
            label="고급 기능 접기"
            onClick={toggleToolbarAdvanced}
          >
            <X size={14} />
          </ToolbarIconButton>
        )}
        <ToolbarIconButton
          label={compactMode ? "툴바 확장 모드" : "툴바 단순 모드"}
          active={compactMode}
          onClick={toggleCompactMode}
        >
          <SlidersHorizontal size={14} />
        </ToolbarIconButton>

        {/* 그룹 3 — 도구 / 알림 */}
        {!compactMode && (
          <>
            <ToolbarIconButton
              label="AI Diff 리뷰"
              shortcut="⌘⇧R"
              active={showDiffReview}
              onClick={() => setShowDiffReview(true)}
            >
              <GitCompareArrows size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="시스템 모니터"
              shortcut="⌘⇧M"
              active={showSysmon}
              onClick={() => setShowSysmon(v => !v)}
            >
              <Activity size={14} />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="터미널 테마"
              shortcut="⌘,"
              active={showThemePanel}
              onClick={() => setShowThemePanel(true)}
            >
              <Palette size={14} />
            </ToolbarIconButton>
          </>
        )}
        <div className="relative" ref={notifCenterPopupRef}>
          <ToolbarIconButton
            ref={notifCenterButtonRef}
            label="알림 센터"
            active={showNotifCenter}
            badge={notifCenter.unreadCount > 0}
            aria-controls={NOTIF_CENTER_PANEL_ID}
            aria-expanded={showNotifCenter}
            onClick={toggleNotifCenter}
          >
            <Bell size={14} />
          </ToolbarIconButton>
          <AnimatePresence>
            {showNotifCenter && (
                <motion.div
                  ref={notifCenterPanelRef}
                  key="notif-center"
                role="menu"
                aria-label="알림 센터"
                  onKeyDown={(e) => {
                    const handled = handlePopupTabTrap(e, notifCenterPanelRef)
                      || handlePopupArrowNav(e, notifCenterPanelRef);
                    if (handled) {
                      e.stopPropagation();
                    }
                  }}
                  initial={{ opacity: 0, scale: 0.96, y: notifCenterPanelOffsetY }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: notifCenterPanelOffsetY }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  style={{
                    transformOrigin: notifCenterPanelOrigin,
                    maxHeight: `${notifCenterMaxHeight}px`,
                    ...notifCenterPanelStyle,
                  }}
                  className="fixed w-80 h-fit z-50"
                >
                <NotificationCenter
                  notifications={notifCenter.notifications}
                  unreadCount={notifCenter.unreadCount}
                  onMarkAllRead={notifCenter.markAllRead}
                  onDismiss={notifCenter.dismiss}
                  onClear={notifCenter.clear}
                  panelId={NOTIF_CENTER_PANEL_ID}
                  onClose={closeNotifCenter}
                  closeOnDocument={false}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

const AdvancedRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  /** 카운트 dot — squad 활성 등 상태성 마커. emerald. */
  badge?: boolean;
  /** Phase 126: "처음 보는 기능" 마커 — 클릭 시 영구 dismiss. amber + "NEW" 라벨로 더 눈에 띄게. */
  isNew?: boolean;
  onClick: () => void;
}> = ({ icon, label, badge, isNew, onClick }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-white/75 hover:text-white hover:bg-white/[0.07] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  >
    <span className="shrink-0 text-white/50">{icon}</span>
    <span className="flex-1 text-left">{label}</span>
    {isNew && (
      <span className="text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
        NEW
      </span>
    )}
    {badge && !isNew && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />}
  </button>
);

export default AppHeader;
