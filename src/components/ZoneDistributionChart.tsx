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
import type { ZoneDistribution } from "../utils/zoneAnalysis";
import { useTheme } from "../contexts/ThemeContext";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h${rm > 0 ? ` ${rm}m` : ""}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface ZoneDistributionChartProps {
  title: string;
  zones: ZoneDistribution[];
}

export default function ZoneDistributionChart({ title, zones }: ZoneDistributionChartProps) {
  const { t } = useTranslation("dashboard");
  const { resolvedTheme } = useTheme();
  const data = useMemo(() => ({
    labels: zones.map((z) => `Z${z.zone} ${t(z.nameKey)}`),
    datasets: [{
      data: zones.map((z) => z.percentage),
      backgroundColor: zones.map((z) => z.color),
      borderRadius: 4,
      barThickness: 24,
    }],
  }), [zones, t]);

  const options: ChartOptions<"bar"> = useMemo(() => {
    const dark = resolvedTheme === "dark";
    const textColor = dark ? "#9ca3af" : "#6b7280";
    return {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const z = zones[ctx.dataIndex]!;
              return `${z.percentage.toFixed(1)}% · ${formatSeconds(z.seconds)}`;
            },
          },
        },
      },
      scales: {
        x: {
          display: true,
          max: 100,
          ticks: { color: textColor, font: { size: 10 }, callback: (v) => `${v}%` },
          grid: { display: false },
        },
        y: {
          display: true,
          ticks: { color: textColor, font: { size: 11 } },
          grid: { display: false },
        },
      },
    };
  }, [zones, resolvedTheme]);

  const maxZone = zones.reduce((max, z) => (z.seconds > max.seconds ? z : max), zones[0]!);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{title}</h4>
        <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
          {t("charts.zoneDistribution.dominant", { zone: maxZone.zone, name: t(maxZone.nameKey), pct: maxZone.percentage.toFixed(0) })}
        </span>
      </div>
      <div style={{ height: zones.length * 36 + 40 }}>
        <Bar data={data} options={options} />
      </div>
      {/* 존별 상세 */}
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>
        {zones.map((z) => (
          <div key={z.zone} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[var(--r-sm)] flex-shrink-0" style={{ backgroundColor: z.color }} />
            <span>Z{z.zone} {t(z.nameKey)} {formatSeconds(z.seconds)} ({z.percentage.toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
