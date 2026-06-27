import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useTheme } from "../contexts/ThemeContext";
import { formatNum } from "../utils/units";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface ComparisonChartProps {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color: string;
  }[];
  height?: number;
  unit?: string;
}

export default function ComparisonChart({
  labels,
  datasets,
  height = 200,
  unit = "",
}: ComparisonChartProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const tickColor = dark ? "#6b7280" : "#9ca3af";
  const labelColor = dark ? "#9ca3af" : "#6b7280";
  const gridColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  const chartData = {
    labels,
    datasets: datasets.map((ds) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color,
      borderRadius: 3,
      barPercentage: 0.8,
      categoryPercentage: 0.7,
    })),
  };

  return (
    <div style={{ height }}>
      <Bar
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { font: { size: 11 }, padding: 12, usePointStyle: true, color: labelColor },
            },
            tooltip: {
              callbacks: {
                label: (ctx) =>
                  `${ctx.dataset.label}: ${formatNum(ctx.parsed.y, 1)}${unit}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 11 }, color: labelColor },
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                font: { size: 10 },
                color: tickColor,
                callback: (v) => `${v}${unit}`,
              },
            },
          },
        }}
      />
    </div>
  );
}
