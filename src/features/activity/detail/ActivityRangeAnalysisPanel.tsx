import { zoneSurfaceStyle } from "../../../theme/charts/zoneSurface";
import type { ActivityRangeAnalysisResponse } from "@shared/types/activity-range-analysis";
import type { HrZoneBoundaries } from "@shared/training/hrZoneTable";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Stack, Stat, Text, ToggleButton, ToggleControls } from "../../../theme";
import { useLocale } from "../../../contexts/LocaleContext";
import { useActivityRangeAnalysis } from "../../../hooks/useActivityRangeAnalysis";
import type { ActivityRangeSelectionModel } from "../../../hooks/useActivityRangeSelection";
import { validElapsedRange, formatElapsedBoundary, parseElapsedBoundary } from "./activityRangeSelection";
import "./activity-range-analysis.css";
import PowerDurationWindowsPanel from "./PowerDurationWindowsPanel";

interface Props { activityId: string; selection: ActivityRangeSelectionModel; sport: string; callableEnabled?: boolean; previewActive?: boolean }

export function ActivityRangeControls({ selection }: { selection: ActivityRangeSelectionModel }) {
  const { t } = useTranslation("activity");
  if (!selection.ownerUid) return null;
  return <section className="activity-range-controls space-y-3" aria-label={t("rangeAnalysis.controls")}>
    <Stack direction="row" wrap align="center" gap="var(--space-2)">
      <ToggleControls variant="axis" aria-label={t("rangeAnalysis.controls")}><ToggleButton selected={selection.xAxis === "distance"} onClick={() => selection.setXAxis("distance")}>{t("rangeAnalysis.distanceAxis")}</ToggleButton>
      <ToggleButton disabled={!selection.sampledAxis} selected={selection.xAxis === "elapsed"} onClick={() => selection.setXAxis("elapsed")}>{t("rangeAnalysis.elapsedAxis")}</ToggleButton></ToggleControls>
      <Button size="sm" variant="secondary" aria-pressed={selection.enabled} onClick={selection.toggle}>{t(selection.enabled ? "rangeAnalysis.endSelection" : "rangeAnalysis.select")}</Button>
    </Stack>
    {selection.enabled && (Number.isFinite(selection.durationSec) && selection.durationSec > 0 ? <RangeTimeControls key={`${selection.identity}:${selection.selection?.requestId ?? "none"}`} selection={selection} />
      : <Text as="p" variant="bodyMedium" tone="secondary">{t("rangeAnalysis.unknownAxis")}</Text>)}
    {selection.enabled && selection.selection && <Text as="p" variant="bodyMedium" mono>{t("rangeAnalysis.boundaryLegend", { start: formatElapsedBoundary(selection.selection.startOffsetSec), end: formatElapsedBoundary(selection.selection.endOffsetSec) })}</Text>}
  </section>;
}

function RangeTimeControls({ selection }: { selection: ActivityRangeSelectionModel }) {
  const { t } = useTranslation("activity");
  const id = useId();
  const [start, setStart] = useState(formatElapsedBoundary(selection.selection?.startOffsetSec ?? selection.axis?.[0] ?? 0));
  const [end, setEnd] = useState(formatElapsedBoundary(selection.selection?.endOffsetSec ?? selection.axis?.[selection.axis.length - 1] ?? selection.durationSec));
  const startOffsetSec = parseElapsedBoundary(start), endOffsetSec = parseElapsedBoundary(end);
  const range = startOffsetSec != null && endOffsetSec != null ? { startOffsetSec, endOffsetSec } : null;
  const valid = range != null && validElapsedRange(range, selection.durationSec);
  return <div className="space-y-3">
    <div className="activity-range-time-inputs">
      <label htmlFor={`${id}-start`}><Text variant="bodyMedium">{t("rangeAnalysis.start")}</Text><Input id={`${id}-start`} mono type="text" inputMode="text" placeholder="mm:ss" aria-invalid={!valid} aria-describedby={!valid ? `${id}-error` : undefined} value={start} onChange={event => setStart(event.target.value)} /></label>
      <label htmlFor={`${id}-end`}><Text variant="bodyMedium">{t("rangeAnalysis.end")}</Text><Input id={`${id}-end`} mono type="text" inputMode="text" placeholder="mm:ss" aria-invalid={!valid} aria-describedby={!valid ? `${id}-error` : undefined} value={end} onChange={event => setEnd(event.target.value)} /></label>
    </div>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={!valid} onClick={() => { if (valid && range) selection.select(range); }}>{t("rangeAnalysis.apply")}</Button>
      <Button size="sm" variant="ghost" disabled={!selection.selection} onClick={selection.clear}>{t("rangeAnalysis.clear")}</Button></div>
    {!valid && <Text id={`${id}-error`} as="p" variant="bodyMedium" tone="secondary" role="alert">{t("rangeAnalysis.invalidTime")}</Text>}
    {!selection.axis && <Text as="p" variant="bodyMedium" tone="secondary">{t("rangeAnalysis.noRouteAxis")}</Text>}
    <Text as="p" variant="bodyMedium" tone="secondary">{t("rangeAnalysis.shortHint")}</Text>
    <details className="activity-range-details"><summary>{t("rangeAnalysis.howToSelect")}</summary><Text as="p" variant="bodyMedium" tone="secondary">{t("rangeAnalysis.selectionHint")}</Text></details>
  </div>;
}

function RangeZones({ values, count, title, boundaries, sheen = false }: { sheen?: boolean; values: number[] | null; count: number; title: string; boundaries?: HrZoneBoundaries | null }) {
  const { t } = useTranslation("activity");
  if (!values || values.length !== count || Array.from(values).some(value => !Number.isFinite(value) || value < 0)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return <section aria-label={title}><Text as="h4" variant="bodyMedium" weight={600}>{title}</Text><Text as="p" variant="bodyMedium" tone="secondary">{t("rangeAnalysis.zeroObservedZones")}</Text></section>;
  return <section className="space-y-3" aria-label={title}>
    <Text as="h4" variant="bodyMedium" weight={600}>{title}</Text>
    {values.map((seconds, index) => <div key={index} className="flex items-center gap-3">
      <div><Text variant="bodyMedium">Z{index + 1}</Text>{boundaries?.zones[index] && <Text as="div" variant="bodyMedium" tone="tertiary">{boundaries.zones[index]!.minBpm}{boundaries.zones[index]!.maxBpmExclusive != null ? `–<${boundaries.zones[index]!.maxBpmExclusive}` : ` ${t("rangeAnalysis.orAbove")}`} bpm</Text>}</div>
      <div className="flex-1 rounded-[var(--r-sm)] overflow-hidden bg-[var(--bg-2)]" aria-hidden="true"><div className="py-1" style={{ width: `${seconds / total * 100}%`, background: `var(--zone-${Math.min(index + 1, 5)})`, ...(sheen ? zoneSurfaceStyle : {}) }} /></div>
      <Text variant="bodyMedium" mono>{formatElapsedBoundary(seconds)} · {(seconds / total * 100).toFixed(1)}%</Text>
    </div>)}
    {boundaries && <Text as="p" variant="bodyMedium" tone="tertiary">{t("rangeAnalysis.recordedHrReference", { reference: boundaries.reference === "lthr" ? "LTHR" : t("analysis.metric.maxHr"), bpm: boundaries.referenceBpm })}</Text>}
    <Text as="p" variant="bodyMedium" tone="tertiary">{t("rangeAnalysis.zoneBasis")}</Text>
  </section>;
}

/** 저장된 관측 구간의 양 끝 차이만 표시한다. 센서 분석의 성공 여부와 독립적이다. */
function RangeElevationReading({ response }: { response: ActivityRangeAnalysisResponse }) {
  const { t } = useTranslation("activity"), { units, locale } = useLocale();
  const elevation = response.elevation;
  if (!elevation || elevation.state !== "available") return <Text as="p" variant="bodyMedium" tone="secondary">{t("rangeAnalysis.elevation.unavailable")}</Text>;
  const number = (raw: number | null, factor = 1, signed = false) => {
    if (raw === null) return "—";
    const value = raw * factor;
    if (!Number.isFinite(value) || raw !== 0 && value === 0) return "—";
    const fixed = value.toFixed(2);
    // 긴 유효 값과 반올림으로 0이 되는 작은 값을 같은 폭 안에서 보존한다.
    const formatted = fixed.length > 12 || value !== 0 && Number(fixed) === 0
      ? new Intl.NumberFormat(locale, { notation: "scientific", maximumSignificantDigits: 3 }).format(value)
      : fixed;
    return `${signed && value > 0 ? "+" : ""}${formatted}`;
  };
  return <section className="space-y-3" aria-label={t("rangeAnalysis.elevation.title")}>
    <Text as="h4" variant="bodyMedium" weight={600}>{t("rangeAnalysis.elevation.title")}</Text>
    <div className="activity-range-stats">
      <Stat compact label={t("rangeAnalysis.elevation.netChange")} value={number(elevation.netElevationChangeM, units === "imperial" ? 1 / 0.3048 : 1, true)} unit={units === "imperial" ? "ft" : "m"} />
      <Stat compact label={t("rangeAnalysis.elevation.counterDistance")} value={number(elevation.distanceM, units === "imperial" ? 1 / 1609.344 : 1 / 1000)} unit={units === "imperial" ? "mi" : "km"} />
      <Stat compact label={t("rangeAnalysis.elevation.netGrade")} value={number(elevation.netMeanGradePct, 1, true)} unit={elevation.netMeanGradePct === null ? undefined : "%"} />
    </div>
    <Text as="p" variant="bodyMedium" mono>{t(elevation.boundaryCoverage === "inside_samples" ? "rangeAnalysis.elevation.insideSamples" : "rangeAnalysis.elevation.exactSamples", { start: formatElapsedBoundary(elevation.observedSelection.startOffsetSec), end: formatElapsedBoundary(elevation.observedSelection.endOffsetSec) })}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("rangeAnalysis.elevation.basis", { source: t(`rangeAnalysis.elevation.sources.${elevation.declaredActivitySource ?? "unknown"}`) })}</Text>
    <a className="inline-flex items-center min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)] text-[var(--ink-0)] underline" href={`/${locale}/activity/${encodeURIComponent(response.activityId)}`}>{t("rangeAnalysis.elevation.sourceActivity")}</a>
  </section>;
}

export default function ActivityRangeAnalysisPanel({ activityId, selection, sport, callableEnabled = false, previewActive = false }: Props) {
  const locked = selection.sourceLocked;
  // 서버 revision은 같은 입력의 다음 사용자 선택부터 고정한다. 응답 도착 자체는 추가 요청을 만들지 않는다.
  const binding = useRef<{ identity: string; revision?: string; requestId?: string; requestRevision?: string }>({ identity: selection.identity });
  if (binding.current.identity !== selection.identity) binding.current = { identity: selection.identity };
  if (binding.current.requestId !== selection.selection?.requestId) {
    binding.current.requestId = selection.selection?.requestId;
    binding.current.requestRevision = binding.current.revision;
  }
  const analysis = useActivityRangeAnalysis({ activityId, ownerUid: selection.ownerUid, selection: locked ? null : selection.selection,
    inputIdentity: selection.identity, expectedInputRevision: binding.current.requestRevision, callableEnabled, includePowerWindowInput: sport === "bike" || sport === "ride", includeElevation: true });
  if (analysis.response?.state === "changed_input") {
    binding.current.revision = undefined;
    binding.current.requestRevision = undefined;

  }
  else if (analysis.response?.inputRevision) binding.current.revision = analysis.response.inputRevision;
  useEffect(() => {
    if (analysis.response?.state === "changed_input" && !locked) selection.lockSource();
  }, [analysis.response?.state, locked, selection]);
  const visible = locked ? { ...analysis, state: "changed_input" as const, response: null, metrics: null, reason: "source_reload_required" } : analysis;
  return <ActivityRangeAnalysisReading selection={selection} sport={sport} analysis={visible} previewActive={previewActive} onReloadSource={locked ? () => { void selection.reloadSource(); } : undefined} />;
}

/** 서버 결과 읽기는 callable 소유권/요청 상태와 분리한다. 수치 계산은 하지 않는다. */
export function ActivityRangeAnalysisReading({ selection, sport, analysis, previewActive = false, onReloadSource }: Omit<Props, "activityId" | "callableEnabled"> & { analysis: ReturnType<typeof useActivityRangeAnalysis>; onReloadSource?: () => void }) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  if (!selection.enabled || !selection.selection) return null;
  const metrics = analysis.metrics;
  const format = (value: number | null | undefined, factor = 1, decimals = 0) => value != null && Number.isFinite(value) ? (value * factor).toFixed(decimals) : "—";
  const duration = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return "—";
    return formatElapsedBoundary(value);
  };
  const distanceUnit = units === "imperial" ? "mi" : "km", speedUnit = units === "imperial" ? "mph" : "km/h";
  const distanceFactor = units === "imperial" ? 1 / 1609.344 : 1 / 1000, speedFactor = units === "imperial" ? 1 / 1.609344 : 1;
  return <section className="activity-range-reading space-y-4" aria-label={t("rangeAnalysis.title")}>
    <Text as="h3" variant="subtitle">{t("rangeAnalysis.title")}</Text>
    {analysis.state === "available" && metrics && <Text as="p" variant="bodyMedium" tone="secondary">{t(previewActive ? "rangeAnalysis.canonicalPreviewBasis" : "rangeAnalysis.canonicalBasis")}</Text>}
    <Text as="p" variant="bodyMedium" mono>{t("rangeAnalysis.window", { start: duration(selection.selection.startOffsetSec), end: duration(selection.selection.endOffsetSec) })}</Text>
    {(selection.locationUnavailable || selection.clippedBoundary) && <Text as="p" variant="bodyMedium" tone="secondary">{t(selection.locationUnavailable ? "rangeAnalysis.locationUnavailable" : "rangeAnalysis.clippedLocation")}</Text>}
    {!metrics ? <div role="status" className="space-y-3"><Text as="p" variant="bodyMedium" tone="secondary">{t(analysis.reason === "api_unavailable" ? "rangeAnalysis.apiUnavailable" : `rangeAnalysis.${analysis.state}`)}</Text>
      {analysis.reason === "source_reload_required" && onReloadSource && <Button variant="secondary" size="sm" onClick={onReloadSource}>{t("rangeAnalysis.reloadSource")}</Button>}
      {analysis.reason === "request_failed" && <Button variant="secondary" size="sm" onClick={analysis.retry}>{t("page.retry")}</Button>}</div>
      : <>
        <div className="activity-range-stats">
          <Stat compact label={t("rangeAnalysis.elapsed")} value={duration(metrics.elapsedSec)} />
          <Stat compact label={t("rangeAnalysis.moving")} value={duration(metrics.movingSec)} />
          <Stat compact label={t("rangeAnalysis.distance")} value={format(metrics.distanceM, distanceFactor, 2)} unit={metrics.distanceM != null ? distanceUnit : undefined} />
          <Stat compact label={t(sport === "run" ? "rangeAnalysis.pace" : "rangeAnalysis.speed")} value={sport === "run" ? duration(metrics.paceSecPerKm == null ? null : metrics.paceSecPerKm * (units === "imperial" ? 1.609344 : 1)) : format(metrics.avgSpeedKph, speedFactor, 1)} unit={(sport === "run" ? metrics.paceSecPerKm : metrics.avgSpeedKph) != null ? (sport === "run" ? `/${distanceUnit}` : speedUnit) : undefined} />
          <Stat compact label={t("peakInspector.power")} value={format(metrics.averagePowerW)} unit={metrics.averagePowerW != null ? "W" : undefined} />
          <Stat compact label={t("rangeAnalysis.np")} value={format(metrics.normalizedPowerW)} unit={metrics.normalizedPowerW != null ? "W" : undefined} />
          <Stat compact label={t("peakInspector.heartRate")} value={format(metrics.averageHr)} unit={metrics.averageHr != null ? "bpm" : undefined} />
          <Stat compact label={t("peakInspector.cadence")} value={format(metrics.averageCadence)} unit={metrics.averageCadence != null && sport !== "run" ? "rpm" : undefined} />
        </div>
        {sport === "run" && metrics.averageCadence != null && <Text as="p" variant="bodyMedium" tone="secondary">{t("rangeAnalysis.cadenceUnitUnknown")}</Text>}
        <Text as="p" variant="bodyMedium" tone="secondary">{t(metrics.powerSource === "virtual" ? "rangeAnalysis.virtualPower" : "rangeAnalysis.measuredMeans")}</Text>
        {metrics.context.mode === "recorded" && (metrics.hrZoneSec || metrics.powerZoneSec) && <div className="space-y-4">
          <RangeZones values={metrics.hrZoneSec} boundaries={metrics.context.hrZoneBoundaries} count={5} title={t("rangeAnalysis.hrZones")} />
          <RangeZones sheen values={metrics.powerZoneSec} count={7} title={t("rangeAnalysis.powerZones")} />
          {metrics.powerZoneSec && metrics.context.ftp != null && <Text as="p" variant="bodyMedium" tone="tertiary">{t("rangeAnalysis.recordedFtp", { ftp: metrics.context.ftp })}</Text>}
        </div>}
        {(sport === "bike" || sport === "ride") && analysis.response?.powerWindowInput && <div className="activity-range-power-windows"><PowerDurationWindowsPanel input={analysis.response.powerWindowInput} identity={`${selection.identity}:${selection.ownerUid}:${selection.selection.requestId}`} /></div>}
        <details className="activity-range-details"><summary>{t("rangeAnalysis.coverage")}</summary>
          <div className="space-y-2"><Text as="p" variant="bodyMedium" tone="secondary">{t("rangeAnalysis.pause", { time: duration(metrics.pauseSec), heartRate: metrics.maxHr == null ? "—" : `${format(metrics.maxHr)} bpm` })}</Text>
            {metrics.speedBasis && <Text as="p" variant="bodyMedium" tone="secondary">{t(metrics.speedBasis === "moving_time" ? "rangeAnalysis.movingSpeedBasis" : "rangeAnalysis.measuredSpeedBasis")}</Text>}
            {(["power", "heartrate", "cadence", "speed"] as const).map(key => <Text key={key} as="p" variant="bodyMedium" tone="secondary">
            {t(`rangeAnalysis.channel.${key}`)} · {t("rangeAnalysis.observed", { seconds: format(metrics.channels[key].measuredSec, 1, 1), percent: format(metrics.channels[key].fraction, 100, 1) })}</Text>)}
            <Text as="p" variant="bodyMedium" tone="secondary">{t(metrics.diagnostics.gaps ? "rangeAnalysis.gaps" : "rangeAnalysis.noGaps")}</Text>
          </div>
        </details>
      </>}
    {analysis.response && <RangeElevationReading response={analysis.response} />}
  </section>;
}
