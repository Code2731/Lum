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
