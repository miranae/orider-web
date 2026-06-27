import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface CriticalPaceCurveProps {
  color?: string;
  /** 활동별 velocity_smooth 배열들 (최근 28일) */
  recentStreams?: number[][];
  /** 활동별 velocity_smooth 배열들 (이전 28일) */
  prevStreams?: number[][];
}

const mockCurrent = [
  { dur: 0.5, pace: 195 },
  { dur: 1, pace: 210 },
  { dur: 3, pace: 230 },
  { dur: 5, pace: 245 },
  { dur: 10, pace: 265 },
  { dur: 20, pace: 278 },
  { dur: 30, pace: 285 },
  { dur: 60, pace: 300 },
  { dur: 120, pace: 318 },
];

const mockPrevious = [
  { dur: 0.5, pace: 202 },
  { dur: 1, pace: 218 },
  { dur: 3, pace: 238 },
  { dur: 5, pace: 255 },
  { dur: 10, pace: 275 },
  { dur: 20, pace: 288 },
  { dur: 30, pace: 296 },
  { dur: 60, pace: 312 },
  { dur: 120, pace: 330 },
];

// 지속시간 목록 (초)
const DURATIONS = [30, 60, 180, 300, 600, 1200, 1800, 3600, 7200];

function computeBestPace(velocityArrays: number[][], durationSec: number): number | null {
  let bestAvgVelocity = 0;
  for (const vel of velocityArrays) {
    if (vel.length < durationSec) continue;
    for (let start = 0; start <= vel.length - durationSec; start++) {
      let sum = 0;
      for (let j = start; j < start + durationSec; j++) sum += vel[j]!;
      const avg = sum / durationSec;
      if (avg > bestAvgVelocity) bestAvgVelocity = avg;
    }
  }
  if (bestAvgVelocity <= 0) return null;
  return 1000 / bestAvgVelocity; // m/s → sec/km
}

const xTicks = [0.5, 1, 5, 10, 30, 60, 120];
// 5K ~22min, 10K ~45min, 하프 ~100min — "5K"/"10K" are proper nouns kept as-is
const REF_MARKER_BASE = [
  { dur: 22, label: "5K" },
  { dur: 46, label: "10K" },
];

export default function CriticalPaceCurve({ color = "var(--amber)", recentStreams, prevStreams }: CriticalPaceCurveProps) {
  const { t } = useTranslation("dashboard");
  const refMarkers = [
    ...REF_MARKER_BASE,
    { dur: 100, label: t("charts.criticalPace.half") },
  ];
  const currentData = useMemo(() => {
    if (!recentStreams || recentStreams.length === 0) return null;
    const pts = DURATIONS.map(d => {
      const pace = computeBestPace(recentStreams, d);
      return pace !== null ? { dur: d / 60, pace } : null;
    }).filter((p): p is { dur: number; pace: number } => p !== null);
    return pts.length > 0 ? pts : null;
  }, [recentStreams]);

  const prevData = useMemo(() => {
    if (!prevStreams || prevStreams.length === 0) return null;
    const pts = DURATIONS.map(d => {
      const pace = computeBestPace(prevStreams, d);
      return pace !== null ? { dur: d / 60, pace } : null;
    }).filter((p): p is { dur: number; pace: number } => p !== null);
    return pts.length > 0 ? pts : null;
  }, [prevStreams]);

  // 실데이터 없으면 mock fallback
  const current = currentData ?? mockCurrent;
  const previous = prevData ?? mockPrevious;

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
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
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
            <text x={x + 3} y={padT + 10} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-3)">{label}</text>
          </g>
        );
      })}

      {/* 이전 시즌 (dashed, ink-3) */}
      <path d={toPath(previous)} stroke="var(--ink-3)" strokeWidth="1.5" fill="none" strokeDasharray="5 4" />

      {/* 현재 시즌 (amber) */}
      <path d={toPath(current)} stroke={color} strokeWidth="2" fill="none" />
      {current.map(({ dur, pace }, i) => (
        <circle key={i} cx={sx(dur)} cy={sy(pace)} r="3" fill={color} />
      ))}

      {/* X축 틱 */}
      {xTicks.map((t) => (
        <text key={t} x={sx(t)} y={h - 4} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="middle">
          {t < 1 ? `${t * 60}s` : t < 60 ? `${t}m` : `${t / 60}h`}
        </text>
      ))}

      {/* Y축 (페이스) */}
      {current.filter((_, i) => i % 2 === 0).map(({ dur, pace }) => (
        <text key={dur} x={padL - 4} y={sy(pace) + 4} fontSize="8" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="end">
          {secToMmss(pace)}
        </text>
      ))}
    </svg>
  );
}
