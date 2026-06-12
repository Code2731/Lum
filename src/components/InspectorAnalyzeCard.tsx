import React from "react";
import { Copy, Loader2, MoreHorizontal, Search, TerminalSquare } from "lucide-react";
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
}) => (
  <div className={inspectorCardRegularClass}>
    <div className="flex items-center justify-between gap-2">
      <p className="text-white/45 uppercase tracking-[0.06em] text-xs">Last AI Analyze</p>
      {analyzeCache && (
        <div className="flex items-center gap-1">
          <button
            onClick={onCopyAnalyzeResult}
            className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-white/18 bg-white/[0.05] text-white/72 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            <Copy size={9} />
            COPY
          </button>
          <button
            onClick={onClearAnalyzeCache}
            className="text-xs px-1.5 py-0.5 rounded border border-white/18 bg-white/[0.05] text-white/70 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            CLEAR
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-white/82 truncate">{analyzeCache.command}</p>
          {analyzeCache.status === "streaming" ? (
            <span className="inline-flex items-center gap-1 text-xs text-cyan-100">
              <Loader2 size={9} className="animate-spin" />
              STREAMING
            </span>
          ) : analyzeCache.status === "error" ? (
            <span className="text-xs px-1.5 py-0.5 rounded bg-rose-400/20 text-rose-100">
              ERROR
            </span>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-100">
              DONE
            </span>
          )}
        </div>
        <p className={`text-xs font-mono break-words ${
          analyzeCache.status === "error" ? "text-rose-100/80" : "text-cyan-100/78"
        }`}>
          {analyzeCache.result || "응답을 기다리는 중..."}
        </p>
        {analyzeCache.status === "done" && analyzeCache.suggestedCommands.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.06em] text-cyan-100/70">Suggested Commands</p>
              <p className="text-xs text-cyan-100/62">
                {isInspectorCompact ? "R 실행 · MORE→C/L" : "R 실행 · C 복사 · L 로드"}
              </p>
            </div>
            <div className="space-y-1">
              {analyzeCache.suggestedCommands.map((cmd, idx) => (
                <div
                  key={`${cmd}-${idx}`}
                  data-inspector-command-menu-row="1"
                  tabIndex={isInspectorCompact ? 0 : -1}
                  className="rounded border border-cyan-300/18 bg-cyan-400/[0.06] px-1.5 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/45"
                  onBlurCapture={(e) => onCommandMenuRowBlurCapture(e, idx)}
                  onKeyDown={(e) => onSuggestedCommandRowKeyDown(e, idx)}
                >
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
                          onClick={() => onApplySuggestedCommand(idx)}
                          className="inline-flex w-[68px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300/35 bg-emerald-400/16 text-xs text-emerald-100 hover:bg-emerald-400/26 transition-colors"
                          title={`${idx + 1}번 커맨드 실행 (R)`}
                        >
                          <TerminalSquare size={9} />
                          RUN (R)
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
                          MORE
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onCopySuggestedCommand(idx)}
                          className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/22 bg-white/[0.05] text-xs text-white/76 hover:text-white hover:bg-white/[0.12] transition-colors"
                          title={`${idx + 1}번 커맨드 복사 (C)`}
                        >
                          <Copy size={9} />
                          COPY
                        </button>
                        <button
                          onClick={() => onLoadSuggestedCommandToAiBar(idx)}
                          className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-accent/35 bg-accent/14 text-xs text-accent hover:bg-accent/24 transition-colors"
                          title={`${idx + 1}번 커맨드 AI 입력바 로드 (L)`}
                        >
                          <Search size={9} />
                          LOAD
                        </button>
                        <button
                          onClick={() => onApplySuggestedCommand(idx)}
                          className="inline-flex w-[58px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300/35 bg-emerald-400/16 text-xs text-emerald-100 hover:bg-emerald-400/26 transition-colors"
                          title={`${idx + 1}번 커맨드 실행 (R)`}
                        >
                          <TerminalSquare size={9} />
                          RUN
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
                        onClick={() => onCopySuggestedCommand(idx)}
                        className="inline-flex w-[72px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/22 bg-white/[0.05] text-xs text-white/76 hover:text-white hover:bg-white/[0.12] transition-colors"
                        title={`${idx + 1}번 커맨드 복사 (C)`}
                      >
                        <Copy size={9} />
                        COPY (C)
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => onLoadSuggestedCommandToAiBar(idx)}
                        className="inline-flex w-[72px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-accent/35 bg-accent/14 text-xs text-accent hover:bg-accent/24 transition-colors"
                        title={`${idx + 1}번 커맨드 AI 입력바 로드 (L)`}
                      >
                        <Search size={9} />
                        LOAD (L)
                      </button>
                    </div>
                  )}
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
              RUN #1
            </button>
            <button
              onClick={onCopyAnalyzeResult}
              title="분석 결과 전체 복사"
              className="inline-flex w-[64px] justify-center items-center gap-1 px-1.5 py-0.5 rounded border border-white/20 bg-white/[0.05] text-xs text-white/76 hover:text-white hover:bg-white/[0.12] transition-colors"
            >
              <Copy size={9} />
              COPY
            </button>
          </div>
        )}
      </div>
    )}
  </div>
);

export default InspectorAnalyzeCard;
