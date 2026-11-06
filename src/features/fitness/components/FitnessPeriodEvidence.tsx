import "./fitness-period-evidence.css";
import BikePeriodSnapshotPanel from "./BikePeriodSnapshotPanel";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import PeriodLoadEvidence from "./PeriodLoadEvidence";
import { usePeriodControls } from "../../../hooks/usePeriodControls";
import { validTrainingPeriodControls, type TrainingPeriodControls } from "./periodControls";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../contexts/AuthContext";
import { useLocale } from "../../../contexts/LocaleContext";
import { useTrainingAnalysisPeriods, type TrainingAnalysisPeriodsSelection } from "../../../hooks/useTrainingAnalysisPeriods";
import { trainingAnalysisPeriodsAvailable } from "../../../services/trainingAnalysisPeriods";
import { trainingCalendarDate, trainingCalendarPeriod, trainingComparisonPeriods, trainingWindowPeriods, type TrainingComparisonPreset } from "../../../services/trainingComparisonCalendar";
import { getRuntimeConfig } from "../../../services/runtimeConfig";
import RunPeriodComparisonPanel from "../../activity/detail/RunPeriodComparisonPanel";
import TrainingPeriodZonesPanel from "../../activity/detail/TrainingPeriodZonesPanel";
import RunEffortStageManagementPanel from "../../activity/detail/RunEffortStageManagementPanel";
import { formatDistance, formatElev } from "../../../utils/units";
import { formatElapsedBoundary } from "../../activity/detail/activityRangeSelection";
import { Button, Input, Stack, Text, ToggleControls, ToggleButton } from "../../../theme/components";

type Sport = "bike" | "run" | "swim";
/** 이 패널이 그려지는지 — 페이지가 공용 "불러오기" 버튼을 둘지 정할 때 쓴다. */
export function fitnessPeriodEvidenceVisible(discipline: string, user: { isAnonymous: boolean } | null | undefined): boolean {
  if (!user || user.isAnonymous || discipline === "tri") return false;
  return getRuntimeConfig().appEnvironment === "stage" || ((discipline === "bike" || discipline === "run") && trainingAnalysisPeriodsAvailable(discipline));
}
/**
 * [windowDays] 를 주면(분석 상단 기간 선택) 기본 비교가 "최근 N일 ↔ 이전 N일" 이 되고, 한 번 불러온 뒤에는
 * 위 기간이 바뀔 때 새 기간으로 다시 불러온다. 직접 지정은 그대로 고를 수 있다.
 * [loadSignal] 을 주면 자체 불러오기 버튼을 숨기고, 값이 바뀔 때마다 지금 고른 기간으로 불러온다(페이지 공용 버튼).
 */
export default function FitnessPeriodEvidence({ discipline, inline = false, timeseries = null, windowDays, loadSignal }: { discipline: Sport; inline?: boolean; timeseries?: FitnessTimeseriesDoc | null; windowDays?: number; loadSignal?: number }) {
  const { user } = useAuth();
  if (!fitnessPeriodEvidenceVisible(discipline, user)) return null;
  return <PeriodEvidence key={`${user!.uid}:${discipline}`} ownerUid={user!.uid} discipline={discipline} inline={inline} timeseries={timeseries} windowDays={windowDays} loadSignal={loadSignal} />;
}
function PeriodEvidence({ ownerUid, discipline, inline, timeseries, windowDays, loadSignal }: { ownerUid: string; discipline: Sport; inline: boolean; timeseries: FitnessTimeseriesDoc | null; windowDays?: number; loadSignal?: number }) {
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
  // 위 기간 선택을 따르는 비교(기본). 직접 지정을 고르면 끈다.
  const [followWindow, setFollowWindow] = useState(windowDays != null);
  const windowMode = windowDays != null && followWindow;
  const submit = () => {
    setControls(value => value); // An explicit load wins over late session restoration.
    const periods = windowMode ? trainingWindowPeriods(windowDays!, Date.now()) : preset ? trainingComparisonPeriods(preset, Date.now()) : ranges.map(range => trainingCalendarPeriod(range.from, range.through, Date.now()));
    if (periods.some(period => !period || period.fromInclusive >= period.toExclusive)) { setInvalid(true); return; }
    setInvalid(false);
    setSelection(current => ({ requestId: (current?.requestId ?? 0) + 1, request: {
      discipline, periods: periods.filter(period => period !== null),
      ...(discipline === "bike" ? { includeCyclingClimbObservations: true } : {}),
      ...(discipline === "run" ? { includeExpandedRunDistances: true, includeRunningPaceZones: true, includeStageRunEffortPreferences: true } : {}),
    } }));
  };
  // 한 번 불러온 뒤 위 기간이 바뀌면 새 기간으로 다시 불러온다(기간을 바꿔도 그대로이던 문제).
  const submitRef = useRef(submit); submitRef.current = submit;
  const loadedWindow = useRef<number | null>(null);
  useEffect(() => {
    if (!windowMode || selection === null) return;
    if (loadedWindow.current === null) { loadedWindow.current = windowDays!; return; }
    if (loadedWindow.current !== windowDays) { loadedWindow.current = windowDays!; submitRef.current(); }
  }, [windowDays, windowMode, selection]);
  const lastSignal = useRef(loadSignal);
  useEffect(() => {
    if (loadSignal === undefined || loadSignal === lastSignal.current) return;
    lastSignal.current = loadSignal; if (available) submitRef.current();
  }, [loadSignal, available]);
  const Container = inline ? "section" : "details";
  return <Container data-testid="K5-5-2" className="fitness-period-evidence">
    {inline ? <Text as="h3" variant="title">{activityT("trainingPeriods.title")}</Text> : <summary className="cursor-pointer py-3">{activityT("trainingPeriods.title")}</summary>}
    <Stack gap="var(--space-4)">
    <Text as="p" variant="caption" tone="secondary">{t("comparison.timezone")}</Text>
    <ToggleControls variant="metric" aria-label={t("comparison.title")}>
      {windowDays != null ? <ToggleButton selected={windowMode} onClick={() => { setFollowWindow(true); setSelection(null); setInvalid(false); }}>{t("comparison.window", { days: windowDays })}</ToggleButton>
        : (["fourWeeks", "yearToDate"] as const).map(value => <ToggleButton key={value} selected={preset === value} onClick={() => { setPreset(value); setSelection(null); setInvalid(false); }}>{t(`comparison.${value}`)}</ToggleButton>)}
      <ToggleButton selected={windowDays != null ? !windowMode : preset === null} onClick={() => { setFollowWindow(false); setPreset(null); setSelection(null); setInvalid(false); }}>{t("periodCurve.custom")}</ToggleButton>
    </ToggleControls>
    {windowMode ? <Text as="p" variant="caption">{t("comparison.windowNote", { days: windowDays })}</Text> : preset && <Text as="p" variant="caption">{t(`comparison.${preset}Note`)}</Text>}
    {!windowMode && !preset && <div className="grid gap-3 sm:grid-cols-2">{ranges.map((range, index) => <fieldset key={index} disabled={result.state === "loading"}>
      <legend>{t("periodCurve.period", { n: index + 1 })}</legend>
      {(["from", "through"] as const).map(field => <label className="block" key={field}>{t(`periodCurve.${field}`)}<Input type="date" value={range[field]} max={today} onChange={event => { setRanges(values => values.map((value, position) => position === index ? { ...value, [field]: event.target.value } : value)); setSelection(null); setInvalid(false); }} /></label>)}
    </fieldset>)}</div>}
    {loadSignal === undefined && <div><Button disabled={!available || result.state === "loading"} onClick={submit}>{t("periodCurve.load")}</Button></div>}
    {!available && <Text role="status">{t("periodCurve.preparing")}</Text>}
    {invalid && <Text role="alert">{t("periodCurve.invalid")}</Text>}
    {result.state === "loading" && <Text role="status">{t("periodEvidence.loading")}</Text>}
    {result.state === "error" && <Button onClick={result.retry}>{t("canonical.retry")}</Button>}
    {result.response && <Stack gap="var(--space-6)">
      <Text as="p" variant="caption">{activityT("growth.canonicalPeriodBasis")}</Text>
      <div className="grid gap-3 sm:grid-cols-2">{result.response.periods.map((period, index) => <section key={index} className="fitness-period-summary">
        <Text as="h4" variant="subtitle">{t("periodCurve.period", { n: index + 1 })}</Text>
        <Text as="p" variant="caption" tone="secondary">{trainingCalendarDate(period.fromInclusive)} – {trainingCalendarDate(period.toExclusive - 1)}</Text>
        <Text as="p" weight={600}>{period.totals.distanceM.totalValue == null ? "—" : formatDistance(period.totals.distanceM.totalValue, units)} · {period.totals.movingTimeSec.totalValue == null ? "—" : formatElapsedBoundary(period.totals.movingTimeSec.totalValue)} · {period.totals.elevationGainM.totalValue == null ? "—" : formatElev(period.totals.elevationGainM.totalValue, units)}</Text>
        {period.coverage.truncated && <Text as="p" tone="secondary">{activityT("trainingPeriods.truncated")}</Text>}
        {discipline === "bike" && <BikePeriodSnapshotPanel historyOnly={!period.coverage.truncated} ownerUid={ownerUid} period={period} />}
      </section>)}</div>
      <PeriodLoadEvidence ownerUid={ownerUid} discipline={discipline} periods={result.response.periods} timeseries={timeseries} />
      <RunPeriodComparisonPanel response={result.response} />
      <TrainingPeriodZonesPanel response={result.response} ownerUid={ownerUid} />
      {discipline === "run" && <RunEffortStageManagementPanel ownerUid={ownerUid} appliedResponse={result.response} />}
    </Stack>}
    </Stack>
  </Container>;
}
