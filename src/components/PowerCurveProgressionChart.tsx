import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import type { PowerCurveProgression } from "../utils/powerCurveProgression";
import { formatNum } from "../utils/units";
import { useTheme } from "../contexts/ThemeContext";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface Props {
  progressions: PowerCurveProgression[];
}

export default function PowerCurveProgressionChart({ progressions }: Props) {
  const { t } = useTranslation("dashboard");
  const { resolvedTheme } = useTheme();

  const formatDuration = (sec: number): string => {
    if (sec < 60) return t("charts.powerCurve.unitSec", { n: sec });
    if (sec < 3600) return t("charts.powerCurve.unitMin", { n: Math.floor(sec / 60) });
    return t("charts.powerCurve.unitHour", { n: Math.floor(sec / 3600) });
  };

  const allDurations = useMemo(() => {
    const set = new Set<number>();
    for (const p of progressions) for (const pt of p.points) set.add(pt.durationSeconds);
    return Array.from(set).sort((a, b) => a - b);
  }, [progressions]);

  const chartData = useMemo(() => ({
    labels: allDurations.map(formatDuration),
    datasets: progressions.map((p) => {
      const map = new Map(p.points.map((pt) => [pt.durationSeconds, pt.maxPower]));
      return {
        label: p.label,
        data: allDurations.map((d) => map.get(d) ?? null),
        borderColor: p.color,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: p.color,
        tension: 0.3,
        spanGaps: true,
      };
    }),
  }), [progressions, allDurations, t]);

  const options: ChartOptions<"line"> = useMemo(() => {
    const dark = resolvedTheme === "dark";
    const textColor = dark ? "#9ca3af" : "#6b7280";
    const gridColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true, position: "top",
          labels: { color: textColor, usePointStyle: true, pointStyle: "circle", font: { size: 11 } },
        },
        tooltip: {
          mode: "index", intersect: false,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatNum(ctx.parsed.y, 0)}W` },
        },
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
        y: { beginAtZero: true, ticks: { color: textColor, font: { size: 10 }, callback: (v) => `${v}W` }, grid: { color: gridColor } },
      },
    };
  }, [resolvedTheme]);

  // 주요 구간 변화량 — early return 이전에 호출 (rules-of-hooks 준수)
  const improvements = useMemo(() => {
    if (progressions.length < 2) return null;
    const recent = new Map(progressions[0]!.points.map((p) => [p.durationSeconds, p.maxPower]));
    const prev = new Map(progressions[1]!.points.map((p) => [p.durationSeconds, p.maxPower]));
    return [5, 60, 300, 1200]
      .map((d) => {
        const r = recent.get(d), p = prev.get(d);
        if (r == null || p == null || p === 0) return null;
        const diff = r - p;
        return { duration: formatDuration(d), diff, pct: ((diff / p) * 100).toFixed(1), positive: diff > 0 };
      })
      .filter(Boolean) as { duration: string; diff: number; pct: string; positive: boolean }[];
  }, [progressions, t]);

  if (progressions.length === 0) {
    return (
      <div className="text-center py-8 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>
        {t("charts.powerCurve.noDataProgression")}
      </div>
    );
  }

  return (
    <div>
      <div className="h-[250px]">
        <Line data={chartData} options={options} />
      </div>
      {improvements && improvements.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 text-[length:var(--fs-xs)]">
          {improvements.map((imp) => (
            <div key={imp.duration} className="flex items-center gap-1">
              <span style={{ color: "var(--ink-2)" }}>{imp.duration}:</span>
              <span className={imp.positive ? "text-green-500 font-medium" : "text-red-500 font-medium"}>
                {imp.positive ? "+" : ""}{imp.diff}W ({imp.positive ? "+" : ""}{imp.pct}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
