// Phase 126 — App.tsx 분해 1차: 헤더 추출.
// 툴바 버튼 그룹·모델 배지·Privacy Ledger 등 헤더 전체.
// state는 App.tsx가 소유, 여기는 props로 받아 렌더 + 상호작용만.

import React from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  Cpu, Loader2, TerminalSquare, LayoutList, MousePointer2,
  Package, Database, X, SlidersHorizontal, GitCompareArrows, Palette,
  BookOpen, Bell, Activity, FolderTree, Brain, PlugZap, Users, Sparkles, Library, Hammer, Layers, BookMarked, GitBranch,
  PanelRightOpen,
} from "lucide-react";
import { RecommendationReasonBadge } from "@/components/ui/recommendation-reason-badge";
import { SectionIntroHeader } from "@/components/ui/section-intro-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToolbarIconButton, ToolbarSeparator } from "@/components/ui/toolbar-icon-button";
import { RecommendationCard } from "@/components/ui/recommendation-card";
import WindowControls from "./WindowControls";
import PrivacyLedgerBadge from "./PrivacyLedgerBadge";
import NotificationCenter from "./NotificationCenter";
import { SMALL_ICON_SIZE } from "../constants/ui";
import { getAdvancedRecommendationCardPresentation } from "../utils/advanced-recommendation-card";
import { getAdvancedRecommendation } from "../utils/advanced-recommendation";
import { getActiveFocusableIndex, isPointerOutsideTargets } from "../utils/pointerGuard";
import type { usePanelVisibility } from "../hooks/usePanelVisibility";
import type { useSquads } from "../hooks/useSquads";
import type { usePrivacyLedger } from "../hooks/usePrivacyLedger";
import type { useNotificationCenter } from "../hooks/useNotificationCenter";
import type { useScriptLibrary } from "../hooks/useScriptLibrary";
import type { useHardwareSpecs } from "../hooks/useHardwareSpecs";

type ViewMode = "terminal" | "canvas" | "list";

export interface AppHeaderModelBadgeMeta {
  fastTitle: string;
  heavyTitle?: string;
}

export interface AppHeaderRecoveryBadgeMeta {
  label: string;
  title: string;
  tone: "amber" | "cyan";
  emphasize: boolean;
}

export function getAppHeaderModelBadgeMeta(input: {
  fastEmpty: boolean;
  loadedModelId: string | null;
  heavyModelId: string | null;
}): AppHeaderModelBadgeMeta {
  return {
    fastTitle: input.fastEmpty
      ? "빠른 응답용 모델이 아직 준비되지 않았습니다. 모델 패널에서 모델을 [사용]하세요."
      : `빠른 응답 모델 준비됨 · ${input.loadedModelId}`,
    heavyTitle: input.heavyModelId ? `헤비 분석 모델 준비됨 · ${input.heavyModelId}` : undefined,
  };
}

export function getAppHeaderRecoveryBadgeMeta(input: {
  healingCount: number;
  unreadHealingCount: number;
}): AppHeaderRecoveryBadgeMeta | null {
  if (input.healingCount === 0) {
    return null;
  }

  if (input.unreadHealingCount > 0) {
    return {
      label: input.unreadHealingCount === 1 ? "복구 확인 필요" : `복구 확인 ${input.unreadHealingCount}건`,
      title: `미확인 자동 복구 흐름이 ${input.unreadHealingCount}건 있습니다. 이 배지를 눌러 알림 센터를 열고, 이어서 인스펙터 복구 흐름으로 바로 들어가세요.`,
      tone: "amber",
      emphasize: true,
    };
  }

  return {
    label: input.healingCount === 1 ? "복구 기록 있음" : `복구 기록 ${input.healingCount}건`,
    title: `최근 자동 복구 기록이 ${input.healingCount}건 남아 있습니다. 이 배지에서 알림 센터를 열고, 필요하면 인스펙터에서 같은 복구 흐름을 다시 확인하세요.`,
    tone: "cyan",
    emphasize: false,
  };
}

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
  description: string;
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

const POPUP_OFFSCREEN_POSITION: PopupPosition = { x: -9999, y: -9999 };

const clampValue = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

const POPUP_FALLBACK_WIDTH = {
  advanced: 256,
  notif: 320,
};
const POPUP_FALLBACK_HEIGHT_RATIO = 0.9;
const POPUP_MIN_HEIGHT = 96;
const POPUP_EDGE_GUTTER = 8;
const VIEWPORT_FALLBACK_GUTTER = 8;

type ViewportBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const getViewportBounds = (): ViewportBounds => {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const rawWidth = vv?.width;
  const rawHeight = vv?.height;
  const innerWidth = typeof window !== "undefined" ? window.innerWidth : 1;
  const innerHeight = typeof window !== "undefined" ? window.innerHeight : 1;
  const width =
    typeof rawWidth === "number" && Number.isFinite(rawWidth) && rawWidth > 1
      ? Math.min(rawWidth, innerWidth)
      : innerWidth;
  const height =
    typeof rawHeight === "number" && Number.isFinite(rawHeight) && rawHeight > 1
      ? Math.min(rawHeight, innerHeight)
      : innerHeight;
  const left = vv?.offsetLeft ?? 0;
  const top = vv?.offsetTop ?? 0;

  return {
    left: Number.isFinite(left) ? left : 0,
    top: Number.isFinite(top) ? top : 0,
    width: Math.max(1, Math.floor(Number.isFinite(width) ? width : 1)),
    height: Math.max(1, Math.floor(Number.isFinite(height) ? height : 1)),
  };
};

const getPopupMaxHeight = (viewportHeight: number): number => {
  const ratioHeight = Math.floor(viewportHeight * POPUP_FALLBACK_HEIGHT_RATIO);
  return Math.max(1, Math.min(ratioHeight, viewportHeight));
};

const getPopupAvailableSpace = (
  triggerRect: DOMRect,
  placement: PopupPlacement,
  viewport: ViewportBounds,
): number => {
  const spaceAbove = triggerRect.top - viewport.top - POPUP_EDGE_GUTTER;
  const spaceBelow = viewport.top + viewport.height - triggerRect.bottom - POPUP_EDGE_GUTTER;
  const preferredSpace = placement === "up" ? spaceAbove : spaceBelow;
  return Math.max(1, Math.floor(preferredSpace - 4));
};

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
  toolbarShowAdvanced, toggleToolbarAdvanced: _toggleToolbarAdvanced,
  showAdvancedOverflow, setShowAdvancedOverflow,
  loadWorkspaces,
  seenAdvancedFeatures, onMarkAdvancedSeen,
}) => {
  const isNew = (id: string) =>
    (NEW_ADVANCED_FEATURES as readonly string[]).includes(id) && !seenAdvancedFeatures.includes(id);
  const hasUnseenAdvanced = NEW_ADVANCED_FEATURES.some((id) => !seenAdvancedFeatures.includes(id));
  const unseenAdvancedCount = NEW_ADVANCED_FEATURES.reduce((acc, id) => (isNew(id) ? acc + 1 : acc), 0);
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
      description: "외부 도구와 모델 서버 연결을 관리합니다.",
      icon: (size) => <PlugZap size={size} />,
      active: showMcpPanel,
      onActivate: () => setShowMcpPanel(v => !v),
    },
    {
      id: "squad",
      label: "워크트리 스쿼드",
      description: "병렬 작업용 worktree와 squad 세션을 빠르게 엽니다.",
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
      description: "자동 수정 승인 기록을 학습 데이터로 쌓아봅니다.",
      icon: (size) => <Sparkles size={size} className={size <= SMALL_ICON_SIZE ? "text-cyan-300" : undefined} />,
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
      description: "명령과 변경 흐름을 시맨틱 히스토리로 훑어봅니다.",
      icon: (size) => <GitBranch size={size} />,
      active: showHistoryGraph,
      onActivate: () => setShowHistoryGraph(v => !v),
      tone: "cyan",
    },
    {
      id: "recall",
      label: "메모리 검색 (history/healing/memory)",
      description: "과거 명령, 승인, 메모를 한 번에 다시 찾습니다.",
      icon: (size) => <Library size={size} className={size <= SMALL_ICON_SIZE ? "text-cyan-300" : undefined} />,
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
      description: "내 승인 데이터로 로컬 모델 학습 흐름을 시작합니다.",
      icon: (size) => <Hammer size={size} className={size <= SMALL_ICON_SIZE ? "text-cyan-300" : undefined} />,
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
      label: "스킬 — 절차 라이브러리",
      description: "반복 작업 절차를 스킬로 저장하고 재사용합니다.",
      icon: (size) => <BookMarked size={size} className={size <= SMALL_ICON_SIZE ? "text-cyan-300" : undefined} />,
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
      description: "코드베이스를 인덱싱하고 맥락 검색 결과를 확인합니다.",
      icon: (size) => <Database size={size} />,
      active: showRagPanel,
      onActivate: () => setShowRagPanel(v => !v),
    },
    {
      id: "xllm",
      label: "xLLM 최적화 설정",
      description: "외부 추론 서버와 최적화 옵션을 조정합니다.",
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
  const activeAdvancedCount = advancedActions.reduce((acc, action) => acc + (action.active ? 1 : 0), 0);
  const advancedStatusSummary = [
    unseenAdvancedCount > 0 ? { short: `새 ${unseenAdvancedCount}`, long: `새 고급 기능 ${unseenAdvancedCount}개` } : null,
    activeAdvancedCount > 0 ? { short: `열림 ${activeAdvancedCount}`, long: `열린 고급 패널 ${activeAdvancedCount}개` } : null,
    squadStore.squads.length > 0 ? { short: `스쿼드 ${squadStore.squads.length}`, long: `활성 스쿼드 ${squadStore.squads.length}개` } : null,
  ].filter(Boolean) as Array<{ short: string; long: string }>;
  const advancedBadgeLabel = advancedStatusSummary.length > 0
    ? advancedStatusSummary.map((item) => item.long).join(", ")
    : undefined;
  const advancedStateSignals = [
    activeAdvancedCount > 0 ? "복귀 가능" : null,
    unseenAdvancedCount > 0 ? "새 기능 탐색" : null,
    squadStore.squads.length > 0 ? "스쿼드 진행 중" : null,
  ].filter(Boolean) as string[];
  const advancedStatusSummaryLabel = advancedStateSignals.length > 0
    ? advancedStateSignals.join(" · ")
    : advancedStatusSummary.map((item) => item.short).join(" · ");
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
  const recommendedOverflowActions = React.useMemo(() => {
    return orderedOverflowActions
      .map((action) => {
        const isActionNew = action.newFeatureId != null && isNew(action.newFeatureId);
        const isPinnedContext = action.id === "squad" && squadStore.squads.length > 0;
        const isStarter = ["recall", "rag", "skills"].includes(action.id);
        const { reason, score } = getAdvancedRecommendation({
          isNew: isActionNew,
          isActive: action.active,
          isPinnedContext,
          isStarter,
          hasBadge: Boolean(action.badge),
        });
        return { action, reason, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  }, [orderedOverflowActions, seenAdvancedFeatures, squadStore.squads.length]);
  const primaryAdvancedRecommendation = recommendedOverflowActions[0] ?? null;
  const advancedSummaryButtonLabel = primaryAdvancedRecommendation
    ? `추천 · ${primaryAdvancedRecommendation.action.label}`
    : advancedStatusSummaryLabel;
  const advancedSummaryButtonTitle = primaryAdvancedRecommendation
    ? [
        `지금 바로 열어볼 추천 기능: ${primaryAdvancedRecommendation.action.label}`,
        primaryAdvancedRecommendation.reason?.label
          ? `추천 이유: ${primaryAdvancedRecommendation.reason.label}`
          : "추천 이유: 현재 작업 흐름과 가까운 시작점",
        advancedStateSignals.length > 0
          ? `현재 상태: ${advancedStateSignals.join(", ")}`
          : undefined,
        advancedBadgeLabel,
      ].filter(Boolean).join("\n")
    : [
        advancedStateSignals.length > 0 ? `현재 상태: ${advancedStateSignals.join(", ")}` : undefined,
        advancedBadgeLabel,
      ].filter(Boolean).join("\n");
  const recoveryOverflowActions = React.useMemo(
    () => recommendedOverflowActions.filter(({ reason }) => reason?.label === "작업 중" || reason?.label === "복귀"),
    [recommendedOverflowActions],
  );
  const discoveryOverflowActions = React.useMemo(
    () => recommendedOverflowActions.filter(({ reason }) => reason?.label !== "작업 중" && reason?.label !== "복귀"),
    [recommendedOverflowActions],
  );


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
  const [advancedOverflowPosition, setAdvancedOverflowPosition] = React.useState<PopupPosition>(POPUP_OFFSCREEN_POSITION);
  const [notifCenterPosition, setNotifCenterPosition] = React.useState<PopupPosition>(POPUP_OFFSCREEN_POSITION);
  const [advancedOverflowReady, setAdvancedOverflowReady] = React.useState(false);
  const [notifCenterReady, setNotifCenterReady] = React.useState(false);
  const [notifCenterRecoveryFocus, setNotifCenterRecoveryFocus] = React.useState(false);
  const ADVANCED_OVERFLOW_PANEL_ID = "advanced-overflow-panel";
  const NOTIF_CENTER_PANEL_ID = "notification-center-panel";
  const POPUP_GUTTER = 8;
  const viewportHeight = typeof window === "undefined"
    ? 0
    : getViewportBounds().height;
  const POPUP_ESTIMATE_HEIGHT = Math.max(
    POPUP_MIN_HEIGHT,
    Math.floor(viewportHeight * POPUP_FALLBACK_HEIGHT_RATIO),
  );
  const popupFocusables = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
  const clampPopupHeight = (placement: PopupPlacement, triggerRect: DOMRect | null): number => {
    if (!triggerRect) return POPUP_ESTIMATE_HEIGHT;
    const viewport = getViewportBounds();
    const availableHeight = getPopupMaxHeight(viewport.height);
    const availableSpace = getPopupAvailableSpace(triggerRect, placement, viewport);
    const spaceAbove = triggerRect.top - viewport.top - POPUP_EDGE_GUTTER;
    const spaceBelow = viewport.top + viewport.height - triggerRect.bottom - POPUP_EDGE_GUTTER;

    // 위/아래 모두 최소 가시 높이 미만이면 트리거 일부를 겹치더라도
    // 뷰포트 안전 높이를 우선 사용해 "거의 안 보이는 잘림"을 피한다.
    if (spaceAbove < POPUP_MIN_HEIGHT && spaceBelow < POPUP_MIN_HEIGHT) {
      const viewportSafeHeight = Math.max(
        1,
        Math.floor(viewport.height - POPUP_EDGE_GUTTER * 2),
      );
      return Math.max(1, Math.min(availableHeight, viewportSafeHeight));
    }

    return Math.max(1, Math.min(availableHeight, availableSpace));
  };
  const measurePopupPlacement = React.useCallback((trigger: HTMLElement | null, panelRef?: React.RefObject<HTMLDivElement | null>): PopupPlacement => {
    if (typeof window === "undefined" || !trigger) return "down";

    const viewport = getViewportBounds();
    const rect = trigger.getBoundingClientRect();
    const spaceAbove = rect.top - viewport.top - POPUP_GUTTER;
    const spaceBelow = viewport.top + viewport.height - rect.bottom - POPUP_GUTTER;
    const panelRectHeight = panelRef?.current?.getBoundingClientRect().height;
    const availableHeight = getPopupMaxHeight(viewport.height);
    const minHeight = Math.min(POPUP_MIN_HEIGHT, availableHeight);
    const panelHeight = (typeof panelRectHeight === "number" && Number.isFinite(panelRectHeight) && panelRectHeight > 0)
      ? Math.min(panelRectHeight, availableHeight)
      : Math.min(POPUP_ESTIMATE_HEIGHT, availableHeight);
    const canOpenUp = spaceAbove >= panelHeight;
    const canOpenDown = spaceBelow >= panelHeight;

    if (spaceAbove < minHeight && spaceBelow < minHeight) {
      return spaceAbove > spaceBelow ? "up" : "down";
    }
    if (spaceAbove < minHeight) {
      return "down";
    }
    if (spaceBelow < minHeight) {
      return "up";
    }

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

    if (typeof window === "undefined") {
      return;
    }

    const viewport = getViewportBounds();
    const safeViewportWidth = Math.max(
      POPUP_EDGE_GUTTER * 2 + 1,
      viewport.width - POPUP_EDGE_GUTTER * 2,
    );
    const viewportSafeTop = viewport.top + VIEWPORT_FALLBACK_GUTTER;
    const viewportSafeLeft = viewport.left + VIEWPORT_FALLBACK_GUTTER;

    if (!options.trigger) {
      const clampedPanelWidth = Math.min(options.fallbackWidth, safeViewportWidth);
      const fallbackY = clampValue(
        viewportSafeTop,
        viewportSafeTop,
        Math.max(
          viewportSafeTop,
          viewport.top + viewport.height - nextHeight - POPUP_EDGE_GUTTER,
        ),
      );
      const fallbackX = clampValue(
        viewport.left + viewport.width - clampedPanelWidth - POPUP_EDGE_GUTTER,
        viewportSafeLeft,
        Math.max(
          viewportSafeLeft,
          viewport.left + viewport.width - clampedPanelWidth - POPUP_EDGE_GUTTER,
        ),
      );
      options.setPosition({
        x: fallbackX,
        y: fallbackY,
        width: clampedPanelWidth,
      });
      options.onReady();
      return;
    }

    const triggerRect = options.trigger.getBoundingClientRect();
    const panelRect = options.panelRef?.current?.getBoundingClientRect();
    const panelWidth = (panelRect?.width && Number.isFinite(panelRect.width) && panelRect.width > 0)
      ? panelRect.width
      : options.fallbackWidth;
    const clampedPanelWidth = Math.min(panelWidth, safeViewportWidth);
    const panelHeight = nextHeight;

    const nextY = placement === "up"
      ? triggerRect.top - panelHeight - POPUP_EDGE_GUTTER
      : triggerRect.bottom + POPUP_EDGE_GUTTER;

    const nextX = triggerRect.right - clampedPanelWidth;
    const maxTop = Math.max(
      viewportSafeTop,
      viewport.top + viewport.height - panelHeight - POPUP_EDGE_GUTTER,
    );
    const maxLeft = Math.max(
      viewportSafeLeft,
      viewport.left + viewport.width - clampedPanelWidth - POPUP_EDGE_GUTTER,
    );

    options.setPosition({
      x: clampValue(nextX, viewportSafeLeft, maxLeft),
      y: clampValue(nextY, viewportSafeTop, maxTop),
      width: clampedPanelWidth,
    });
    options.onReady();
  }, [measurePopupPlacement]);

  const advancedOverflowPanelStyle: React.CSSProperties = {
    left: `${advancedOverflowPosition.x}px`,
    top: `${advancedOverflowPosition.y}px`,
    width: typeof advancedOverflowPosition.width === "number" ? `${advancedOverflowPosition.width}px` : undefined,
    visibility: advancedOverflowReady ? "visible" : "hidden",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
  };

  const advancedOverflowPanelOrigin = advancedOverflowPlacement === "up" ? "bottom right" : "top right";
  const advancedOverflowPanelOffsetY = advancedOverflowPlacement === "up" ? 4 : -4;

  const notifCenterPanelStyle: React.CSSProperties = {
    left: `${notifCenterPosition.x}px`,
    top: `${notifCenterPosition.y}px`,
    width: typeof notifCenterPosition.width === "number" ? `${notifCenterPosition.width}px` : undefined,
    visibility: notifCenterReady ? "visible" : "hidden",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
  };
  const notifCenterPanelOrigin = notifCenterPlacement === "up" ? "bottom right" : "top right";
  const notifCenterPanelOffsetY = notifCenterPlacement === "up" ? 4 : -4;
  const modelBadgeMeta = getAppHeaderModelBadgeMeta({
    fastEmpty,
    loadedModelId,
    heavyModelId,
  });
  const isNarrowHeader = typeof window !== "undefined" && window.innerWidth < 1280;
  const isVeryNarrowHeader = typeof window !== "undefined" && window.innerWidth < 1120;
  const isUltraNarrowHeader = typeof window !== "undefined" && window.innerWidth < 980;
  const hideHardwareChip = typeof window !== "undefined" && window.innerWidth < 920;
  const activeViewLabel = VIEW_BUTTONS.find(({ mode }) => mode === viewMode)?.label ?? "터미널";
  const healingNotifications = notifCenter.notifications.filter((notification) => notification.type === "healing");
  const recoveryBadgeMeta = getAppHeaderRecoveryBadgeMeta({
    healingCount: healingNotifications.length,
    unreadHealingCount: healingNotifications.filter((notification) => !notification.read).length,
  });
  const recoveryBadgeLabel = !recoveryBadgeMeta
    ? null
    : isUltraNarrowHeader
      ? "복구"
      : isVeryNarrowHeader
      ? recoveryBadgeMeta.emphasize
        ? "복구 확인"
        : "복구 기록"
      : recoveryBadgeMeta.label;

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
    const currentIndex = getActiveFocusableIndex(focusables, active);
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
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return false;

    const focusables = getPopupElements(panelRef);
    if (focusables.length === 0) return false;

    const active = document.activeElement;
    const currentIndex = getActiveFocusableIndex(focusables, active);
    const nextIndex = (() => {
      if (e.key === "Home") return 0;
      if (e.key === "End") return focusables.length - 1;
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
    setShowAdvancedOverflow(false);
    setAdvancedOverflowReady(false);
    requestAnimationFrame(() => {
      advancedOverflowButtonRef.current?.focus();
    });
  }, [setShowAdvancedOverflow]);

  const closeNotifCenter = React.useCallback(() => {
    setShowNotifCenter(false);
    setNotifCenterReady(false);
    setNotifCenterRecoveryFocus(false);
    requestAnimationFrame(() => {
      notifCenterButtonRef.current?.focus();
    });
  }, [setShowNotifCenter]);

  const toggleAdvancedOverflow = React.useCallback(() => {
    setShowNotifCenter(false);
    setNotifCenterReady(false);
    setShowAdvancedOverflow((prev) => {
      const next = !prev;
      if (next) {
        setAdvancedOverflowReady(false);
        setAdvancedOverflowPosition(POPUP_OFFSCREEN_POSITION);
      }
      return next;
    });
  }, [setShowAdvancedOverflow, setShowNotifCenter]);

  const toggleNotifCenter = React.useCallback(() => {
    setShowAdvancedOverflow(false);
    setAdvancedOverflowReady(false);
    setNotifCenterRecoveryFocus(false);
    setShowNotifCenter((prev) => {
      const next = !prev;
      if (next) {
        setNotifCenterReady(false);
        setNotifCenterPosition(POPUP_OFFSCREEN_POSITION);
      }
      if (next) notifCenter.markAllRead();
      return next;
    });
  }, [notifCenter, setShowAdvancedOverflow, setShowNotifCenter]);

  React.useLayoutEffect(() => {
    if (!showAdvancedOverflow) return;

    const handleClose = (e: PointerEvent) => {
      const target = e.target;
      if (isPointerOutsideTargets(target, [advancedOverflowRef.current, advancedOverflowPanelRef.current])) {
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

  React.useLayoutEffect(() => {
    if (!showAdvancedOverflow) return;

    let raf = requestAnimationFrame(() => updatePopupPlacement({
      trigger: advancedOverflowButtonRef.current,
      panelRef: advancedOverflowPanelRef,
      setPlacement: setAdvancedOverflowPlacement,
      setMaxHeight: setAdvancedOverflowMaxHeight,
      setPosition: setAdvancedOverflowPosition,
      fallbackWidth: POPUP_FALLBACK_WIDTH.advanced,
      onReady: () => {
        setAdvancedOverflowReady(true);
      },
    }));

    const updatePlacement = () => {
      updatePopupPlacement({
        trigger: advancedOverflowButtonRef.current,
        panelRef: advancedOverflowPanelRef,
        setPlacement: setAdvancedOverflowPlacement,
        setMaxHeight: setAdvancedOverflowMaxHeight,
        setPosition: setAdvancedOverflowPosition,
        fallbackWidth: POPUP_FALLBACK_WIDTH.advanced,
        onReady: () => {
          setAdvancedOverflowReady(true);
        },
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
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [showAdvancedOverflow, updatePopupPlacement]);

  React.useLayoutEffect(() => {
    if (!showNotifCenter) return;

    const handleClose = (e: PointerEvent) => {
      const target = e.target;
      if (isPointerOutsideTargets(target, [notifCenterPopupRef.current, notifCenterPanelRef.current])) {
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

  React.useLayoutEffect(() => {
    if (!showNotifCenter) return;

    let raf = requestAnimationFrame(() => updatePopupPlacement({
      trigger: notifCenterButtonRef.current,
      panelRef: notifCenterPanelRef,
      setPlacement: setNotifCenterPlacement,
      setMaxHeight: setNotifCenterMaxHeight,
      setPosition: setNotifCenterPosition,
      fallbackWidth: POPUP_FALLBACK_WIDTH.notif,
      onReady: () => {
        setNotifCenterReady(true);
      },
    }));

    const updatePlacement = () => {
      updatePopupPlacement({
        trigger: notifCenterButtonRef.current,
        panelRef: notifCenterPanelRef,
        setPlacement: setNotifCenterPlacement,
        setMaxHeight: setNotifCenterMaxHeight,
        setPosition: setNotifCenterPosition,
        fallbackWidth: POPUP_FALLBACK_WIDTH.notif,
        onReady: () => {
          setNotifCenterReady(true);
        },
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
      cancelAnimationFrame(raf);
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
        {!hideHardwareChip && (
          <div data-tauri-drag-region className="flex items-center gap-1.5 text-xs text-white/55 font-medium shrink-0 whitespace-nowrap">
            <Cpu size={12} />
            {specsLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : specs ? (
              <span title={specs.recommendation_reason}>
                {(() => {
                  if (specs.gpu_vram_gb && specs.gpu_vram_gb > 0) {
                    return isVeryNarrowHeader ? `${specs.gpu_vram_gb}G` : `GPU ${specs.gpu_vram_gb}G`;
                  }
                  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
                  if (specs.gpu_type === "integrated" || isMac) {
                    return isVeryNarrowHeader ? `${specs.total_memory_gb}G` : `통합 ${specs.total_memory_gb}G`;
                  }
                  return isVeryNarrowHeader ? `${specs.total_memory_gb}G` : `메모리 ${specs.total_memory_gb}G`;
                })()}
              </span>
            ) : null}
          </div>
        )}

        <div className="flex items-center gap-1.5">
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
          {!isVeryNarrowHeader && (
            <span
              className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-white/62 whitespace-nowrap"
              title={`현재 뷰: ${activeViewLabel}`}
            >
              {isNarrowHeader ? activeViewLabel : `뷰 · ${activeViewLabel}`}
            </span>
          )}
        </div>
      </div>

      <div data-tauri-drag-region className="flex-1 h-full" />

      <div data-tauri-drag-region className="flex items-center gap-1 min-w-0">
        <div data-tauri-drag-region className="flex items-center gap-1 min-w-0 overflow-hidden mr-1">
          <div
            data-tauri-drag-region
            className={`text-sm px-2 py-1 rounded-md truncate max-w-[148px] border ${
              fastEmpty
                ? "bg-white/[0.04] border-white/10 text-white/35 italic"
                : "bg-emerald-400/10 border-emerald-400/25 text-emerald-300"
            }`}
            title={modelBadgeMeta.fastTitle}
          >
            {isUltraNarrowHeader
              ? (fastEmpty ? "없음" : "응답")
              : isNarrowHeader
                ? (fastEmpty ? "응답 없음" : "응답 준비")
                : (fastEmpty ? "빠른 응답 없음" : "빠른 응답 준비")}
          </div>
          {heavyEnabled && heavy && !isVeryNarrowHeader && (
            <div
              data-tauri-drag-region
              className="text-sm px-2 py-1 rounded-md bg-amber-400/10 border border-amber-400/25 text-amber-200 truncate max-w-[148px]"
              title={modelBadgeMeta.heavyTitle}
            >
              {isNarrowHeader ? "분석 준비" : "헤비 분석 준비"}
            </div>
          )}
        </div>

        <PrivacyLedgerBadge
          state={privacyLedger.state}
          isAllOnDevice={privacyLedger.isAllOnDevice}
          onReset={privacyLedger.reset}
        />
        {recoveryBadgeMeta && (
          <button
            type="button"
            onClick={() => {
              setShowAdvancedOverflow(false);
              setAdvancedOverflowReady(false);
              setNotifCenterRecoveryFocus(true);
              setShowNotifCenter(true);
              setNotifCenterReady(false);
              setNotifCenterPosition(POPUP_OFFSCREEN_POSITION);
            }}
            className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border truncate max-w-[132px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              recoveryBadgeMeta.tone === "amber"
                ? recoveryBadgeMeta.emphasize
                  ? "bg-amber-400/16 border-amber-300/40 text-amber-50 shadow-[0_0_0_1px_rgba(251,191,36,0.08),0_10px_24px_rgba(245,158,11,0.16)] hover:bg-amber-400/24"
                  : "bg-amber-400/10 border-amber-400/25 text-amber-100 hover:bg-amber-400/18"
                : "bg-cyan-400/10 border-cyan-300/25 text-cyan-100 hover:bg-cyan-400/18"
            }`}
            title={recoveryBadgeMeta.title}
            aria-label={`${recoveryBadgeLabel ?? recoveryBadgeMeta.label} 열기`}
          >
            {recoveryBadgeMeta.emphasize && (
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-200" />
              </span>
            )}
            {recoveryBadgeLabel ?? recoveryBadgeMeta.label}
          </button>
        )}
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
          <div className="relative flex items-center gap-1.5" ref={advancedOverflowRef}>
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
            {!compactMode && advancedStatusSummaryLabel && (
              <button
                type="button"
                onClick={toggleAdvancedOverflow}
                aria-label={`고급 기능 요약: ${advancedSummaryButtonTitle ?? advancedBadgeLabel ?? "고급 기능 메뉴"}`}
                title={advancedSummaryButtonTitle}
                className={`inline-flex h-7 max-w-[148px] items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  primaryAdvancedRecommendation
                    ? "border-cyan-300/22 bg-cyan-400/[0.14] text-cyan-50 hover:border-cyan-200/30 hover:bg-cyan-400/[0.2] hover:text-white"
                    : "border-white/10 bg-white/[0.06] text-white/68 hover:border-white/16 hover:bg-white/[0.1] hover:text-white/88"
                }`}
              >
                {primaryAdvancedRecommendation ? <Sparkles size={12} className="shrink-0 text-cyan-200" /> : null}
                <span className="truncate">{advancedSummaryButtonLabel}</span>
              </button>
            )}
            {(showAdvancedOverflow && typeof document !== "undefined") ? createPortal(
              <motion.div
                ref={advancedOverflowPanelRef}
                id={ADVANCED_OVERFLOW_PANEL_ID}
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
                  opacity: 1,
                  backgroundColor: "#0f1620",
                }}
                className="fixed z-[2200] w-64 overflow-y-auto rounded-xl border border-white/[0.16] bg-[#111a24] shadow-xl p-2 space-y-0.5 text-white pointer-events-auto"
              >
                {hasUnseenAdvanced && (
                  <div className="px-2 py-1.5 mb-1 border-b border-white/10">
                    <p className="text-xs font-semibold tracking-[0.06em] text-amber-300 uppercase">
                      NEW FEATURE
                    </p>
                    <p className="text-xs text-white/65 mt-0.5">
                      신규 기능 {unseenAdvancedCount}개를 확인해 보세요.
                    </p>
                  </div>
                )}
                {recommendedOverflowActions.length > 0 && (
                  <div className="px-2 py-1.5 mb-1 border-b border-white/10">
                    <SectionIntroHeader
                      title="추천 시작점"
                      description="지금 바로 이어갈 만한 고급 기능만 먼저 추렸습니다."
                      titleClassName="text-[11px] font-semibold tracking-[0.06em] text-cyan-300 uppercase"
                      descriptionClassName="mt-1 text-[11px] text-white/52"
                      aside={<StatusBadge tone="neutral">{recommendedOverflowActions.length}개 항목</StatusBadge>}
                    />
                    {(recoveryOverflowActions.length > 0 || discoveryOverflowActions.length > 0) && (
                      <div className="mt-2 space-y-2">
                        {recoveryOverflowActions.length > 0 && (
                          <div className="rounded-xl border border-emerald-300/14 bg-emerald-400/[0.08] px-2.5 py-2">
                            <SectionIntroHeader
                              title="최근 작업 복귀"
                              description="이미 열려 있거나 직전 흐름과 이어지는 기능을 먼저 보여줍니다."
                              titleClassName="text-[10px] font-semibold tracking-[0.06em] text-emerald-200 uppercase"
                              descriptionClassName="mt-1 text-[10px] text-emerald-50/68"
                              aside={<StatusBadge tone="neutral">{recoveryOverflowActions.length}개</StatusBadge>}
                            />
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {recoveryOverflowActions.map(({ action, reason }) => (
                                <StatusBadge key={`advanced-recovery-${action.id}`} tone="neutral">
                                  {action.label}{reason ? ` · ${reason.label}` : ""}
                                </StatusBadge>
                              ))}
                            </div>
                          </div>
                        )}
                        {discoveryOverflowActions.length > 0 && (
                          <div className="rounded-xl border border-amber-300/14 bg-amber-400/[0.08] px-2.5 py-2">
                            <SectionIntroHeader
                              title="새 기능 탐색"
                              description="이번 세션에서 아직 열지 않은 신규/시작점 기능을 먼저 둘러봅니다."
                              titleClassName="text-[10px] font-semibold tracking-[0.06em] text-amber-200 uppercase"
                              descriptionClassName="mt-1 text-[10px] text-amber-50/68"
                              aside={<StatusBadge tone="neutral">{discoveryOverflowActions.length}개</StatusBadge>}
                            />
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {discoveryOverflowActions.map(({ action, reason }) => (
                                <StatusBadge key={`advanced-discovery-${action.id}`} tone="neutral">
                                  {action.label}{reason ? ` · ${reason.label}` : ""}
                                </StatusBadge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-2 space-y-2">
                      {recommendedOverflowActions.map(({ action, reason }, index) => {
                        const isPrimaryRecommendation = index === 0;
                        const presentation = getAdvancedRecommendationCardPresentation(index, action.description, reason?.tone);

                        const cardClassName = isPrimaryRecommendation
                          ? `${presentation.className} border-cyan-300/24 bg-cyan-400/[0.14] shadow-[0_12px_32px_rgba(34,211,238,0.14)]`
                          : `${presentation.className} border-white/8 bg-white/[0.04] opacity-90`;

                        return (
                          <RecommendationCard
                            key={`advanced-recommend-${action.id}`}
                            onClick={() => {
                              setShowAdvancedOverflow(false);
                              action.onActivate();
                            }}
                            icon={action.icon(SMALL_ICON_SIZE)}
                            title={action.label}
                            description={presentation.description}
                            badges={(
                              <>
                                <StatusBadge tone={presentation.priorityTone}>
                                  {index + 1}순위
                                </StatusBadge>
                                {reason ? <RecommendationReasonBadge label={reason.label} tone={reason.tone} /> : null}
                              </>
                            )}
                            actionAlign="center"
                            surfaceTone={presentation.surfaceTone}
                            density="compact"
                            className={cardClassName}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
                {orderedOverflowActions.length > 0 && (
                  <div className="px-2 py-1.5 mb-1 border-b border-white/8">
                    <SectionIntroHeader
                      title="전체 고급 기능"
                      description="추천 시작점 외의 연결, 설정, 운영 흐름을 여기서 이어갑니다."
                      titleClassName="text-[11px] font-semibold tracking-[0.06em] text-white/58 uppercase"
                      descriptionClassName="mt-1 text-[11px] text-white/44"
                      aside={(
                        <div className="flex items-center gap-1.5">
                          <StatusBadge tone="neutral">{orderedOverflowActions.length}개 항목</StatusBadge>
                          <StatusBadge tone="neutral">도구 탐색</StatusBadge>
                        </div>
                      )}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                      <StatusBadge tone="neutral">연결 설정</StatusBadge>
                      <StatusBadge tone="neutral">운영 점검</StatusBadge>
                      <StatusBadge tone="neutral">상태 요약</StatusBadge>
                      <StatusBadge tone="neutral">확장 도구</StatusBadge>
                      <span className="text-[10px] text-white/34">
                        연결, 운영, 상태 요약, 확장 탐색을 한 흐름으로 이어갑니다.
                      </span>
                    </div>
                    <div
                      className={`mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-2 ${
                        privacyLedger.state.total === 0
                          ? "border-white/8 bg-white/[0.025]"
                          : privacyLedger.isAllOnDevice
                            ? "border-cyan-300/18 bg-cyan-400/[0.07]"
                            : "border-amber-300/18 bg-amber-400/[0.08]"
                      }`}
                    >
                      <StatusBadge tone="neutral">
                        {privacyLedger.state.total === 0
                          ? "호출 대기"
                          : privacyLedger.isAllOnDevice
                            ? "로컬 우선"
                            : `클라우드 ${privacyLedger.state.onlineCalls}건`}
                      </StatusBadge>
                      <span
                        className={`text-[10px] ${
                          privacyLedger.state.total === 0
                            ? "text-white/36"
                            : privacyLedger.isAllOnDevice
                              ? "text-cyan-100/76"
                              : "text-amber-100/78"
                        }`}
                      >
                        {privacyLedger.state.total === 0
                          ? "AI 호출이 시작되면 로컬/클라우드 흐름을 여기서 함께 점검합니다."
                          : privacyLedger.isAllOnDevice
                            ? "현재 세션은 온디바이스 중심으로 이어지고 있습니다."
                            : "현재 세션은 클라우드가 섞인 라우팅을 함께 점검합니다."}
                      </span>
                    </div>
                  </div>
                )}
                {[
                  {
                    title: "연결 · 운영",
                    description: "서버 연결, 코드 검색, 기록 점검처럼 기반 흐름을 먼저 확인합니다.",
                    ids: ["mcp", "xllm", "rag", "history", "squad"],
                  },
                  {
                    title: "확장 · 학습",
                    description: "메모리, 자동화, 학습, 스킬 같은 확장 흐름을 이어갑니다.",
                    ids: ["healing", "recall", "lora", "skills"],
                  },
                ].map((group) => {
                  const groupActions = orderedOverflowActions.filter((action) => group.ids.includes(action.id));
                  if (groupActions.length === 0) return null;

                  return (
                    <div key={`advanced-group-${group.title}`} className="mb-1">
                      <div className="px-2 py-1">
                        <SectionIntroHeader
                          title={group.title}
                          description={group.description}
                          titleClassName="text-[10px] font-semibold tracking-[0.06em] text-white/54 uppercase"
                          descriptionClassName="mt-1 text-[10px] text-white/36"
                          aside={(
                            <div className="flex items-center gap-1.5">
                              <StatusBadge tone="neutral">{groupActions.length}개</StatusBadge>
                              <StatusBadge tone="neutral">
                                {group.title === "연결 · 운영" ? "기반 우선" : "확장 흐름"}
                              </StatusBadge>
                            </div>
                          )}
                        />
                      </div>
                      {groupActions.map((action, index) => (
                        <AdvancedRow
                          key={`advanced-overflow-${action.id}`}
                          icon={action.icon(SMALL_ICON_SIZE)}
                          label={action.label}
                          description={action.description}
                          statusLabel={action.active ? "열림" : action.badge ? "활성" : index === 0 ? "먼저" : index === 1 ? "다음" : "열기"}
                          priority={index === 0 ? "primary" : index === 1 ? "secondary" : "default"}
                          badge={action.badge}
                          isNew={action.newFeatureId ? isNew(action.newFeatureId) : false}
                          onClick={() => {
                            setShowAdvancedOverflow(false);
                            action.onActivate();
                          }}
                        />
                      ))}
                    </div>
                  );
                })}
                {compactMode && (
                  <>
                    <p className="px-2 py-1.5 text-xs font-semibold tracking-[0.06em] text-white/50 uppercase">
                      QUICK ACCESS
                    </p>
                    {compactQuickAccessActions.map((action) => (
                      <AdvancedRow
                        key={`quick-access-${action.id}`}
                        icon={action.icon(SMALL_ICON_SIZE)}
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
                  <p className="px-2 py-1.5 text-xs text-white/45">
                    고급 기능은 이 메뉴에서 관리됩니다.
                  </p>
                )}
              </motion.div>,
              document.body,
            ) : null}
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
          {showNotifCenter && createPortal(
            <AnimatePresence>
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
                  opacity: 1,
                }}
                className="fixed w-80 h-fit z-[2200] pointer-events-auto bg-[#111a24] border border-white/[0.16] rounded-xl shadow-xl"
              >
                <NotificationCenter
                  notifications={notifCenter.notifications}
                  unreadCount={notifCenter.unreadCount}
                  maxHeight={notifCenterMaxHeight}
                  onMarkAllRead={notifCenter.markAllRead}
                  onMarkByIds={notifCenter.markByIds}
                  onDismissByIds={notifCenter.dismissByIds}
                  onDismiss={notifCenter.dismiss}
                  onClear={notifCenter.clear}
                  panelId={NOTIF_CENTER_PANEL_ID}
                  onOpenRecoveryFlow={() => {
                    closeNotifCenter();
                    if (!showInspector) {
                      onToggleInspector();
                    }
                  }}
                  highlightRecovery={notifCenterRecoveryFocus}
                  autoFocusRecoveryAction={notifCenterRecoveryFocus}
                  onClose={closeNotifCenter}
                  closeOnDocument={false}
                />
              </motion.div>
            </AnimatePresence>,
            document.body,
          )}
        </div>
      </div>
    </header>
  );
};

const AdvancedRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  description?: string;
  statusLabel?: string;
  priority?: "default" | "primary" | "secondary";
  /** 카운트 dot — squad 활성 등 상태성 마커. emerald. */
  badge?: boolean;
  /** Phase 126: "처음 보는 기능" 마커 — 클릭 시 영구 dismiss. amber + "NEW" 라벨로 더 눈에 띄게. */
  isNew?: boolean;
  onClick: () => void;
}> = ({ icon, label, description, statusLabel, priority = "default", badge, isNew, onClick }) => (
  <button
    type="button"
    role="menuitem"
    aria-label={label}
    onClick={onClick}
    className={
      priority === "primary"
        ? "w-full flex items-start gap-2 rounded-xl border border-cyan-300/14 bg-cyan-400/[0.06] px-2.5 py-2 text-sm text-white/82 hover:text-white hover:border-cyan-300/22 hover:bg-cyan-400/[0.1] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        : priority === "secondary"
          ? "w-full flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-sm text-white/80 hover:text-white hover:border-white/16 hover:bg-white/[0.07] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          : "w-full flex items-start gap-2 px-2 py-1.5 rounded text-sm text-white/75 hover:text-white hover:bg-white/[0.07] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    }
  >
    <span className={priority === "primary" ? "mt-0.5 shrink-0 text-cyan-100/72" : priority === "secondary" ? "mt-0.5 shrink-0 text-white/62" : "mt-0.5 shrink-0 text-white/50"}>{icon}</span>
    <span className="min-w-0 flex-1 text-left">
      <span className={priority === "primary" ? "block truncate font-medium text-white/88" : priority === "secondary" ? "block truncate font-medium text-white/82" : "block truncate"}>{label}</span>
      {description && (
        <span
          aria-hidden="true"
          className={
            priority === "primary"
              ? "mt-0.5 block text-xs leading-5 text-cyan-100/52"
              : priority === "secondary"
                ? "mt-0.5 block text-xs leading-5 text-white/48"
                : "mt-0.5 block text-xs leading-5 text-white/42"
          }
        >
          {description}
        </span>
      )}
    </span>
    {isNew && (
      <span aria-hidden="true" className="text-xs font-semibold tracking-wide px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
        NEW
      </span>
    )}
    {!isNew && statusLabel && (
      <span
        aria-hidden="true"
        className={
          statusLabel === "열림" || statusLabel === "활성"
            ? "shrink-0 rounded-full border border-emerald-300/18 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200/90"
            : priority === "primary"
              ? "shrink-0 rounded-full border border-cyan-300/18 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100/90"
              : priority === "secondary"
                ? "shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/58"
                : "shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-white/48"
        }
      >
        {statusLabel}
      </span>
    )}
    {badge && !isNew && !statusLabel && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />}
  </button>
);

export default AppHeader;
