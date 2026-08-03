import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ActionFlowBar } from "@/components/ui/action-flow-bar";

interface VisualData {
  type: "chart";
  chartType: "line" | "bar" | "area" | "pie";
  data: any[];
  config: {
    xKey: string;
    yKeys: string[];
    colors?: string[];
    title?: string;
  };
}

export interface VisualChartFlowSummary {
  badges: readonly [string, string, string];
  helper: string;
}

const DEFAULT_COLORS = ["#00d4aa", "#a78bfa", "#58a6ff", "#f85149", "#d29922"];
const CHART_AXIS_FONT_SIZE = 10;
const CHART_LEGEND_FONT_SIZE = "11px";
const CHART_TYPE_LABELS = {
  line: "라인 차트",
  bar: "막대 차트",
  area: "영역 차트",
  pie: "파이 차트",
} as const;
const CHART_FLOW_META = {
  line: {
    badges: ["먼저 축 확인", "다음 추세 비교", "마지막 급변 구간 해석"],
    helper: "시간축이나 범주축을 먼저 읽고, 선의 흐름을 비교한 뒤 급격히 변한 지점을 해석합니다.",
  },
  bar: {
    badges: ["먼저 범주 확인", "다음 값 비교", "마지막 큰 차이 해석"],
    helper: "각 막대의 범주를 먼저 확인하고, 값 차이를 비교한 뒤 큰 격차가 생긴 이유를 읽습니다.",
  },
  area: {
    badges: ["먼저 축 확인", "다음 누적 흐름 비교", "마지막 변화량 해석"],
    helper: "축을 먼저 읽고 면적 흐름을 비교한 뒤, 어느 구간에서 변화량이 커졌는지 해석합니다.",
  },
  pie: {
    badges: ["먼저 항목 확인", "다음 비중 비교", "마지막 편중 여부 해석"],
    helper: "파이 조각의 항목을 먼저 확인하고, 비중을 비교한 뒤 특정 항목 편중 여부를 해석합니다.",
  },
} as const;

export function getVisualChartFlowSummary(
  chartType: VisualData["chartType"],
): VisualChartFlowSummary {
  return CHART_FLOW_META[chartType];
}

export function getVisualChartEmptyFlowSummary(
  chartType: VisualData["chartType"],
): VisualChartFlowSummary {
  const flowMeta = CHART_FLOW_META[chartType];

  return {
    badges: flowMeta.badges,
    helper: "먼저 데이터를 불러오거나 필터 조건을 완화한 뒤 다시 시각화를 열면 비교 흐름을 이어갈 수 있습니다.",
  };
}

const VisualChart = ({ visualData }: { visualData: VisualData }) => {
  const { chartType, data, config } = visualData;
  const colors = config.colors || DEFAULT_COLORS;
  const dataCount = data.length;
  const seriesCount = chartType === "pie" ? Math.min(config.yKeys.length, 1) : config.yKeys.length;
  const flowMeta = getVisualChartFlowSummary(chartType);
  const emptyFlowMeta = getVisualChartEmptyFlowSummary(chartType);
  const chartLabel = CHART_TYPE_LABELS[chartType];

  if (dataCount === 0) {
    return (
      <div className="visual-chart-container rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="visual-chart-title">{config.title || chartLabel}</div>
            <p className="mt-1 text-xs text-white/40">차트를 그릴 데이터가 아직 없습니다.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/52">
            데이터 0개
          </span>
        </div>
        <div className="mt-3">
          <ActionFlowBar
            badges={emptyFlowMeta.badges}
            helper={emptyFlowMeta.helper}
            tone="neutral"
          />
        </div>
      </div>
    );
  }

  const renderChart = () => {
    switch (chartType) {
      case "line":
        return (
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis dataKey={config.xKey} stroke="#8b949e" fontSize={CHART_AXIS_FONT_SIZE} />
            <YAxis stroke="#8b949e" fontSize={CHART_AXIS_FONT_SIZE} />
            <Tooltip
              contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d" }}
              itemStyle={{ fontSize: CHART_LEGEND_FONT_SIZE }}
            />
            <Legend wrapperStyle={{ fontSize: CHART_LEGEND_FONT_SIZE }} />
            {config.yKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        );
      case "bar":
        return (
          <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis dataKey={config.xKey} stroke="#8b949e" fontSize={CHART_AXIS_FONT_SIZE} />
            <YAxis stroke="#8b949e" fontSize={CHART_AXIS_FONT_SIZE} />
            <Tooltip
              contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d" }}
              itemStyle={{ fontSize: CHART_LEGEND_FONT_SIZE }}
            />
            <Legend wrapperStyle={{ fontSize: CHART_LEGEND_FONT_SIZE }} />
            {config.yKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[index % colors.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );
      case "area":
        return (
          <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis dataKey={config.xKey} stroke="#8b949e" fontSize={CHART_AXIS_FONT_SIZE} />
            <YAxis stroke="#8b949e" fontSize={CHART_AXIS_FONT_SIZE} />
            <Tooltip
              contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d" }}
              itemStyle={{ fontSize: CHART_LEGEND_FONT_SIZE }}
            />
            <Legend wrapperStyle={{ fontSize: CHART_LEGEND_FONT_SIZE }} />
            {config.yKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                fill={colors[index % colors.length]}
                fillOpacity={0.1}
              />
            ))}
          </AreaChart>
        );
      case "pie":
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={config.yKeys[0]}
              nameKey={config.xKey}
              cx="50%"
              cy="50%"
              outerRadius={60}
              label={{ fontSize: CHART_AXIS_FONT_SIZE, fill: "#8b949e" }}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d" }}
              itemStyle={{ fontSize: CHART_LEGEND_FONT_SIZE }}
            />
            <Legend wrapperStyle={{ fontSize: CHART_LEGEND_FONT_SIZE }} />
          </PieChart>
        );
      default:
        return <div>지원되지 않는 차트 유형</div>;
    }
  };

  return (
    <div className="visual-chart-container rounded-2xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="visual-chart-title">{config.title || chartLabel}</div>
          <p className="mt-1 text-xs text-white/42">
            {chartLabel} · 데이터 {dataCount}개 · 시리즈 {seriesCount}개
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/54">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
            x축 {config.xKey}
          </span>
          {config.yKeys.map((key) => (
            <span key={key} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
              값 {key}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <ActionFlowBar badges={flowMeta.badges} helper={flowMeta.helper} tone="cyan" />
      </div>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default VisualChart;
