import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { RUN_DISTANCES } from "@shared/types/personal-records";
import type { RunDistanceKey } from "@shared/types/personal-records";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { useLocale } from "../../../contexts/LocaleContext";
import { ChartFrame, Select, Text } from "../../../theme";
import { formatPace } from "../../../utils/units";
import { formatElapsedBoundary } from "./activityRangeSelection";
import "./activity-growth-panel.css";
import { observedMedianDifference, observedRunEffortLeaders } from "./observedRunEffortLeaders";

const DURATIONS = [30, 60, 180, 300, 600, 1200, 1800, 3600, 7200];
const BASES = ["run_metrics_pace_curve", "speed_curve_kmh_converted"] as const;
const positive = (value: number) => Number.isFinite(value) && value > 0;

/** 이미 조회한 정본의 관측 분포만 표시한다. 빈 정본을 다른 기준으로 보충하지 않는다. */
export default function RunPeriodEvidencePanel({ response }: { response: TrainingAnalysisPeriodsResponse | null }) {
  const { t, i18n } = useTranslation("activity");
  const { locale, units } = useLocale();
  const id = useId();
  const [basis, setBasis] = useState<string>(BASES[0]);
  const [duration, setDuration] = useState(300);
  const [mode, setMode] = useState("pace");
  const [distance, setDistance] = useState<RunDistanceKey>("5km");
  if (!response || response.discipline !== "run" || !response.periods.some(period => period.running?.evidence || period.running?.bestDistances.observedStatistics !== undefined || period.running?.paceCurves.some(curve => curve.observedStatistics !== undefined))) return null;
  const periods = response.periods.slice(0, 2);
  const bases = BASES.filter(value => periods.some(period => period.running?.paceCurves.some(curve => curve.sourceBasis === value && curve.observedStatistics !== undefined)
    || period.running?.evidence?.activities.some(activity => activity.paceCurve?.sourceBasis === value)));
  const hasDistance = periods.some(period => period.running?.bestDistances.observedStatistics !== undefined);
  const distanceMode = hasDistance && (mode === "distance" || !bases.length);
  if (!bases.length && !hasDistance) return <section className="space-y-3" aria-label={t("runEvidence.title")}><Text as="h3" variant="subtitle">{t("runEvidence.title")}</Text><Text as="p" variant="bodyMedium" tone="secondary">{t(distanceMode ? "runEvidence.distanceNoEvidence" : "runEvidence.noEvidence")}</Text></section>;
  const activeBasis = bases.includes(basis as typeof BASES[number]) ? basis : bases[0];
  const date = (value: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const observed = periods.map((period, index) => {
    const curve = distanceMode ? period.running?.bestDistances : period.running?.paceCurves.find(item => item.sourceBasis === activeBasis);
    const stats = distanceMode ? (period.running?.bestDistances.observedStatistics ?? []).slice(0, 5).filter(item => RUN_DISTANCES.includes(item.distance) && positive(item.bestTimeSeconds) && positive(item.medianTimeSeconds) && Number.isInteger(item.contributingActivityCount) && item.contributingActivityCount > 0 && item.contributingActivityCount <= 200).map(item => ({ key: item.distance as string | number, best: item.bestTimeSeconds, median: item.medianTimeSeconds, count: item.contributingActivityCount }))
      : (period.running?.paceCurves.find(item => item.sourceBasis === activeBasis)?.observedStatistics ?? []).slice(0, 9).filter(item => DURATIONS.includes(item.durationSeconds) && positive(item.observedBestPaceSecPerKm) && positive(item.observedMedianPaceSecPerKm) && Number.isInteger(item.contributingActivityCount) && item.contributingActivityCount > 0 && item.contributingActivityCount <= 200).map(item => ({ key: item.durationSeconds as string | number, best: item.observedBestPaceSecPerKm, median: item.observedMedianPaceSecPerKm, count: item.contributingActivityCount }));
    const evidence = period.running?.evidence;
    const activities = evidence?.version === 1 && evidence.scope === "observed_representatives" ? evidence.activities.slice(0, 200).flatMap(activity => {
      if (distanceMode) {
        if (!Number.isFinite(activity.startTime) || !activity.activityId || !activity.metricsRevision || activity.distanceRecords.length > 5
          || activity.distanceRecords.some(record => !RUN_DISTANCES.includes(record.distance) || !positive(record.elapsedSec)) || new Set(activity.distanceRecords.map(record => record.distance)).size !== activity.distanceRecords.length) return [];
        return [{ ...activity, points: activity.distanceRecords.map(record => ({ key: record.distance as string | number, value: record.elapsedSec })), index }];
      }
      const pace = activity.paceCurve;
      if (!pace || pace.sourceBasis !== activeBasis || pace.unit !== "sec_per_km" || !Number.isFinite(activity.startTime) || !activity.activityId || !activity.metricsRevision
        || pace.points.length > 9 || pace.points.some(point => !DURATIONS.includes(point.durationSeconds) || !positive(point.paceSecPerKm)) || new Set(pace.points.map(point => point.durationSeconds)).size !== pace.points.length) return [];
      return [{ ...activity, points: pace.points.map(point => ({ key: point.durationSeconds as string | number, value: point.paceSecPerKm })), index }];
    }) : [];
    return { period, curve, stats, activities, bounded: (evidence?.activities.length ?? 0) > 200 || (curve?.observedStatistics?.length ?? 0) > (distanceMode ? 5 : 9) };
  });
  const durations = DURATIONS.filter(seconds => observed.some(item => item.stats.some(stat => stat.key === seconds) || item.activities.some(activity => activity.points.some(point => point.key === seconds))));
  const selectedDuration = durations.includes(duration) ? duration : durations[0];
  const selectedKey = distanceMode ? distance : selectedDuration;
  const leaders = distanceMode ? periods.map(period => observedRunEffortLeaders(period.running?.evidence, distance)) : [];
  const medianSamples = observed.map(item => {
    const stat = item.stats.find(stat => stat.key === selectedKey);
    const curve = item.curve;
    return stat ? { ...stat, basis: distanceMode ? curve?.timingBasis : curve && "sourceBasis" in curve ? curve.sourceBasis : undefined, timingBasis: curve?.timingBasis, unit: distanceMode ? "seconds" : curve && "unit" in curve ? curve.unit : undefined } : undefined;
  });
  const medianDifference = observedMedianDifference(medianSamples[0], medianSamples[1], units === "imperial");
  const formatValue = (value: number) => distanceMode ? formatElapsedBoundary(value) : formatPace(value, units);
  const points = observed.flatMap(item => item.activities.flatMap(activity => {
    const point = activity.points.find(value => value.key === selectedKey);
    return point ? [{ ...activity, pace: point.value }] : [];
  }));
  if (distanceMode) points.sort((a, b) => a.startTime - b.startTime || a.index - b.index || a.activityId.localeCompare(b.activityId));
  const values = points.map(point => point.pace), times = points.map(point => point.startTime);
  const low = Math.min(...values), high = Math.max(...values), first = Math.min(...times), last = Math.max(...times);
  const x = (time: number) => first === last ? 180 : 42 + (time - first) / (last - first) * 276;
  const y = (pace: number) => low === high ? 72 : 28 + (pace - low) / (high - low) * 72;
  return <section className="space-y-4" aria-label={t(distanceMode ? "runEvidence.distanceTitle" : "runEvidence.title")}>
    <Text as="h3" variant="subtitle">{t(distanceMode ? "runEvidence.distanceTitle" : "runEvidence.title")}</Text>
    {hasDistance && <label className="block" htmlFor={`${id}-mode`}><Text variant="bodyMedium">{t("runEvidence.mode")}</Text><Select id={`${id}-mode`} className="min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]" value={distanceMode ? "distance" : "pace"} onChange={event => setMode(event.target.value)}>{bases.length > 0 && <option value="pace">{t("runEvidence.paceMode")}</option>}<option value="distance">{t("runEvidence.distanceMode")}</option></Select></label>}
    <Text as="p" variant="bodyMedium" tone="secondary">{t(distanceMode ? "runEvidence.distanceScope" : "runEvidence.scope")}</Text>
    {!distanceMode && bases.length > 0 && <label className="block" htmlFor={`${id}-basis`}><Text variant="bodyMedium">{t("runEvidence.basis")}</Text><Select id={`${id}-basis`} className="min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]" value={activeBasis} onChange={event => setBasis(event.target.value)}>{bases.map(value => <option key={value} value={value}>{t(`runPeriods.${value}`)}</option>)}</Select></label>}
    <Text as="p" variant="bodyMedium" tone="secondary">{t(distanceMode ? "runEvidence.distanceBasis" : activeBasis === BASES[1] ? "runEvidence.legacyBasis" : "runEvidence.canonicalBasis")}</Text>
    {distanceMode && <label className="block" htmlFor={`${id}-distance`}><Text variant="bodyMedium">{t("runEvidence.distanceSelection")}</Text><Select id={`${id}-distance`} className="min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]" value={distance} onChange={event => setDistance(event.target.value as RunDistanceKey)}>{RUN_DISTANCES.map(key => <option key={key} value={key}>{t(`runRecord.dist.${key}`)}</option>)}</Select></label>}
    {!distanceMode && durations.length > 0 && <label className="block" htmlFor={`${id}-duration`}><Text variant="bodyMedium">{t("runEvidence.duration")}</Text><Select id={`${id}-duration`} className="min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]" value={selectedDuration} onChange={event => setDuration(Number(event.target.value))}>{durations.map(seconds => <option key={seconds} value={seconds}>{t("runPeriods.seconds", { count: seconds })}</option>)}</Select></label>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{observed.map((item, index) => {
      const stat = item.stats.find(value => value.key === selectedKey);
      return <div key={index} className="space-y-2"><Text as="h4" variant="bodyMedium" weight={600} tone="primary"><span aria-hidden="true" className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: index ? "var(--chart-heart-rate)" : "var(--chart-speed)" }} />{t(index ? "runPeriods.previous" : "runPeriods.current")} · {date(item.period.fromInclusive)}–{date(item.period.toExclusive - 1)}</Text>
        {item.curve && <Text as="p" variant="bodyMedium" tone="secondary">{t("runPeriods.coverage", { eligible: item.curve.coverage.eligibleActivityCount, total: item.curve.coverage.candidateActivityCount, missing: item.curve.coverage.missingActivityCount, empty: item.curve.coverage.noObservedEffortActivityCount })}</Text>}
        {(item.period.status === "partial" || item.curve?.status === "partial") && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEvidence.partial")}</Text>}
        {(item.period.coverage.truncated || item.curve?.coverage.truncated || item.bounded) && <Text as="p" variant="bodyMedium" tone="secondary">{t("runPeriods.truncated")}</Text>}
        <Text as="p" variant="bodyMedium">{t(distanceMode ? "runEvidence.distanceBest" : "runEvidence.best")}: {stat ? formatValue(stat.best) : "—"}</Text>
        <Text as="p" variant="bodyMedium">{t(distanceMode ? "runEvidence.distanceMedian" : "runEvidence.median")}: {stat ? distanceMode ? formatElapsedBoundary(stat.median) : `${formatElapsedBoundary(stat.median * (units === "imperial" ? 1.609344 : 1))}${units === "imperial" ? "/mi" : "/km"}` : "—"}</Text>
        <Text as="p" variant="bodyMedium">{t(distanceMode ? "runEvidence.distanceCount" : "runEvidence.count")}: {stat ? stat.count : "—"}</Text>
        {!stat && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEvidence.notObserved")}</Text>}
        {!item.period.running?.evidence && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEvidence.notCollected")}</Text>}
      </div>;
    })}</div>
    {medianDifference && <Text as="p" variant="bodyMedium" tone="secondary">{t("observedEfforts.medianDifference", {
      difference: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 6 }).format(Math.abs(medianDifference.deltaSeconds)),
      unit: distanceMode ? "" : units === "imperial" ? "/mi" : "/km",
      direction: t(medianDifference.deltaSeconds < 0 ? "observedEfforts.shorter" : medianDifference.deltaSeconds > 0 ? "observedEfforts.longer" : "observedEfforts.equal"),
      previous: medianDifference.previousCount, current: medianDifference.currentCount,
    })}</Text>}
    {points.length > 0 ? <div className="activity-comparison-curve-section"><ChartFrame variant="embedded" header={<Text as="h4" variant="subtitle">{t(distanceMode ? "runEvidence.distanceTimeline" : "runEvidence.timeline")}</Text>}>
      <svg viewBox="0 0 360 144" className="activity-comparison-curve" role="img" aria-label={t(distanceMode ? "runEvidence.distanceTimeline" : "runEvidence.timeline")}>
        <line x1={42} x2={318} y1={110} y2={110} stroke="var(--grid-soft)" />
        {[low, ...(low === high ? [] : [high])].map(value => <text key={value} x={42} y={y(value) - 8} fill="var(--chart-grid-label)">{formatValue(value)}</text>)}
        {points.map(point => <circle key={`${point.index}-${point.activityId}`} cx={x(point.startTime)} cy={y(point.pace)} r={4} fill={point.index ? "var(--chart-heart-rate)" : "var(--chart-speed)"}><title>{t(point.index ? "runPeriods.previous" : "runPeriods.current")} · {date(point.startTime)} · {formatValue(point.pace)}</title></circle>)}
        <text x={42} y={136} fill="var(--chart-grid-label)">{date(first)}</text>{last !== first && <text x={318} y={136} textAnchor="end" fill="var(--chart-grid-label)">{date(last)}</text>}
      </svg>
      <Text as="p" variant="bodyMedium" tone="secondary">{t(distanceMode ? "runEvidence.distanceTimelineNote" : "runEvidence.timelineNote")}</Text>
    </ChartFrame></div> : <Text as="p" variant="bodyMedium" tone="secondary">{t(distanceMode ? "runEvidence.distanceNoEvidence" : "runEvidence.noEvidence")}</Text>}
    {points.length > 0 && <details className="space-y-3"><summary className="cursor-pointer py-3 text-[length:var(--fs-md)]" style={{ minHeight: "var(--space-8)" }}>{t("runEvidence.sources", { count: points.length })}</summary><div className="space-y-3">{points.map(point => <div key={`${point.index}-${point.activityId}`} className="border-t border-[var(--line-soft)] py-2" data-metrics-revision={point.metricsRevision}>
      <Text as="div" variant="bodyMedium" weight={600}>{t(point.index ? "runPeriods.previous" : "runPeriods.current")} · {formatValue(point.pace)}</Text>
      <a className="inline-flex items-center py-3 underline text-[length:var(--fs-md)] min-h-[calc(var(--dim-button-height)+var(--space-1))]" href={`/${locale}/activity/${encodeURIComponent(point.activityId)}`}>{t("runPeriods.source", { date: date(point.startTime) })}</a>
    </div>)}</div></details>}
    {leaders.some(records => records.length > 0) && <section className="space-y-3" aria-label={t("observedEfforts.title")}>
      <Text as="h4" variant="subtitle">{t("observedEfforts.title")}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("observedEfforts.scope")}</Text>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{leaders.map((records, index) => records.length > 0 && <div key={index} className="space-y-2"><Text as="h5" variant="bodyMedium" weight={600} tone="primary">{t(index ? "runPeriods.previous" : "runPeriods.current")} · {date(periods[index]!.fromInclusive)}–{date(periods[index]!.toExclusive - 1)}</Text>
        <ul className="space-y-2">{records.map(record => <li key={record.activityId} data-metrics-revision={record.metricsRevision}><Text as="div" variant="bodyMedium" weight={600}>{formatElapsedBoundary(record.elapsedSec)}</Text><a className="inline-flex items-center py-3 underline text-[length:var(--fs-md)] min-h-[calc(var(--dim-button-height)+var(--space-1))]" href={`/${locale}/activity/${encodeURIComponent(record.activityId)}`}>{t("runPeriods.source", { date: date(record.startTime) })}</a></li>)}</ul>
      </div>)}</div>
    </section>}
  </section>;
}
