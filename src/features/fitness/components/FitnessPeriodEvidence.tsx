import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../contexts/AuthContext";
import { useLocale } from "../../../contexts/LocaleContext";
import { useTrainingAnalysisPeriods, type TrainingAnalysisPeriodsSelection } from "../../../hooks/useTrainingAnalysisPeriods";
import { trainingAnalysisPeriodsAvailable } from "../../../services/trainingAnalysisPeriods";
import { utcPowerCurvePeriod } from "../../../services/powerCurvePeriods";
import { getRuntimeConfig } from "../../../services/runtimeConfig";
import RunPeriodComparisonPanel from "../../activity/detail/RunPeriodComparisonPanel";
import TrainingPeriodZonesPanel from "../../activity/detail/TrainingPeriodZonesPanel";
import RunEffortStageManagementPanel from "../../activity/detail/RunEffortStageManagementPanel";
import { formatDistance, formatElev } from "../../../utils/units";
import { formatElapsedBoundary } from "../../activity/detail/activityRangeSelection";
import { Button, Input, Text } from "../../../theme/components";

type Sport = "bike" | "run" | "swim";
export default function FitnessPeriodEvidence({ discipline }: { discipline: Sport }) {
  const { user } = useAuth();
  if (getRuntimeConfig().appEnvironment !== "stage" || !user || user.isAnonymous) return null;
  return <PeriodEvidence key={`${user.uid}:${discipline}`} ownerUid={user.uid} discipline={discipline} />;
}
function PeriodEvidence({ ownerUid, discipline }: { ownerUid: string; discipline: Sport }) {
  const { t } = useTranslation("fitness");
  const { t: activityT } = useTranslation("activity");
  const { units } = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [ranges, setRanges] = useState(() => [
    { from: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10), through: today },
    { from: new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10), through: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10) },
  ]);
  const [selection, setSelection] = useState<TrainingAnalysisPeriodsSelection | null>(null);
  const [invalid, setInvalid] = useState(false);
  const available = trainingAnalysisPeriodsAvailable();
  const result = useTrainingAnalysisPeriods(ownerUid, selection, available);
  const submit = () => {
    const periods = ranges.map(range => utcPowerCurvePeriod(range.from, range.through, Date.now()));
    if (periods.some(period => !period)) { setInvalid(true); return; }
    setInvalid(false);
    setSelection(current => ({ requestId: (current?.requestId ?? 0) + 1, request: {
      discipline, periods: periods.filter(period => period !== null),
      ...(discipline === "bike" ? { includeCyclingClimbObservations: true } : {}),
      ...(discipline === "run" ? { includeExpandedRunDistances: true, includeRunningPaceZones: true, includeStageRunEffortPreferences: true } : {}),
    } }));
  };
  return <details data-testid="K5-5-2" className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3">
    <summary className="cursor-pointer py-3">{activityT("trainingPeriods.title")}</summary>
    <Text as="p" variant="caption">{t("periodCurve.timezone")}</Text>
    <div className="grid gap-3 sm:grid-cols-2">{ranges.map((range, index) => <fieldset key={index} disabled={result.state === "loading"}>
      <legend>{t("periodCurve.period", { n: index + 1 })}</legend>
      {(["from", "through"] as const).map(field => <label className="block" key={field}>{t(`periodCurve.${field}`)}<Input type="date" value={range[field]} max={today} onChange={event => { setRanges(values => values.map((value, position) => position === index ? { ...value, [field]: event.target.value } : value)); setSelection(null); }} /></label>)}
    </fieldset>)}</div>
    <Button disabled={!available || result.state === "loading"} onClick={submit}>{t("periodCurve.load")}</Button>
    {!available && <Text role="status">{t("periodCurve.preparing")}</Text>}
    {invalid && <Text role="alert">{t("periodCurve.invalid")}</Text>}
    {result.state === "loading" && <Text role="status">{t("periodEvidence.loading")}</Text>}
    {result.state === "error" && <Button onClick={result.retry}>{t("canonical.retry")}</Button>}
    {result.response && <>
      <Text as="p" variant="caption">{activityT("growth.canonicalPeriodBasis")}</Text>
      <div className="grid gap-3 sm:grid-cols-2">{result.response.periods.map((period, index) => <section key={index}>
        <Text as="h3" variant="subtitle">{t("periodCurve.period", { n: index + 1 })}</Text>
        <Text>{period.totals.distanceM.totalValue == null ? "—" : formatDistance(period.totals.distanceM.totalValue, units)} · {period.totals.movingTimeSec.totalValue == null ? "—" : formatElapsedBoundary(period.totals.movingTimeSec.totalValue)} · {period.totals.elevationGainM.totalValue == null ? "—" : formatElev(period.totals.elevationGainM.totalValue, units)}</Text>
        {period.coverage.truncated && <Text>{activityT("trainingPeriods.truncated")}</Text>}
      </section>)}</div>
      <RunPeriodComparisonPanel response={result.response} />
      <TrainingPeriodZonesPanel response={result.response} ownerUid={ownerUid} />
      {discipline === "run" && <RunEffortStageManagementPanel ownerUid={ownerUid} appliedResponse={result.response} />}
    </>}
  </details>;
}
