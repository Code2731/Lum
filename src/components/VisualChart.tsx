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

const DEFAULT_COLORS = ["#00d4aa", "#a78bfa", "#58a6ff", "#f85149", "#d29922"];
const CHART_AXIS_FONT_SIZE = 10;
const CHART_LEGEND_FONT_SIZE = "11px";

const VisualChart = ({ visualData }: { visualData: VisualData }) => {
  const { chartType, data, config } = visualData;
  const colors = config.colors || DEFAULT_COLORS;

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
    <div className="visual-chart-container">
      {config.title && <div className="visual-chart-title">{config.title}</div>}
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default VisualChart;
