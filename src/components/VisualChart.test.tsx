import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import VisualChart, {
  getVisualChartEmptyFlowSummary,
  getVisualChartFlowSummary,
} from "./VisualChart";

vi.mock("recharts", () => {
  const Mock = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    LineChart: Mock,
    Line: Mock,
    BarChart: Mock,
    Bar: Mock,
    AreaChart: Mock,
    Area: Mock,
    PieChart: Mock,
    Pie: Mock,
    XAxis: Mock,
    YAxis: Mock,
    CartesianGrid: Mock,
    Tooltip: Mock,
    Legend: Mock,
    ResponsiveContainer: Mock,
    Cell: Mock,
  };
});

describe("VisualChart", () => {
  it("차트 종류별 흐름 요약을 계산한다", () => {
    expect(getVisualChartFlowSummary("bar")).toEqual({
      badges: ["먼저 범주 확인", "다음 값 비교", "마지막 큰 차이 해석"],
      helper: "각 막대의 범주를 먼저 확인하고, 값 차이를 비교한 뒤 큰 격차가 생긴 이유를 읽습니다.",
    });

    expect(getVisualChartEmptyFlowSummary("pie")).toEqual({
      badges: ["먼저 항목 확인", "다음 비중 비교", "마지막 편중 여부 해석"],
      helper: "먼저 데이터를 불러오거나 필터 조건을 완화한 뒤 다시 시각화를 열면 비교 흐름을 이어갈 수 있습니다.",
    });
  });

  it("차트 메타 정보와 읽기 흐름을 함께 렌더링한다", () => {
    render(
      <VisualChart
        visualData={{
          type: "chart",
          chartType: "bar",
          data: [
            { name: "A", value: 10 },
            { name: "B", value: 20 },
          ],
          config: {
            title: "주간 비교",
            xKey: "name",
            yKeys: ["value"],
          },
        }}
      />,
    );

    expect(screen.getByText("주간 비교")).toBeInTheDocument();
    expect(screen.getByText("막대 차트 · 데이터 2개 · 시리즈 1개")).toBeInTheDocument();
    expect(screen.getByText("x축 name")).toBeInTheDocument();
    expect(screen.getByText("값 value")).toBeInTheDocument();
    expect(screen.getByText("먼저 범주 확인")).toBeInTheDocument();
    expect(screen.getByText("다음 값 비교")).toBeInTheDocument();
    expect(screen.getByText("마지막 큰 차이 해석")).toBeInTheDocument();
    expect(screen.getByText("각 막대의 범주를 먼저 확인하고, 값 차이를 비교한 뒤 큰 격차가 생긴 이유를 읽습니다.")).toBeInTheDocument();
  });

  it("데이터가 없으면 빈 상태 안내를 렌더링한다", () => {
    render(
      <VisualChart
        visualData={{
          type: "chart",
          chartType: "pie",
          data: [],
          config: {
            xKey: "name",
            yKeys: ["value"],
          },
        }}
      />,
    );

    expect(screen.getByText("파이 차트")).toBeInTheDocument();
    expect(screen.getByText("차트를 그릴 데이터가 아직 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("데이터 0개")).toBeInTheDocument();
    expect(screen.getByText("먼저 항목 확인")).toBeInTheDocument();
    expect(screen.getByText("다음 비중 비교")).toBeInTheDocument();
    expect(screen.getByText("마지막 편중 여부 해석")).toBeInTheDocument();
    expect(screen.getByText("먼저 데이터를 불러오거나 필터 조건을 완화한 뒤 다시 시각화를 열면 비교 흐름을 이어갈 수 있습니다.")).toBeInTheDocument();
  });
});
