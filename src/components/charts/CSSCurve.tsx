import { useMemo } from "react";
import type { LapData } from "@shared/types";

interface CSSCurveProps {
  color?: string;
  css?: number; // CSS 페이스 (sec/100m), 기본 mock
  recentLaps?: LapData[][];
  prevLaps?: LapData[][];
}

const currentMock = [
  { dist: 50, pace: 55 },
  { dist: 100, pace: 65 },
  { dist: 200, pace: 78 },
  { dist: 400, pace: 92 },
  { dist: 800, pace: 102 },
  { dist: 1500, pace: 112 },
  { dist: 3000, pace: 120 },
  { dist: 5000, pace: 128 },
];

const previousMock = [
  { dist: 50, pace: 58 },
  { dist: 100, pace: 68 },
  { dist: 200, pace: 82 },
  { dist: 400, pace: 97 },
  { dist: 800, pace: 107 },
  { dist: 1500, pace: 117 },
  { dist: 3000, pace: 125 },
  { dist: 5000, pace: 133 },
];

const TARGET_DISTS = [50, 100, 200, 400, 800, 1500, 3000, 5000];

function computeBestSwimPace(lapsArrays: LapData[][], targetDistM: number): number | null {
  let bestPace = Infinity;
  for (const laps of lapsArrays) {
    let accDist = 0, accTime = 0;
    for (const lap of laps) {
      accDist += lap.distanceKm * 1000;
      accTime += lap.durationMs / 1000;
      if (accDist >= targetDistM * 0.9) {
        const pace100 = (accTime / accDist) * 100;
        if (pace100 < bestPace) bestPace = pace100;
        break;
      }
    }
  }
  return bestPace === Infinity ? null : bestPace;
}

const xTicks = [50, 100, 200, 400, 800, 1500, 3000, 5000];
const refMarkers = [
  { dist: 400, label: "400m" },
  { dist: 1500, label: "1500m" },
];

export default function CSSCurve({ color = "var(--aqua)", css, recentLaps, prevLaps }: CSSCurveProps) {
  const currentData = useMemo(() => {
    if (!recentLaps || recentLaps.length === 0) return null;
    const pts = TARGET_DISTS.map(d => {
      const pace = computeBestSwimPace(recentLaps, d);
      return pace !== null ? { dist: d, pace } : null;
    }).filter((p): p is { dist: number; pace: number } => p !== null);
    return pts.length > 0 ? pts : null;
  }, [recentLaps]);

  const prevData = useMemo(() => {
    if (!prevLaps || prevLaps.length === 0) return null;
    const pts = TARGET_DISTS.map(d => {
      const pace = computeBestSwimPace(prevLaps, d);
      return pace !== null ? { dist: d, pace } : null;
    }).filter((p): p is { dist: number; pace: number } => p !== null);
    return pts.length > 0 ? pts : null;
  }, [prevLaps]);

  // 실데이터 없으면 mock fallback
  const current = currentData ?? currentMock;
  const previous = prevData ?? previousMock;
  const cssValue = css ?? 92; // mock CSS: ~1:32/100m

  const w = 1080, h = 160;
  const padL = 44, padR = 20, padT = 10, padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const xMin = 50, xMax = 5000;
  const allPaces = [...current.map((p) => p.pace), ...previous.map((p) => p.pace)];
  const paceMin = Math.min(...allPaces) - 6;
  const paceMax = Math.max(...allPaces) + 6;

  const sx = (dist: number) =>
    padL + ((Math.log(dist) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin))) * chartW;

  // Y: pace 낮을수록 빠름 → 반전
  const sy = (pace: number) =>
    padT + ((pace - paceMin) / (paceMax - paceMin)) * chartH;

  const toPath = (pts: { dist: number; pace: number }[]) =>
    pts.map(({ dist, pace }, i) => `${i === 0 ? "M" : "L"}${sx(dist).toFixed(1)} ${sy(pace).toFixed(1)}`).join(" ");

  const secToMmss = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const cssY = sy(cssValue);

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

      {/* 수직 참조 마커 (400m, 1500m) */}
      {refMarkers.map(({ dist, label }) => {
        const x = sx(dist);
        return (
          <g key={label}>
            <line x1={x} x2={x} y1={padT} y2={padT + chartH} stroke="var(--grid-axis)" strokeDasharray="3 3" />
            <text x={x + 3} y={padT + 10} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-3)">{label}</text>
          </g>
        );
      })}

      {/* CSS 수평 참조선 */}
      <line
        x1={padL} x2={w - padR}
        y1={cssY} y2={cssY}
        stroke={color} strokeWidth="1" strokeDasharray="6 4" opacity="0.5"
      />
      <text x={w - padR + 3} y={cssY + 4} fontSize="8" fontFamily="var(--font-mono)" fill={color}>CSS</text>

      {/* 이전 CSS (dashed, ink-3) */}
      <path d={toPath(previous)} stroke="var(--ink-3)" strokeWidth="1.5" fill="none" strokeDasharray="5 4" />

      {/* 현재 CSS 라인 (aqua) */}
      <path d={toPath(current)} stroke={color} strokeWidth="2" fill="none" />
      {current.map(({ dist, pace }, i) => (
        <circle key={i} cx={sx(dist)} cy={sy(pace)} r="3" fill={color} />
      ))}

      {/* X축 틱 */}
      {xTicks.map((t) => (
        <text key={t} x={sx(t)} y={h - 4} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="middle">
          {t >= 1000 ? `${t / 1000}km` : `${t}m`}
        </text>
      ))}

      {/* Y축 (페이스) */}
      {current.filter((_, i) => i % 2 === 0).map(({ dist, pace }) => (
        <text key={dist} x={padL - 4} y={sy(pace) + 4} fontSize="8" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="end">
          {secToMmss(pace)}
        </text>
      ))}
    </svg>
  );
}
