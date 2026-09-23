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
import { useOriderTheme } from "../theme";
import { resolveCssColor } from "../utils/cssColor";
import type { OriderThemeVariant } from "../theme/OriderTheme";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface DailyLoadChartProps {
  data: DailyLoad[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getBarColor(day: DailyLoad, variant: OriderThemeVariant): string {
  if (day.activities.length === 0) return variant.colors.textQuaternary;
  const hasTss = day.activities.some((a) => a.source === "tss");
  const hasTrimp = day.activities.some((a) => a.source === "trimp");
  if (hasTss) return variant.chartColors.power;
  if (hasTrimp) return variant.chartColors.heartRate;
  return variant.chartColors.gridLabel;
}

export default function DailyLoadChart({ data }: DailyLoadChartProps) {
  const { t } = useTranslation("dashboard");
  const { variant } = useOriderTheme();
  const chartData = useMemo(() => ({
    labels: data.map((d) => formatDate(d.date)),
    datasets: [{
      label: t("charts.dailyLoad.datasetLabel"),
      data: data.map((d) => d.totalLoad),
      backgroundColor: data.map((d) => getBarColor(d, variant)),
      borderRadius: 2,
    }],
  }), [data, t, variant]);

  const options: ChartOptions<"bar"> = useMemo(() => {
    const textColor = resolveCssColor("var(--chart-grid-label)", variant);
    const gridColor = resolveCssColor("var(--grid-soft)", variant);

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: resolveCssColor("var(--bg-3)", variant),
          borderColor: resolveCssColor("var(--line)", variant),
          borderWidth: 1,
          titleColor: resolveCssColor("var(--ink-0)", variant),
          bodyColor: resolveCssColor("var(--ink-1)", variant),
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
          ticks: { color: textColor, maxTicksLimit: 10, font: { size: 12 } },
          grid: { display: false },
        },
        y: {
          display: true,
          beginAtZero: true,
          ticks: { color: textColor, font: { size: 12 } },
          grid: { color: gridColor },
        },
      },
    };
  }, [data, variant, t]);

  return (
    <div className="h-full">
      <Bar data={chartData} options={options} />
    </div>
  );
}
