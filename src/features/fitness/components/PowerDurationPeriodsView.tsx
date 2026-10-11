import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import { ChartFrame, Select, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import "./power-duration-periods.css";

/** 서버 관측 격자만 표시하며 기존 11개 곡선과 비교하지 않는다. */
export function PowerDurationPeriodsView({ response }: { response: PowerCurvePeriodsResponse }) {
  const { t } = useTranslation("fitness");
  const id = useId();
  const [duration, setDuration] = useState(300);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const observations = response.periods.map(period => period.powerDurationObservations);
  const points = observations.flatMap(value => value?.points ?? []);
  const durations = [...new Set(points.map(point => point.durationSeconds))].sort((a, b) => a - b);
  const selected = durations.includes(duration) ? duration : durations[0];
  const durationLabel = (seconds: number) => {
    const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
    return [hours ? t("densePeriod.hours", { count: hours }) : "", minutes ? t("densePeriod.minutes", { count: minutes }) : "", remainder || !seconds ? t("densePeriod.seconds", { count: remainder }) : ""].filter(Boolean).join(" ");
  };
  const values = observations.map(value => value?.points.find(point => point.durationSeconds === selected));
  const high = Math.max(100, ...points.map(point => point.maxAveragePowerW));
  const x = (seconds: number) => 45 + Math.log(seconds) / Math.log(86400) * 295;
  const y = (watts: number) => 142 - watts / high * 105;
  const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return <section className="dense-period-power" aria-label={t("densePeriod.title")}>
    <Text as="h4" variant="bodyMedium" weight={600}>{t("densePeriod.title")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("densePeriod.scope")}</Text>
    <ChartFrame variant="embedded">
      {points.length ? <><svg viewBox="0 0 360 180" className="dense-period-chart" role="img" aria-label={t("densePeriod.chart")}>
        {[0, 0.5, 1].map(value => <g key={value}><line x1={45} x2={340} y1={y(high * value)} y2={y(high * value)} stroke="var(--grid-soft)" /><text x={38} y={y(high * value) + 5} textAnchor="end" fill="var(--ink-2)">{Math.round(high * value)}</text></g>)}
        <text x={45} y={18} fill="var(--ink-2)">W</text>
        {observations.map((value, index) => <g key={index}>{value?.points.map(point => <circle key={point.durationSeconds} cx={x(point.durationSeconds)} cy={y(point.maxAveragePowerW)} r={selected === point.durationSeconds ? 4 : 2} fill={index ? "var(--ink-2)" : "var(--accent-dark)"} />)}</g>)}
        {[1, 60, 3600, 86400].map((seconds, index) => <text key={seconds} x={x(seconds)} y={168} textAnchor={index === 0 ? "start" : index === 3 ? "end" : "middle"} fill="var(--ink-2)">{durationLabel(seconds)}</text>)}
      </svg><label className="dense-period-duration" htmlFor={id}><Text variant="bodyMedium">{t("periodCurve.duration")}</Text><Select id={id} value={selected} onChange={event => setDuration(Number(event.target.value))}>{durations.map(seconds => <option key={seconds} value={seconds}>{durationLabel(seconds)}</option>)}</Select></label></> : <Text as="p" variant="bodyMedium" tone="secondary">{t("densePeriod.empty")}</Text>}
      <div className="dense-period-values">{response.periods.map((period, index) => {
        const value = observations[index], point = values[index];
        return <div key={index} className="space-y-2"><Text as="h5" variant="bodyMedium" weight={600}><span className={`dense-period-dot${index ? " dense-period-dot--second" : ""}`} />{date(period.fromInclusive)} – {date(period.toExclusive - 1)}</Text><Text as="p" variant="bodyMedium">{point ? `${point.maxAveragePowerW} W · ${t("densePeriod.n", { count: point.observedActivityCount })}` : "—"}</Text><Text as="p" variant="bodyMedium" tone="secondary">{t(!value ? "densePeriod.unknown" : value.partial ? "densePeriod.partial" : "densePeriod.complete")}</Text>{point && <Text as="p" variant="bodyMedium" tone="secondary">{t(`periodCurve.source.${point.provenance}`)}</Text>}{point && <LocalizedLink className="dense-period-source" to={`/activity/${encodeURIComponent(point.sourceActivityId)}`}>{t("periodCurve.source", { date: date(point.startTime) })}</LocalizedLink>}</div>;
      })}</div>
      {values.length === 2 && values[0] && values[1] && <Text as="p" variant="bodyMedium">{t("densePeriod.difference", { watts: values[0].maxAveragePowerW - values[1].maxAveragePowerW })}</Text>}
    </ChartFrame>
    <details className="dense-period-details" onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>{t("densePeriod.details")}</summary><div className="space-y-3"><Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.asOf", { date: new Date(response.asOf).toISOString().replace("T", " ").slice(0, 19) })}</Text>{observations.map((value, index) => value && <Text key={index} as="p" variant="bodyMedium" tone="secondary">{t("densePeriod.coverage", { period: index + 1, candidate: value.inputCandidateCount, ...value.counts })}{value.scanTruncated ? ` · ${t("densePeriod.truncated")}` : ""}</Text>)}<Text as="p" variant="bodyMedium" tone="secondary">{t("densePeriod.note")}</Text>
      {detailsOpen && response.periods.length > 1 && durations.length > 0 && <Text as="p" variant="bodyMedium" tone="secondary" className="dense-period-scroll-hint">{t("densePeriod.scrollHint")}</Text>}
      {detailsOpen && <div className="dense-period-table-scroll"><table className="dense-period-table"><thead><tr><th>{t("periodCurve.duration")}</th>{response.periods.map((_, index) => <th key={index}>{t("periodCurve.period", { n: index + 1 })}</th>)}</tr></thead><tbody>{durations.map(seconds => <tr key={seconds}><th scope="row">{durationLabel(seconds)}</th>{observations.map((value, index) => {
        const point = value?.points.find(item => item.durationSeconds === seconds);
        return <td key={index}>{point ? <>{point.maxAveragePowerW} W · {t("densePeriod.n", { count: point.observedActivityCount })}<LocalizedLink className="dense-period-source" to={`/activity/${encodeURIComponent(point.sourceActivityId)}`}>{date(point.startTime)} UTC</LocalizedLink></> : "—"}</td>;
      })}</tr>)}</tbody></table></div>}
    </div></details>
  </section>;
}
