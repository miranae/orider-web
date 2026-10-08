import { useTranslation } from "react-i18next";
import type { RunPacePoint } from "../../features/fitness/fitnessCurveDocuments";
import ChartEmptyState from "./ChartEmptyState";

interface CriticalPaceCurveProps {
  color?: string;
  recentPoints?: readonly RunPacePoint[];
  prevPoints?: readonly RunPacePoint[];
}

const xTicks = [0.5, 1, 5, 10, 30, 60, 120];
// 5K ~22min, 10K ~45min, 하프 ~100min — "5K"/"10K" are proper nouns kept as-is
const REF_MARKER_BASE = [
  { dur: 22, label: "5K" },
  { dur: 46, label: "10K" },
];

export default function CriticalPaceCurve({ color = "var(--amber)", recentPoints = [], prevPoints = [] }: CriticalPaceCurveProps) {
  const { t } = useTranslation("dashboard");
  const refMarkers = [
    ...REF_MARKER_BASE,
    { dur: 100, label: t("charts.criticalPace.half") },
  ];
  const current = recentPoints.map(({ durationSec, paceSecPerKm }) => ({ dur: durationSec / 60, pace: paceSecPerKm }));
  const previous = prevPoints.map(({ durationSec, paceSecPerKm }) => ({ dur: durationSec / 60, pace: paceSecPerKm }));
  if (current.length === 0 && previous.length === 0) {
    return <ChartEmptyState title={t("charts.fitness.noData")} description="" />;
  }

  const w = 1080, h = 160;
  const padL = 40, padR = 20, padT = 10, padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const xMin = 0.5, xMax = 120;
  const allPaces = [...current.map((p) => p.pace), ...previous.map((p) => p.pace)];
  const paceMin = Math.min(...allPaces) - 10;
  const paceMax = Math.max(...allPaces) + 10;

  // X: log scale (min → px)
  const sx = (dur: number) =>
    padL + ((Math.log(dur) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin))) * chartW;

  // Y: pace — 낮을수록 빠름 → y축 반전 (paceMin → bottom, paceMax → top)
  const sy = (pace: number) =>
    padT + ((pace - paceMin) / (paceMax - paceMin)) * chartH;

  const toPath = (pts: { dur: number; pace: number }[]) =>
    pts.map(({ dur, pace }, i) => `${i === 0 ? "M" : "L"}${sx(dur).toFixed(1)} ${sy(pace).toFixed(1)}`).join(" ");

  const secToMmss = (s: number) => {
    const totalSeconds = Math.round(s);
    const m = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 200 }}>
      {/* 수평 그리드 */}
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1={padL} x2={w - padR}
          y1={padT + chartH * p} y2={padT + chartH * p}
          stroke="var(--grid-soft)"
        />
      ))}

      {/* 참조 마커 (5K, 10K) */}
      {refMarkers.map(({ dur, label }) => {
        if (dur > xMax) return null;
        const x = sx(dur);
        return (
          <g key={label}>
            <line x1={x} x2={x} y1={padT} y2={padT + chartH} stroke="var(--grid-axis)" strokeDasharray="3 3" />
            <text x={x + 3} y={padT + 10} fontSize="12" fontFamily="var(--font-mono)" fill="var(--ink-3)">{label}</text>
          </g>
        );
      })}

      {/* 이전 시즌 (dashed, ink-3) */}
      {previous.length > 0 && <path d={toPath(previous)} stroke="var(--ink-3)" strokeWidth="1.5" fill="none" strokeDasharray="5 4" />}
      {previous.map(({ dur, pace }, i) => (
        <circle key={i} cx={sx(dur)} cy={sy(pace)} r="3" fill="var(--ink-3)" />
      ))}

      {/* 현재 시즌 (amber) */}
      {current.length > 0 && <path d={toPath(current)} stroke={color} strokeWidth="2" fill="none" />}
      {current.map(({ dur, pace }, i) => (
        <circle key={i} cx={sx(dur)} cy={sy(pace)} r="3" fill={color} />
      ))}

      {/* X축 틱 */}
      {xTicks.map((t) => (
        <text key={t} x={sx(t)} y={h - 4} fontSize="12" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="middle">
          {t < 1 ? `${t * 60}s` : t < 60 ? `${t}m` : `${t / 60}h`}
        </text>
      ))}

      {/* Y축 (페이스) */}
      {(current.length > 0 ? current : previous).filter((_, i) => i % 2 === 0).map(({ dur, pace }) => (
        <text key={dur} x={padL - 4} y={sy(pace) + 4} fontSize="8" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="end">
          {secToMmss(pace)}
        </text>
      ))}
    </svg>
  );
}
