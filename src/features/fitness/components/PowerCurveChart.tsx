import { useState } from "react";
import { useTranslation } from "react-i18next";

import { makeDurationLabel, type PowerCurvePoint } from "../fitnessPageUtils";

export default function PowerCurveChart({
  current,
  previous,
  expected,
}: {
  current: PowerCurvePoint[];
  previous: PowerCurvePoint[];
  expected?: PowerCurvePoint[];
}) {
  const { t } = useTranslation("fitness");
  const durationLabel = makeDurationLabel(t);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const w = 480;
  const h = 200;
  const xMin = 5;
  const xMax = 3600;
  const yMax = Math.max(
    ...current.map((p) => p.maxPower),
    ...previous.map((p) => p.maxPower),
    ...(expected ?? []).map((p) => p.maxPower),
    100,
  ) * 1.1;

  const sx = (v: number) => (Math.log(Math.max(v, 1)) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin)) * w;
  const sy = (v: number) => h - (v / yMax) * h + 10;

  const line = (pts: PowerCurvePoint[]) =>
    pts.map(({ durationSeconds: x, maxPower: y }, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(" ");

  const xTicks = [5, 60, 300, 1200, 3600];
  const hover = hoverIdx != null ? current[hoverIdx] : null;
  const powerAt = (pts: PowerCurvePoint[], sec: number) =>
    pts.find((p) => p.durationSeconds === sec)?.maxPower;
  const rows: [string, number, string][] = [];
  if (hover) {
    rows.push([t("powerCurve.tooltip.current"), Math.round(hover.maxPower), "var(--lime)"]);
    const pv = powerAt(previous, hover.durationSeconds);
    if (pv != null) rows.push([t("powerCurve.tooltip.previous"), Math.round(pv), "var(--ink-4)"]);
    const ev = powerAt(expected ?? [], hover.durationSeconds);
    if (ev != null) rows.push([t("powerCurve.tooltip.expected"), Math.round(ev), "var(--aqua)"]);
  }
  const ttW = 92;
  const ttH = 20 + rows.length * 15;
  const hx = hover ? sx(hover.durationSeconds) : 0;
  const hy = hover ? sy(hover.maxPower) : 0;
  const ttX = Math.min(Math.max(hx + 8, 0), w - ttW);
  const ttY = Math.max(hy - ttH - 8, 0);

  return (
    <svg viewBox={`0 0 ${w} ${h + 20}`} style={{ width: "100%", height: 220 }}>
      {[0.25, 0.5, 0.75].map((p) => (
        <line key={p} x1="0" x2={w} y1={h * p} y2={h * p} stroke="var(--grid-soft)" />
      ))}
      {previous.length > 0 && (
        <path d={line(previous)} stroke="var(--ink-4)" strokeWidth="1.5" fill="none" strokeDasharray="4 4" />
      )}
      {expected && expected.length > 0 && (
        <path d={line(expected)} stroke="var(--aqua)" strokeWidth="1.5" fill="none" strokeDasharray="2 3" opacity={0.85} />
      )}
      {current.length > 0 && (
        <>
          <path d={line(current)} stroke="var(--lime)" strokeWidth="2" fill="none" />
          {current.map((pt, i) => (
            <circle key={i} cx={sx(pt.durationSeconds)} cy={sy(pt.maxPower)} r="3" fill="var(--lime)" />
          ))}
          {current.map((pt, i) => (
            <circle
              key={`hit-${i}`}
              cx={sx(pt.durationSeconds)}
              cy={sy(pt.maxPower)}
              r="12"
              fill="transparent"
              style={{ cursor: "default" }}
              onPointerEnter={() => setHoverIdx(i)}
              onPointerLeave={() => setHoverIdx(null)}
            />
          ))}
        </>
      )}
      {xTicks.map((tick) => (
        <text key={tick} x={sx(tick)} y={h + 16} style={{ fontSize: "var(--fs-xs)" }} fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="middle">
          {tick < 60 ? `${tick}s` : tick < 3600 ? `${tick / 60}m` : `${tick / 3600}h`}
        </text>
      ))}
      {hover && (
        <g pointerEvents="none">
          <circle cx={hx} cy={hy} r="4.5" fill="none" stroke="var(--lime)" strokeWidth="1.5" />
          <rect x={ttX} y={ttY} width={ttW} height={ttH} rx="6" fill="var(--bg-1)" stroke="var(--line)" strokeWidth="1" opacity="0.98" />
          <text x={ttX + 8} y={ttY + 14} style={{ fontSize: "var(--fs-xs)" }} fontFamily="var(--font-mono)" fill="var(--ink-1)" fontWeight="700">
            {durationLabel(hover.durationSeconds)}
          </text>
          {rows.map(([label, val, color], i) => (
            <g key={label} transform={`translate(${ttX + 8}, ${ttY + 29 + i * 15})`}>
              <text x="0" y="0" style={{ fontSize: "var(--fs-xs)" }} fontFamily="var(--font-mono)" fill="var(--ink-2)">{label}</text>
              <text x={ttW - 16} y="0" style={{ fontSize: "var(--fs-xs)" }} fontFamily="var(--font-mono)" fill={color} fontWeight="700" textAnchor="end">{val}W</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
