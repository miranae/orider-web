import { useId, useState, type KeyboardEvent, type PointerEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { RunPacePoint } from "../../features/fitness/fitnessCurveDocuments";
import ChartEmptyState from "./ChartEmptyState";
import { Card, ChartFrame, ChartLegend, ChartGridLine, ChartAxisLine, ChartValue, DataTable, Text } from "../../theme/components";
import "./CriticalPaceCurve.css";

interface CriticalPaceCurveProps {
  color?: string;
  stableSelection?: boolean;
  recentPoints?: readonly RunPacePoint[];
  prevPoints?: readonly RunPacePoint[];
}

const xTicks = [0.5, 1, 5, 10, 30, 60, 120];
// 5K ~22min, 10K ~46min, 하프 ~100min — "5K"/"10K" are proper nouns kept as-is
const REF_MARKER_BASE = [
  { dur: 22, label: "5K" },
  { dur: 46, label: "10K" },
];

export default function CriticalPaceCurve({ color = "var(--amber)", stableSelection = false, recentPoints = [], prevPoints = [] }: CriticalPaceCurveProps) {
  const { t } = useTranslation("dashboard");
  const { t: fitnessT } = useTranslation("fitness");
  const chartId = useId();
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
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

  // Y: 더 빠른 페이스(작은 초/km)는 위쪽에 표시한다.
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

  const durations = [...new Set([...recentPoints, ...prevPoints].map(point => point.durationSec))].sort((a, b) => a - b);
  const selected = selectedDuration != null && durations.includes(selectedDuration) ? selectedDuration : stableSelection ? [1800, 1200, 300].find(duration => durations.includes(duration)) ?? durations[0] ?? null : null;
  const durationLabel = (seconds: number) => seconds < 60 ? `${seconds}s` : seconds % 3600 !== 0 ? `${seconds / 60}m` : `${seconds / 3600}h`;
  const choosePointer = (event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !Number.isFinite(event.clientX)) return;
    const x = padL + (event.clientX - bounds.left) / bounds.width * chartW;
    setSelectedDuration(durations.reduce((best, duration) => Math.abs(sx(duration / 60) - x) < Math.abs(sx(best / 60) - x) ? duration : best));
  };
  const navigate = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") { event.preventDefault(); setSelectedDuration(null); return; }
    let index = selected == null ? -1 : durations.indexOf(selected);
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = durations.length - 1;
    else if (event.key === "ArrowLeft") index = Math.max(0, (index < 0 ? durations.length : index) - 1);
    else if (event.key === "ArrowRight") index = Math.min(durations.length - 1, index + 1);
    else return;
    event.preventDefault();
    setSelectedDuration(durations[index]!);
  };

  return (
    <div className="critical-pace-curve space-y-3">
    <ChartLegend items={[{ label: fitnessT("period.recent"), color }, { label: fitnessT("period.previous"), color: "var(--ink-3)", dasharray: "5 4" }]} />
    <ChartFrame variant="embedded">
    <p id={`${chartId}-periods`} className="critical-pace-curve__note">{fitnessT("criticalPace.periodNote")}</p>
    <div className="critical-pace-curve__references" aria-label={fitnessT("criticalPace.referenceNote")}>
      {refMarkers.map(({ dur, label }) => <span key={label}>{label} · {dur}m</span>)}
    </div>
    <div className="critical-pace-curve__chart">
      <div className="critical-pace-curve__y-axis" aria-hidden="true"><span>/km</span>{[paceMin, (paceMin + paceMax) / 2, paceMax].map(pace => <span key={pace} style={{ top: `${(sy(pace) - padT) / chartH * 100}%` }}>{secToMmss(pace)}</span>)}</div>
      <svg role="img" tabIndex={0} aria-labelledby={`${chartId}-title`} aria-describedby={`${chartId}-description ${chartId}-periods ${chartId}-reference-note${selected != null ? ` ${chartId}-tooltip` : ""}`} viewBox={`${padL} ${padT} ${chartW} ${chartH}`} preserveAspectRatio="none" className="critical-pace-curve__plot"
        onFocus={stableSelection ? undefined : () => setSelectedDuration(durations[durations.length - 1]!)} onKeyDown={navigate}
        onPointerMove={stableSelection ? undefined : choosePointer} onPointerDown={choosePointer} onClick={choosePointer}>
        <title id={`${chartId}-title`}>{fitnessT("criticalPace.title")}</title>
        <desc id={`${chartId}-description`}>{fitnessT("criticalPace.description")} {fitnessT("chartDetail.navigate")}</desc>
        {[paceMin, (paceMin + paceMax) / 2, paceMax].map(pace => <ChartGridLine key={pace} x1={padL} x2={w - padR} y1={sy(pace)} y2={sy(pace)} />)}
        {refMarkers.map(({ dur, label }) => <ChartAxisLine key={label} x1={sx(dur)} x2={sx(dur)} y1={padT} y2={padT + chartH} strokeDasharray="3 3" />)}
        {previous.length > 0 && <path d={toPath(previous)} stroke="var(--ink-3)" strokeWidth="1.5" fill="none" strokeDasharray="5 4" />}
        {previous.map(({ dur, pace }, i) => <circle key={i} cx={sx(dur)} cy={sy(pace)} r="3" fill="var(--ink-3)" />)}
        {current.length > 0 && <path d={toPath(current)} stroke={color} strokeWidth="2" fill="none" />}
        {current.map(({ dur, pace }, i) => <circle key={i} cx={sx(dur)} cy={sy(pace)} r="3" fill={color} />)}
        {selected != null && <line x1={sx(selected / 60)} x2={sx(selected / 60)} y1={padT} y2={padT + chartH} stroke="var(--ink-2)" strokeDasharray="3 3" />}
      </svg>
      <div className="critical-pace-curve__x-axis" aria-hidden="true">{xTicks.map((duration, index) => <span key={duration} data-edge={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : undefined} style={{ left: `${(sx(duration) - padL) / chartW * 100}%` }}>{durationLabel(duration * 60)}</span>)}</div>
    </div>
    <p id={`${chartId}-reference-note`} className="critical-pace-curve__note">{fitnessT("criticalPace.referenceNote")}</p>
    {selected != null && <Card variant="inset" padding="compact" id={`${chartId}-tooltip`} className={stableSelection ? "critical-pace-curve__readout" : undefined} tabIndex={stableSelection ? 0 : undefined} aria-label={stableSelection ? fitnessT("criticalPace.duration") : undefined} role="status" aria-live="polite">
      <Text as="p" variant="bodySmall">{fitnessT("criticalPace.duration")} · {durationLabel(selected)}</Text>
      <div className="critical-pace-curve__values">{[{ label: fitnessT("period.recent"), point: recentPoints.find(point => point.durationSec === selected) }, { label: fitnessT("period.previous"), point: prevPoints.find(point => point.durationSec === selected) }].map(({ label, point }) => <ChartValue key={label} primary={point ? `${secToMmss(point.paceSecPerKm)} /km` : "—"} secondary={label} />)}</div>
      <Text as="p" variant="bodySmall" tone="secondary">{fitnessT("criticalPace.periodNote")}</Text>
    </Card>}
    </ChartFrame>
    <DataTable caption={fitnessT("criticalPace.title")} captionVisibility="screen-reader" rows={durations} rowKey={duration => String(duration)} emptyLabel={t("charts.fitness.noData")} columns={[
      { id: "duration", header: fitnessT("criticalPace.duration"), rowHeader: true, cell: duration => duration < 60 ? `${duration}s` : `${duration / 60}m` },
      ...([{ id: "recent", points: recentPoints }, { id: "previous", points: prevPoints }]).map(({ id, points }) => ({ id, header: fitnessT(`criticalPace.${id}`), align: "end" as const, cell: (duration: number) => { const point = points.find(point => point.durationSec === duration); return <ChartValue primary={point ? `${secToMmss(point.paceSecPerKm)} /km` : "—"} />; } })),
    ]} /></div>
  );
}
