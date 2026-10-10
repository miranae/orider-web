import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PowerCurvePeriod, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import { Button, ChartFrame, Input, Select, Stat, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useAuth } from "../../../contexts/AuthContext";
import { usePowerCurvePeriods, type PowerCurvePeriodsSelection } from "../../../hooks/usePowerCurvePeriods";
import { utcPowerCurvePeriod } from "../../../services/powerCurvePeriods";
import { makeDurationLabel } from "../fitnessPageUtils";
import "./power-curve-periods.css";
type Draft = { preset: "year" | "all" | "custom"; from: string; through: string };
export function PowerCurvePeriodsView({ response }: { response: PowerCurvePeriodsResponse }) {
  const { t } = useTranslation("fitness");
  const id = useId();
  const durationLabel = makeDurationLabel(t);
  const [duration, setDuration] = useState(300);
  const durations = [...new Set(response.periods.flatMap(period => period.points.map(point => point.durationSeconds)))].sort((a, b) => a - b);
  const selected = durations.includes(duration) ? duration : durations[0];
  const rangeLabels = response.periods.map(period => `${new Date(period.fromInclusive).toISOString().slice(0, 10)} – ${new Date(period.toExclusive - 1).toISOString().slice(0, 10)}`);
  const allPoints = response.periods.flatMap(period => period.points);
  const high = Math.max(100, ...allPoints.map(point => point.watts)) * 1.1;
  const x = (seconds: number) => 56 + Math.log(seconds) / Math.log(3600) * 280;
  const y = (watts: number) => 146 - watts / high * 118;
  return <div className="period-curve-analysis space-y-4">
    <ChartFrame variant="embedded">
      <div className="period-curve-legend">{response.periods.map((period, index) => <Text key={index} variant="bodySmall" tone={index ? "secondary" : "primary"}><span className={index ? "period-curve-line period-curve-line--second" : "period-curve-line"} />{rangeLabels[index]} · {t(period.status === "complete" ? "periodCurve.complete" : "periodCurve.partial")}</Text>)}</div>
      {allPoints.length ? <>
        <svg viewBox="0 0 360 180" className="period-curve-chart" role="img" aria-label={t("periodCurve.chart")}>
          {[0, 0.5, 1].map(fraction => <g key={fraction}><line x1={56} x2={336} y1={28 + fraction * 118} y2={28 + fraction * 118} stroke="var(--grid-soft)" /><text x={48} y={33 + fraction * 118} textAnchor="end" fill="var(--chart-grid-label)">{Math.round(high * (1 - fraction))}</text></g>)}
          <text x={56} y={16} fill="var(--chart-grid-label)">W</text>
          {selected != null && <line x1={x(selected)} x2={x(selected)} y1={28} y2={146} stroke="var(--line-soft)" />}
          {response.periods.map((period, index) => <g key={index}><polyline points={period.points.map(point => `${x(point.durationSeconds)},${y(point.watts)}`).join(" ")} stroke={index ? "var(--ink-2)" : "var(--accent)"} strokeWidth={2} strokeDasharray={index ? "6 4" : undefined} fill="none" />{period.points.map(point => <circle key={point.durationSeconds} cx={x(point.durationSeconds)} cy={y(point.watts)} r={selected === point.durationSeconds ? 4 : 2} fill={index ? "var(--ink-2)" : "var(--accent)"} />)}</g>)}
          {[1, 60, 300, 3600].map(seconds => <text key={seconds} x={x(seconds)} y={170} textAnchor="middle" fill="var(--chart-grid-label)">{durationLabel(seconds)}</text>)}
          {durations.map((seconds, index) => {
            const start = index === 0 ? 56 : (x(durations[index - 1]!) + x(seconds)) / 2;
            const end = index === durations.length - 1 ? 336 : (x(seconds) + x(durations[index + 1]!)) / 2;
            return <rect key={seconds} data-duration={seconds} x={start} y={28} width={end - start} height={118} fill="transparent" className="period-curve-hit" onClick={() => setDuration(seconds)}><title>{durationLabel(seconds)}</title></rect>;
          })}
        </svg>
        <label className="period-curve-duration" htmlFor={id}><Text variant="bodySmall" tone="secondary">{t("periodCurve.duration")}</Text><Select id={id} value={selected} onChange={event => setDuration(Number(event.target.value))}>{durations.map(seconds => <option key={seconds} value={seconds}>{durationLabel(seconds)}</option>)}</Select></label>
        <div className="period-curve-values">{response.periods.map((period, index) => {
          const point = period.points.find(item => item.durationSeconds === selected);
          return <div key={index} className="space-y-2"><Stat compact label={rangeLabels[index]} value={point ? point.watts.toFixed(1) : "—"} unit={point ? "W" : undefined} />{point && <><LocalizedLink className="period-curve-source" to={`/activity/${encodeURIComponent(point.sourceActivityId)}`}>{t("periodCurve.source", { date: new Date(point.startTime).toISOString().slice(0, 10) })}</LocalizedLink><Text as="p" variant="caption" tone="tertiary">{t(`periodCurve.source.${point.source}`)}</Text></>}</div>;
        })}</div>
      </> : <Text as="p" variant="bodySmall" tone="secondary">{t("periodCurve.empty")}</Text>}
    </ChartFrame>
    {response.periods.map((period, index) => <div key={index} className="space-y-2"><Text as="h4" variant="bodySmall" weight={600}>{rangeLabels[index]}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("periodCurve.included", { count: period.coverage.includedActivityCount })}{period.status === "partial" ? ` · ${t("periodCurve.partial")}` : ""}</Text>{period.status === "partial" && <Text as="p" variant="bodySmall" tone="secondary">{t("periodCurve.partialNote")}</Text>}</div>)}
    <details className="period-curve-details"><summary>{t("periodCurve.details")}</summary><div className="space-y-4">
      <Text as="p" variant="caption" tone="tertiary">{t("periodCurve.asOf", { date: new Date(response.asOf).toISOString().replace("T", " ").slice(0, 19) })}</Text>
      {response.periods.map((period, index) => {
        const point = period.points.find(item => item.durationSeconds === selected);
        return <div key={index} className="space-y-2"><Text as="h4" variant="bodySmall" weight={600}>{rangeLabels[index]}</Text><Text as="p" variant="caption" tone="tertiary">{t("periodCurve.exactBounds", { from: new Date(period.fromInclusive).toISOString(), to: new Date(period.toExclusive).toISOString() })}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("periodCurve.coverage", { scanned: period.coverage.scannedActivityCount, candidate: period.coverage.candidateActivityCount, included: period.coverage.includedActivityCount, pending: period.coverage.pendingActivityCount, missing: period.coverage.missingActivityCount, incomplete: period.coverage.incompleteActivityCount, ineligible: period.coverage.ineligibleActivityCount })}</Text>{point && <Text as="p" variant="bodySmall">{t("periodCurve.rawValue", { duration: durationLabel(point.durationSeconds), watts: String(point.watts) })}</Text>}{period.coverage.pendingActivityCount > 0 && <Text as="p" variant="caption" tone="tertiary">{t("periodCurve.pendingNote")}</Text>}{period.coverage.truncated && <Text as="p" variant="bodySmall" tone="secondary">{t("periodCurve.truncated", { limit: period.coverage.scanLimit })}</Text>}</div>;
      })}
      <Text as="p" variant="caption" tone="tertiary">{t("periodCurve.pointNote")}</Text>
    </div></details>
  </div>;
}
function PeriodsForm({ ownerUid, callableEnabled }: { ownerUid: string; callableEnabled: boolean }) {
  const { t } = useTranslation("fitness");
  const id = useId();
  const today = new Date().toISOString().slice(0, 10);
  const makeDraft = (): Draft => ({ preset: "year", from: `${today.slice(0, 4)}-01-01`, through: today });
  const [drafts, setDrafts] = useState<Draft[]>(() => [makeDraft()]);
  const [selection, setSelection] = useState<PowerCurvePeriodsSelection | null>(null);
  const [invalid, setInvalid] = useState(false);
  const result = usePowerCurvePeriods(ownerUid, selection, callableEnabled);
  const update = (index: number, patch: Partial<Draft>) => { setDrafts(values => values.map((value, i) => index === i ? { ...value, ...patch } : value)); setSelection(null); setInvalid(false); };
  const submit = () => {
    const now = Date.now();
    const periods = drafts.map(draft => draft.preset === "all" ? { fromInclusive: 0, toExclusive: now }
      : draft.preset === "year" ? { fromInclusive: Date.UTC(new Date(now).getUTCFullYear(), 0, 1), toExclusive: now }
      : utcPowerCurvePeriod(draft.from, draft.through, now));
    if (periods.some(period => !period || period.fromInclusive >= period.toExclusive)) { setInvalid(true); setSelection(null); return; }
    setInvalid(false); setSelection(current => ({ request: { unit: "W", periods: periods as PowerCurvePeriod[] }, requestId: (current?.requestId ?? 0) + 1 }));
  };
  return <section className="space-y-4">
    <Text as="h3" variant="subtitle">{t("periodCurve.title")}</Text>
    <Text as="p" variant="bodySmall" tone="secondary">{t("periodCurve.timezone")}</Text>
    <div className="period-curve-form">{drafts.map((draft, index) => <div key={index} className="space-y-3"><label className="space-y-2 block" htmlFor={`${id}-${index}`}><Text as="span" variant="bodySmall">{t("periodCurve.period", { n: index + 1 })}</Text><Select id={`${id}-${index}`} value={draft.preset} onChange={event => update(index, { preset: event.target.value as Draft["preset"] })}><option value="year">{t("periodCurve.year")}</option><option value="all">{t("periodCurve.all")}</option><option value="custom">{t("periodCurve.custom")}</option></Select></label>{draft.preset === "custom" && <div className="period-curve-dates">{(["from", "through"] as const).map(field => <label key={field} className="space-y-2 block"><Text as="span" variant="bodySmall">{t(`periodCurve.${field}`)}</Text><Input type="date" max={today} value={draft[field]} onChange={event => update(index, { [field]: event.target.value })} /></label>)}</div>}</div>)}</div>
    <div className="flex flex-wrap gap-3"><Button variant="ghost" size="sm" onClick={() => { setDrafts(values => values.length === 1 ? [...values, makeDraft()] : values.slice(0, 1)); setSelection(null); }}>{t(drafts.length === 1 ? "periodCurve.add" : "periodCurve.remove")}</Button><Button size="sm" disabled={!callableEnabled || result.state === "loading"} onClick={submit}>{t("periodCurve.load")}</Button></div>
    {!callableEnabled && <Text as="p" variant="bodySmall" tone="secondary">{t("periodCurve.preparing")}</Text>}
    {invalid && <Text as="p" variant="bodySmall" role="alert">{t("periodCurve.invalid")}</Text>}
    {result.state === "loading" && <Text as="p" variant="bodySmall">{t("periodCurve.loading")}</Text>}
    {result.state === "error" && <Text as="p" variant="bodySmall" role="alert">{t("periodCurve.error")}</Text>}
    {result.response && <PowerCurvePeriodsView key={JSON.stringify(selection)} response={result.response} />}
  </section>;
}
export function PowerCurvePeriodsPanel({ ownerUid, callableEnabled = false }: { ownerUid: string | null | undefined; callableEnabled?: boolean }) {
  const { user } = useAuth();
  if (!ownerUid || !user || user.isAnonymous || user.uid !== ownerUid) return null;
  return <PeriodsForm key={ownerUid} ownerUid={ownerUid} callableEnabled={callableEnabled} />;
}
