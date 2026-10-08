import { useTranslation } from "react-i18next";
import type { SwimPacePoint } from "../../features/fitness/fitnessCurveDocuments";
import ChartEmptyState from "./ChartEmptyState";

interface CSSCurveProps {
  color?: string;
  css?: number; // CSS 페이스 (sec/100m)
  recentPoints?: readonly SwimPacePoint[];
  prevPoints?: readonly SwimPacePoint[];
}

const xTicks = [50, 100, 200, 400, 800, 1500, 3000, 5000];
const refMarkers = [
  { dist: 400, label: "400m" },
  { dist: 1500, label: "1500m" },
];

export default function CSSCurve({ color = "var(--aqua)", css, recentPoints = [], prevPoints = [] }: CSSCurveProps) {
  const { t } = useTranslation("dashboard");
  const current = recentPoints.map(({ distanceM, paceSecPer100m }) => ({ dist: distanceM, pace: paceSecPer100m }));
  const previous = prevPoints.map(({ distanceM, paceSecPer100m }) => ({ dist: distanceM, pace: paceSecPer100m }));
  if (current.length === 0 && previous.length === 0) {
    return <ChartEmptyState title={t("charts.fitness.noData")} description="" />;
  }
  const cssValue = css != null && Number.isFinite(css) && css > 0 ? css : null;

  const w = 1080, h = 160;
  const padL = 44, padR = 20, padT = 10, padB = 30;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const xMin = 50, xMax = 5000;
  const allPaces = [...current.map((p) => p.pace), ...previous.map((p) => p.pace), ...(cssValue !== null ? [cssValue] : [])];
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
    const totalSeconds = Math.round(s);
    const m = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const cssY = cssValue !== null ? sy(cssValue) : null;

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
            <text x={x + 3} y={padT + 10} fontSize="12" fontFamily="var(--font-mono)" fill="var(--ink-3)">{label}</text>
          </g>
        );
      })}

      {/* CSS 수평 참조선 */}
      {cssY !== null && (
        <>
          <line
            x1={padL} x2={w - padR}
            y1={cssY} y2={cssY}
            stroke={color} strokeWidth="1" strokeDasharray="6 4" opacity="0.5"
          />
          <text x={w - padR + 3} y={cssY + 4} fontSize="8" fontFamily="var(--font-mono)" fill={color}>CSS</text>
        </>
      )}

      {/* 이전 CSS (dashed, ink-3) */}
      {previous.length > 0 && <path d={toPath(previous)} stroke="var(--ink-3)" strokeWidth="1.5" fill="none" strokeDasharray="5 4" />}
      {previous.map(({ dist, pace }, i) => (
        <circle key={i} cx={sx(dist)} cy={sy(pace)} r="3" fill="var(--ink-3)" />
      ))}

      {/* 현재 CSS 라인 (aqua) */}
      {current.length > 0 && <path d={toPath(current)} stroke={color} strokeWidth="2" fill="none" />}
      {current.map(({ dist, pace }, i) => (
        <circle key={i} cx={sx(dist)} cy={sy(pace)} r="3" fill={color} />
      ))}

      {/* X축 틱 */}
      {xTicks.map((t) => (
        <text key={t} x={sx(t)} y={h - 4} fontSize="12" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="middle">
          {t >= 1000 ? `${t / 1000}km` : `${t}m`}
        </text>
      ))}

      {/* Y축 (페이스) */}
      {(current.length > 0 ? current : previous).filter((_, i) => i % 2 === 0).map(({ dist, pace }) => (
        <text key={dist} x={padL - 4} y={sy(pace) + 4} fontSize="8" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="end">
          {secToMmss(pace)}
        </text>
      ))}
    </svg>
  );
}
