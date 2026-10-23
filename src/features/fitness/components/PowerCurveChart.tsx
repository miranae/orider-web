import "./fitness-analysis-controls.css";
import "./PowerCurveChart.css";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { createPortal } from "react-dom";
import { TooltipContent } from "../../../theme/components/TooltipContent";
import InfoTip from "../../../components/InfoTip";
import { ChartGridLine, DropdownSelect, Stat, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { makeDurationLabel, type PowerCurvePoint } from "../fitnessPageUtils";

export default function PowerCurveChart({
  current,
  previous,
  expected,
  stableSelection = false,
}: {
  current: PowerCurvePoint[];
  previous: PowerCurvePoint[];
  expected?: PowerCurvePoint[];
  stableSelection?: boolean;
}) {
  const { t } = useTranslation("fitness");
  const durationLabel = makeDurationLabel(t);
  const id = useId();
  const [selectedDuration, setSelectedDuration] = useState(300);
  const selected = current.find(point => point.durationSeconds === selectedDuration) ?? current[0];
  const previousSelected = selected && previous.find(point => point.durationSeconds === selected.durationSeconds);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [anchor, setAnchor] = useState({ left: 8, top: 8 });
  useEffect(() => {
    if (hoverIdx === null) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setHoverIdx(null); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [hoverIdx]);
  const w = 480;
  const h = 200;
  const xMin = 1;
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

  const xTicks = [1, 60, 300, 1200, 3600];
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

  return (
    <div className="fitness-analysis-controls power-curve-evidence">
    <div className="power-curve-evidence__plot">
    <svg viewBox={`0 0 ${w} ${h + 10}`} preserveAspectRatio="none" className="power-curve-evidence__chart">
      {[0.25, 0.5, 0.75].map((p) => (
        <ChartGridLine key={p} x1="0" x2={w} y1={h * p} y2={h * p} />
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
              onPointerEnter={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const width = Math.min(320, window.innerWidth - 16);
                setAnchor({ left: Math.max(8, Math.min(rect.left - width / 2, window.innerWidth - width - 8)), top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 192)) });
                setHoverIdx(i);
              }}
              onClick={() => setSelectedDuration(pt.durationSeconds)}
              onPointerLeave={() => setHoverIdx(null)}
            />
          ))}
        </>
      )}
    </svg>
    <div className="power-curve-evidence__axis" aria-hidden="true">{xTicks.map(tick => <span key={tick} style={{ left: `${sx(tick) / w * 100}%` }}>{tick < 60 ? `${tick}s` : tick < 3600 ? `${tick / 60}m` : `${tick / 3600}h`}</span>)}</div>
    </div>
    {hover && createPortal(<TooltipContent title={durationLabel(hover.durationSeconds)} role="tooltip"
      style={{ position: "fixed", ...anchor, width: "min(320px, calc(100vw - 16px))", zIndex: 100, pointerEvents: "none" }}>
      <span className="flex flex-col gap-2">{rows.map(([label, value]) => <span key={label} className="flex justify-between gap-3"><span>{label}</span><strong style={{ color: "var(--ink-1)", whiteSpace: "nowrap" }}>{value} W</strong></span>)}</span>
    </TooltipContent>, document.body)}
    {selected && <div className="power-curve-evidence__selection">
      <div className="power-curve-evidence__duration">
      <div className="power-curve-evidence__duration-heading"><label htmlFor={id}><Text variant="bodySmall" tone="secondary">{t("powerCurve.durationSelect")}</Text></label>
      <InfoTip title={durationLabel(selected.durationSeconds)} label={`${durationLabel(selected.durationSeconds)} · ${t("powerCurve.tooltip.current")}`} content={[
        `${t("powerCurve.tooltip.current")}: ${Math.round(selected.maxPower)} W`,
        ...(previousSelected ? [`${t("powerCurve.tooltip.previous")}: ${Math.round(previousSelected.maxPower)} W`] : []),
        ...(powerAt(expected ?? [], selected.durationSeconds) != null ? [`${t("powerCurve.tooltip.expected")}: ${Math.round(powerAt(expected ?? [], selected.durationSeconds)!)} W`] : []),
      ].join(" · ")} className="power-curve-evidence__values-info">{t("powerCurve.valuesInfo")}</InfoTip></div>
      <DropdownSelect id={id} label={t("powerCurve.durationSelect")} value={String(selected.durationSeconds)} onChange={next => setSelectedDuration(Number(next))} options={current.map((point) => ({ value: String(point.durationSeconds), label: durationLabel(point.durationSeconds) }))} />
      </div>
      <div className="power-curve-evidence__values" data-stable={stableSelection || undefined}>{[selected, previousSelected].map((point, index) => <div key={index} className="space-y-2"><Stat compact label={t(index ? "period.previous" : "period.recent")} value={point ? point.maxPower.toFixed(0) : "—"} unit={point ? "W" : undefined} /><div className="power-curve-evidence__source">{point?.sourceActivityId && point.startTime != null ? <LocalizedLink className="underline" to={`/activity/${encodeURIComponent(point.sourceActivityId)}`}><Text variant="bodySmall">{t("powerCurve.source", { date: new Date(point.startTime).toLocaleDateString() })}</Text></LocalizedLink> : stableSelection ? <Text variant="caption" tone="secondary">{t("powerCurve.sourceUnavailable")}</Text> : null}</div></div>)}</div>
    </div>}
    <Text as="p" className="power-curve-evidence__note" variant="caption" tone="tertiary">{t("powerCurve.windowNote")}</Text>
    </div>
  );
}
