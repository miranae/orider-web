import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import type { PowerCurvePoint } from "../utils/powerCurve";
import { formatNum } from "../utils/units";
import { useTheme } from "../contexts/ThemeContext";
import ChartEmptyState from "./charts/ChartEmptyState";

ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Filler, Tooltip);

interface PowerCurveChartProps {
  points: PowerCurvePoint[];
  ftp?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function PowerCurveChart({ points, ftp, emptyTitle, emptyDescription }: PowerCurveChartProps) {
  const { t } = useTranslation("dashboard");
  const { resolvedTheme } = useTheme();

  const formatDuration = (sec: number): string => {
    if (sec < 60) return t("charts.powerCurve.unitSec", { n: sec });
    if (sec < 3600) return t("charts.powerCurve.unitMin", { n: Math.floor(sec / 60) });
    return t("charts.powerCurve.unitHour", { n: Math.floor(sec / 3600) });
  };

  const data = useMemo(() => ({
    labels: points.map((p) => formatDuration(p.durationSeconds)),
    datasets: [
      {
        label: t("charts.powerCurve.datasetLabel"),
        data: points.map((p) => p.maxPower),
        borderColor: "#a855f7",
        backgroundColor: "rgba(168, 85, 247, 0.1)",
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: "#a855f7",
        fill: true,
        tension: 0.3,
      },
      ...(ftp ? [{
        label: "FTP",
        data: points.map(() => ftp),
        borderColor: "rgba(239, 68, 68, 0.5)",
        borderWidth: 1,
        borderDash: [6, 3],
        pointRadius: 0,
        fill: false,
      }] : []),
    ],
  }), [points, ftp, t]);

  const options: ChartOptions<"line"> = useMemo(() => {
    const dark = resolvedTheme === "dark";
    const textColor = dark ? "#9ca3af" : "#6b7280";
    const gridColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatNum(ctx.parsed.y, 0)} W`,
          },
        },
      },
      scales: {
        x: {
          display: true,
          ticks: { color: textColor, font: { size: 10 } },
          grid: { color: gridColor },
        },
        y: {
          display: true,
          beginAtZero: true,
          ticks: { color: textColor, font: { size: 10 }, callback: (v) => `${v}W` },
          grid: { color: gridColor },
        },
      },
    };
  }, [resolvedTheme]);

  if (points.length === 0) {
    return (
      <ChartEmptyState
        title={emptyTitle ?? t("charts.powerCurve.emptyTitle")}
        description={emptyDescription ?? t("charts.powerCurve.emptyDescription")}
        minHeight={200}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-3 text-[length:var(--fs-xs)] mb-2" style={{ color: "var(--ink-3)" }}>
        <span>{t("charts.powerCurve.peakPower", { power: points[0]?.maxPower })}</span>
        {ftp && <span className="text-red-400">FTP {ftp}W</span>}
      </div>
      <div className="h-[200px]">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
