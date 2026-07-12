import { describe, expect, it } from "vitest";
import { getSystemMonitorMeta, type SystemStats } from "./useSystemMonitor";

describe("useSystemMonitor helpers", () => {
  it("stats가 없으면 대기 메타를 반환한다", () => {
    expect(getSystemMonitorMeta(null)).toEqual({
      title: "시스템 상태 대기 중",
      badges: ["먼저 CPU 확인", "다음 메모리 확인", "마지막 상위 프로세스 확인"],
      helper: "실시간 시스템 사용량을 불러온 뒤 CPU, 메모리, 상위 프로세스 흐름을 정리합니다.",
    });
  });

  it("실시간 stats를 CPU/메모리/주요 프로세스 중심으로 요약한다", () => {
    const stats: SystemStats = {
      cpu_usage: 73.4,
      memory_used_gb: 21.2,
      memory_total_gb: 32,
      memory_percent: 66.1,
      cpu_count: 12,
      top_cpu: [
        { pid: 100, name: "node", cpu_percent: 81.5, memory_mb: 1024 },
      ],
      top_mem: [
        { pid: 200, name: "python", cpu_percent: 14.2, memory_mb: 4096 },
      ],
    };

    expect(getSystemMonitorMeta(stats)).toEqual({
      title: "12코어 시스템 · 실시간 상태",
      badges: ["CPU 73%", "메모리 66%", "node CPU"],
      helper: "총 32.0GB 중 21.2GB 사용 중입니다.",
    });
  });

  it("프로세스 정보가 없으면 대기 배지를 사용한다", () => {
    const stats: SystemStats = {
      cpu_usage: 12.1,
      memory_used_gb: 4.8,
      memory_total_gb: 16,
      memory_percent: 30.2,
      cpu_count: 8,
      top_cpu: [],
      top_mem: [],
    };

    expect(getSystemMonitorMeta(stats)).toEqual({
      title: "8코어 시스템 · 실시간 상태",
      badges: ["CPU 12%", "메모리 30%", "프로세스 대기"],
      helper: "총 16.0GB 중 4.8GB 사용 중입니다.",
    });
  });
});
