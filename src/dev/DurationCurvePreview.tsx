import { Chart as ChartJS, LineElement, PointElement, LinearScale, LogarithmicScale, Filler, Tooltip, type ScriptableContext } from "chart.js";
import { Line } from "react-chartjs-2";
import type { OriderThemeVariant } from "../theme/OriderTheme";
import { DURATION_CURVE_PRESENTATION as CURVE, durationCurveArea } from "../theme/charts/durationCurvePresentation";
import { Text } from "../theme";

ChartJS.register(LineElement, PointElement, LinearScale, LogarithmicScale, Filler, Tooltip);

/** Synthetic samples: exercise the shared canvas appearance without account or theme-provider state. */
export default function DurationCurvePreview({ variant }: { variant: OriderThemeVariant }) {
  const seconds = [1, 5, 30, 60, 300, 1200];
  const points = (values: number[]) => seconds.map((x, i) => ({ x, y: values[i]! }));
  const power = variant.chartColors.power;
  return <div><Text as="p" variant="caption" tone="secondary">실선: 이번 활동 · 점선: 최근 90일 최고 · 생성 예시</Text><div className="h-56"><Line aria-label="생성한 최고 평균 파워 곡선" role="img" data={{ datasets: [
    { label: "이번 활동", data: points([740, 630, 440, 350, 255, 190]), borderColor: power, borderWidth: CURVE.lineWidth, pointRadius: CURVE.pointRadius, pointBackgroundColor: power, tension: 0, fill: "origin", backgroundColor: (ctx: ScriptableContext<"line">) => durationCurveArea(ctx, power) },
    { label: "최근 90일 최고", data: points([810, 700, 490, 390, 280, 210]), borderColor: variant.colors.textTertiary, borderWidth: CURVE.referenceWidth, borderDash: [5, 4], pointRadius: 0, tension: 0 },
  ] }} options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: {
    x: { type: "logarithmic", min: 1, max: 1200, afterBuildTicks: scale => { scale.ticks = seconds.map(value => ({ value })); }, grid: { drawOnChartArea: false, drawTicks: false }, border: { display: false }, ticks: { color: variant.chartColors.gridLabel, callback: value => Number(value) < 60 ? `${value}초` : `${Number(value) / 60}분`, maxRotation: 0 } },
    y: { min: 0, max: 1000, grid: { color: variant.chartColors.grid, drawTicks: false }, border: { display: false }, ticks: { color: variant.chartColors.gridLabel, stepSize: 250 } },
  } }} /></div></div>;
}
