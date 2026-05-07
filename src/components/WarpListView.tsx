import React, { useState } from "react";
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Copy, TerminalSquare, Search } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { tokenizeShell, TOKEN_COLORS } from "../utils/shellSyntax";
import type { CommandBlock } from "../hooks/useCommandBlocks";

interface Props {
  blocks: CommandBlock[];
  onExecute?: (cmd: string) => void;
}

const SyntaxCmd: React.FC<{ cmd: string }> = ({ cmd }) => (
  <>
    {tokenizeShell(cmd).map((t, i) => (
      <span key={i} style={{ color: TOKEN_COLORS[t.type] }}>{t.text}</span>
    ))}
  </>
);

function fmtDuration(block: CommandBlock): string {
  if (!block.endedAt) return "";
  const ms = block.endedAt - block.startedAt;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const WarpListView: React.FC<Props> = ({ blocks, onExecute }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "failed" | "success">("all");

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20 select-none">
        <TerminalSquare size={32} />
        <p className="text-xs text-center leading-relaxed">
          명령어를 실행하면<br />블록으로 표시됩니다.
        </p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = [...blocks]
    .reverse()
    .filter((b) => {
      const ok = b.exitCode === 0 || b.exitCode === null;
      if (statusFilter === "failed" && ok) return false;
      if (statusFilter === "success" && !ok) return false;
      if (!q) return true;
      return b.command.toLowerCase().includes(q) || b.output.toLowerCase().includes(q);
    });

  const failedCount = blocks.filter((b) => b.exitCode !== 0 && b.exitCode !== null).length;
  const successCount = blocks.length - failedCount;

  return (
    <div className="p-3 space-y-1.5 overflow-y-auto h-full">
      <div className="sticky top-0 z-10 mb-2 rounded-xl border border-white/10 bg-[#0f151f]/92 backdrop-blur-sm p-2 space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Search size={12} className="text-white/35 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="블록 검색 (명령/출력)"
            className="w-full bg-transparent border-none outline-none text-xs text-white/82 placeholder:text-white/30"
          />
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label={`전체 ${blocks.length}`} />
          <FilterChip active={statusFilter === "failed"} onClick={() => setStatusFilter("failed")} label={`실패 ${failedCount}`} tone="danger" />
          <FilterChip active={statusFilter === "success"} onClick={() => setStatusFilter("success")} label={`성공 ${successCount}`} tone="success" />
          <span className="ml-auto text-[10px] text-white/34 tabular-nums">
            표시 {filtered.length}
          </span>
        </div>
      </div>

      {filtered.map((b) => {
        const ok         = b.exitCode === 0 || b.exitCode === null;
        const isExpanded = expanded.has(b.id);
        const dur        = fmtDuration(b);
        const hasOutput  = b.output.trim().length > 0;

        return (
          <div
            key={b.id}
            className={`rounded-xl border overflow-hidden ${
              ok ? "border-white/8 bg-white/[0.018]" : "border-red-500/20 bg-red-500/[0.03]"
            }`}
          >
            {/* header */}
            <div
              className={`flex items-center gap-2 px-3 py-2 ${hasOutput ? "cursor-pointer hover:bg-white/3" : ""} group select-none`}
              onClick={() => hasOutput && toggle(b.id)}
            >
              {ok ? (
                <CheckCircle2 size={11} className="text-green-400 shrink-0" />
              ) : (
                <XCircle size={11} className="text-red-400 shrink-0" />
              )}

              <span className="flex-1 min-w-0 text-[11px] font-mono truncate">
                <span className="text-white/25 mr-1">$</span>
                {b.command ? <SyntaxCmd cmd={b.command} /> : <span className="text-white/30">…</span>}
              </span>

              {dur && (
                <span className="flex items-center gap-0.5 text-[9px] text-white/20 shrink-0 tabular-nums">
                  <Clock size={8} />
                  {dur}
                </span>
              )}

              {b.endedAt && (
                <span className="text-[9px] text-white/15 shrink-0 tabular-nums">
                  {new Date(b.endedAt).toLocaleTimeString()}
                </span>
              )}

              <IconButton
                tooltip="명령어 복사"
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(b.command).catch(() => {}); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-white/70 transition-all shrink-0"
              >
                <Copy size={9} />
              </IconButton>

              {onExecute && b.command && (
                <IconButton
                  tooltip="다시 실행"
                  onClick={(e) => { e.stopPropagation(); onExecute(b.command + "\r"); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-accent transition-all shrink-0"
                >
                  <TerminalSquare size={9} />
                </IconButton>
              )}

              {hasOutput && (
                <span className="text-white/20 shrink-0">
                  {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </span>
              )}
            </div>

            {/* output */}
            {hasOutput && isExpanded && (
              <div className="relative border-t border-white/5">
                <pre className="px-3 py-2 text-[10px] font-mono text-white/40 whitespace-pre-wrap max-h-52 overflow-y-auto leading-relaxed bg-[#0d1117]">
                  {b.output.trim()}
                </pre>
                <IconButton
                  tooltip="출력 복사"
                  onClick={() => navigator.clipboard.writeText(b.output.trim()).catch(() => {})}
                  className="absolute top-2 right-2 p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/5 transition-colors"
                >
                  <Copy size={9} />
                </IconButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const FilterChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "neutral" | "danger" | "success";
}> = ({ active, onClick, label, tone = "neutral" }) => {
  const activeClass =
    tone === "danger"
      ? "bg-red-400/20 border-red-400/40 text-red-200"
      : tone === "success"
        ? "bg-emerald-400/20 border-emerald-400/40 text-emerald-200"
        : "bg-accent/20 border-accent/40 text-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded-md text-[10px] border transition-colors ${
        active
          ? activeClass
          : "border-white/14 text-white/48 bg-white/[0.04] hover:text-white/72 hover:bg-white/[0.08]"
      }`}
    >
      {label}
    </button>
  );
};

export default WarpListView;
