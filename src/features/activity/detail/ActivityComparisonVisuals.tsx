import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartFrame, Select, Stat, Text } from "../../../theme";
import { comparableCurves } from "./activityGrowth";
import { hrZoneDistribution, powerZoneDistribution, type MetricsLike } from "./metricsPresentation";

type CurvePoint = ReturnType<typeof comparableCurves>[number];
function pace(value: number) {
  const seconds = Math.round(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function duration(seconds: number) { return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${seconds / 60}m` : `${seconds / 3600}h`; }
function recordedTime(seconds: number) {
  const rounded = Math.round(seconds);
  return rounded < 60 ? `${rounded}s` : `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, "0")}s`;
}
function Legend() {
  const { t } = useTranslation("activity");
  return <div className="activity-comparison-legend"><Text variant="bodySmall"><span className="activity-comparison-line" />{t("growth.current")}</Text><Text variant="bodySmall" tone="secondary"><span className="activity-comparison-line activity-comparison-line--previous" />{t("growth.previous")}</Text></div>;
}
function Curve({ points, power, running, imperial }: { points: CurvePoint[]; power: boolean; running: boolean; imperial: boolean }) {
  const { t } = useTranslation("activity");
  const id = useId();
  const [selectedDuration, setSelectedDuration] = useState(300);
  const selected = points.find((point) => point.duration === selectedDuration) ?? points[0]!;
  const factor = imperial ? 1 / 1.609344 : 1;
  const asPace = running && !power;
  const convert = (value: number) => power ? value : asPace ? 3600 / value / factor : value * factor;
  const format = (value: number) => asPace ? pace(value) : value.toFixed(power ? 0 : 1);
  const unit = power ? "W" : asPace ? imperial ? "/mi" : "/km" : imperial ? "mph" : "km/h";
  const title = t(power ? "growth.powerCurve" : running ? "growth.paceCurve" : "growth.speedCurve");
  const values = points.flatMap((point) => [convert(point.value), convert(point.baseline)]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = (maximum - minimum || maximum * 0.1 || 1) * 0.15;
  const low = Math.max(0, minimum - padding), high = maximum + padding;
  const first = Math.log(points[0]!.duration), last = Math.log(points[points.length - 1]!.duration);
  const x = (seconds: number) => last === first ? 210 : 62 + (Math.log(seconds) - first) / (last - first) * 274;
  const y = (value: number) => 24 + (asPace ? (value - low) : (high - value)) / (high - low) * 118;
  const delta = convert(selected.value) - convert(selected.baseline);
  const roundedDelta = Number(delta.toFixed(asPace || power ? 0 : 1));
  const deltaText = `${roundedDelta > 0 ? "+" : ""}${roundedDelta.toFixed(asPace || power ? 0 : 1)} ${asPace ? imperial ? "s/mi" : "s/km" : unit}`;
  return <section className="space-y-3">
    <ChartFrame variant="embedded" header={<Text as="h4" variant="subtitle">{title}</Text>}>
      <Legend />
      <svg className="activity-comparison-curve" viewBox="0 0 360 176" role="img" aria-label={title}>
        {[0, 0.5, 1].map((fraction) => {
          const value = asPace ? low + (high - low) * fraction : high - (high - low) * fraction;
          return <g key={fraction}><line x1={62} x2={336} y1={24 + fraction * 118} y2={24 + fraction * 118} stroke="var(--grid-soft)" /><text x={54} y={29 + fraction * 118} textAnchor="end" fill="var(--chart-grid-label)">{format(value)}</text></g>;
        })}
        <line x1={x(selected.duration)} x2={x(selected.duration)} y1={24} y2={142} stroke="var(--line-soft)" />
        {(["value", "baseline"] as const).map((key) => <g key={key}>
          <polyline points={points.map((point) => `${x(point.duration)},${y(convert(point[key]))}`).join(" ")} fill="none" stroke={key === "value" ? "var(--accent)" : "var(--ink-2)"} strokeWidth={2} strokeDasharray={key === "baseline" ? "6 4" : undefined} />
          {points.map((point) => <circle key={point.duration} cx={x(point.duration)} cy={y(convert(point[key]))} r={point.duration === selected.duration ? 4 : 2} fill={key === "value" ? "var(--accent)" : "var(--ink-2)"} />)}
        </g>)}
        {[points[0]!, ...(points.length > 2 ? [points[Math.floor(points.length / 2)]!] : []), ...(points.length > 1 ? [points[points.length - 1]!] : [])].map((point) => <text key={point.duration} x={x(point.duration)} y={166} textAnchor="middle" fill="var(--chart-grid-label)">{duration(point.duration)}</text>)}
        {points.map((point, index) => {
          const start = index === 0 ? 62 : (x(points[index - 1]!.duration) + x(point.duration)) / 2;
          const end = index === points.length - 1 ? 336 : (x(point.duration) + x(points[index + 1]!.duration)) / 2;
          return <rect key={point.duration} data-duration={point.duration} x={start} y={24} width={end - start} height={118} fill="transparent" className="activity-comparison-hit" onClick={() => setSelectedDuration(point.duration)}><title>{duration(point.duration)}</title></rect>;
        })}
        <text x={62} y={15} fill="var(--chart-grid-label)">{unit}</text>
      </svg>
      <label className="activity-comparison-duration" htmlFor={id}><Text variant="bodySmall" tone="secondary">{t("growth.visual.duration")}</Text><Select id={id} value={selected.duration} onChange={(event) => setSelectedDuration(Number(event.target.value))}>{points.map((point) => <option key={point.duration} value={point.duration}>{duration(point.duration)}</option>)}</Select></label>
      <div className="activity-comparison-values"><Stat compact label={t("growth.current")} value={format(convert(selected.value))} unit={unit} /><Stat compact label={t("growth.previous")} value={format(convert(selected.baseline))} unit={unit} /></div>
      <Text as="p" variant="bodySmall" tone="secondary">{t("growth.change")} <span className="whitespace-nowrap">{deltaText}</span></Text>
      <Text as="p" variant="caption" tone="tertiary">{t("growth.visual.curveNote")}</Text>
    </ChartFrame>
  </section>;
}
function Zones({ current, previous, power }: { current: MetricsLike; previous: MetricsLike; power: boolean }) {
  const { t } = useTranslation("activity");
  const read = (metrics: MetricsLike) => {
    const seconds = power ? metrics.powerZoneSec : metrics.hrZoneSec;
    return seconds?.length === (power ? 7 : 5) && Array.from(seconds).every((value) => Number.isFinite(value) && value >= 0) && seconds.some((value) => value > 0)
      ? power ? powerZoneDistribution(metrics) : hrZoneDistribution(metrics) : null;
  };
  const left = read(current), right = read(previous);
  if (!left && !right) return null;
  const context = (metrics: MetricsLike) => power
    ? `${typeof metrics.isVirtualPower === "boolean" ? t(metrics.isVirtualPower ? "growth.virtualPower" : "growth.measuredPower") : t("growth.powerUnknown")} · FTP ${metrics.contextSnapshot?.ftp && Number.isFinite(metrics.contextSnapshot.ftp) && metrics.contextSnapshot.ftp > 0 ? metrics.contextSnapshot.ftp : "—"} W`
    : metrics.hrZoneBoundaries && Number.isFinite(metrics.hrZoneBoundaries.referenceBpm) && metrics.hrZoneBoundaries.referenceBpm > 0 ? `${t(metrics.hrZoneBoundaries.reference === "lthr" ? "growth.visual.lthr" : "growth.visual.maxHr")} ${metrics.hrZoneBoundaries.referenceBpm} bpm` : t("growth.visual.unknownContext");
  const boundary = (metrics: MetricsLike, zone: number) => {
    const entry = metrics.hrZoneBoundaries?.zones?.find((item) => item.zone === zone);
    return entry && Number.isFinite(entry.minBpm) && (entry.maxBpmExclusive === null || Number.isFinite(entry.maxBpmExclusive))
      ? entry.maxBpmExclusive == null ? `≥${entry.minBpm} bpm` : `${entry.minBpm}–<${entry.maxBpmExclusive} bpm` : "—";
  };
  const zones = [...new Set([...(left ?? []).map((zone) => zone.zone), ...(right ?? []).map((zone) => zone.zone)])];
  return <section className="space-y-3"><Text as="h4" variant="subtitle">{t(power ? "growth.powerZones" : "growth.hrZones")}</Text><Legend />
    <Text as="p" variant="caption" tone="tertiary">{t("growth.current")}: {left ? context(current) : "—"} · {t("growth.previous")}: {right ? context(previous) : "—"}</Text>
    <div className="space-y-3">{zones.map((zone) => <div key={zone} className="activity-comparison-zone"><Text variant="bodySmall" weight={600}>Z{zone}</Text><div className="space-y-2">{[left, right].map((distribution, index) => {
      const value = distribution?.find((item) => item.zone === zone);
      return <div key={index} className="activity-comparison-zone-row"><div className="activity-comparison-zone-track" aria-hidden="true">{value && <span className={index ? "activity-comparison-zone-fill activity-comparison-zone-fill--previous" : "activity-comparison-zone-fill"} style={{ width: `${value.percentage}%` }} />}</div><Text variant="bodySmall" mono><span className="sr-only">{t(index ? "growth.previous" : "growth.current")} </span>{value ? `${value.percentage.toFixed(1)}% · ${recordedTime(value.seconds)}` : "—"}</Text></div>;
    })}{!power && <Text as="p" variant="caption" tone="tertiary">{t("growth.current")}: {boundary(current, zone)} · {t("growth.previous")}: {boundary(previous, zone)}</Text>}</div></div>)}</div><Text as="p" variant="caption" tone="tertiary">{t("growth.visual.zoneNote")}</Text>
  </section>;
}
export function ActivityComparisonVisuals({ current, previous, running, units }: { current: MetricsLike; previous: MetricsLike; running: boolean; units: string }) {
  const { t } = useTranslation("activity");
  const incompatiblePower = typeof current.isVirtualPower !== "boolean" || current.isVirtualPower !== previous.isVirtualPower;
  return <div className="space-y-6">{[false, true].map((power) => {
    const points = comparableCurves(current, previous, power);
    return points.length > 0 ? <Curve key={String(power)} points={points} power={power} running={running} imperial={units === "imperial"} /> : null;
  })}{incompatiblePower && (Object.keys(current.mmp ?? {}).length > 0 || Object.keys(previous.mmp ?? {}).length > 0) && <Text as="p" variant="caption" tone="tertiary">{t("growth.visual.powerUnavailable")}</Text>}
    <Zones current={current} previous={previous} power={false} /><Zones current={current} previous={previous} power />
  </div>;
}
