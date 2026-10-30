import BikePeriodSnapshotPanel from "./BikePeriodSnapshotPanel";
import { usePeriodControls } from "../../../hooks/usePeriodControls";
import { validPowerPeriodControls, type PowerPeriodControls, type PeriodDraft as Draft } from "./periodControls";
import "./fitness-analysis-controls.css";
import { CalendarDays } from "lucide-react";
import DateField from "../../../components/redesign/DateField";
import { PowerEffortPreferencePanel } from "./PowerEffortPreferencePanel";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PowerCurvePeriod, PowerCurvePeriodsResponse, PeriodPowerPoint, WeightNormalizedPowerPoint } from "@shared/types/power-curve-periods";
import { Button, ToggleControls, ToggleButton, ChartFrame, DropdownSelect, Stat, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useAuth } from "../../../contexts/AuthContext";
import { usePowerCurvePeriods, type PowerCurvePeriodsSelection } from "../../../hooks/usePowerCurvePeriods";
import { trainingCalendarDate, trainingCalendarPeriod, trainingComparisonPeriods, type TrainingComparisonPreset } from "../../../services/trainingComparisonCalendar";
import { makeDurationLabel } from "../fitnessPageUtils";
import "./power-curve-periods.css";
import { PowerDurationPeriodsView } from "./PowerDurationPeriodsView";
import { stageActivityPowerAvailable } from "../../../services/stageActivityPowerDuration";
import { NativePowerTwelvePersonalPanel } from "./NativePowerTwelvePersonalPanel";
import type { NativePowerLoadedActivity } from "./NativePowerTwelvePersonalView";
import { PowerSkillsObservedView } from "./PowerSkillsObservedView";
import { ICON_SIZE } from "../../../theme/tokens/icon";
export function PowerCurvePeriodsView({ response, unit = "W", selectedDuration, onDurationChange }: { response: PowerCurvePeriodsResponse; unit?: "W" | "W/kg"; selectedDuration?: number; onDurationChange?: (duration: number) => void }) {
  const { t } = useTranslation("fitness");
  const id = useId();
  const durationLabel = makeDurationLabel(t);
  const [localDuration, setLocalDuration] = useState(300);
  const duration = selectedDuration ?? localDuration;
  const setDuration = (next: number) => { setLocalDuration(next); onDurationChange?.(next); };
  const normalized = unit === "W/kg";
  const periods = response.periods.map(period => normalized ? { ...period, points: period.weightNormalized?.points ?? [],
    coverage: period.weightNormalized?.coverage ?? period.coverage, status: period.weightNormalized?.status ?? period.status } : period);
  const power = (point: PeriodPowerPoint | WeightNormalizedPowerPoint) => normalized && "wattsPerKg" in point ? point.wattsPerKg : point.watts;

  const durations = [...new Set(periods.flatMap(period => period.points.map(point => point.durationSeconds)))].sort((a, b) => a - b);
  const selected = durations.includes(duration) ? duration : durations[0];
  const rangeLabels = periods.map(period => `${trainingCalendarDate(period.fromInclusive)} – ${trainingCalendarDate(period.toExclusive - 1)}`);
  const allPoints = periods.flatMap(period => period.points);
  const high = Math.max(normalized ? 0.01 : 100, ...allPoints.map(power)) * 1.1;
  const x = (seconds: number) => 56 + Math.log(seconds) / Math.log(3600) * 280;
  const y = (watts: number) => 146 - watts / high * 118;
  return <div className="fitness-analysis-controls period-curve-analysis space-y-4">
    <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.populationBasis")}</Text>
    {normalized && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.weightBasis")}</Text>}
    {normalized && response.periods.some(period => !period.weightNormalized) && <Text as="p" variant="bodyMedium" role="status">{t("periodCurve.weightUnsupported")}</Text>}
    <ChartFrame variant="embedded">
      <div className="period-curve-legend">{periods.map((period, index) => <Text key={index} variant="bodyMedium" tone={index ? "secondary" : "primary"}><span className={index ? "period-curve-line period-curve-line--second" : "period-curve-line"} />{rangeLabels[index]} · {t(normalized && !period.weightNormalized ? "periodCurve.weightUnsupported" : period.status === "complete" ? "periodCurve.complete" : "periodCurve.partial")}</Text>)}</div>
      {allPoints.length ? <>
        <svg viewBox="0 0 360 180" className="period-curve-chart" role="img" aria-label={normalized ? `${t("periodCurve.chart")} · W/kg` : t("periodCurve.chart")}>
          {[0, 0.5, 1].map(fraction => <g key={fraction}><line x1={56} x2={336} y1={28 + fraction * 118} y2={28 + fraction * 118} stroke="var(--grid-soft)" /><text x={48} y={33 + fraction * 118} textAnchor="end" fill="var(--chart-grid-label)">{normalized ? (high * (1 - fraction)).toFixed(high >= 1 ? 1 : 3) : Math.round(high * (1 - fraction))}</text></g>)}
          <text x={56} y={16} fill="var(--chart-grid-label)">{unit}</text>
          {selected != null && <line x1={x(selected)} x2={x(selected)} y1={28} y2={146} stroke="var(--line-soft)" />}
          {periods.map((period, index) => <g key={index}><polyline points={period.points.map(point => `${x(point.durationSeconds)},${y(power(point))}`).join(" ")} stroke={index ? "var(--ink-2)" : "var(--accent)"} strokeWidth={2} strokeDasharray={index ? "6 4" : undefined} fill="none" />{period.points.map(point => <circle key={point.durationSeconds} cx={x(point.durationSeconds)} cy={y(power(point))} r={selected === point.durationSeconds ? 4 : 2} fill={index ? "var(--ink-2)" : "var(--accent)"} />)}</g>)}
          {[1, 60, 300, 3600].map(seconds => <text key={seconds} x={x(seconds)} y={170} textAnchor="middle" fill="var(--chart-grid-label)">{durationLabel(seconds)}</text>)}
          {durations.map((seconds, index) => {
            const start = index === 0 ? 56 : (x(durations[index - 1]!) + x(seconds)) / 2;
            const end = index === durations.length - 1 ? 336 : (x(seconds) + x(durations[index + 1]!)) / 2;
            return <rect key={seconds} data-duration={seconds} x={start} y={28} width={end - start} height={118} fill="transparent" className="period-curve-hit" onClick={() => setDuration(seconds)}><title>{durationLabel(seconds)}</title></rect>;
          })}
        </svg>
        <label className="period-curve-duration" htmlFor={id}><Text variant="bodyMedium" tone="secondary">{t("periodCurve.duration")}</Text><DropdownSelect id={id} label={t("periodCurve.duration")} value={String(selected)} onChange={next => setDuration(Number(next))} options={durations.map((seconds) => ({ value: String(seconds), label: durationLabel(seconds) }))} /></label>
        <div className="period-curve-values">{periods.map((period, index) => {
          const point = period.points.find(item => item.durationSeconds === selected);
          return <div key={index} className="space-y-2"><Stat compact label={rangeLabels[index]} value={point ? normalized && power(point) > 0 && power(point) < 0.01 ? "<0.01" : power(point).toFixed(normalized ? 2 : 1) : "—"} unit={point ? unit : undefined} />{point && <><LocalizedLink className="period-curve-source" to={`/activity/${encodeURIComponent(point.sourceActivityId)}`}>{t("periodCurve.source", { date: trainingCalendarDate(point.startTime) })}</LocalizedLink><Text as="p" variant="bodyMedium" tone="tertiary">{t(`periodCurve.source.${point.source}`)}</Text>{normalized && "weightKg" in point && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.weightWinner", { watts: point.watts, kg: point.weightKg })}</Text>}</>}</div>;
        })}</div>
      </> : <Text as="p" variant="bodyMedium" tone="secondary">{t(normalized ? "periodCurve.weightEmpty" : "periodCurve.empty")}</Text>}
    </ChartFrame>
    {periods.map((period, index) => normalized && !period.weightNormalized ? <Text key={index} as="p" variant="bodyMedium" tone="secondary">{rangeLabels[index]} · {t("periodCurve.weightUnsupported")}</Text> : <div key={index} className="space-y-2"><Text as="h4" variant="bodyMedium" weight={600}>{rangeLabels[index]}</Text><Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.included", { count: period.coverage.includedActivityCount })}{period.status === "partial" ? ` · ${t("periodCurve.partial")}` : ""}</Text>{period.status === "partial" && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.partialNote")}</Text>}{normalized && period.weightNormalized && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.weightCoverage", { ...period.weightNormalized.weightCounts })}</Text>}</div>)}
    <details className="period-curve-details"><summary>{t("periodCurve.details")}</summary><div className="space-y-4">
      <Text as="p" variant="bodyMedium" tone="tertiary">{t("periodCurve.asOf", { date: new Date(response.asOf).toISOString().replace("T", " ").slice(0, 19) })}</Text>
      {periods.map((period, index) => {
        const point = period.points.find(item => item.durationSeconds === selected);
        return <div key={index} className="space-y-2"><Text as="h4" variant="bodyMedium" weight={600}>{rangeLabels[index]}</Text><Text as="p" variant="bodyMedium" tone="tertiary">{t("periodCurve.exactBounds", { from: new Date(period.fromInclusive).toISOString(), to: new Date(period.toExclusive).toISOString() })}</Text><Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.coverage", { scanned: period.coverage.scannedActivityCount, candidate: period.coverage.candidateActivityCount, included: period.coverage.includedActivityCount, pending: period.coverage.pendingActivityCount, missing: period.coverage.missingActivityCount, incomplete: period.coverage.incompleteActivityCount, ineligible: period.coverage.ineligibleActivityCount })}</Text>{point && <Text as="p" variant="bodyMedium">{t("periodCurve.rawValue", { duration: durationLabel(point.durationSeconds), watts: String(point.watts) })}</Text>}{point && normalized && "weightKg" in point && <Text as="p" variant="bodyMedium">{t("periodCurve.weightWinner", { watts: point.watts, kg: point.weightKg })}</Text>}{period.coverage.pendingActivityCount > 0 && <Text as="p" variant="bodyMedium" tone="tertiary">{t("periodCurve.pendingNote")}</Text>}{period.coverage.truncated && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.truncated", { limit: period.coverage.scanLimit })}</Text>}</div>;
      })}
      <Text as="p" variant="bodyMedium" tone="tertiary">{t(normalized ? "periodCurve.weightPointNote" : "periodCurve.pointNote")}</Text>
    </div></details>
    {(normalized ? response.periods.some(period => period.weightNormalized?.powerDurationObservations !== undefined) : periods.some(period => period.powerDurationObservations !== undefined)) && <PowerDurationPeriodsView response={response} unit={unit} selectedDuration={duration} onDurationChange={setDuration} />}
  </div>;
}
function PeriodsForm({ ownerUid, callableEnabled, embedded }: { ownerUid: string; callableEnabled: boolean; embedded: boolean }) {
  const { t } = useTranslation("fitness");
  const id = useId();
  const today = trainingCalendarDate(Date.now());
  const makeDraft = (): Draft => ({ preset: "year", from: `${today.slice(0, 4)}-01-01`, through: today });
  const [controls, setControls] = usePeriodControls<PowerPeriodControls>(ownerUid, "power", () => ({ skillsMode: false, comparison: null, drafts: [makeDraft()], unit: "W", duration: 300 }), validPowerPeriodControls);
  const { skillsMode, comparison, drafts, unit } = controls;
  const setSkillsMode = (skillsMode: boolean) => setControls(v => ({ ...v, skillsMode }));
  const setComparison = (comparison: TrainingComparisonPreset | null) => setControls(v => ({ ...v, comparison }));
  const setDrafts = (update: (drafts: Draft[]) => Draft[]) => setControls(v => ({ ...v, drafts: update(v.drafts) }));
  const setUnit = (unit: "W" | "W/kg") => setControls(v => ({ ...v, unit }));
  const [selection, setSelection] = useState<PowerCurvePeriodsSelection | null>(null);
  const [invalid, setInvalid] = useState(false);
  const result = usePowerCurvePeriods(ownerUid, selection, callableEnabled);
  const update = (index: number, patch: Partial<Draft>) => { setComparison(null); setDrafts(values => values.map((value, i) => index === i ? { ...value, ...patch } : value)); setSelection(null); setInvalid(false); };
  const submit = () => {
    setControls(value => value); // An explicit load wins over late session restoration.
    const now = Date.now();
    const periods = skillsMode ? [{ fromInclusive: Math.max(0, now - 56 * 86400000), toExclusive: now }, { fromInclusive: 0, toExclusive: now }] : comparison ? trainingComparisonPeriods(comparison, now) : drafts.map(draft => draft.preset === "all" ? { fromInclusive: 0, toExclusive: now }
      : draft.preset === "year" ? { fromInclusive: Date.parse(`${trainingCalendarDate(now).slice(0, 4)}-01-01T00:00:00+09:00`), toExclusive: now }
      : trainingCalendarPeriod(draft.from, draft.through, now));
    if (periods.some(period => !period || period.fromInclusive >= period.toExclusive)) { setInvalid(true); setSelection(null); return; }
    setInvalid(false); setSelection(current => ({ request: { unit: "W", periods: periods as PowerCurvePeriod[], ...(unit === "W/kg" ? { includeWeightNormalized: true } : {}) }, requestId: (current?.requestId ?? 0) + 1 }));
  };
  return <section className="fitness-analysis-controls period-curve-tool space-y-4" aria-label={t("periodCurve.title")}>
    {!embedded && <Text as="h3" variant="title">{t("periodCurve.title")}</Text>}
    <Text as="p" variant="bodyMedium" tone="secondary">{t(skillsMode ? "comparison.rollingNote" : "comparison.timezone")}</Text>

    {unit === "W/kg" && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.weightBasis")}</Text>}
    <ToggleControls variant="axis" aria-label={t("periodCurve.title")}><ToggleButton selected={!skillsMode} onClick={() => { setSkillsMode(false); setSelection(null); setInvalid(false); }}>{t("powerSkills.freePeriods")}</ToggleButton><ToggleButton selected={skillsMode} onClick={() => { setSkillsMode(true); setSelection(null); setInvalid(false); }}>{t("powerSkills.preset")}</ToggleButton></ToggleControls>
    {skillsMode && <Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.requestNote")}</Text>}
    <div className="period-curve-controls">
    <label className="period-curve-unit space-y-2 block" htmlFor={`${id}-unit`}><Text as="span" variant="bodyMedium">{t("periodCurve.unit")}</Text><DropdownSelect id={`${id}-unit`} label={t("periodCurve.unit")} value={String(unit)} onChange={next => { setUnit(next === "W/kg" ? "W/kg" : "W"); setSelection(null); setInvalid(false); }} options={[{ value: String("W"), label: "W" }, { value: String("W/kg"), label: "W/kg" }]} /></label>
    {!skillsMode && <ToggleControls variant="axis" aria-label={t("comparison.title")}>
      {(["fourWeeks", "yearToDate"] as const).map(preset => <ToggleButton key={preset} selected={comparison === preset} onClick={() => { setComparison(preset); setSelection(null); setInvalid(false); }}>{t(`comparison.${preset}`)}</ToggleButton>)}
      <ToggleButton selected={comparison === null} onClick={() => { setComparison(null); setSelection(null); setInvalid(false); }}>{t("periodCurve.custom")}</ToggleButton>
    </ToggleControls>}
    {!skillsMode && comparison && <Text as="p" variant="bodyMedium" tone="secondary">{t(`comparison.${comparison}Note`)}</Text>}
    {!skillsMode && !comparison && <div className="period-curve-form">{drafts.map((draft, index) => <div key={index} className="space-y-3"><label className="space-y-2 block" htmlFor={`${id}-${index}`}><Text as="span" variant="bodyMedium">{t("periodCurve.period", { n: index + 1 })}</Text><DropdownSelect id={`${id}-${index}`} label={t("periodCurve.period", { n: index + 1 })} value={String(draft.preset)} onChange={next => update(index, { preset: next as Draft["preset"] })} options={[{ value: String("year"), label: t("periodCurve.year") }, { value: String("all"), label: t("periodCurve.all") }, { value: String("custom"), label: t("periodCurve.custom") }]} /></label>{draft.preset === "custom" && <div className="period-curve-dates">{(["from", "through"] as const).map(field => <div key={field} className="fitness-date-control"><label htmlFor={`${id}-${index}-${field}`}><Text as="span" variant="bodyMedium">{t(`periodCurve.${field}`)}</Text></label><DateField id={`${id}-${index}-${field}`} portal icon={<CalendarDays size={ICON_SIZE.md} aria-hidden="true" />} max={today} value={draft[field]} onChange={next => update(index, { [field]: next })} /></div>)}</div>}</div>)}</div>}
    <div className="period-curve-actions">{!skillsMode && !comparison && <Button variant="ghost" size="sm" onClick={() => { setDrafts(values => values.length === 1 ? [...values, makeDraft()] : values.slice(0, 1)); setSelection(null); }}>{t(drafts.length === 1 ? "periodCurve.add" : "periodCurve.remove")}</Button>}<Button size="lg" loading={result.state === "loading"} disabled={!callableEnabled || result.state === "loading"} onClick={submit}>{t("periodCurve.load")}</Button></div>
    </div>
    {!callableEnabled && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.preparing")}</Text>}
    {invalid && <Text as="p" variant="bodyMedium" role="alert">{t("periodCurve.invalid")}</Text>}
    {result.state === "loading" && <Text as="p" variant="bodyMedium">{t("periodCurve.loading")}</Text>}
    {result.state === "error" && <Text as="p" variant="bodyMedium" role="alert">{t("periodCurve.error")}</Text>}
    {result.response && (skillsMode ? <PowerSkillsObservedView key={JSON.stringify(selection)} response={result.response} unit={selection?.request.includeWeightNormalized ? "W/kg" : "W"} /> : <PowerCurvePeriodsView selectedDuration={controls.duration} onDurationChange={duration => setControls(v => ({ ...v, duration }))} key={JSON.stringify(selection)} response={result.response} unit={selection?.request.includeWeightNormalized ? "W/kg" : "W"} />)}
    {result.response?.periods.map(p => <BikePeriodSnapshotPanel historyOnly={!p.coverage.truncated} key={`${p.fromInclusive}:${p.toExclusive}`} ownerUid={ownerUid} period={p} />)}
    {result.response && stageActivityPowerAvailable() && <PowerEffortPreferencePanel ownerUid={ownerUid} mode="stage_power_effort_adjusted_canonical" activityIds={[...new Set(result.response.periods.flatMap(p=>[...p.points.map(v=>v.sourceActivityId),...(p.powerDurationObservations?.points.map(v=>v.sourceActivityId)??[]),...(p.weightNormalized?.points.map(v=>v.sourceActivityId)??[]),...(p.weightNormalized?.powerDurationObservations?.points.map(v=>v.sourceActivityId)??[])]))].slice(0,20)} periods={result.response.periods.map((p,i)=>({id:`period_${i}`,fromInclusiveMs:p.fromInclusive,toExclusiveMs:p.toExclusive}))} scopeKey={JSON.stringify([selection,result.response.inputDigest])}/>}
  </section>;
}
export function PowerCurvePeriodsPanel({ ownerUid, callableEnabled = false, embedded = false, nativeActivities = [] }: { nativeActivities?: readonly NativePowerLoadedActivity[]; ownerUid: string | null | undefined; callableEnabled?: boolean; embedded?: boolean }) {
  const { user } = useAuth();
  if (!ownerUid || !user || user.isAnonymous || user.uid !== ownerUid) return null;
  return <div data-testid="K5-5"><PeriodsForm key={ownerUid} ownerUid={ownerUid} callableEnabled={callableEnabled} embedded={embedded} />{stageActivityPowerAvailable() && <NativePowerTwelvePersonalPanel key={`native-${ownerUid}`} ownerUid={ownerUid} activities={nativeActivities} enabled={callableEnabled} />}</div>;
}
