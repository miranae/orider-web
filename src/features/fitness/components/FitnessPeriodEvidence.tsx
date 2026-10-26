import BikePeriodSnapshotPanel from "./BikePeriodSnapshotPanel";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import PeriodLoadEvidence from "./PeriodLoadEvidence";
import { usePeriodControls } from "../../../hooks/usePeriodControls";
import { validTrainingPeriodControls, type TrainingPeriodControls } from "./periodControls";
import { localTrainingEmulatorAvailable } from "../../../services/localTrainingEmulator";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../contexts/AuthContext";
import { useLocale } from "../../../contexts/LocaleContext";
import { useTrainingAnalysisPeriods, type TrainingAnalysisPeriodsSelection } from "../../../hooks/useTrainingAnalysisPeriods";
import { trainingAnalysisPeriodsAvailable } from "../../../services/trainingAnalysisPeriods";
import { trainingCalendarDate, trainingCalendarPeriod, trainingComparisonPeriods, type TrainingComparisonPreset } from "../../../services/trainingComparisonCalendar";
import { getRuntimeConfig } from "../../../services/runtimeConfig";
import RunPeriodComparisonPanel from "../../activity/detail/RunPeriodComparisonPanel";
import TrainingPeriodZonesPanel from "../../activity/detail/TrainingPeriodZonesPanel";
import RunEffortStageManagementPanel from "../../activity/detail/RunEffortStageManagementPanel";
import { formatDistance, formatElev } from "../../../utils/units";
import { formatElapsedBoundary } from "../../activity/detail/activityRangeSelection";
import { Button, Input, Text, ToggleControls, ToggleButton } from "../../../theme/components";

type Sport = "bike" | "run" | "swim";
export default function FitnessPeriodEvidence({ discipline, inline = false, timeseries = null }: { discipline: Sport; inline?: boolean; timeseries?: FitnessTimeseriesDoc | null }) {
  const { user } = useAuth();
  if ((getRuntimeConfig().appEnvironment !== "stage" && !(discipline === "bike" && localTrainingEmulatorAvailable())) || !user || user.isAnonymous) return null;
  return <PeriodEvidence key={`${user.uid}:${discipline}`} ownerUid={user.uid} discipline={discipline} inline={inline} timeseries={timeseries} />;
}
function PeriodEvidence({ ownerUid, discipline, inline, timeseries }: { ownerUid: string; discipline: Sport; inline: boolean; timeseries: FitnessTimeseriesDoc | null }) {
  const { t } = useTranslation("fitness");
  const { t: activityT } = useTranslation("activity");
  const { units } = useLocale();
  const today = trainingCalendarDate(Date.now());
  const [controls, setControls] = usePeriodControls<TrainingPeriodControls>(ownerUid, `training-${discipline}`, () => ({ preset: "fourWeeks", ranges: trainingComparisonPeriods("fourWeeks", Date.now()).map(period => ({
    from: trainingCalendarDate(period.fromInclusive), through: trainingCalendarDate(period.toExclusive - 1),
  })) }), validTrainingPeriodControls);
  const { preset, ranges } = controls;
  const setPreset = (preset: TrainingComparisonPreset | null) => setControls(v => ({ ...v, preset }));
  const setRanges = (update: (ranges: TrainingPeriodControls["ranges"]) => TrainingPeriodControls["ranges"]) => setControls(v => ({ ...v, ranges: update(v.ranges) }));
  const [selection, setSelection] = useState<TrainingAnalysisPeriodsSelection | null>(null);
  const [invalid, setInvalid] = useState(false);
  const available = trainingAnalysisPeriodsAvailable(discipline);
  const result = useTrainingAnalysisPeriods(ownerUid, selection, available);
  const submit = () => {
    setControls(value => value); // An explicit load wins over late session restoration.
    const periods = preset ? trainingComparisonPeriods(preset, Date.now()) : ranges.map(range => trainingCalendarPeriod(range.from, range.through, Date.now()));
    if (periods.some(period => !period || period.fromInclusive >= period.toExclusive)) { setInvalid(true); return; }
    setInvalid(false);
    setSelection(current => ({ requestId: (current?.requestId ?? 0) + 1, request: {
      discipline, periods: periods.filter(period => period !== null),
      ...(discipline === "bike" ? { includeCyclingClimbObservations: true } : {}),
      ...(discipline === "run" ? { includeExpandedRunDistances: true, includeRunningPaceZones: true, includeStageRunEffortPreferences: true } : {}),
    } }));
  };
  const Container = inline ? "section" : "details";
  return <Container data-testid="K5-5-2" className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3">
    {inline ? <Text as="h3" variant="subtitle">{activityT("trainingPeriods.title")}</Text> : <summary className="cursor-pointer py-3">{activityT("trainingPeriods.title")}</summary>}
    <Text as="p" variant="caption">{t("comparison.timezone")}</Text>
    <ToggleControls variant="axis" aria-label={t("comparison.title")}>
      {(["fourWeeks", "yearToDate"] as const).map(value => <ToggleButton key={value} selected={preset === value} onClick={() => { setPreset(value); setSelection(null); setInvalid(false); }}>{t(`comparison.${value}`)}</ToggleButton>)}
      <ToggleButton selected={preset === null} onClick={() => { setPreset(null); setSelection(null); setInvalid(false); }}>{t("periodCurve.custom")}</ToggleButton>
    </ToggleControls>
    {preset && <Text as="p" variant="caption">{t(`comparison.${preset}Note`)}</Text>}
    {!preset && <div className="grid gap-3 sm:grid-cols-2">{ranges.map((range, index) => <fieldset key={index} disabled={result.state === "loading"}>
      <legend>{t("periodCurve.period", { n: index + 1 })}</legend>
      {(["from", "through"] as const).map(field => <label className="block" key={field}>{t(`periodCurve.${field}`)}<Input type="date" value={range[field]} max={today} onChange={event => { setRanges(values => values.map((value, position) => position === index ? { ...value, [field]: event.target.value } : value)); setSelection(null); setInvalid(false); }} /></label>)}
    </fieldset>)}</div>}
    <Button disabled={!available || result.state === "loading"} onClick={submit}>{t("periodCurve.load")}</Button>
    {!available && <Text role="status">{t("periodCurve.preparing")}</Text>}
    {invalid && <Text role="alert">{t("periodCurve.invalid")}</Text>}
    {result.state === "loading" && <Text role="status">{t("periodEvidence.loading")}</Text>}
    {result.state === "error" && <Button onClick={result.retry}>{t("canonical.retry")}</Button>}
    {result.response && <>
      <Text as="p" variant="caption">{activityT("growth.canonicalPeriodBasis")}</Text>
      <div className="grid gap-3 sm:grid-cols-2">{result.response.periods.map((period, index) => <section key={index}>
        <Text as="h3" variant="subtitle">{t("periodCurve.period", { n: index + 1 })} · {trainingCalendarDate(period.fromInclusive)} – {trainingCalendarDate(period.toExclusive - 1)}</Text>
        <Text>{period.totals.distanceM.totalValue == null ? "—" : formatDistance(period.totals.distanceM.totalValue, units)} · {period.totals.movingTimeSec.totalValue == null ? "—" : formatElapsedBoundary(period.totals.movingTimeSec.totalValue)} · {period.totals.elevationGainM.totalValue == null ? "—" : formatElev(period.totals.elevationGainM.totalValue, units)}</Text>
        {period.coverage.truncated && <Text>{activityT("trainingPeriods.truncated")}</Text>}
        {discipline === "bike" && <BikePeriodSnapshotPanel historyOnly={!period.coverage.truncated} ownerUid={ownerUid} period={period} />}
      </section>)}</div>
      <PeriodLoadEvidence ownerUid={ownerUid} discipline={discipline} periods={result.response.periods} timeseries={timeseries} />
      <RunPeriodComparisonPanel response={result.response} />
      <TrainingPeriodZonesPanel response={result.response} ownerUid={ownerUid} />
      {discipline === "run" && <RunEffortStageManagementPanel ownerUid={ownerUid} appliedResponse={result.response} />}
    </>}
  </Container>;
}
