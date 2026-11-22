import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import type { PowerCurvePeriod, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import { Button, Card, DataTable, DistributionStrip, Text, ToggleButton, ToggleControls, buttonClass } from "../../../theme/components";
import { useAuth } from "../../../contexts/AuthContext";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { usePowerCurvePeriods, type PowerCurvePeriodsSelection } from "../../../hooks/usePowerCurvePeriods";
import { useTrainingAnalysisPeriods, type TrainingAnalysisPeriodsSelection } from "../../../hooks/useTrainingAnalysisPeriods";
import { trainingAnalysisPeriodsAvailable } from "../../../services/trainingAnalysisPeriods";
import { trainingWindowPeriods } from "../../../services/trainingComparisonCalendar";
import { WINDOW_RELOAD_DELAY_MS } from "../../../services/periodRequestCache";
import { FOCUS_TARGETS, withFocus } from "../../../services/focusTarget";
import { CoachQuestionLauncher } from "../../coach/CoachQuestionLauncher";
import CriticalPaceCurve from "../../../components/charts/CriticalPaceCurve";
import type { CurvePeriods, RunPacePoint } from "../fitnessCurveDocuments";
import { periodPower, signedChange, summarizeCoachAnalysis, type CurveRow, type PowerUnit, type ZoneShare } from "../coachAnalysisSummary";
import "./coach-analysis.css";

/** 분석 기간(최근 N일 ↔ 이전 N일) 선택지. */
export const ANALYSIS_WINDOW_CHOICES = [30, 90, 180, 365] as const;
type WindowDays = typeof ANALYSIS_WINDOW_CHOICES[number];
const DEFAULT_WINDOW: WindowDays = 90;

export interface CoachAnalysisViewProps {
  discipline: "bike" | "run";
  /** 기간 파워 비교 호출이 열린 환경인지. 닫혀 있으면 [fallbackPowerCurve] 를 그대로 둔다. */
  powerPeriodsEnabled: boolean;
  fallbackPowerCurve?: ReactNode;
  runPaceCurve?: CurvePeriods<RunPacePoint>;
  /** FTP 재평가 제안이 있는지 — 있을 때만 "FTP 재평가" 줄을 둔다. */
  ftpReviewAvailable?: boolean;
  /** 기존 FTP 판단 영역(요청했을 때만 열리는 #ftp-decision). */
  ftpSection?: ReactNode;
}

/**
 * 코치 분석 — 웹·앱(임베드)이 같은 한 구조를 쓴다.
 * 요약 3칸 → 파워 커브 → 훈련 구성 → 다음에 할 일. 설명 문구 없이 숫자·짧은 제목·버튼만 둔다.
 * 두 기간 비교는 서버 호출이라 화면이 열릴 때와 기간을 바꿀 때(연속 선택은 마지막만) 한 번씩만 부른다.
 */
export default function CoachAnalysisView({ discipline, powerPeriodsEnabled, fallbackPowerCurve = null, runPaceCurve, ftpReviewAvailable = false, ftpSection = null }: CoachAnalysisViewProps) {
  const { t } = useTranslation("fitness");
  const { user, signIn } = useAuth();
  const webScope = useFirebaseServices().scope !== "embedded";
  const ownerUid = user && !user.isAnonymous ? user.uid : null;
  const isBike = discipline === "bike";
  const [windowDays, setWindowDays] = useState<WindowDays>(DEFAULT_WINDOW);
  const [request, setRequest] = useState<{ days: number; periods: PowerCurvePeriod[]; id: number }>(() => ({ days: DEFAULT_WINDOW, periods: trainingWindowPeriods(DEFAULT_WINDOW, Date.now()), id: 1 }));
  const [unit, setUnit] = useState<PowerUnit>("W");
  // 기간 탭을 연달아 누르면 마지막 기간만 부른다(기간 분석 호출 한도 보호).
  const firstWindow = useRef(true);
  useEffect(() => {
    if (firstWindow.current) { firstWindow.current = false; return; }
    const timer = setTimeout(() => setRequest(current => ({ days: windowDays, periods: trainingWindowPeriods(windowDays, Date.now()), id: current.id + 1 })), WINDOW_RELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [windowDays]);
  const powerSelection = useMemo<PowerCurvePeriodsSelection | null>(() => isBike && powerPeriodsEnabled
    ? { request: { unit: "W", periods: request.periods, includeWeightNormalized: true }, requestId: request.id } : null, [isBike, powerPeriodsEnabled, request]);
  const trainingAvailable = trainingAnalysisPeriodsAvailable(discipline);
  const trainingSelection = useMemo<TrainingAnalysisPeriodsSelection | null>(() => trainingAvailable
    ? { request: { discipline, periods: request.periods }, requestId: request.id } : null, [trainingAvailable, discipline, request]);
  const power = usePowerCurvePeriods(ownerUid, powerSelection, powerPeriodsEnabled);
  const training = useTrainingAnalysisPeriods(ownerUid, trainingSelection, trainingAvailable);
  const summary = summarizeCoachAnalysis({ power: power.response, training: training.response, unit });
  const days = request.days;
  const loading = power.state === "loading" || training.state === "loading";
  const failed = power.state === "error" || training.state === "error";
  const retry = () => { if (training.state === "error") training.retry(); if (power.state === "error") setRequest(current => ({ ...current, id: current.id + 1 })); };
  const percent = (value: number | null) => value == null ? "—" : `${signedChange(value)}%`;
  const tiles = isBike && power.response && !summary.insufficient ? [
    { key: "fiveMin", label: t("analysis.concise.fiveMin"), value: summary.fiveMinPct, text: percent(summary.fiveMinPct) },
    { key: "sixtyMin", label: t("analysis.concise.sixtyMin"), value: summary.sixtyMinPct, text: percent(summary.sixtyMinPct) },
    { key: "high", label: t("analysis.concise.highShare"), value: summary.highSharePp, text: summary.highSharePp == null ? "—" : `${signedChange(summary.highSharePp)}%p` },
  ] : [];
  const planDetails = [
    summary.fiveMinPct != null ? `${t("analysis.concise.fiveMin")} ${percent(summary.fiveMinPct)}` : null,
    summary.sixtyMinPct != null ? `${t("analysis.concise.sixtyMin")} ${percent(summary.sixtyMinPct)}` : null,
    summary.highSharePp != null ? `${t("analysis.concise.highShare")} ${signedChange(summary.highSharePp)}%p` : null,
  ].filter(Boolean).join(", ");
  const planQuestion = t("analysis.concise.planQuestion", { days }) + (planDetails ? ` (${planDetails})` : "");
  const paceAvailable = !!runPaceCurve && (runPaceCurve.recent28.length > 0 || runPaceCurve.prev28.length > 0);

  return <div className="coach-analysis" data-testid="coach-analysis">
    <ToggleControls variant="axis" aria-label={t("analysis.concise.period")} data-testid="K5-0-3">
      {ANALYSIS_WINDOW_CHOICES.map(choice => <ToggleButton key={choice} selected={windowDays === choice} onClick={() => setWindowDays(choice)}>{t(`range.${choice}`)}</ToggleButton>)}
    </ToggleControls>
    {loading && <Text as="p" variant="bodySmall" tone="secondary" role="status">{t("analysis.concise.loading")}</Text>}
    {failed && <div><Button size="sm" variant="secondary" onClick={retry}>{t("canonical.retry")}</Button></div>}

    {summary.insufficient ? <div className="coach-analysis__notice" data-testid="coach-analysis-insufficient">
      <Text variant="bodyMedium">{t("analysis.concise.insufficient", { count: summary.insufficient.powerActivityCount })}</Text>
      {webScope && <LocalizedLink className="coach-analysis__link" to={withFocus("/settings/device", FOCUS_TARGETS.virtualPower)}>{t("analysis.concise.enablePower")} ›</LocalizedLink>}
    </div> : tiles.length > 0 && <div className="coach-analysis__tiles" data-testid="coach-analysis-summary">
      {tiles.map(tile => <Card key={tile.key} variant="flat" padding="compact" className="coach-analysis__tile">
        <Text as="div" variant="caption" tone="secondary">{tile.label}</Text>
        <Text as="div" variant="dataMedium" tone={tile.value != null && tile.value > 0 ? "accent" : "primary"}>{tile.text}</Text>
      </Card>)}
    </div>}

    {isBike && (powerPeriodsEnabled
      ? power.response && summary.rows.length > 0 && <PowerCurveCard response={power.response} rows={summary.rows} unit={unit} onUnitChange={setUnit} days={days} />
      : fallbackPowerCurve)}

    {discipline === "run" && paceAvailable && <Card title={t("analysis.concise.paceCurveTitle")} data-testid="coach-analysis-pace">
      <CriticalPaceCurve stableSelection recentPoints={runPaceCurve!.recent28} prevPoints={runPaceCurve!.prev28} />
    </Card>}

    {summary.recentZones && <CompositionCard recent={summary.recentZones} previous={summary.previousZones} recentHours={summary.recentWeeklyHours} previousHours={summary.previousWeeklyHours} />}

    {ownerUid && <Card title={t("analysis.concise.nextTitle")} data-testid="coach-analysis-next">
      <div className="coach-analysis__next">
        <CoachQuestionLauncher user={user} discipline={discipline} onSignIn={() => void signIn()} triggerBlock triggerVariant="primary" triggerTestId="coach-analysis-apply"
          triggerLabel={t("analysis.concise.applyPlan")} presetQuestion={planQuestion} />
        {isBike && ftpReviewAvailable && <FtpReviewLink label={t("analysis.concise.ftpReview")} />}
      </div>
    </Card>}
    {ftpSection}
  </div>;
}

const CURVE_DURATIONS: readonly number[] = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];

/** 같은 화면의 #ftp-decision 영역을 연다(기존 FTP 판단 진입). */
function FtpReviewLink({ label }: { label: string }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("detail", "ftp-decision");
  return <Link data-testid="coach-analysis-ftp" className={buttonClass({ variant: "ghost", block: true, align: "start" })} to={{ search: `?${params}` }}>{label} ›</Link>;
}

function PowerCurveCard({ response, rows, unit, onUnitChange, days }: { response: PowerCurvePeriodsResponse; rows: CurveRow[]; unit: PowerUnit; onUnitChange: (unit: PowerUnit) => void; days: number }) {
  const { t } = useTranslation("fitness");
  const durationLabel = (seconds: number) => seconds < 60 ? t("duration.sec", { n: seconds }) : t("duration.min", { n: seconds / 60 });
  const format = (value: number | null) => value == null ? "—" : unit === "W/kg" ? value.toFixed(2) : String(Math.round(value));
  const [recent, previous] = response.periods;
  const curves = [recent, previous].map(period => CURVE_DURATIONS
    .map(seconds => ({ seconds, value: periodPower(period, seconds, unit) }))
    .filter((point): point is { seconds: number; value: number } => point.value != null));
  const all = curves.flat();
  const high = Math.max(unit === "W/kg" ? 0.01 : 100, ...all.map(point => point.value)) * 1.1;
  const x = (seconds: number) => 40 + Math.log(seconds) / Math.log(3600) * 300;
  const y = (value: number) => 130 - value / high * 110;
  return <Card title={t("analysis.concise.curveTitle")} data-testid="coach-analysis-curve"
    actions={<ToggleControls variant="axis" density="compact" aria-label={t("periodCurve.unit")}>
      {(["W/kg", "W"] as const).map(value => <ToggleButton key={value} selected={unit === value} onClick={() => onUnitChange(value)}>{value}</ToggleButton>)}
    </ToggleControls>}>
    <div className="coach-analysis__legend">
      <Text variant="caption"><span className="coach-analysis__line" />{t("analysis.concise.recent", { days })}</Text>
      <Text variant="caption" tone="secondary"><span className="coach-analysis__line coach-analysis__line--previous" />{t("analysis.concise.previous", { days })}</Text>
    </div>
    {all.length > 0 && <svg viewBox="0 0 360 156" className="coach-analysis__chart" role="img" aria-label={`${t("analysis.concise.curveTitle")} · ${unit}`}>
      {[0, 0.5, 1].map(fraction => <line key={fraction} x1={40} x2={340} y1={20 + fraction * 110} y2={20 + fraction * 110} stroke="var(--grid-soft)" />)}
      {[0, 0.5, 1].map(fraction => <text key={`l${fraction}`} x={34} y={24 + fraction * 110} textAnchor="end" fill="var(--chart-grid-label)">{format(high * (1 - fraction))}</text>)}
      {curves.map((points, index) => points.length > 0 && <polyline key={index} points={points.map(point => `${x(point.seconds)},${y(point.value)}`).join(" ")}
        stroke={index ? "var(--ink-2)" : "var(--accent)"} strokeWidth={2} strokeDasharray={index ? "6 4" : undefined} fill="none" />)}
      {[5, 60, 300, 1200, 3600].map(seconds => <text key={seconds} x={x(seconds)} y={150} textAnchor="middle" fill="var(--chart-grid-label)">{durationLabel(seconds)}</text>)}
    </svg>}
    <DataTable caption={t("analysis.concise.curveTitle")} captionVisibility="screen-reader" emptyLabel="—" rowKey={row => String(row.durationSeconds)} rows={rows} columns={[
      { id: "duration", header: t("analysis.concise.duration"), cell: row => durationLabel(row.durationSeconds) },
      { id: "value", header: unit, align: "end", cell: row => format(row.recent) },
      { id: "change", header: t("analysis.concise.change"), align: "end", cell: row => <Text variant="bodySmall" tone={row.changePct != null && row.changePct > 0 ? "accent" : "secondary"}>{row.changePct == null ? "—" : `${signedChange(row.changePct)}%`}</Text> },
    ]} />
  </Card>;
}

function CompositionCard({ recent, previous, recentHours, previousHours }: { recent: ZoneShare; previous: ZoneShare | null; recentHours: number | null; previousHours: number | null }) {
  const { t } = useTranslation("fitness");
  const items = (share: ZoneShare, unlabelled: boolean) => ([
    { id: "low", label: "Z1–2", weight: share.low, color: "var(--zone-2)" },
    { id: "mid", label: "Z3", weight: share.mid, color: "var(--zone-3)" },
    { id: "high", label: "Z4+", weight: share.high, color: "var(--zone-5)" },
  ]).map(item => ({ ...item, detail: `${Math.round(item.weight * 100)}%`, unlabelled }));
  const hours = (value: number | null) => value == null ? "—" : value.toFixed(1);
  return <Card title={t("analysis.concise.compositionTitle")} data-testid="coach-analysis-composition"
    sub={recentHours != null || previousHours != null ? t("analysis.concise.weeklyHours", { recent: hours(recentHours), previous: hours(previousHours) }) : undefined}>
    <div className="coach-analysis__composition">
      <DistributionStrip label={t("analysis.concise.recentShort")} items={items(recent, false)} />
      {previous && <DistributionStrip label={t("analysis.concise.previousShort")} items={items(previous, true)} />}
    </div>
  </Card>;
}
