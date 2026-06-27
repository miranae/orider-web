import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import type { DailyLoad } from "../utils/fitnessMetrics";
import { formatNum } from "../utils/units";
import { useTheme } from "../contexts/ThemeContext";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface DailyLoadChartProps {
  data: DailyLoad[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getBarColor(day: DailyLoad): string {
  if (day.activities.length === 0) return "rgba(156,163,175,0.3)";
  const hasTss = day.activities.some((a) => a.source === "tss");
  const hasTrimp = day.activities.some((a) => a.source === "trimp");
  if (hasTss) return "rgba(168, 85, 247, 0.7)";
  if (hasTrimp) return "rgba(239, 68, 68, 0.5)";
  return "rgba(156, 163, 175, 0.5)";
}

export default function DailyLoadChart({ data }: DailyLoadChartProps) {
  const { t } = useTranslation("dashboard");
  const { resolvedTheme } = useTheme();
  const chartData = useMemo(() => ({
    labels: data.map((d) => formatDate(d.date)),
    datasets: [{
      label: t("charts.dailyLoad.datasetLabel"),
      data: data.map((d) => d.totalLoad),
      backgroundColor: data.map((d) => getBarColor(d)),
      borderRadius: 2,
    }],
  }), [data, t]);

  const options: ChartOptions<"bar"> = useMemo(() => {
    const dark = resolvedTheme === "dark";
    const textColor = dark ? "#9ca3af" : "#6b7280";
    const gridColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0]?.dataIndex;
              return idx != null ? data[idx]?.date ?? "" : "";
            },
            label: (ctx) => t("charts.dailyLoad.tooltipLabel", { value: formatNum(ctx.parsed.y, 0) }),
          },
        },
      },
      scales: {
        x: {
          display: true,
          ticks: { color: textColor, maxTicksLimit: 10, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          display: true,
          beginAtZero: true,
          ticks: { color: textColor, font: { size: 10 } },
          grid: { color: gridColor },
        },
      },
    };
  }, [data, resolvedTheme, t]);

  return (
    <div className="h-full">
      <Bar data={chartData} options={options} />
    </div>
  );
}
