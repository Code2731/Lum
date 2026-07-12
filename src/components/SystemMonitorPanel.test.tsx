import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SystemMonitorPanel, { getSystemMonitorFlowSummary } from "./SystemMonitorPanel";

const useSystemMonitorMock = vi.fn();

vi.mock("../hooks/useSystemMonitor", () => ({
  useSystemMonitor: () => useSystemMonitorMock(),
}));

describe("SystemMonitorPanel", () => {
  it("요약 함수는 수집 대기와 정상 상태를 반환한다", () => {
    expect(getSystemMonitorFlowSummary(null)).toEqual({
      primary: "시스템 수집 대기",
      secondary: "첫 상태 준비 중",
      detail: "초기 수집이 끝나면 CPU와 메모리 전체 상태를 바로 확인할 수 있습니다.",
    });
    expect(
      getSystemMonitorFlowSummary({
        cpu_usage: 42.3,
        cpu_count: 8,
        memory_used_gb: 12.5,
        memory_total_gb: 32,
        memory_percent: 39.1,
        top_cpu: [],
        top_mem: [],
      } as any),
    ).toEqual({
      primary: "시스템 상태 확인",
      secondary: "CPU 42.3% · 메모리 39%",
      detail: "전체 자원 점유율을 먼저 보고, 아래 상위 프로세스로 원인을 빠르게 좁힐 수 있습니다.",
    });
  });

  it("수집 중 상태에서 모니터링 흐름 안내를 보여준다", () => {
    useSystemMonitorMock.mockReturnValue(null);

    render(<SystemMonitorPanel onClose={vi.fn()} />);

    expect(screen.getByText("시스템 수집 대기")).toBeInTheDocument();
    expect(screen.getByText("첫 상태 준비 중")).toBeInTheDocument();
    expect(screen.getByText("마지막 상위 프로세스")).toBeInTheDocument();
    expect(
      screen.getByText("초기 수집이 끝나면 CPU와 메모리 전체 상태를 바로 확인할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("수집 시작")).toBeInTheDocument();
    expect(screen.getByText("2초 갱신")).toBeInTheDocument();
    expect(screen.getByText("첫 상태 대기")).toBeInTheDocument();
    expect(screen.getByText("수집 중…")).toBeInTheDocument();
  });
});
