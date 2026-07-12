import React from "react";
import { X, Cpu, MemoryStick, RefreshCw } from "lucide-react";
import { useSystemMonitor, type SystemStats } from "../hooks/useSystemMonitor";
import { SMALL_ICON_SIZE } from "../constants/ui";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";

interface Props {
  onClose: () => void;
  compact?: boolean;
}

export interface SystemMonitorFlowSummary {
  primary: string;
  secondary: string;
  detail: string;
}

function GaugeBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-white/[0.1] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function color(pct: number) {
  if (pct >= 90) return "bg-red-400";
  if (pct >= 70) return "bg-amber-300";
  return "bg-accent/90";
}

export function getSystemMonitorFlowSummary(stats: SystemStats | null): SystemMonitorFlowSummary {
  if (!stats) {
    return {
      primary: "시스템 수집 대기",
      secondary: "첫 상태 준비 중",
      detail: "초기 수집이 끝나면 CPU와 메모리 전체 상태를 바로 확인할 수 있습니다.",
    };
  }

  return {
    primary: "시스템 상태 확인",
    secondary: `CPU ${stats.cpu_usage.toFixed(1)}% · 메모리 ${stats.memory_percent.toFixed(0)}%`,
    detail: "전체 자원 점유율을 먼저 보고, 아래 상위 프로세스로 원인을 빠르게 좁힐 수 있습니다.",
  };
}

function ProcTable({
  procs,
  mode,
}: {
  procs: SystemStats["top_cpu"];
  mode: "cpu" | "mem";
}) {
  return (
    <div className="space-y-0.5">
      {procs.map((p) => {
        const label =
          mode === "cpu"
            ? `${p.cpu_percent.toFixed(1)}%`
            : p.memory_mb >= 1024
              ? `${(p.memory_mb / 1024).toFixed(1)} GB`
              : `${p.memory_mb.toFixed(0)} MB`;
        const barPct = mode === "cpu" ? p.cpu_percent : Math.min((p.memory_mb / 8192) * 100, 100);

        return (
          <div key={`${p.pid}-${mode}`} className="flex items-center gap-2">
            <span className="w-[100px] text-xs font-mono text-white/56 truncate shrink-0">
              {p.name}
            </span>
            <div className="flex-1 h-1 bg-white/[0.09] rounded-full overflow-hidden">
              <div
                className="h-full bg-accent/70 rounded-full transition-all duration-500"
                style={{ width: `${barPct}%` }}
              />
            </div>
            <span className="text-xs font-mono text-white/46 w-16 text-right shrink-0">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SystemMonitorPanel: React.FC<Props> = ({ onClose, compact = false }) => {
  const stats = useSystemMonitor(true);
  const flowSummary = getSystemMonitorFlowSummary(stats);
  const panelTextClass = compact ? "text-xs" : "text-xs";
  const headerPadClass = compact ? "px-2.5 py-1.5" : "px-3 py-2";
  const bodyPadClass = compact
    ? "flex-1 overflow-y-auto px-2 py-2 space-y-3 min-h-0"
    : "flex-1 overflow-y-auto px-3 py-2.5 space-y-4 min-h-0";
  const sectionGapClass = compact ? "space-y-1" : "space-y-1.5";

  return (
    <div className={`lum-sidepanel flex flex-col h-full border-l border-white/10 ${panelTextClass}`}>
      {/* 헤더 */}
      <div className={`flex items-center gap-2 ${headerPadClass} border-b border-white/10 bg-white/[0.02] shrink-0`}>
        <Cpu size={SMALL_ICON_SIZE} className="text-accent shrink-0" />
        <span className="text-sm font-semibold text-white/86 flex-1">시스템 모니터</span>
        {stats && (
          <span className="flex items-center gap-1 text-xs text-white/28">
            <RefreshCw size={8} className="animate-spin" style={{ animationDuration: "2s" }} />
            2초
          </span>
        )}
        <button
          onClick={onClose}
          aria-label="시스템 모니터 닫기"
          className="p-1 rounded border border-white/[0.1] text-white/40 hover:text-white/75 hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X size={11} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-white/10 bg-white/[0.015] shrink-0">
        <ActionFlowBar
          badges={[flowSummary.primary, flowSummary.secondary, "마지막 상위 프로세스"]}
          helper={flowSummary.detail}
        />
      </div>

      {!stats ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-white/24 px-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left">
            <ActionFlowBar
              badges={["수집 시작", "2초 갱신", "첫 상태 대기"]}
              helper="초기 수집이 끝나면 2초 간격으로 갱신되며, 첫 상태가 보이는 즉시 자원 변화를 읽을 수 있습니다."
            />
          </div>
          <div>수집 중…</div>
        </div>
      ) : (
        <div className={bodyPadClass}>
          {/* CPU */}
          <section className={sectionGapClass}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-white/50 uppercase tracking-wider">
                <Cpu size={10} />
                CPU
              </span>
              <span className="text-sm font-mono font-semibold text-white/86">
                {stats.cpu_usage.toFixed(1)}%
                <span className="text-xs text-white/25 ml-1">/ {stats.cpu_count}코어</span>
              </span>
            </div>
            <GaugeBar pct={stats.cpu_usage} color={color(stats.cpu_usage)} />
          </section>

          {/* 메모리 */}
          <section className={sectionGapClass}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-white/50 uppercase tracking-wider">
                <MemoryStick size={10} />
                메모리
              </span>
              <span className="text-sm font-mono font-semibold text-white/86">
                {stats.memory_used_gb} GB
                <span className="text-xs text-white/25 ml-1">/ {stats.memory_total_gb} GB</span>
              </span>
            </div>
            <GaugeBar pct={stats.memory_percent} color={color(stats.memory_percent)} />
            <p className="text-xs text-white/25 text-right">{stats.memory_percent.toFixed(0)}% 사용</p>
          </section>

          {/* 프로세스 — CPU */}
          <section className={sectionGapClass}>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              CPU 상위 프로세스
            </p>
            <ProcTable procs={stats.top_cpu} mode="cpu" />
          </section>

          {/* 프로세스 — 메모리 */}
          <section className={sectionGapClass}>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              메모리 상위 프로세스
            </p>
            <ProcTable procs={stats.top_mem} mode="mem" />
          </section>
        </div>
      )}
    </div>
  );
};

export default SystemMonitorPanel;
