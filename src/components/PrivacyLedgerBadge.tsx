// Phase 115 — Privacy Ledger 헤더 배지.
// 세션의 AI 호출 라우팅을 가시화. 외부 네트워크로 한 번도 안 나갔으면 🔒,
// 한 번이라도 나갔으면 ☁️. 클릭하면 백엔드별 통계 + 마지막 호출 정보 popover.

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Cloud, ShieldCheck, RotateCcw, X } from "lucide-react";
import { motion } from "framer-motion";
import type { LedgerState, Backend } from "../hooks/usePrivacyLedger";
import { cn } from "@/lib/utils";

interface Props {
  state: LedgerState;
  isAllOnDevice: boolean;
  onReset: () => void;
}

const BACKEND_LABEL: Record<Backend, string> = {
  embedded: "임베디드 mistralrs",
  ollama: "Ollama",
  xllm: "xLLM (TabbyAPI)",
  gemini: "Gemini Cloud",
};

const BACKEND_DOT: Record<Backend, string> = {
  embedded: "bg-emerald-400",
  ollama: "bg-emerald-400",
  xllm: "bg-amber-300",
  gemini: "bg-rose-400",
};

function pct(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function avg(total: number, count: number): string {
  if (count === 0) return "—";
  return `${Math.round(total / count)}`;
}

type LedgerTone = "neutral" | "ondevice" | "mixed" | "cloudHeavy";

const TONE_CLASS: Record<LedgerTone, string> = {
  neutral: "bg-white/5 text-white/40 border-white/10",
  ondevice: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  mixed: "bg-amber-300/10 text-amber-200 border-amber-300/30",
  cloudHeavy: "bg-rose-400/10 text-rose-300 border-rose-400/30",
};
const popupFocusables =
  "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
type PopupPlacement = "down" | "up";
type PopupPosition = { x: number; y: number; width?: number };
type ViewportBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const POPUP_FALLBACK_WIDTH = 288; // w-72
const POPUP_FALLBACK_HEIGHT_RATIO = 0.9;
const POPUP_EDGE_GUTTER = 8;
const POPUP_MIN_HEIGHT = 96;
const POPUP_OFFSCREEN_POSITION: PopupPosition = { x: -9999, y: -9999 };

const clampValue = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

const getViewportBounds = (): ViewportBounds => {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const rawWidth = vv?.width;
  const rawHeight = vv?.height;
  const width =
    typeof rawWidth === "number" && Number.isFinite(rawWidth) && rawWidth > 1
      ? rawWidth
      : window.innerWidth;
  const height =
    typeof rawHeight === "number" && Number.isFinite(rawHeight) && rawHeight > 1
      ? rawHeight
      : window.innerHeight;
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
  return Math.max(1, Math.floor(viewportHeight * POPUP_FALLBACK_HEIGHT_RATIO));
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

function classify(
  state: LedgerState,
  isAllOnDevice: boolean,
): {
  tone: LedgerTone;
  label: string;
  tooltip: string;
} {
  if (state.total === 0) {
    return {
      tone: "neutral",
      label: "AI 호출 없음",
      tooltip: "이번 세션에 AI 호출이 아직 없습니다 — 클릭으로 패널 열기",
    };
  }
  if (isAllOnDevice) {
    return {
      tone: "ondevice",
      label: "100% On-Device",
      tooltip: "이번 세션의 모든 AI 호출이 로컬에서 처리됐습니다",
    };
  }
  const ratio = state.onlineCalls / state.total;
  return {
    tone: ratio >= 0.5 ? "cloudHeavy" : "mixed",
    label: `Cloud ${Math.round(ratio * 100)}%`,
    tooltip: `클라우드 호출 ${state.onlineCalls}/${state.total}건 — 클릭으로 상세보기`,
  };
}

const PrivacyLedgerBadge: React.FC<Props> = ({
  state,
  isAllOnDevice,
  onReset,
}) => {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<PopupPlacement>("down");
  const [popupPos, setPopupPos] = useState<PopupPosition>({
    ...POPUP_OFFSCREEN_POSITION,
    width: 288,
  });
  const [popupMaxHeight, setPopupMaxHeight] = useState(() => {
    const viewportHeight = getViewportBounds().height;
    return getPopupMaxHeight(viewportHeight);
  });
  const popoverId = React.useId();
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  const clampPopupHeight = (
    placement: PopupPlacement,
    triggerRect: DOMRect | null,
  ): number => {
    if (!triggerRect) return getPopupMaxHeight(getViewportBounds().height);
    const viewport = getViewportBounds();
    const availableHeight = getPopupMaxHeight(viewport.height);
    const availableSpace = getPopupAvailableSpace(triggerRect, placement, viewport);
    return Math.max(1, Math.min(availableHeight, availableSpace));
  };

  const measurePlacement = React.useCallback(
    (trigger: HTMLElement | null): PopupPlacement => {
      if (typeof window === "undefined" || !trigger) {
        return "down";
      }
      const viewport = getViewportBounds();
      const triggerRect = trigger.getBoundingClientRect();
      const panelRectHeight = popRef.current?.getBoundingClientRect().height;
      const availableHeight = getPopupMaxHeight(viewport.height);
      const minHeight = Math.min(POPUP_MIN_HEIGHT, availableHeight);
      const panelHeight =
        typeof panelRectHeight === "number" &&
        Number.isFinite(panelRectHeight) &&
        panelRectHeight > 0
          ? Math.min(panelRectHeight, getPopupMaxHeight(viewport.height), availableHeight)
          : Math.min(getPopupMaxHeight(viewport.height), availableHeight);
      const spaceAbove = triggerRect.top - viewport.top - POPUP_EDGE_GUTTER;
      const spaceBelow = viewport.top + viewport.height - triggerRect.bottom - POPUP_EDGE_GUTTER;
      const canOpenUp =
        spaceAbove >= panelHeight;
      const canOpenDown =
        spaceBelow >= panelHeight;

      if (canOpenUp && canOpenDown) {
        return spaceAbove > spaceBelow ? "up" : "down";
      }
      if (canOpenUp) return "up";
      if (canOpenDown) return "down";

      if (spaceAbove < minHeight && spaceBelow < minHeight) {
        return spaceAbove > spaceBelow ? "up" : "down";
      }
      if (spaceAbove < minHeight) {
        return "down";
      }
      if (spaceBelow < minHeight) {
        return "up";
      }
      return spaceAbove > spaceBelow ? "up" : "down";
    },
    [],
  );

  const getPopupElements = () => {
    if (!popRef.current) return [];
    return Array.from(
      popRef.current.querySelectorAll<HTMLElement>(popupFocusables),
    );
  };

  const closePopover = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handlePopupTabTrap = (e: React.KeyboardEvent): boolean => {
    if (e.key !== "Tab") return false;

    const focusables = getPopupElements();
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

  const handlePopupArrowNav = (e: React.KeyboardEvent): boolean => {
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    )
      return false;

    const focusables = getPopupElements();
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
      if (e.key === "Home") {
        return 0;
      }
      if (e.key === "End") {
        return focusables.length - 1;
      }
      return (currentIndex - 1 + focusables.length) % focusables.length;
    })();

    e.preventDefault();
    focusables[nextIndex]?.focus();
    return true;
  };

  const updatePlacement = React.useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const nextPlacement = measurePlacement(triggerRef.current);
    const nextHeight = clampPopupHeight(nextPlacement, triggerRect);
    const panelHeight = nextHeight;
    const panelWidth = Math.min(
      Math.max(
        POPUP_FALLBACK_WIDTH,
        popRef.current?.getBoundingClientRect().width ?? POPUP_FALLBACK_WIDTH,
      ),
      Math.max(
        POPUP_EDGE_GUTTER * 2 + 1,
        getViewportBounds().width - POPUP_EDGE_GUTTER * 2,
      ),
    );
    const viewport = getViewportBounds();
    const viewportTop = viewport.top;
    const viewportLeft = viewport.left;
    const nextY =
      nextPlacement === "up"
        ? triggerRect.top - nextHeight - POPUP_EDGE_GUTTER
        : triggerRect.bottom + POPUP_EDGE_GUTTER;
    const nextX = triggerRect.right - panelWidth;
    const safeTop = viewportTop + POPUP_EDGE_GUTTER;
    const safeLeft = viewportLeft + POPUP_EDGE_GUTTER;
    const clampedX = clampValue(
      nextX,
      safeLeft,
      Math.max(
        safeLeft,
        viewportLeft + viewport.width - panelWidth - POPUP_EDGE_GUTTER,
      ),
    );
    const clampedY = clampValue(
      nextY,
      safeTop,
      Math.max(
        safeTop,
        viewport.top + viewport.height - panelHeight - POPUP_EDGE_GUTTER,
      ),
    );
    setPlacement(nextPlacement);
    setPopupPos({ x: clampedX, y: clampedY, width: panelWidth });
    setPopupMaxHeight(nextHeight);
  }, [measurePlacement]);

  React.useLayoutEffect(() => {
    if (!open) return;

    updatePlacement();

    let raf = requestAnimationFrame(updatePlacement);
    return () => cancelAnimationFrame(raf);
  }, [open, updatePlacement]);

  const openPopover = React.useCallback(() => {
    setPopupPos((prev) => ({ ...POPUP_OFFSCREEN_POSITION, width: prev.width }));
    setOpen(true);
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (popRef.current && !popRef.current.contains(target)) &&
        (triggerRef.current && !triggerRef.current.contains(target))
      ) {
        closePopover();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closePopover();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler, { capture: true });
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler, { capture: true });
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, closePopover, updatePlacement]);

  useEffect(() => {
    if (!open) return;
    const focusables = getPopupElements();
    if (focusables.length === 0) return;
    focusables[0]?.focus();
  }, [open]);

  const { tone, label, tooltip: tooltipText } = classify(state, isAllOnDevice);
  const Icon = tone === "ondevice" || tone === "neutral" ? ShieldCheck : Cloud;
  const popupYOffset = placement === "up" ? 4 : -4;
  const popupOrigin = placement === "up" ? "bottom right" : "top right";
  const popupStyle: React.CSSProperties = {
    left: `${popupPos.x}px`,
    top: `${popupPos.y}px`,
    width:
      typeof popupPos.width === "number" ? `${popupPos.width}px` : undefined,
    visibility: popupPos.x > -9000 && popupPos.y > -9000 ? "visible" : "hidden",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
  };
  const popover = (
    <motion.div
      onKeyDown={(e) => {
        const handled = handlePopupTabTrap(e) || handlePopupArrowNav(e);
        if (handled) {
          e.stopPropagation();
        }
      }}
      key="privacy-ledger-pop"
      ref={popRef}
      initial={{ opacity: 0, scale: 0.96, y: popupYOffset }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: popupYOffset }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      style={{
        ...popupStyle,
        transformOrigin: popupOrigin,
        maxHeight: `${popupMaxHeight}px`,
        opacity: 1,
        backgroundColor: "#161b22",
      }}
      className="fixed w-72 flex flex-col border border-white/12 rounded-xl shadow-2xl z-[2200] overflow-hidden"
      aria-label="Privacy Ledger 상세"
      id={popoverId}
      role="dialog"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
          <ShieldCheck size={12} />
          <span>Privacy Ledger</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={closePopover}
            aria-label="Privacy Ledger 상세 닫기"
            className="inline-flex items-center gap-1 text-sm text-white/45 hover:text-white/85 transition-colors rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X size={11} />
            닫기
          </button>
          <button
            type="button"
            onClick={() => onResetRef.current()}
            title="이번 세션 카운터 초기화"
            aria-label="세션 카운터 초기화"
            className="inline-flex items-center gap-1 text-sm text-white/45 hover:text-white/85 transition-colors rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <RotateCcw size={10} />
            초기화
          </button>
        </div>
      </div>

      <div className="px-3 py-2.5 border-b border-white/5">
        <div className="text-sm text-white/50">전체 AI 호출</div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-lg font-semibold tabular-nums text-white/90">
            {state.total}
          </span>
          <span className="text-sm text-white/50">
            · 클라우드 <span className="tabular-nums">{state.onlineCalls}</span>
            건 ({pct(state.onlineCalls, state.total)})
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
        {(Object.keys(state.perBackend) as Backend[]).map((b) => {
          const s = state.perBackend[b];
          const ratio = pct(s.count, state.total);
          return (
            <div key={b} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    BACKEND_DOT[b],
                  )}
                />
                <span className="text-white/70 truncate">
                  {BACKEND_LABEL[b]}
                </span>
              </div>
              <div className="flex items-center gap-2 text-white/50 shrink-0">
                <span className="tabular-nums">{s.count}</span>
                <span className="tabular-nums w-9 text-right">{ratio}</span>
                <span
                  className="tabular-nums w-12 text-right"
                  title="평균 latency"
                >
                  {avg(s.totalLatencyMs, s.count)}ms
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {state.last && (
        <div className="px-3 py-2 border-t border-white/5 bg-white/2">
          <div className="text-xs uppercase tracking-wide text-white/40 font-semibold">
            최근 호출
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-white/70">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                BACKEND_DOT[state.last.backend],
              )}
            />
            <span className="font-medium">
              {BACKEND_LABEL[state.last.backend]}
            </span>
            {state.last.online ? (
              <span className="text-rose-300">(온라인)</span>
            ) : (
              <span className="text-emerald-300">(오프라인)</span>
            )}
          </div>
          {state.last.model && (
            <div
              className="mt-0.5 text-xs text-white/45 truncate"
              title={state.last.model}
            >
              {state.last.model}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Privacy Ledger — ${label}`}
            aria-pressed={open}
            aria-expanded={open}
            aria-controls={popoverId}
            ref={triggerRef}
            onClick={() => {
              if (open) {
                setOpen(false);
              } else {
                openPopover();
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2 rounded-md border text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              TONE_CLASS[tone],
            )}
          >
            <Icon size={12} />
            <span className="tabular-nums">{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipText}</TooltipContent>
      </Tooltip>

      {open && (typeof document === "undefined" ? popover : createPortal(popover, document.body))}
    </div>
  );
};

export default PrivacyLedgerBadge;
