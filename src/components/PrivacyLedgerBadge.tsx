// Phase 115 — Privacy Ledger 헤더 배지.
// 세션의 AI 호출 라우팅을 가시화. 외부 네트워크로 한 번도 안 나갔으면 🔒,
// 한 번이라도 나갔으면 ☁️. 클릭하면 백엔드별 통계 + 마지막 호출 정보 popover.

import React, { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Cloud, ShieldCheck, RotateCcw, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
const popupFocusables = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

function classify(state: LedgerState, isAllOnDevice: boolean): {
  tone: LedgerTone; label: string; tooltip: string;
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

const PrivacyLedgerBadge: React.FC<Props> = ({ state, isAllOnDevice, onReset }) => {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = React.useId();
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  const getPopupElements = () => {
    if (!popRef.current) return [];
    return Array.from(popRef.current.querySelectorAll<HTMLElement>(popupFocusables));
  };

  const closePopover = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handlePopupTabTrap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;

    const focusables = getPopupElements();
    if (focusables.length === 0) return;

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
  };

  const handlePopupArrowNav = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

    const focusables = getPopupElements();
    if (focusables.length === 0) return;

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
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePopover();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open, closePopover]);

  useEffect(() => {
    if (!open) return;
    const focusables = getPopupElements();
    if (focusables.length === 0) return;
    focusables[0]?.focus();
  }, [open]);

  const { tone, label, tooltip: tooltipText } = classify(state, isAllOnDevice);
  const Icon = tone === "ondevice" || tone === "neutral" ? ShieldCheck : Cloud;

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
            onClick={() => setOpen((v) => !v)}
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

      <AnimatePresence>
        {open && (
          <motion.div
            onKeyDown={(e) => {
              handlePopupTabTrap(e);
              handlePopupArrowNav(e);
            }}
            key="privacy-ledger-pop"
            ref={popRef}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ transformOrigin: "top right" }}
                id={popoverId}
                role="dialog"
                aria-label="Privacy Ledger 상세"
                className="absolute top-full right-0 mt-1 w-72 max-h-[min(440px,calc(100vh-3.5rem))] flex flex-col bg-[#161b22] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
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
                  className="inline-flex items-center gap-1 text-[11px] text-white/45 hover:text-white/85 transition-colors rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <X size={11} />
                  닫기
                </button>
                <button
                  type="button"
                  onClick={() => onResetRef.current()}
                  title="이번 세션 카운터 초기화"
                  aria-label="세션 카운터 초기화"
                  className="inline-flex items-center gap-1 text-[11px] text-white/45 hover:text-white/85 transition-colors rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <RotateCcw size={10} />
                  초기화
                </button>
              </div>
            </div>

            <div className="px-3 py-2.5 border-b border-white/5">
              <div className="text-[11px] text-white/50">전체 AI 호출</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-semibold tabular-nums text-white/90">{state.total}</span>
                <span className="text-[11px] text-white/50">
                  · 클라우드 <span className="tabular-nums">{state.onlineCalls}</span>건 ({pct(state.onlineCalls, state.total)})
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
              {(Object.keys(state.perBackend) as Backend[]).map((b) => {
                const s = state.perBackend[b];
                const ratio = pct(s.count, state.total);
                return (
                  <div key={b} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", BACKEND_DOT[b])} />
                      <span className="text-white/70 truncate">{BACKEND_LABEL[b]}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/50 shrink-0">
                      <span className="tabular-nums">{s.count}</span>
                      <span className="tabular-nums w-9 text-right">{ratio}</span>
                      <span className="tabular-nums w-12 text-right" title="평균 latency">
                        {avg(s.totalLatencyMs, s.count)}ms
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {state.last && (
              <div className="px-3 py-2 border-t border-white/5 bg-white/2">
                <div className="text-[10px] uppercase tracking-wide text-white/40 font-semibold">최근 호출</div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-white/70">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", BACKEND_DOT[state.last.backend])} />
                  <span className="font-medium">{BACKEND_LABEL[state.last.backend]}</span>
                  {state.last.online ? (
                    <span className="text-rose-300">(온라인)</span>
                  ) : (
                    <span className="text-emerald-300">(오프라인)</span>
                  )}
                </div>
                {state.last.model && (
                  <div className="mt-0.5 text-[10px] text-white/45 truncate" title={state.last.model}>
                    {state.last.model}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PrivacyLedgerBadge;
