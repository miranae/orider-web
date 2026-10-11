import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityPowerWindowInput } from "@shared/types/activity-range-analysis";
import { ChartFrame, Input, Select, Text } from "../../../theme";
import { usePowerDurationWindows } from "../../../hooks/usePowerDurationWindows";
import { formatElapsedBoundary } from "./activityRangeSelection";
import "./activity-growth-panel.css";

/** 선택 범위의 측정 구간으로만 계산한다. 서버 정본·기간 PR을 대체하지 않는다. */
export default function PowerDurationWindowsPanel({ input, identity }: { input: ActivityPowerWindowInput; identity: string }) {
  const { t } = useTranslation("activity");
  const id = useId();
  const [duration, setDuration] = useState(String(input.state === "available" ? Math.min(17, input.longestContinuousSeconds) : 17));
  const seconds = Number(duration);
  const result = usePowerDurationWindows(input, identity, seconds);
  const longest = input.state === "available" ? input.longestContinuousSeconds : 0;
  const valid = duration.trim() !== "" && Number.isFinite(seconds) && seconds > 0 && seconds <= longest;
  const max = Math.max(1, ...result.points.map(point => point.maxPower));
  const x = (value: number) => 68 + (longest > 1 ? Math.log(Math.max(1, value)) / Math.log(longest) : 0) * 276;
  const y = (value: number) => 112 - value / max * 88;
  return <section className="space-y-3" aria-label={t("powerWindows.title")}>
    <Text as="h4" variant="subtitle">{t("powerWindows.title")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("powerWindows.scope", { start: formatElapsedBoundary(input.rangeStartElapsedSec), end: formatElapsedBoundary(input.rangeEndElapsedSec) })}</Text>
    {input.state !== "available" ? <Text as="p" variant="bodyMedium" tone="secondary" role="status">{t(`powerWindows.reason.${input.reason}`)}</Text> : <>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("powerWindows.basis", { source: t(`powerWindows.source.${input.provenance}`) })}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("powerWindows.limit", { duration: formatElapsedBoundary(longest) })}</Text>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-duration`}><Text as="span" variant="bodyMedium">{t("powerWindows.duration")}</Text><Input id={`${id}-duration`} mono type="number" min="0" max={longest} step="any" value={duration} aria-invalid={!valid} aria-describedby={`${id}-hint`} className="min-h-[calc(var(--space-4)*2+var(--space-3))]" onChange={event => setDuration(event.target.value)} /></label>
        <label htmlFor={`${id}-preset`}><Text as="span" variant="bodyMedium">{t("powerWindows.calculated")}</Text><Select id={`${id}-preset`} value={duration} className="min-h-[calc(var(--space-4)*2+var(--space-3))]" onChange={event => setDuration(event.target.value)}><option value={duration}>{valid ? formatElapsedBoundary(seconds) : "—"}</option>{[...new Set([...result.points.map(point => point.durationSeconds), 17, 5400, 7200])].sort((a, b) => a - b).filter(value => String(value) !== duration).map(value => <option key={value} value={value} disabled={value > longest}>{formatElapsedBoundary(value)}</option>)}</Select></label>
      </div>
      <Text id={`${id}-hint`} as="p" variant="bodyMedium" tone="secondary">{t(valid ? "powerWindows.exact" : "powerWindows.invalid")}</Text>
      <Text as="p" variant="bodyMedium" mono role="status">{result.state === "unavailable" || result.selectedState === "unavailable" ? t("powerWindows.failed") : !valid ? "—" : result.point ? `${formatElapsedBoundary(result.point.durationSeconds)} · ${result.point.maxPower.toFixed(1)} W` : t("powerWindows.loading")}</Text>
      {result.points.length > 0 && <div className="activity-comparison-curve-section"><ChartFrame variant="embedded"><svg viewBox="0 0 360 144" className="activity-comparison-curve" role="img" aria-label={t("powerWindows.calculated")}>
        <line x1="68" y1="112" x2="344" y2="112" stroke="var(--grid-axis)" />
        <text x="62" y="26" textAnchor="end" fill="var(--ink-1)">{max.toFixed(0)} W</text><text x="62" y="112" textAnchor="end" fill="var(--ink-1)">0 W</text>
        <text x="68" y="136" fill="var(--ink-1)">{formatElapsedBoundary(result.points[0]!.durationSeconds)}</text><text x="344" y="136" textAnchor="end" fill="var(--ink-1)">{formatElapsedBoundary(longest)}</text>
        {result.points.map(point => <circle key={point.durationSeconds} cx={x(point.durationSeconds)} cy={y(point.maxPower)} r="3" fill="var(--chart-power)"><title>{formatElapsedBoundary(point.durationSeconds)} · {point.maxPower.toFixed(1)} W</title></circle>)}
      </svg></ChartFrame></div>}
    </>}
  </section>;
}
