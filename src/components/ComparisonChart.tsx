import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useOriderTheme } from "../theme";
import { resolveCssColor } from "../utils/cssColor";
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
  const { variant } = useOriderTheme();
  const labelColor = resolveCssColor("var(--chart-grid-label)", variant);
  const gridColor = resolveCssColor("var(--grid-soft)", variant);

  const chartData = {
    labels,
    datasets: datasets.map((ds) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: resolveCssColor(ds.color, variant),
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
              labels: { font: { size: 12 }, padding: 12, usePointStyle: true, color: labelColor },
            },
            tooltip: {
              backgroundColor: resolveCssColor("var(--bg-3)", variant),
              borderColor: resolveCssColor("var(--line)", variant),
              borderWidth: 1,
              titleColor: resolveCssColor("var(--ink-0)", variant),
              bodyColor: resolveCssColor("var(--ink-1)", variant),
              callbacks: {
                label: (ctx) =>
                  `${ctx.dataset.label}: ${formatNum(ctx.parsed.y, 1)}${unit}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 12 }, color: labelColor, autoSkip: true, maxTicksLimit: 6 },
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                font: { size: 12 },
                color: labelColor,
                callback: (v) => `${v}${unit}`,
              },
            },
          },
        }}
      />
    </div>
  );
}
