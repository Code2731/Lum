import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
}

export interface SystemStats {
  cpu_usage: number;
  memory_used_gb: number;
  memory_total_gb: number;
  memory_percent: number;
  cpu_count: number;
  top_cpu: ProcessInfo[];
  top_mem: ProcessInfo[];
}

export interface SystemMonitorMeta {
  title: string;
  badges: [string, string, string];
  helper: string;
}

function getCpuBadge(stats: SystemStats): string {
  return `CPU ${Math.round(stats.cpu_usage)}%`;
}

function getMemoryBadge(stats: SystemStats): string {
  return `메모리 ${Math.round(stats.memory_percent)}%`;
}

function getPrimaryPressureProcess(stats: SystemStats): string {
  const cpuProcess = stats.top_cpu[0];
  const memProcess = stats.top_mem[0];
  if (cpuProcess && memProcess) {
    return cpuProcess.cpu_percent >= memProcess.cpu_percent ? `${cpuProcess.name} CPU` : `${memProcess.name} 메모리`;
  }
  if (cpuProcess) return `${cpuProcess.name} CPU`;
  if (memProcess) return `${memProcess.name} 메모리`;
  return "프로세스 대기";
}

export function getSystemMonitorMeta(stats: SystemStats | null): SystemMonitorMeta {
  if (!stats) {
    return {
      title: "시스템 상태 대기 중",
      badges: ["먼저 CPU 확인", "다음 메모리 확인", "마지막 상위 프로세스 확인"],
      helper: "실시간 시스템 사용량을 불러온 뒤 CPU, 메모리, 상위 프로세스 흐름을 정리합니다.",
    };
  }

  return {
    title: `${stats.cpu_count}코어 시스템 · 실시간 상태`,
    badges: [getCpuBadge(stats), getMemoryBadge(stats), getPrimaryPressureProcess(stats)],
    helper: `총 ${stats.memory_total_gb.toFixed(1)}GB 중 ${stats.memory_used_gb.toFixed(1)}GB 사용 중입니다.`,
  };
}

export function useSystemMonitor(active: boolean) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    const poll = () =>
      invoke<SystemStats>("get_system_stats")
        .then(setStats)
        .catch(() => {});

    poll();
    timerRef.current = setInterval(poll, 2000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [active]);

  return stats;
}
