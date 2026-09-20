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
import { formatNum } from "../utils/units";
import { useTheme } from "../contexts/ThemeContext";
import ChartEmptyState from "./charts/ChartEmptyState";

ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Filler, Tooltip);

/**
 * 창 길이별 최고값 곡선 — 파워 커브와 속도 커브가 같은 모양을 쓴다.
 *
 * 두 커브는 서버에서 **같은 창 길이·같은 규약**(`bestWindowByTime`)으로 계산되므로,
 * 화면에서도 같은 축과 같은 읽는 법을 가져야 나란히 비교된다. 축 단위와 색만 다르다.
 */
export interface DurationCurvePoint {
  durationSeconds: number;
  value: number;
}

export interface DurationCurveChartProps {
  points: DurationCurvePoint[];
  /** y 축·툴팁에 붙는 단위. */
  unit: string;
  /** 소수점 자리. 파워는 0, 속도는 1. */
  fractionDigits?: number;
  color: string;
  datasetLabel: string;
  /** 기준선 (파워의 FTP 등). 없으면 그리지 않는다. */
  reference?: { value: number; label: string } | null;
  /** 좌상단 요약 문구. */
  peakLabel?: string;
  emptyTitle: string;
  emptyDescription: string;
}

export default function DurationCurveChart({
  points, unit, fractionDigits = 0, color, datasetLabel,
  reference = null, peakLabel, emptyTitle, emptyDescription,
}: DurationCurveChartProps) {
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
        label: datasetLabel,
        data: points.map((p) => p.value),
        borderColor: color,
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: color,
        fill: false,
        tension: 0.3,
      },
      ...(reference ? [{
        label: reference.label,
        data: points.map(() => reference.value),
        borderColor: "rgba(239, 68, 68, 0.5)",
        borderWidth: 1,
        borderDash: [6, 3],
        pointRadius: 0,
        fill: false,
      }] : []),
    ],
    // formatDuration 은 t 에만 의존한다.
  }), [points, reference, color, datasetLabel, t]);

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
            label: (ctx) => `${ctx.dataset.label}: ${formatNum(ctx.parsed.y, fractionDigits)}${unit}`,
          },
        },
      },
      scales: {
        x: {
          display: true,
          ticks: { color: textColor, font: { size: 12 }, autoSkip: true, maxTicksLimit: 6 },
          grid: { color: gridColor },
        },
        y: {
          display: true,
          beginAtZero: true,
          ticks: { color: textColor, font: { size: 12 }, callback: (v) => `${v}${unit}` },
          grid: { color: gridColor },
        },
      },
    };
  }, [resolvedTheme, unit, fractionDigits]);

  if (points.length === 0) {
    return <ChartEmptyState title={emptyTitle} description={emptyDescription} minHeight={200} />;
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-3 text-[length:var(--fs-xs)] mb-2" style={{ color: "var(--ink-3)" }}>
        {peakLabel && <span>{peakLabel}</span>}
        {reference && <span className="text-red-400">{reference.label}</span>}
      </div>
      <div className="h-[200px]">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
