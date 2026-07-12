import React from "react";
import { Copy, Loader2, MoreHorizontal, Search, TerminalSquare } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { InspectorAnalyzeCache } from "./InspectorPanel/types";

interface InspectorAnalyzeCardProps {
  analyzeCache: InspectorAnalyzeCache | null;
  commandMenuIndex: number | null;
  isInspectorCompact: boolean;
  inspectorCardRegularClass: string;
  inspectorMoreButtonRefs: React.MutableRefObject<Record<number, HTMLButtonElement | null>>;
  inspectorMenuFirstActionRefs: React.MutableRefObject<Record<number, HTMLButtonElement | null>>;
  onCopyAnalyzeResult: () => void;
  onClearAnalyzeCache: () => void;
  onCopySuggestedCommand: (commandIndex: number) => void;
  onLoadSuggestedCommandToAiBar: (commandIndex: number) => void;
  onApplySuggestedCommand: (commandIndex: number) => void;
  onCommandMenuRowBlurCapture: (e: React.FocusEvent<HTMLDivElement>, rowIndex: number) => void;
  onSuggestedCommandRowKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, rowIndex: number) => void;
  onCompactMenuKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, rowIndex: number) => void;
  onOpenCompactMenu: (index: number) => void;
  onCloseCommandMenu: (restoreFocus?: boolean) => void;
}

export interface InspectorAnalyzeStatusMeta {
  statusLabel: string;
  statusClassName: string;
  summaryTone: "amber" | "cyan";
  resultClassName: string;
}

export function getInspectorAnalyzeStatusMeta(
  status: InspectorAnalyzeCache["status"],
): InspectorAnalyzeStatusMeta {
  if (status === "error") {
    return {
      statusLabel: "분석 오류",
      statusClassName: "text-xs px-1.5 py-0.5 rounded bg-rose-400/20 text-rose-100",
      summaryTone: "amber",
      resultClassName: "text-xs font-mono break-words text-rose-100/80",
    };
  }

  if (status === "streaming") {
    return {
      statusLabel: "진행 중",
      statusClassName: "inline-flex items-center gap-1 text-xs text-cyan-100",
      summaryTone: "cyan",
      resultClassName: "text-xs font-mono break-words text-cyan-100/78",
    };
  }

  return {
    statusLabel: "분석 완료",
    statusClassName: "text-xs px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-100",
    summaryTone: "cyan",
    resultClassName: "text-xs font-mono break-words text-cyan-100/78",
  };
}

export function getInspectorAnalyzeActionHint(isInspectorCompact: boolean): string {
  return isInspectorCompact ? "실행 · 추가 액션에서 복사/입력" : "실행 · 복사 · 입력";
}

export interface InspectorSuggestedCommandMeta {
  badge: string;
  tone: "cyan" | "amber" | "neutral";
  helper: string;
}

export function getInspectorSuggestedCommandMeta(
  index: number,
  total: number,
): InspectorSuggestedCommandMeta {
  if (index === 0) {
    return {
      badge: "먼저 실행",
      tone: "cyan",
      helper: "가장 가능성 높은 복구 커맨드입니다.",
    };
  }

  if (index === total - 1) {
    return {
      badge: "추가 점검",
      tone: "neutral",
      helper: "앞선 제안으로 충분하지 않을 때 이어서 확인합니다.",
    };
  }

  return {
    badge: "대안",
    tone: "amber",
    helper: "첫 제안이 맞지 않을 때 바로 전환할 후보입니다.",
  };
}

export function getInspectorAnalyzePrimaryCta(options: {
  status: InspectorAnalyzeCache["status"];
  suggestedCommandCount: number;
  isInspectorCompact: boolean;
}): {
  label: string;
  helper: string;
  showQuickLoad: boolean;
  badges: [string, string, string];
  shortcutHint: string;
  remainingHint: string;
} | null {
  const { status, suggestedCommandCount, isInspectorCompact } = options;

  if (status !== "done" || suggestedCommandCount === 0) return null;

  return {
    label: isInspectorCompact ? "첫 제안 실행" : "첫 제안 바로 실행",
    helper: "분석이 끝났다면 가장 먼저 첫 번째 추천 커맨드부터 실행해 복구 가능성을 빠르게 확인합니다.",
    showQuickLoad: !isInspectorCompact,
    badges: isInspectorCompact
      ? ["먼저 실행", "필요시 복사", "추가 액션"]
      : ["먼저 실행", "필요시 복사", "AI 입력 전환"],
    shortcutHint: isInspectorCompact ? "R 실행 · 추가 메뉴에서 C/L" : "R 실행 · C 복사 · L 입력",
    remainingHint:
      suggestedCommandCount > 1
        ? `대안 ${suggestedCommandCount - 1}개가 더 준비되어 있습니다.`
        : "현재는 이 제안이 가장 직접적인 복구 후보입니다.",
  };
}

const InspectorAnalyzeCard: React.FC<InspectorAnalyzeCardProps> = ({
  analyzeCache,
  commandMenuIndex,
  isInspectorCompact,
  inspectorCardRegularClass,
  inspectorMoreButtonRefs,
  inspectorMenuFirstActionRefs,
  onCopyAnalyzeResult,
  onClearAnalyzeCache,
  onCopySuggestedCommand,
  onLoadSuggestedCommandToAiBar,
  onApplySuggestedCommand,
  onCommandMenuRowBlurCapture,
  onSuggestedCommandRowKeyDown,
  onCompactMenuKeyDown,
  onOpenCompactMenu,
  onCloseCommandMenu,
}) => {
  const statusMeta = analyzeCache ? getInspectorAnalyzeStatusMeta(analyzeCache.status) : null;
  const primaryCta = analyzeCache
    ? getInspectorAnalyzePrimaryCta({
        status: analyzeCache.status,
        suggestedCommandCount: analyzeCache.suggestedCommands.length,
        isInspectorCompact,
      })
    : null;

  return (
  <div className={`${inspectorCardRegularClass} border-cyan-300/10 bg-cyan-400/[0.04] shadow-[0_10px_24px_rgba(34,211,238,0.05)]`}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <StatusBadge tone={analyzeCache?.status === "done" ? "cyan" : analyzeCache?.status === "error" ? "warn" : "neutral"}>
          2단계
        </StatusBadge>
        <p className="text-white/45 uppercase tracking-[0.06em] text-xs">
          {analyzeCache?.status === "done" ? "분석 결과 확인" : analyzeCache?.status === "error" ? "분석 오류 확인" : "AI 분석 대기"}
        </p>
      </div>
      {analyzeCache && (
        <div className="flex items-center gap-1">
          <button
            onClick={onCopyAnalyzeResult}
            className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-white/18 bg-white/[0.05] text-white/72 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            <Copy size={9} />
            결과 복사
          </button>
          <button
            onClick={onClearAnalyzeCache}
            className="text-xs px-1.5 py-0.5 rounded border border-white/18 bg-white/[0.05] text-white/70 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            결과 지우기
          </button>
        </div>
      )}
    </div>
    {!analyzeCache && (
      <p className="text-white/40">아직 실행된 분석이 없습니다.</p>
    )}
    {analyzeCache && (
      <div className={`rounded-md border px-2 py-1.5 space-y-1 ${
        analyzeCache.status === "error"
          ? "border-rose-300/25 bg-rose-400/8"
          : "border-cyan-300/20 bg-cyan-400/8"
      }`}>
        <div className={`rounded-lg border px-2 py-1 ${
          analyzeCache.status === "error"
            ? "border-rose-300/16 bg-black/10"
            : analyzeCache.status === "done"
              ? "border-emerald-300/16 bg-emerald-400/[0.08]"
              : "border-cyan-300/16 bg-black/10"
        }`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={statusMeta?.summaryTone ?? "neutral"}>
              {analyzeCache.status === "done" ? "결과 준비" : analyzeCache.status === "error" ? "오류 상태" : "응답 대기"}
            </StatusBadge>
            <span className={`text-[10px] ${
              analyzeCache.status === "error"
                ? "text-rose-100/58"
                : analyzeCache.status === "done"
                  ? "text-emerald-100/68"
                  : "text-cyan-100/58"
            }`}>
              {analyzeCache.status === "done"
                ? "추천 커맨드를 비교하고 바로 실행 단계로 넘어갈 수 있습니다."
                : analyzeCache.status === "error"
                  ? "분석이 실패해도 결과 메시지를 보고 다시 분석하거나 다른 복구 흐름으로 전환할 수 있습니다."
                  : "응답이 도착하면 복구 후보 커맨드가 아래에 정리됩니다."}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-white/82 truncate">{analyzeCache.command}</p>
          {analyzeCache.status === "streaming" ? (
            <span className={statusMeta?.statusClassName}>
              <Loader2 size={9} className="animate-spin" />
              {statusMeta?.statusLabel}
            </span>
          ) : analyzeCache.status === "error" ? (
            <span className={statusMeta?.statusClassName}>
              {statusMeta?.statusLabel}
            </span>
          ) : (
            <span className={statusMeta?.statusClassName}>
              {statusMeta?.statusLabel}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-cyan-300/14 bg-black/10 px-2 py-1.5">
          <StatusBadge tone={statusMeta?.summaryTone}>
            먼저 결과
          </StatusBadge>
          <StatusBadge tone="neutral">다음 제안</StatusBadge>
          <StatusBadge tone="neutral">마지막 실행</StatusBadge>
          <span className={`text-[10px] ${
            analyzeCache.status === "error" ? "text-rose-100/58" : "text-cyan-100/58"
          }`}>
            분석 결과를 먼저 확인하고, 추천 커맨드를 고른 뒤 실행하거나 입력에 넣습니다.
          </span>
        </div>
        <p className={statusMeta?.resultClassName}>
          {analyzeCache.result || "응답을 기다리는 중..."}
        </p>
        {primaryCta && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300/18 bg-emerald-400/[0.08] px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone="cyan">{primaryCta.badges[0]}</StatusBadge>
              <StatusBadge tone="neutral">{primaryCta.badges[1]}</StatusBadge>
              <StatusBadge tone="neutral">{primaryCta.badges[2]}</StatusBadge>
            </div>
            <div className="w-full rounded-lg border border-emerald-300/16 bg-black/10 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-[0.08em] text-emerald-100/50">첫 제안 커맨드</p>
              <p className="mt-1 truncate font-mono text-xs text-emerald-100/92" title={analyzeCache.suggestedCommands[0]}>
                {analyzeCache.suggestedCommands[0]}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onApplySuggestedCommand(0)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/35 bg-emerald-400/16 px-2.5 py-1 text-xs font-medium text-emerald-100 transition-[background-color,box-shadow,transform] hover:bg-emerald-400/26 hover:shadow-[0_8px_20px_rgba(16,185,129,0.18)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/45"
              title="첫 번째 추천 커맨드 바로 실행"
            >
              <TerminalSquare size={10} />
              {primaryCta.label}
            </button>
            <span className="text-[11px] leading-relaxed text-emerald-100/72">
              {primaryCta.helper}
            </span>
            <span className="text-[10px] text-emerald-100/52">
              {primaryCta.shortcutHint}
            </span>
            <span className="text-[10px] text-emerald-100/52">
              {primaryCta.remainingHint}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => onCopySuggestedCommand(0)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/[0.05] px-2 py-1 text-xs text-white/78 transition-[background-color,box-shadow,transform,color] hover:bg-white/[0.12] hover:text-white hover:shadow-[0_8px_18px_rgba(0,0,0,0.14)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25"
                title="첫 번째 추천 커맨드 복사"
              >
                <Copy size={10} />
                복사
              </button>
              {primaryCta.showQuickLoad && (
                <button
                  type="button"
                  onClick={() => onLoadSuggestedCommandToAiBar(0)}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300/32 bg-amber-400/14 px-2 py-1 text-xs text-amber-100 transition-[background-color,box-shadow,transform] hover:bg-amber-400/22 hover:shadow-[0_8px_20px_rgba(245,158,11,0.16)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
                  title="첫 번째 추천 커맨드를 입력바로 넘기기"
                >
                  <Search size={10} />
                  입력 넘기기
                </button>
              )}
            </div>
            {analyzeCache.suggestedCommands[1] && (
              <div className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-[0.08em] text-white/42">다음 대안</p>
                <p className="mt-1 truncate font-mono text-xs text-white/78" title={analyzeCache.suggestedCommands[1]}>
                  {analyzeCache.suggestedCommands[1]}
                </p>
              </div>
            )}
          </div>
        )}
        {analyzeCache.status === "done" && analyzeCache.suggestedCommands.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.06em] text-cyan-100/70">추천 커맨드</p>
              <p className="text-xs text-cyan-100/62">
                {getInspectorAnalyzeActionHint(isInspectorCompact)}
              </p>
            </div>
            <div className="space-y-1">
              {analyzeCache.suggestedCommands.map((cmd, idx) => (
                <div
                  key={`${cmd}-${idx}`}
                  data-inspector-command-menu-row={idx + 1}
                  tabIndex={isInspectorCompact ? 0 : -1}
                  className="rounded border border-cyan-300/18 bg-cyan-400/[0.06] px-1.5 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/45"
                  onBlurCapture={(e) => onCommandMenuRowBlurCapture(e, idx)}
                  onKeyDown={(e) => onSuggestedCommandRowKeyDown(e, idx)}
                >
                  {(() => {
                    const commandMeta = getInspectorSuggestedCommandMeta(
                      idx,
                      analyzeCache.suggestedCommands.length,
                    );

                    return (
                      <>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={commandMeta.tone}>{commandMeta.badge}</StatusBadge>
                    <span className="text-[10px] text-cyan-100/58">{commandMeta.helper}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center min-w-4 h-4 rounded bg-cyan-400/20 text-xs text-cyan-100">
                      {idx + 1}
                    </span>
                    <p className="min-w-0 flex-1 text-xs font-mono text-cyan-100/92 truncate" title={cmd}>
                      {cmd}
                    </p>
                    {isInspectorCompact ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            onApplySuggestedCommand(idx);
                            onCloseCommandMenu(false);
                          }}
                          className="inline-flex w-[68px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300/35 bg-emerald-400/16 text-xs text-emerald-100 hover:bg-emerald-400/26 transition-colors"
                          title={`${idx + 1}번 커맨드 실행 (R)`}
                        >
                          <TerminalSquare size={9} />
                          실행 (R)
                        </button>
                        <button
                          ref={(el) => { inspectorMoreButtonRefs.current[idx] = el; }}
                          onClick={() => {
                            if (commandMenuIndex === idx) {
                              onCloseCommandMenu(true);
                              return;
                            }
                            onOpenCompactMenu(idx);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "ArrowDown" && e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            onOpenCompactMenu(idx);
                          }}
                          aria-expanded={commandMenuIndex === idx}
                          aria-controls={`inspector-command-menu-${idx}`}
                          className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/20 bg-white/[0.05] text-xs text-white/75 hover:text-white hover:bg-white/[0.12] transition-colors"
                          title={`${idx + 1}번 추가 액션 (C/L 단축키 활성화)`}
                        >
                          <MoreHorizontal size={9} />
                          추가
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onCopySuggestedCommand(idx)}
                          className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/22 bg-white/[0.05] text-xs text-white/76 hover:text-white hover:bg-white/[0.12] hover:shadow-[0_8px_18px_rgba(0,0,0,0.14)] hover:-translate-y-[1px] transition-[background-color,box-shadow,transform,color]"
                          title={`${idx + 1}번 커맨드 복사 (C)`}
                        >
                          <Copy size={9} />
                          복사
                        </button>
                        <button
                          onClick={() => onLoadSuggestedCommandToAiBar(idx)}
                          className="inline-flex w-[64px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-amber-300/30 bg-amber-400/14 text-xs text-amber-100 hover:bg-amber-400/22 hover:shadow-[0_8px_20px_rgba(245,158,11,0.16)] hover:-translate-y-[1px] transition-[background-color,box-shadow,transform]"
                          title={`${idx + 1}번 커맨드를 입력바로 넘기기 (L)`}
                        >
                          <Search size={9} />
                          입력
                        </button>
                        <button
                          onClick={() => onApplySuggestedCommand(idx)}
                          className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300/35 bg-emerald-400/16 text-xs text-emerald-100 hover:bg-emerald-400/26 hover:shadow-[0_8px_20px_rgba(16,185,129,0.18)] hover:-translate-y-[1px] transition-[background-color,box-shadow,transform]"
                          title={`${idx + 1}번 커맨드 실행 (R)`}
                        >
                          <TerminalSquare size={9} />
                          실행
                        </button>
                      </div>
                    )}
                  </div>
                  {isInspectorCompact && commandMenuIndex === idx && (
                    <div
                      id={`inspector-command-menu-${idx}`}
                      data-inspector-command-menu="compact"
                      role="menu"
                      onKeyDown={(e) => onCompactMenuKeyDown(e, idx)}
                      className="mt-1.5 ml-5 flex items-center gap-1"
                    >
                      <button
                        ref={(el) => { inspectorMenuFirstActionRefs.current[idx] = el; }}
                        role="menuitem"
                        onClick={() => {
                          onCopySuggestedCommand(idx);
                          onCloseCommandMenu(true);
                        }}
                        className="inline-flex w-[72px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/22 bg-white/[0.05] text-xs text-white/76 hover:text-white hover:bg-white/[0.12] hover:shadow-[0_8px_18px_rgba(0,0,0,0.14)] hover:-translate-y-[1px] transition-[background-color,box-shadow,transform,color]"
                        title={`${idx + 1}번 커맨드 복사 (C)`}
                      >
                        <Copy size={9} />
                        복사 (C)
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          onLoadSuggestedCommandToAiBar(idx);
                          onCloseCommandMenu(false);
                        }}
                        className="inline-flex w-[78px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-amber-300/30 bg-amber-400/14 text-xs text-amber-100 hover:bg-amber-400/22 hover:shadow-[0_8px_20px_rgba(245,158,11,0.16)] hover:-translate-y-[1px] transition-[background-color,box-shadow,transform]"
                        title={`${idx + 1}번 커맨드를 입력바로 넘기기 (L)`}
                      >
                        <Search size={9} />
                        입력 넘기기
                      </button>
                    </div>
                  )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}
        {analyzeCache.status === "done" && !isInspectorCompact && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onApplySuggestedCommand(0)}
              title="첫 번째 추천 커맨드 실행 (R)"
              className="inline-flex w-[74px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300/35 bg-emerald-400/16 text-xs text-emerald-100 hover:bg-emerald-400/26 transition-colors"
            >
              <TerminalSquare size={9} />
              첫 실행
            </button>
            <button
              onClick={onCopyAnalyzeResult}
              title="분석 결과 전체 복사"
              className="inline-flex w-[64px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/20 bg-white/[0.05] text-xs text-white/76 hover:text-white hover:bg-white/[0.12] transition-colors"
            >
              <Copy size={9} />
              결과 복사
            </button>
          </div>
        )}
      </div>
    )}
  </div>
  );
};

export default InspectorAnalyzeCard;
