import React from "react";
import { X, Cpu, MemoryStick, RefreshCw } from "lucide-react";
import { useSystemMonitor, type SystemStats } from "../hooks/useSystemMonitor";

interface Props {
  onClose: () => void;
}

function GaugeBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-white/8 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function color(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-400";
  return "bg-accent";
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
            <span className="w-[100px] text-[10px] font-mono text-white/50 truncate shrink-0">
              {p.name}
            </span>
            <div className="flex-1 h-1 bg-white/6 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent/60 rounded-full transition-all duration-500"
                style={{ width: `${barPct}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-white/40 w-16 text-right shrink-0">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SystemMonitorPanel: React.FC<Props> = ({ onClose }) => {
  const stats = useSystemMonitor(true);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-l border-white/5">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <Cpu size={13} className="text-accent shrink-0" />
        <span className="text-[11px] font-semibold text-white/80 flex-1">시스템 모니터</span>
        {stats && (
          <span className="flex items-center gap-1 text-[9px] text-white/20">
            <RefreshCw size={8} className="animate-spin" style={{ animationDuration: "2s" }} />
            2초
          </span>
        )}
        <button
          onClick={onClose}
          className="text-white/25 hover:text-white/60 transition-colors p-0.5 rounded"
        >
          <X size={11} />
        </button>
      </div>

      {!stats ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-white/20">
          수집 중…
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-4 min-h-0">
          {/* CPU */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                <Cpu size={10} />
                CPU
              </span>
              <span className="text-[11px] font-mono font-semibold text-white/80">
                {stats.cpu_usage.toFixed(1)}%
                <span className="text-[9px] text-white/25 ml-1">/ {stats.cpu_count}코어</span>
              </span>
            </div>
            <GaugeBar pct={stats.cpu_usage} color={color(stats.cpu_usage)} />
          </section>

          {/* 메모리 */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                <MemoryStick size={10} />
                메모리
              </span>
              <span className="text-[11px] font-mono font-semibold text-white/80">
                {stats.memory_used_gb} GB
                <span className="text-[9px] text-white/25 ml-1">/ {stats.memory_total_gb} GB</span>
              </span>
            </div>
            <GaugeBar pct={stats.memory_percent} color={color(stats.memory_percent)} />
            <p className="text-[9px] text-white/25 text-right">{stats.memory_percent.toFixed(0)}% 사용</p>
          </section>

          {/* 프로세스 — CPU */}
          <section className="space-y-1.5">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              CPU 상위 프로세스
            </p>
            <ProcTable procs={stats.top_cpu} mode="cpu" />
          </section>

          {/* 프로세스 — 메모리 */}
          <section className="space-y-1.5">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
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
