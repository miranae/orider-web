import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { RUN_DISTANCES } from "@shared/types/personal-records";
import type { PeriodRunSource, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { useLocale } from "../../../contexts/LocaleContext";
import { ChartFrame, Select, Text } from "../../../theme";
import { formatPace } from "../../../utils/units";
import { formatElapsedBoundary } from "./activityRangeSelection";

/** 같은 통계 응답을 읽는다. 기간이나 종목을 다시 조회하지 않는다. */
export default function RunPeriodComparisonPanel({ response }: { response: TrainingAnalysisPeriodsResponse | null }) {
  const { t, i18n } = useTranslation("activity");
  const { units, locale } = useLocale();
  const id = useId();
  const [basis, setBasis] = useState("run_metrics_pace_curve");
  const [duration, setDuration] = useState(300);
  if (!response || response.discipline !== "run") return null;
  const date = (value: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const periods = response.periods, current = periods[0]?.running, previous = periods[1]?.running;
  const bases = ["run_metrics_pace_curve", "speed_curve_kmh_converted"].filter(value => periods.some(period => period.running?.paceCurves.some(curve => curve.sourceBasis === value && curve.points.length > 0)));
  const activeBasis = bases.includes(basis) ? basis : bases[0];
  const curves = periods.map(period => period.running?.paceCurves.find(curve => curve.sourceBasis === activeBasis));
  const common = curves[0]?.points.filter(point => curves.slice(1).every(curve => curve?.points.some(other => other.durationSeconds === point.durationSeconds))) ?? [];
  const selected = common.find(point => point.durationSeconds === duration) ?? common[0];
  const source = (point: PeriodRunSource | undefined) => point && <><a className="inline-flex items-center py-3 underline text-[length:var(--fs-md)]" href={`/${locale}/activity/${encodeURIComponent(point.sourceActivityId)}`}>{t("runPeriods.source", { date: date(point.startTime) })}</a><Text as="div" variant="bodySmall" tone="secondary">{t("runPeriods.contributors", { count: point.contributingActivityCount })}</Text></>;
  const delta = (a: number | undefined, b: number | undefined, allowed: boolean, factor = 1) => a != null && b != null && allowed ? `${b - a > 0 ? "+" : b - a < 0 ? "−" : ""}${formatElapsedBoundary(Math.abs(b - a) * factor)}` : "—";
  const coverage = (value: NonNullable<typeof current>["bestDistances"] | NonNullable<typeof current>["paceCurves"][number] | undefined) => value && <Text as="p" variant="bodySmall" tone="secondary">{t("runPeriods.coverage", { eligible: value.coverage.eligibleActivityCount, total: value.coverage.candidateActivityCount, missing: value.coverage.missingActivityCount, empty: value.coverage.noObservedEffortActivityCount })}{value.coverage.truncated && <> · {t("runPeriods.truncated")}</>}</Text>;
  const x = (seconds: number) => common.length < 2 ? 180 : 36 + (Math.log(seconds) - Math.log(common[0]!.durationSeconds)) / (Math.log(common[common.length - 1]!.durationSeconds) - Math.log(common[0]!.durationSeconds)) * 288;
  const values = curves.flatMap(curve => curve?.points.filter(point => common.some(other => other.durationSeconds === point.durationSeconds)).map(point => point.paceSecPerKm) ?? []);
  const low = Math.min(...values), high = Math.max(...values);
  const y = (pace: number) => 40 + (pace - low) / (high - low || 1) * 72;
  return <section className="space-y-4" aria-label={t("runPeriods.title")}>
    <Text as="h3" variant="subtitle">{t("runPeriods.title")}</Text>
    {!current && !previous ? <Text as="p" variant="bodySmall" tone="secondary">{t("runPeriods.unavailable")}</Text> : <>
      <Text as="p" variant="bodySmall" tone="secondary">{t("runPeriods.basis")}</Text>
      {periods.map((period, index) => <div key={index} className="space-y-2"><Text as="h4" variant="bodySmall" weight={600}>{t(index === 0 ? "runPeriods.current" : "runPeriods.previous")} · {date(period.fromInclusive)}–{date(period.toExclusive - 1)}</Text>{coverage(period.running?.bestDistances)}{period.running?.bestDistances.status === "partial" && <Text as="p" variant="bodySmall" tone="secondary">{t("runPeriods.partial")}</Text>}</div>)}
      <div className="overflow-x-auto"><table className="w-full text-[length:var(--fs-md)] tabular-nums"><caption className="text-left py-3 font-semibold">{t("runPeriods.distances")}</caption><thead><tr><th scope="col" className="text-left py-3">{t("runEfforts.distance")}</th><th scope="col" className="text-left py-3">{t("runPeriods.current")}</th><th scope="col" className="text-left py-3">{t("runPeriods.previous")}</th><th scope="col" className="text-right py-3">{t("runPeriods.shortened")}</th></tr></thead><tbody>{RUN_DISTANCES.map(key => {
        const a = current?.bestDistances.points.find(point => point.distance === key), b = previous?.bestDistances.points.find(point => point.distance === key);
        return <tr key={key} className="border-t border-[var(--line-soft)]"><th scope="row" className="text-left py-3">{t(`runRecord.dist.${key}`)}</th>{[a, b].map((point, index) => <td key={index} className="p-3 align-top"><Text as="div" variant="bodySmall" mono>{point ? formatElapsedBoundary(point.elapsedSec) : "—"}</Text>{point && <Text as="div" variant="bodySmall" tone="secondary">{formatPace(point.elapsedSec / (point.distanceM / 1000), units)}</Text>}{source(point)}</td>)}<td className="text-right py-3 align-top">{delta(a?.elapsedSec, b?.elapsedSec, current?.bestDistances.status === "complete" && previous?.bestDistances.status === "complete")}</td></tr>;
      })}</tbody></table></div>
      <Text as="p" variant="bodySmall" tone="secondary">{t("runPeriods.deltaBasis")}</Text>
      <ChartFrame variant="embedded" header={<Text as="h4" variant="subtitle">{t("runPeriods.curve")}</Text>}>
        {bases.length > 0 && <label className="block py-3" htmlFor={`${id}-basis`}><Text as="span" variant="bodySmall">{t("runPeriods.curveBasis")}</Text><Select id={`${id}-basis`} className="min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]" value={activeBasis} onChange={event => setBasis(event.target.value)}>{bases.map(value => <option key={value} value={value}>{t(`runPeriods.${value}`)}</option>)}</Select></label>}
        {selected ? <div className="space-y-3">
          <svg viewBox="0 0 360 148" className="w-full font-mono text-[length:var(--fs-md)]" role="img" aria-label={t("runPeriods.curve")}><line x1={36} x2={324} y1={112} y2={112} stroke="var(--grid-soft)" />{curves.map((curve, index) => <g key={index}><polyline points={common.map(point => { const value = curve!.points.find(other => other.durationSeconds === point.durationSeconds)!; return `${x(point.durationSeconds)},${y(value.paceSecPerKm)}`; }).join(" ")} fill="none" stroke={index === 0 ? "var(--chart-speed)" : "var(--chart-heart-rate)"} strokeWidth={2} />{common.map(point => <circle key={point.durationSeconds} cx={x(point.durationSeconds)} cy={y(curve!.points.find(other => other.durationSeconds === point.durationSeconds)!.paceSecPerKm)} r={point.durationSeconds === selected.durationSeconds ? 5 : 3} fill={index === 0 ? "var(--chart-speed)" : "var(--chart-heart-rate)"} />)}</g>)}{[common[0]!, ...(common.length > 1 ? [common[common.length - 1]!] : [])].map(point => <text key={point.durationSeconds} x={x(point.durationSeconds)} y={138} textAnchor="middle" fill="var(--chart-grid-label)">{t("runPeriods.seconds", { count: point.durationSeconds })}</text>)}</svg>
          <label className="block" htmlFor={`${id}-duration`}><Text as="span" variant="bodySmall">{t("runPeriods.duration")}</Text><Select id={`${id}-duration`} className="min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]" value={selected.durationSeconds} onChange={event => setDuration(Number(event.target.value))}>{common.map(point => <option key={point.durationSeconds} value={point.durationSeconds}>{t("runPeriods.seconds", { count: point.durationSeconds })}</option>)}</Select></label>
          <div className="grid grid-cols-2 gap-3">{curves.map((curve, index) => { const point = curve?.points.find(other => other.durationSeconds === selected.durationSeconds); return <div key={index}><Text as="h5" variant="bodySmall" weight={600} style={{ color: index === 0 ? "var(--chart-speed)" : "var(--chart-heart-rate)" }}>{t(index === 0 ? "runPeriods.current" : "runPeriods.previous")}</Text><Text as="p" variant="body" mono>{point ? formatPace(point.paceSecPerKm, units) : "—"}</Text>{source(point)}{coverage(curve)}</div>; })}</div>
          <Text as="p" variant="bodySmall">{t("runPeriods.paceShortened", { unit: units === "imperial" ? "mi" : "km" })} · {delta(curves[0]?.points.find(point => point.durationSeconds === selected.durationSeconds)?.paceSecPerKm, curves[1]?.points.find(point => point.durationSeconds === selected.durationSeconds)?.paceSecPerKm, curves.length === 2 && curves.every(curve => curve?.status === "complete"), units === "imperial" ? 1.609344 : 1)}</Text>
        </div> : <Text as="p" variant="bodySmall" tone="secondary">{t("runPeriods.noCommon")}</Text>}
        <Text as="p" variant="bodySmall" tone="secondary">{t("runPeriods.curveNote")}</Text>
      </ChartFrame>
    </>}
  </section>;
}
