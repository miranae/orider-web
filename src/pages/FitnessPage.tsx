import CoachDetailRouteNotice from "../features/fitness/components/CoachDetailRouteNotice";
import { isSportUiEnabled } from "../config/sportFeatures";
import { qualifiedRunRecords } from "../features/fitness/runAnalysisReadiness";
import { estimateVo2max } from "../features/fitness/estimateVo2max";
import ConditionSectionNav from "../features/fitness/components/ConditionSectionNav";
import { FitnessEvidenceTrend } from "../features/fitness/components/FitnessEvidenceTrend";
import FitnessPedalingEvidence from "../features/fitness/components/FitnessPedalingEvidence";
import GlossaryText from "../components/common/GlossaryText";
import GlossaryProvider from "../components/common/GlossaryProvider";
import FitnessPeriodEvidence from "../features/fitness/components/FitnessPeriodEvidence";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../constants/appStoreLinks";
import RunningRaceEstimatesPanel from "../features/fitness/RunningRaceEstimatesPanel";
import { getRuntimeConfig } from "../services/runtimeConfig";
import "./FitnessPage.css";
import { PowerCurvePeriodsPanel } from "../features/fitness/components/PowerCurvePeriodsPanel";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTrainingDecision } from "../hooks/useTrainingDecision";
import { useSearchParams } from "react-router-dom";

import { isNegligibleActivitySummary } from "@shared/training/activityLoad";
import { classifyGaps, computeExpectedCurve, computeOutdoorPacingGuide, type GapEntry } from "@shared/training/expectedPower";
import type { PowerDurationKey } from "@shared/types/personal-records";
import { deriveEstimatedFtpProgression } from "@shared/training/ftpProgression";
import AdaptationSummary from "../components/training/AdaptationSummary";
import ConsistencyStreakCard from "../components/training/ConsistencyStreakCard";
import CriticalPaceCurve from "../components/charts/CriticalPaceCurve";
import CSSCurve from "../components/charts/CSSCurve";
import FitnessChart from "../components/FitnessChart";
import PmcHistoryPanel, { PmcHistoryMethodNotes } from "../features/fitness/components/PmcHistoryPanel";
import type { PmcRange } from "../features/fitness/pmcHistory";
import { FitnessZoneDistributions } from "../features/fitness/components/FitnessZoneDistributions";
import FitnessPdcProfile from "../features/fitness/components/FitnessPdcProfile";
import CyclingAbilityCard from "../components/fitness/CyclingAbilityCard";
import MilestoneCelebration from "../components/fitness/MilestoneCelebration";
import MilestonesGrid from "../components/fitness/MilestonesGrid";
import RunRecordsBoard from "../components/fitness/RunRecordsBoard";
import TrainingStatusCard from "../components/fitness/TrainingStatusCard";
import GuestValuePreview from "../components/guest/GuestValuePreview";
import MobileFitnessPage from "../components/mobile/MobileFitnessPage";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/redesign";
import DetailsSection from "../components/redesign/DetailsSection";
import AnchoredDetailsSection from "../components/redesign/AnchoredDetailsSection";
import DisciplineTabs from "../components/redesign/DisciplineTabs";
import { RevalidatingIndicator } from "../components/training/RevalidatingIndicator";
import FtpDecisionSection from "../features/fitness/components/FtpDecisionSection";
import { needsRunAnalysisReadiness } from "../features/fitness/runAnalysisReadiness";
import RunRecordsSummary from "../features/fitness/components/RunRecordsSummary";
import BikeThresholdDecisionCard from "../features/fitness/components/BikeThresholdDecisionCard";
import FitnessCoachBriefing from "../features/fitness/components/FitnessCoachBriefing";
import DailyTSSChart from "../features/fitness/components/DailyTSSChart";
import PowerCurveChart from "../features/fitness/components/PowerCurveChart";
import { BikePowerCurveEvidence } from "../features/fitness/components/BikePowerCurveEvidence";
import {
  activityIdsCoveredByImpacts,
  activityDayLoad,
  deriveActivityImpacts,
  forecastFitness48Hours,
} from "../features/fitness/activityImpact";
import { deriveMonthlyCyclingVo2maxTrend } from "../features/fitness/deriveMonthlyCyclingVo2maxTrend";
import {
  POWER_DURATION_KEY_SEC,
  formatKoreanDate,
  formatMonthDay,
  type PowerCurvePoint,
} from "../features/fitness/fitnessPageUtils";
import { PMC_LINE_PALETTE } from "../features/fitness/chartPalette";
import { FitnessWeeklyInsight } from "../features/trainingHub/TrainingHubOpportunityPanel";
import TodayTrainingDecisionCard, { TodayTrainingDecisionSource } from "../features/trainingDecision/TodayTrainingDecisionCard";
import type { TodayTrainingDecisionState } from "../hooks/useTodayTrainingDecision";
import { useFitnessModel, type FitnessModel } from "../hooks/useFitnessModel";
import CanonicalFitnessNotice from "../features/fitness/components/CanonicalFitnessNotice";
import FitnessActivityWindowNotice from "../features/fitness/components/FitnessActivityWindowNotice";
import { Button, Card, Chip, Text, Section, ToggleControls, ToggleButton, buttonClass } from "../theme/components";
import { getDisciplineColor } from "../utils/disciplineFilter";
import { toLocalDate } from "../utils/dateUtils";
import { fitnessTodayKey } from "@shared/training/dateKey";
import TriFitnessView from "./fitness/TriFitnessView";
import { formatPlanGoalTitle } from "../features/training/plan/planDisplay";
import LoadQualityEvidence from "../features/sufficiency/LoadQualityEvidence";
import { SufficiencyCard, SufficiencyInline, SufficiencyGroup, isSufficiencyGrouped, findSufficiencyBlock, needsSufficiencyCard } from "../features/sufficiency/SufficiencyBlock";

export interface FitnessViewProps {
  embedded?: boolean;
  part?: "all" | "condition" | "analysis";
  model: FitnessModel;
  thresholdsSlot?: ReactNode;
  analysisSummarySlot?: ReactNode;
  conditionSupplementSlot?: ReactNode;
  hasThresholdSettings?: boolean;
}

export function fitnessGoalDisplayName(goal: { title?: string | null; courseName?: string | null } | null): string | null {
  if (!goal) return null;
  const raw = [goal.title, goal.courseName]
    .map((value) => value?.trim())
    .find((value) => value && !/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(value));
  return raw ? formatPlanGoalTitle(raw).name : null;
}

export function FitnessView({ thresholdsSlot, ...props }: FitnessViewProps) {
  return <GlossaryProvider scopeKey="coach-fitness">
    {!props.embedded && props.part === "analysis" && <CoachDetailRouteNotice discipline={props.model.discipline} />}
    <FitnessViewContent {...props} thresholdsSlot={thresholdsSlot} />
  </GlossaryProvider>;
}

function FitnessViewContent({ embedded = false, part = "all", model, thresholdsSlot, analysisSummarySlot, conditionSupplementSlot, hasThresholdSettings = Boolean(thresholdsSlot) }: FitnessViewProps) {
  const [chartView, setChartView] = useState<"trend" | "years" | "activities">("trend");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  // Form 구간 정본(#886). 전환이 꺼져 있으면 envelope 은 null 이고 카드는 기존 로컬 표시로 남는다.
  const trainingDecision = useTrainingDecision(
    model.discipline === "tri" ? null : model.user?.uid ?? null,
    model.discipline === "tri" ? "bike" : model.discipline,
  );
  const {
    t,
    i18n,
    durationLabel,
    user,
    profile,
    ftpHistory,
    activities,
    disciplineActivities,
    metricsMap,
    loading,
    error,
    range,
    setRange,
    activeGoal,
    projection,
    isMobile,
    discipline,
    pdc,
    pdcSufficiency,
    loadSufficiency,
    activityWindowSufficiency,
    runRecords,
    milestones,
    consistencyStreak,
    thresholdDecision,
    bikeFtpDecision,
    bikeFtpReceipt,
    bikeFtpDeviceReceipts,
    decisionBusy,
    acceptFtpDecision,
    pendingMilestone,
    setDismissedMilestones,
    markCelebrated,
    revalidating,
    justRecomputed,
    timeseriesLoaded,
    hasCanonicalTimeseries,
    fitnessData,
    dailyData,
    rangeData,
    currentPoint,
    rangeStartPoint,
    powerCurveProgressions,
    weeklyStats,
    zoneDistribution,
    combinedLoad,
    triFitnessBreakdown,
    triFitnessTimeline,
    integratedLoadFocus,
    cyclingAbility,
    runPaceCurve,
    swimCssCurve,
  } = model;
  const { t: trainingT } = useTranslation("training");
  const [historyRangeOverride, setHistoryRangeOverride] = useState<{ discipline: string; range: PmcRange } | null>(null);
  const historyRange = historyRangeOverride?.discipline === discipline ? historyRangeOverride.range : range;
  const changePageRange = (nextRange: typeof range) => {
    setHistoryRangeOverride(null);
    setRange(nextRange);
  };
  const weekChangeSlot = part === "condition" && currentPoint && weeklyStats.insightReady !== false ? <FitnessWeeklyInsight loadSummaryOnly ctlDelta={0}
    ctl={currentPoint.ctl} atl={currentPoint.atl} tsb={currentPoint.tsb} dailyData={dailyData}
    asOf={weeklyStats.asOf} dateBasis={weeklyStats.dateBasis} ready={weeklyStats.insightReady} t={t} /> : null;
  const currentSource = t(model.canonicalFitness.enabled && model.canonicalFitness.values ? "coach.currentSource.summary" : hasCanonicalTimeseries ? "coach.currentSource.history" : "coach.currentSource.estimated");
  const currentBasis = currentPoint ? t("coach.currentBasis", { date: currentPoint.date, source: part === "condition" && discipline === "tri" ? t("condition.combinedSource") : currentSource }) : undefined;
  const periodControls = !embedded && part === "analysis" ? <div data-testid={part === "analysis" ? "K5-0-3" : "K1-0-3"} role="group" aria-label={t("history.range")} className="flex flex-wrap gap-2">
    {([30, 90, 180, 365] as const).map(days => <Button key={days} size="sm" variant={range === days ? "outline" : "ghost"} aria-pressed={range === days} onClick={() => changePageRange(days)}>{t(`range.${days}`)}</Button>)}
  </div> : null;
  const changeHistoryRange = (nextRange: PmcRange) => {
    if (typeof nextRange === "number") {
      setHistoryRangeOverride(null);
      setRange(nextRange as typeof range);
      return;
    }
    setHistoryRangeOverride({ discipline, range: nextRange });
  };
  // 원본 커브와 출처를 모바일·데스크톱에서 그대로 공유한다.
  const currentPowerCurve = powerCurveProgressions.find((p) => p.label === t("period.recent"));
  const prevPowerCurve = powerCurveProgressions.find((p) => p.label === t("period.previous"));

  // 기존 CP/W' 모델 기대값이며 서버에 저장하지 않는다.
  const expectedCurvePoints: PowerCurvePoint[] | undefined =
    discipline === "bike" && pdc?.cp != null
      ? computeExpectedCurve(pdc.cp.value, pdc.cp.wPrime).map((p) => ({
          durationSeconds: p.durationSeconds,
          maxPower: p.watts,
        }))
      : undefined;

  const renderMobile = embedded || isMobile;
  const activityImpacts = discipline === "tri" || !hasCanonicalTimeseries
    ? []
    : deriveActivityImpacts(fitnessData, disciplineActivities, { limit: 6, dateKeyBasis: model.fitnessDateKeyBasis });
  const coveredActivityIds = activityIdsCoveredByImpacts(disciplineActivities, activityImpacts);
  const newestDisciplineActivity = disciplineActivities.reduce<(typeof disciplineActivities)[number] | null>(
    (latest, activity) => isNegligibleActivitySummary(activity.summary)
      ? latest
      : !latest || activity.startTime > latest.startTime ? activity : latest,
    null,
  );
  const pendingImpactActivity = newestDisciplineActivity
    && !coveredActivityIds.has(newestDisciplineActivity.id)
    ? newestDisciplineActivity
    : null;
  const pendingDayLoad = pendingImpactActivity && hasCanonicalTimeseries
    ? activityDayLoad(pendingImpactActivity, fitnessData, model.fitnessDateKeyBasis)
    : null;
  const selectedActivityIsAvailable = selectedActivityId != null && (
    pendingImpactActivity?.id === selectedActivityId
    || activityImpacts.some((entry) => entry.activity.id === selectedActivityId)
  );
  const effectiveSelectedActivityId = selectedActivityIsAvailable
    ? selectedActivityId
    : pendingImpactActivity?.id ?? activityImpacts[0]?.activity.id ?? null;
  const recoveryForecast = currentPoint ? forecastFitness48Hours(currentPoint, 35) : null;
  const goalDisplayName = fitnessGoalDisplayName(activeGoal);
  // 훈련 상태 판정용 CTL 램프 — 선택된 range(최대 365일)로 나누면 희석되므로
  // 항상 최근 28일 기울기를 쓴다. 표본이 모자라면 null(램프 승격 규칙 비활성).
  const RAMP_WINDOW_DAYS = 28;
  const rampStartPoint = fitnessData.length > RAMP_WINDOW_DAYS
    ? fitnessData[fitnessData.length - 1 - RAMP_WINDOW_DAYS]
    : null;
  const ctlRampPerWeek = rampStartPoint
    ? (((currentPoint?.ctl ?? 0) - rampStartPoint.ctl) / RAMP_WINDOW_DAYS) * 7
    : null;

  const currentStatusSlot = discipline !== "tri" && currentPoint ? getRuntimeConfig().trainingDecisionCanonicalEnabled && !trainingDecision.envelope
    ? <Text as="p" variant="bodySmall" tone="secondary">{t(trainingDecision.paused ? "trainingStatus.state.paused" : trainingDecision.display === "error" ? "trainingStatus.state.error" : trainingDecision.display === "empty" ? "trainingStatus.state.empty" : "trainingStatus.state.loading")}</Text>
    : <TrainingStatusCard embedded presentation={part === "condition" ? "story" : "compact"}
    tsb={currentPoint.tsb} ctl={currentPoint.ctl} atl={currentPoint.atl} ctlRampPerWeek={ctlRampPerWeek}
    sport={discipline} decision={trainingDecision.envelope} decisionDisplay={trainingDecision.display}
    decisionPaused={trainingDecision.paused} /> : null;
  const futureGoal = activeGoal && fitnessTodayKey(activeGoal.eventDate, model.fitnessDateKeyBasis) >= fitnessTodayKey(Date.now(), model.fitnessDateKeyBasis) ? activeGoal : null;
  const goalSummary = <>
          {/* 목표 요약 스트립 */}
          {activeGoal && (() => {
            const now = Date.now();
            const daysLeft = Math.ceil((activeGoal.eventDate - now) / 86400000);
            const eventDateStr = formatKoreanDate(activeGoal.eventDate);
            const goalCTLVal = projection?.goalDay.ctl;
            const goalTSBVal = projection?.goalDay.tsb;
            const adherence = projection?.goalDay.adherenceRate;
            const currentCTL = currentPoint?.ctl ?? 0;

            return (
              <div className="condition-goal-summary">
                <div>
                  {goalDisplayName && <Text as="div" variant="caption" style={{ color: "var(--lime)", marginBottom: 'var(--space-1)' }}>
                    {t(daysLeft < 0 ? "condition.goal.past" : "goal.eyebrow", { course: goalDisplayName })}
                  </Text>}
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", fontWeight: 500 }}>
                    {eventDateStr}{daysLeft >= 0 && <> · D-<Text variant="num" style={{ color: "var(--lime)" }}>{daysLeft}</Text></>}
                    <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginLeft: "var(--space-2)" }}>
                      {activeGoal.goalType === 'climb'
                        ? `${activeGoal.target?.climbDurationMin ?? activeGoal.targetDurationMin ?? '—'} min${activeGoal.target?.targetWkg != null ? ` · ${activeGoal.target.targetWkg.toFixed(1)} W/kg` : ''}`
                        : `${activeGoal.courseDist.toFixed(1)} km`}
                      {activeGoal.goalType !== 'climb' && activeGoal.targetDurationMin != null && (
                        activeGoal.targetDurationMin % 60 > 0
                          ? t("goal.targetHm", { h: Math.floor(activeGoal.targetDurationMin / 60), m: activeGoal.targetDurationMin % 60 })
                          : t("goal.targetH", { h: Math.floor(activeGoal.targetDurationMin / 60) })
                      )}
                    </span>
                  </div>
                </div>
                <div>
                  <Text as="div" variant="caption" style={{ marginBottom: "var(--space-1)" }}>{t("goal.ctl")}</Text>
                  {goalCTLVal != null ? (
                    <div>
                      <Text variant="dataMedium" style={{ color: "var(--lime)" }}>{Math.round(goalCTLVal)}</Text>
                      <Text variant="unit">{goalCTLVal > currentCTL ? `+${(goalCTLVal - currentCTL).toFixed(1)}` : (goalCTLVal - currentCTL).toFixed(1)}</Text>
                    </div>
                  ) : (
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>—</span>
                  )}
                </div>
                <div>
                  <Text as="div" variant="caption" style={{ marginBottom: "var(--space-1)" }}>{t("goal.tsb")}</Text>
                  {goalTSBVal != null ? (
                    <div>
                      <Text variant="dataMedium" style={{ color: "var(--amber)" }}>
                        {goalTSBVal >= 0 ? `+${Math.round(goalTSBVal)}` : Math.round(goalTSBVal)}
                      </Text>
                      <Text variant="unit">
                        {goalTSBVal >= 5 && goalTSBVal <= 25 ? t("goal.tsbStatus.optimal") : goalTSBVal > 25 ? t("goal.tsbStatus.over") : t("goal.tsbStatus.fatigue")}
                      </Text>
                    </div>
                  ) : (
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>—</span>
                  )}
                </div>
                <div>
                  <Text as="div" variant="caption" style={{ marginBottom: "var(--space-1)" }}>{t("goal.adherence")}</Text>
                  {adherence != null ? (
                    <div>
                      <Text variant="dataMedium">{Math.round(adherence * 100)}</Text>
                      <Text variant="unit">%</Text>
                    </div>
                  ) : (
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>—</span>
                  )}
                </div>
                <Link data-testid="K1-2-6" to={`/coach/plan?sport=${discipline}`} className={`${buttonClass({ variant: 'secondary', size: 'sm' })}`} style={{ whiteSpace: "nowrap", fontSize: "var(--fs-xs)" }}>
                  {t("goal.viewPlan")}
                </Link>
                  {daysLeft < 0 && <Text as="p" variant="caption" tone="secondary" className="condition-goal-summary__provenance">{t("condition.goal.pastProjection", { date: projection?.computedAt != null && Number.isFinite(projection.computedAt) ? new Date(projection.computedAt).toLocaleString(i18n.language) : t("history.missing") })}</Text>}

              </div>
            );
          })()}
  </>;



  const vo2maxTrend = discipline === "bike"
    ? deriveMonthlyCyclingVo2maxTrend(pdc?.history, profile?.weightKg ?? pdc?.weightKgSnapshot)
    : [];

  // 강점/약점 — mmpAll(duration 별 best)과 CP 모델 기대파워 갭 분류.
  const powerGaps: GapEntry[] =
    discipline === "bike" && pdc?.cp != null && pdc.mmpAll
      ? classifyGaps(
          Object.fromEntries(
            (Object.entries(pdc.mmpAll) as [PowerDurationKey, { value: number } | undefined][])
              .filter(([k, v]) => v != null && k in POWER_DURATION_KEY_SEC)
              .map(([k, v]) => [POWER_DURATION_KEY_SEC[k], v!.value]),
          ),
          pdc.cp.value,
          pdc.cp.wPrime,
        )
      : [];

  if (!user) {
    return <GuestValuePreview kind="fitness" lang={i18n.language} />;
  }

  const analysisSets = [pdcSufficiency && { ...pdcSufficiency, blocks: pdcSufficiency.blocks.filter(block => block.discipline === discipline) }, activityWindowSufficiency && { ...activityWindowSufficiency,
    blocks: activityWindowSufficiency.blocks.filter(block => block.discipline === discipline && block.viewId !== "mobile") }]
    .filter((set): set is NonNullable<typeof set> => set != null);
  const hasSufficiency = Boolean(pdcSufficiency?.blocks.length || loadSufficiency?.blocks.length || activityWindowSufficiency?.blocks.length);
  const loadTrendBlock = findSufficiencyBlock(loadSufficiency, "load_history", "trend");
  const loadFormBlock = findSufficiencyBlock(loadSufficiency, "load_history", "form");
  // Saved training thresholds remain reviewable even before any activity history exists.
  const emptyAnalysisFtpEntry = !embedded && part === "analysis" && discipline === "bike" ? <FtpDecisionSection title={t("condition.basis.title")} anchorEnabled compact={renderMobile} collapsible={!renderMobile}>
    <BikeThresholdDecisionCard inlineEvidence stableDetails decision={thresholdDecision} hasZoneData={model.zoneEvidence.hr.counts != null || model.zoneEvidence.power.counts != null} ftpDecision={bikeFtpDecision} ftpReceipt={bikeFtpReceipt} ftpDeviceReceipts={bikeFtpDeviceReceipts} decisionBusy={decisionBusy} onAcceptDecision={acceptFtpDecision} progressionPoints={deriveEstimatedFtpProgression(pdc?.history)} ftpHistory={ftpHistory} t={t} />
  </FtpDecisionSection> : null;


  if (!hasSufficiency && renderMobile && (loading || !timeseriesLoaded)) {
    return (
      <div className="fitness-reading" style={{ padding: "20px 16px 40px" }}>
        <LoadingSkeleton kind="chart" />
      </div>
    );
  }

  if (renderMobile && error) {
    return (
      <div className="fitness-reading" style={{ padding: "20px 16px 40px" }}>
        {part === "all" && discipline !== "tri" && <div style={{ marginBottom: "var(--space-5)" }}>
          <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />
        </div>}
        <ErrorState title={t("error.dataFailed")} description={error} />
      </div>
    );
  }

  if (!hasSufficiency && renderMobile && model.canonicalFitness.enabled && model.canonicalFitness.values === null) {
    const state = model.canonicalFitness;
    if (state.display === "error") {
      return <div className="fitness-reading" style={{ padding: "20px 16px 40px" }}>
        <ErrorState title={t("canonical.errorTitle")} description={t("canonical.errorBody")} onRetry={state.retry} />
      </div>;
    }
    if (state.display === "empty" && !hasSufficiency) {
      return <div className="fitness-reading" style={{ padding: "20px 16px 40px" }}>
        <EmptyState icon="📈" title={t("canonical.emptyTitle")} description={t("canonical.emptyBody")} />
        {!embedded && thresholdsSlot}
        {emptyAnalysisFtpEntry}
      </div>;
    }
  }

  if (!hasSufficiency && renderMobile && activities.length === 0 && fitnessData.length === 0 && !currentPoint && model.pmcHistoryPoints.length === 0) {
    return (
      <div className="fitness-reading" style={{ padding: "20px 16px 40px" }}>
        {part === "all" && discipline !== "tri" && <div style={{ marginBottom: "var(--space-5)" }}>
          <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />
        </div>}
        <EmptyState
          icon="📈"
          title={t("empty.noActivities")}
          description={t("empty.hint")}
          actions={[
            ...(part === "condition" ? [{ label: "Google Play", variant: "primary" as const, href: ORIDER_PLAY_STORE_URL }, { label: "App Store", variant: "secondary" as const, href: ORIDER_APP_STORE_URL }, { label: t("empty.importHistory"), variant: "secondary" as const, href: "/athlete/me/activities?import=1" }] : []),
            { label: t("empty.connectStrava"), variant: "primary", href: "/settings/connections" },
          ]}
        />
        {!embedded && thresholdsSlot}
        {emptyAnalysisFtpEntry}
      </div>
    );
  }

  // TriFitnessView 는 데스크톱 전용 레이아웃이다. 모바일 tri 는 아래의
  // MobileFitnessPage 로 보내 좁은 화면에서 헤더와 카드가 눌리지 않게 한다.
  if (!renderMobile && discipline === "tri" && part !== "analysis") {
    return (
      <div className="fitness-reading">
        <div className="site-shell" style={{ padding: "var(--space-4) var(--space-6) 0" }}>
          <CanonicalFitnessNotice state={model.canonicalFitness} t={t} />
          <FitnessActivityWindowNotice incomplete={model.activityWindowIncomplete} t={t} />
        </div>
        <TriFitnessView
          condition={part === "condition"}
          loading={loading || !timeseriesLoaded}
          range={range}
          selectedHistoryRange={historyRange}
          onRangeChange={changePageRange}
          breakdown={triFitnessBreakdown}
          timeline={triFitnessTimeline}
          combinedLoad={combinedLoad}
          loadFocus={integratedLoadFocus}
          thresholdsSlot={thresholdsSlot}
          hasThresholdSettings={hasThresholdSettings}
          historySlot={<PmcHistoryPanel key={`${user.uid}-${discipline}`} points={model.pmcHistoryPoints} today={fitnessTodayKey(Date.now(), model.fitnessDateKeyBasis)} canonical={model.hasCanonicalHistory} controlledRange={historyRange} onControlledRangeChange={changeHistoryRange} rangeChoices={[42, 90, 180, 365, "3y", "all"]} />}
        />
      </div>
    );
  }

  if (renderMobile) {
    const renderMobileContent = (decisionState?: TodayTrainingDecisionState) => {
      const mobileCoachBriefing = discipline !== "tri" && currentPoint ? (
        <FitnessCoachBriefing
          showConditionChoices={embedded}
          currentBasis={currentBasis}
          weekChangeSlot={part === "condition" ? null : weekChangeSlot}
          metricsNoteSlot={loadSufficiency && loadFormBlock
            ? <LoadQualityEvidence points={model.pmcHistoryPoints} set={loadSufficiency} block={loadFormBlock} testId="K1-1-1-briefing-sufficiency-inline" /> : null}
          part={part === "condition" ? "condition" : "all"}
          key={`${discipline}-${currentPoint.date}`}
          impacts={activityImpacts}
          selectedActivityId={effectiveSelectedActivityId}
          onSelectActivity={setSelectedActivityId}
          forecast={recoveryForecast}
          current={{ ctl: currentPoint.ctl, atl: currentPoint.atl, tsb: currentPoint.tsb }}
          locale={i18n.language}
          canonicalAvailable={hasCanonicalTimeseries}
          pendingActivity={pendingImpactActivity}
          pendingDayLoad={pendingDayLoad}
          metricsMap={metricsMap}
          discipline={discipline}
          userId={user.uid}
          mobilePriority
          statusSlot={part === "condition" ? <><Text as="p" variant="eyebrow">{t("condition.current.title")}</Text>{currentStatusSlot}</> : null}
          decisionSlot={part === "all" ? <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" decisionState={decisionState} /> : null}
        />
      ) : null;
      return (
        <div className="fitness-reading">
          <CanonicalFitnessNotice state={model.canonicalFitness} t={t} />
          <FitnessActivityWindowNotice incomplete={model.activityWindowIncomplete} t={t} />
          <MobileFitnessPage
            {...model.mobilePageProps}
            periodTimeseries={model.periodTimeseries}
            sectionState={{
              trend: error || model.timeseriesError ? "error" : loading || !timeseriesLoaded ? "loading" : "ready",
              derived: !model.derivedMetricsSettled ? "loading" : model.derivedMetricsError ? "error" : "ready",
            }}
            nativePowerActivities={disciplineActivities.filter(activity => activity.userId === user.uid && activity.source === "orider").map(activity => ({ activityId: activity.id, title: new Date(activity.startTime).toLocaleDateString(i18n.language), headBinding: JSON.stringify([activity.id, activity.startTime, activity.endTime, activity.contentRevision, activity.contentSelectedRevision]) }))}
            triEvidenceSlot={part === "condition" && discipline === "tri" ? <TriFitnessView evidenceOnly condition range={range} selectedHistoryRange={historyRange} onRangeChange={changePageRange} breakdown={triFitnessBreakdown} timeline={triFitnessTimeline} combinedLoad={combinedLoad} loadFocus={integratedLoadFocus} /> : null}
            powerCurveEvidenceSlot={(part === "condition" || part === "analysis") && discipline === "bike" ? <BikePowerCurveEvidence compact={!embedded} current={currentPowerCurve?.points ?? []} previous={prevPowerCurve?.points ?? []} expected={expectedCurvePoints} /> : null}
            runPaceCurve={runPaceCurve}
            runningRecordsSlot={(part === "condition" || part === "analysis") && discipline === "run" ? <><RunRecordsBoard run={runRecords} title={t("condition.metrics.runSourcesTitle")} additionalUnverified={!!model.runEvidence.unverifiedRecords?.length} footer={qualifiedRunRecords(model.runEvidence).length === 0 && !needsRunAnalysisReadiness(model.runEvidence, !!model.mobilePageProps.data.threshold, model.mobilePageProps.data.zones.length > 0) ? <RunRecordsSummary evidence={model.runEvidence} sourceBoard /> : undefined} /><MilestonesGrid achieved={milestones} /></> : null}
            periodSlot={periodControls}
            analysisSummarySlot={analysisSummarySlot}
            conditionSupplementSlot={conditionSupplementSlot}
            currentBasis={currentBasis}
            currentStatusSlot={currentStatusSlot}
            periodEvidenceSlot={<>{weekChangeSlot}{part === "condition" && currentPoint && <FitnessWeeklyInsight includeLoadSummary={false}
              ctlDelta={rangeStartPoint ? currentPoint.ctl - rangeStartPoint.ctl : 0}
              ctl={currentPoint.ctl} atl={currentPoint.atl} tsb={currentPoint.tsb} dailyData={dailyData}
              asOf={weeklyStats.asOf} dateBasis={weeklyStats.dateBasis} ready={weeklyStats.insightReady} t={t} />}</>}
            thresholdsSlot={thresholdsSlot}
            hasThresholdSettings={hasThresholdSettings}
            goalSummarySlot={part === "condition" ? goalSummary : null}
            data={{ ...model.mobilePageProps.data, ...(part === "condition" ? { pmcProjection: futureGoal ? model.mobilePageProps.data.pmcProjection : null } : {}), monthlyVo2maxTrend: vo2maxTrend, powerGaps, pdcSufficiency, loadSufficiency, activityWindowSufficiency }}
            runningRaceEstimatesOwnerUid={user.isAnonymous || (part !== "all" && getRuntimeConfig().appEnvironment !== "stage") ? undefined : user.uid}
            part={part}
            ridingEvidenceSlot={embedded && (part === "condition" || part === "analysis") && discipline === "bike" ? <FitnessPedalingEvidence activities={disciplineActivities} metricsMap={metricsMap} locale={i18n.language} /> : null}
            powerCurvePeriodsOwnerUid={user.uid}
            powerCurvePeriodsEnabled={getRuntimeConfig().activityAnalysisExpansionEnabled === true}
            embedded={embedded}
            coachSlot={mobileCoachBriefing}
            todayDecisionState={decisionState}
            todayDecisionSignedIn={Boolean(user)}
          />
        </div>
      );
    };
    return discipline === "tri" || part !== "all" ? renderMobileContent() : (
      <TodayTrainingDecisionSource user={user} discipline={discipline}>
        {(decisionState) => renderMobileContent(decisionState)}
      </TodayTrainingDecisionSource>
    );
  }

  // loading/error/empty 분기는 헤더 정의(pageHeader) 이후로 이동 — 어느 상태든
  // 헤더(h1)를 즉시 렌더해 LCP 요소를 차트가 아닌 정적 헤더로 고정한다. (아래 참조)

  // KPI 계산
  const ctl = currentPoint?.ctl ?? 0;
  const atl = currentPoint?.atl ?? 0;
  const tsb = currentPoint?.tsb ?? 0;
  const ctlDelta = rangeStartPoint ? ctl - rangeStartPoint.ctl : 0;

  // 자막 생성
  const subtitle = part === "condition" ? t("condition.header.subtitle") : projection
    ? t("header.subtitle.actualWithProjection", { range, projDays: projection.series.length })
    : t("header.subtitle.actual", { range });
  const goalForecast = futureGoal && projection && goalDisplayName ? (() => {
    const goalDateObj = new Date(futureGoal.eventDate);
    const date = `${goalDateObj.getMonth() + 1}/${goalDateObj.getDate()}`;
    const tsbVal = Math.round(projection.goalDay.tsb);
    return { course: goalDisplayName, date, ctl: Math.round(projection.goalDay.ctl), tsb: tsbVal >= 0 ? `+${tsbVal}` : String(tsbVal) };
  })() : null;

  // 파워 커브 주요 구간 값
  const pcKeyDurations = [5, 60, 300, 1200];
  const pcKeyLabels = [t("powerCurve.label.sprint"), t("powerCurve.label.anaerobic"), t("powerCurve.label.vo2"), t("powerCurve.label.ftp")];
  const pcKeyNames = [t("powerCurve.duration.5s"), t("powerCurve.duration.1m"), t("powerCurve.duration.5m"), t("powerCurve.duration.20m")];
  const pcKeyValues = pcKeyDurations.map((d) => {
    const pt = currentPowerCurve?.points.find((p) => p.durationSeconds === d);
    return pt?.maxPower ?? null;
  });

  // 야외 페이싱 가이드 — CP 기반 장거리 지속파워 권장 범위. bike + pdc.cp 있을 때만.
  const pacingGuide =
    discipline === "bike" && pdc?.cp != null
      ? computeOutdoorPacingGuide(pdc.cp.value, profile?.weightKg)
      : null;

  const ftpProgression = deriveEstimatedFtpProgression(pdc?.history);

  const strengths = powerGaps.filter((g) => g.label === "strength");
  const vo2maxBlock = findSufficiencyBlock(pdcSufficiency, "vo2max");
  const powerModelBlock = findSufficiencyBlock(pdcSufficiency, "power_model");
  const riderBlock = findSufficiencyBlock(pdcSufficiency, "rider_profile");
  const ftpBlock = findSufficiencyBlock(pdcSufficiency, "ftp_estimate");
  const monthlyBlock = findSufficiencyBlock(pdcSufficiency, "vo2max", "monthly");
  const curveBlock = activityWindowSufficiency?.blocks.find(block => block.featureId === "power_curve" && block.discipline === discipline);
  const zonesBlock = activityWindowSufficiency?.blocks.find(block => block.featureId === "training_zones" && block.discipline === discipline);
  const runReadiness = (part === "analysis" || part === "condition") && discipline === "run" && needsRunAnalysisReadiness(model.runEvidence, model.runEvidence.thresholdPaceSec != null, !!zoneDistribution?.some(value => value != null));

  const weaknesses = powerGaps.filter((g) => g.label === "weakness");

  // 페이지 헤더 — PageHeader 패턴. const 로 추출해 loading/error/empty/정상 4상태가
  // 동일 헤더를 공유한다. 콜드 진입 시 차트 데이터가 도착하기 전에도 헤더(h1)가 즉시
  // 페인트돼 LCP 요소가 늦게 뜨는 차트가 아닌 정적 헤더로 고정 → LCP 꼬리 제거.
  const eyebrowLine = (
    <Text as="div" variant="caption" className="fitness-page-header__eyebrow">
      <span>{t("header.eyebrow", { date: formatMonthDay(i18n.language) })}</span>
      {(revalidating || justRecomputed) && <span data-testid="K1-0-4"><RevalidatingIndicator
        visible={revalidating || justRecomputed}
        mode={revalidating ? "updating" : "success"}
      /></span>}
    </Text>
  );
  const pageHeader = (
    <div data-testid={part === "analysis" ? "K5-0" : "K1-0"} className={part === "condition" ? "site-shell fitness-page-header condition-page-header" : "site-shell fitness-page-header"}>
      {/* 제목 줄: 제목·날짜 + 종목 전환(오른쪽 끝). 부제·기간 선택은 아래 줄 — 다른 코치 화면과 같은 규칙·같은 높이. */}
      <div className="fitness-page-header__title-row">
        <div className="fitness-page-header__heading">
          <Text data-testid={part === "analysis" ? "K5-0-1" : "K1-0-1"} as="h1" variant="pageTitle">
            {t(part === "analysis" ? "analysis.header.title" : part === "condition" ? "condition.header.title" : "header.title")}
          </Text>
          {eyebrowLine}
        </div>
        <div data-testid={part === "analysis" ? "K5-0-2" : "K1-0-2"}><DisciplineTabs includeTri disabledKeys={part === "condition" || part === "analysis" ? ["swim"] : []} /></div>
      </div>
      <div className="fitness-page-header__subtitle">
        <span>{subtitle}</span>
        {goalForecast && <Link to={`/coach/plan?sport=${discipline}`} aria-label={t("header.subtitle.goalShort", goalForecast)} style={{ color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}>
          {t("header.subtitle.goalShort", goalForecast)} →
        </Link>}
      </div>
      {periodControls}
    </div>
  );

  const bodyPad = { padding: "var(--space-4) var(--space-6) var(--space-8)" };

  // 데이터 의존 본문만 상태별로 스왑 — 헤더는 항상 즉시 페인트.
  // 정본 timeseries doc 이 도착하기 전(doc 보유 유저)엔 스켈레톤 유지 — 클라 폴백(부정확
  // 콜드 CTL)으로 한 번 그렸다가 정본으로 스왑하며 곡선/KPI 가 튀는 깜빡임 방지(리뷰 #340).
  // doc 부재/미인증은 훅이 loaded=true 를 즉시 세팅하므로 추가 대기 없음. (이 지점은 이미
  // tri·미인증 early-return 뒤라 discipline 은 bike/run/swim, user 는 truthy 로 좁혀져 있다.)
  if (!hasSufficiency && (loading || !timeseriesLoaded)) {
    return (
      <div className="fitness-reading">
        {pageHeader}
        <div className="site-shell" style={bodyPad}><LoadingSkeleton kind="chart" /></div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="fitness-reading">
        {pageHeader}
        <div className="site-shell" style={bodyPad}>
          {part === "all" && discipline !== "tri" && <div style={{ marginBottom: "var(--space-5)" }}>
            <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />
          </div>}
          <ErrorState title={t("error.dataFailed")} description={error} />
        </div>
      </div>
    );
  }
  if (!hasSufficiency && activities.length === 0 && fitnessData.length === 0 && !currentPoint && model.pmcHistoryPoints.length === 0) {
    return (
      <div className="fitness-reading">
        {pageHeader}
        <div className="site-shell" style={bodyPad}>
          {part === "all" && discipline !== "tri" && <div style={{ marginBottom: "var(--space-5)" }}>
            <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />
          </div>}
          <EmptyState
            icon="📈"
            title={t("empty.noActivities")}
            description={t("empty.hint")}
            actions={[
              ...(part === "condition" ? [{ label: "Google Play", variant: "primary" as const, href: ORIDER_PLAY_STORE_URL }, { label: "App Store", variant: "secondary" as const, href: ORIDER_APP_STORE_URL }, { label: t("empty.importHistory"), variant: "secondary" as const, href: "/athlete/me/activities?import=1" }] : []),
            { label: t("empty.connectStrava"), variant: "primary", href: "/settings/connections" },
            ]}
          />
          {!embedded && thresholdsSlot}
          {emptyAnalysisFtpEntry}
        </div>
      </div>
    );
  }

  const pacingCard = pacingGuide && pdc?.cp != null ? (
          <Card data-testid="K1-6-6" padding="none" style={{ marginTop: 'var(--space-4)', padding: "16px 24px" }}>
            <Text as="div" variant="caption" style={{ marginBottom: 'var(--space-2)' }}>{t("pacing.title")}</Text>
            <Text as="div" variant="num" style={{ fontSize: "var(--fs-xl)", color: "var(--ink-0)", lineHeight: 1.1 }}>
              {pacingGuide.lowerW}–{pacingGuide.upperW}
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-4)", marginLeft: "var(--space-1)" }}>W</span>
              {pacingGuide.lowerWkg != null && pacingGuide.upperWkg != null && (
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginLeft: "var(--space-2)" }}>
                  · {pacingGuide.lowerWkg.toFixed(2)}–{pacingGuide.upperWkg.toFixed(2)} W/kg
                </span>
              )}
            </Text>
            <Text as="div" variant="caption" style={{ marginTop: 'var(--space-2)', color: "var(--ink-4)" }}>
              {t("pacing.note", { cp: Math.round(pdc.cp.value) })}
            </Text>
          </Card>
  ) : part === "condition" && discipline === "bike" ? <Card data-testid="K1-6-6">
    <Text as="h3" variant="subtitle">{t("pacing.title")}</Text>
    <Text as="p" variant="bodySmall" tone="secondary">{t("condition.metrics.pacingUnavailable")}</Text>
  </Card> : null;


  const activityPlanChart = (
        <Card padding="none" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)' }}>
          <div style={{ display: "flex", alignItems: "flex-end", marginBottom: "var(--space-3)" }}>
            <div>
              <Text as="h2" variant="title" style={{ margin: 0, marginBottom: "var(--space-1)" }}>{t("condition.chart.activities")}</Text>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{futureGoal && projection ? t("pmc.subWithProjection", { range }) : t("pmc.subActual", { range })}</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 'var(--space-4)', fontSize: "var(--fs-xs)", color: "var(--ink-3)", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                <svg width="14" height="6" viewBox="0 0 14 6" aria-hidden="true"><line x1="0" y1="3" x2="14" y2="3" stroke={getDisciplineColor(discipline)} strokeWidth="2" strokeLinecap={PMC_LINE_PALETTE.ctl.linecap} vectorEffect="non-scaling-stroke" /></svg> {t("pmc.legend.ctl")}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                <svg width="14" height="6" viewBox="0 0 14 6" aria-hidden="true"><line x1="0" y1="3" x2="14" y2="3" stroke={PMC_LINE_PALETTE.atl.color} strokeWidth="2" strokeDasharray={PMC_LINE_PALETTE.atl.dasharray} vectorEffect="non-scaling-stroke" /></svg> {t("pmc.legend.atl")}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                <svg width="14" height="6" viewBox="0 0 14 6" aria-hidden="true"><line x1="0" y1="3" x2="14" y2="3" stroke={PMC_LINE_PALETTE.tsb.color} strokeWidth="2" strokeDasharray={PMC_LINE_PALETTE.tsb.dasharray} strokeLinecap={PMC_LINE_PALETTE.tsb.linecap} vectorEffect="non-scaling-stroke" /></svg> {t("pmc.legend.tsb")}
              </span>
              {futureGoal && projection && (
                <>
                  <span style={{ width: 1, height: 12, background: "var(--line-soft)" }} />
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <svg width="16" height="4">
                      <line x1="0" y1="2" x2="16" y2="2" stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="4 2" />
                    </svg>
                    {t("pmc.legend.projection")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 차트 위 한 줄 해석 (#400 §6) — 초심자가 무엇을 먼저 읽어야 할지 알려준다. */}
          {rangeData.fitness.length > 0 && (
            <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-3)", maxWidth: 640 }}>
              {t("pmc.interpretation")}
            </Text>
          )}

          {rangeData.fitness.length > 0 ? (
            <FitnessChart
              data={rangeData.fitness}
              projection={futureGoal ? projection?.series ?? null : null}
              today={toLocalDate(Date.now())}
              goalDate={activeGoal?.eventDate ?? null}
              goalCTL={futureGoal ? projection?.goalDay.ctl ?? null : null}
              goalTSB={futureGoal ? projection?.goalDay.tsb ?? null : null}
              ctlColor={getDisciplineColor(discipline)}
              activityMarkers={activityImpacts.map((entry) => ({
                activityId: entry.activity.id,
                date: entry.date,
                label: `${/ride|cycl/i.test(entry.activity.type)
                  ? t("discipline.bike")
                  : /run/i.test(entry.activity.type)
                    ? t("discipline.run")
                    : /swim/i.test(entry.activity.type)
                      ? t("discipline.swim")
                      : entry.activity.type} · ${entry.attributedLoad.toFixed(0)} TSS`,
                selected: entry.activity.id === effectiveSelectedActivityId,
              }))}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280, fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
              {t("pmc.empty")}
            </div>
          )}

          {part !== "condition" && goalSummary}

        </Card>
  );


  const bikeMetrics = <>
        {/* 상세 분석 — 바이크 개선 액션·VO2max·강점/약점·야외 페이싱·라이더 유형. */}
        {discipline === "bike" && (
        <div className="coach-analysis-details" data-testid={part === "analysis" ? "K5-1" : undefined}><ConditionMetricSection condition={part === "condition" || !embedded && part === "analysis"} title={t(part === "condition" ? "condition.metrics.performanceTitle" : "conclusion.detailToggle")}>
        {/* PDC 기반 VO2max 근거와 월별 추이. 현재 적용 FTP 공식값과 구분한다. */}
        {(pdc?.vo2maxEst != null || part === "condition" || !embedded && part === "analysis") && (
          <Card padding="none" style={{ marginTop: "var(--space-4)", padding: "16px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
              <div>
                {(part === "condition" || !embedded && part === "analysis") && <div className="condition-formula-vo2">
                  <Text as="p" variant="caption">{t("vo2maxCard.formulaLabel")}</Text>
                  <Text as="p" variant="dataLarge">{estimateVo2max(thresholdDecision?.activeFtpW ?? null, profile?.weightKg) ?? "—"} <Text as="span" variant="unit">ml/kg/min</Text></Text>
                  <Text as="p" variant="caption" tone="tertiary">{t("vo2maxCard.formulaBasis")}</Text>
                </div>}
                <Text as="div" variant="caption" style={{ marginBottom: "var(--space-1)" }}>{t("vo2maxCard.pdcLabel")}</Text>
                <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)" }}>
                  <Text variant="dataLarge" style={{ color: "var(--aqua)" }}>{pdc?.vo2maxEst != null ? `~${pdc.vo2maxEst}` : "—"}</Text>
                  <Text variant="unit">ml/kg/min</Text>
                </div>
                <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>{t("vo2maxCard.pdcSub")}</Text>
                {pdc?.vo2maxEst == null && <Text as="p" variant="bodySmall" tone="secondary">{t("vo2maxCard.unavailable")}</Text>}
                {vo2maxBlock && pdcSufficiency && <SufficiencyInline set={pdcSufficiency} block={vo2maxBlock} testId="K5-1-3-sufficiency-inline" />}
              </div>
              {(monthlyBlock ? !needsSufficiencyCard(pdcSufficiency!, monthlyBlock) : vo2maxTrend.length >= 2) && vo2maxTrend.length > 0 && (() => {
                const vals = vo2maxTrend.map((point) => point.v);
                const delta = vals[vals.length - 1]! - vals[0]!;
                const first = vo2maxTrend[0]!, last = vo2maxTrend[vo2maxTrend.length - 1]!;
                const trendDescription = t("vo2maxCard.trendAriaValues", { startPeriod: first.period, start: first.v, endPeriod: last.period, end: last.v, delta: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}` });
                return (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "stretch", gap: "var(--space-1)" }}>
                    <FitnessEvidenceTrend title={t("vo2maxCard.pdcLabel")} description={trendDescription} color="var(--aqua)"
                      points={vo2maxTrend.map(point => ({ key: point.period, label: point.period, value: point.v, unit: "ml/kg/min", detail: t("vo2maxCard.pdcSub") }))} />
                    <Text as="div" variant="num" className="text-[length:var(--fs-xs)]" style={{ color: delta >= 0 ? "var(--lime)" : "var(--rose)" }}>
                      {delta >= 0 ? "+" : ""}{delta.toFixed(1)} · {t("vo2maxCard.trendSpan", { n: vo2maxTrend.length })}
                    </Text>
                  </div>
                );
              })()}
            </div>
            {part === "condition" && !(vo2maxTrend.length > 0 && (monthlyBlock ? !needsSufficiencyCard(pdcSufficiency!, monthlyBlock) : vo2maxTrend.length >= 2)) && <Text as="p" variant="bodySmall" tone="secondary">{t("condition.metrics.vo2TrendUnavailable")}</Text>}
          </Card>
        )}

        {pdcSufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(pdcSufficiency, ftpBlock) && <SufficiencyCard set={pdcSufficiency} block={ftpBlock} testId="K5-1-ftp-sufficiency" />}
        {pdcSufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(pdcSufficiency, monthlyBlock) && <SufficiencyCard set={pdcSufficiency} block={monthlyBlock} testId="K5-1-3-monthly-sufficiency" />}
        {/* 값이 없는 자리는 비우지 않는다 — 서버 충분도 블록이 무엇이 얼마나 필요한지 말한다. */}
        {pdc?.vo2maxEst == null && pdcSufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(pdcSufficiency, vo2maxBlock) && (
          <div style={{ marginTop: "var(--space-4)" }}><SufficiencyCard set={pdcSufficiency} block={vo2maxBlock} testId="K5-1-3-sufficiency" /></div>
        )}
        {pdc?.cp == null && pdcSufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(pdcSufficiency, powerModelBlock) && (
          <div style={{ marginTop: "var(--space-4)" }}><SufficiencyCard set={pdcSufficiency} block={powerModelBlock} testId="K5-1-4-sufficiency" /></div>
        )}
        {/* 강점/약점 — CP 모델 기대파워 대비 실제 best 갭. bike + pdc.cp + 분류 결과 있을 때만 */}
        {discipline === "bike" && pdc?.cp != null && (strengths.length > 0 || weaknesses.length > 0) && (
          <Card padding="none" style={{ marginTop: 'var(--space-4)', padding: "16px 24px" }}>
            <Text as="div" variant="caption" style={{ marginBottom: 'var(--space-3)' }}>{t("gapCard.title")}</Text>
            <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-3)' }}>
              {strengths.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', flexWrap: "wrap" }}>
                  <Text variant="caption" style={{ width: 48, color: "var(--ink-3)" }}>{t("gapCard.strengthLabel")}</Text>
                  {strengths.map((g) => (
                    <Chip key={g.durationSeconds} variant="success" dot>
                      {durationLabel(g.durationSeconds)} +{Math.round(g.gapPct)}%
                    </Chip>
                  ))}
                </div>
              )}
              {weaknesses.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', flexWrap: "wrap" }}>
                  <Text variant="caption" style={{ width: 48, color: "var(--ink-3)" }}>{t("gapCard.weaknessLabel")}</Text>
                  {weaknesses.map((g) => (
                    <Chip key={g.durationSeconds} variant="warning" dot>
                      {durationLabel(g.durationSeconds)} {Math.round(g.gapPct)}%
                    </Chip>
                  ))}
                </div>
              )}
            </div>
            <Text as="div" variant="caption" style={{ marginTop: 'var(--space-3)', color: "var(--ink-4)" }}>
              {t("gapCard.sub")}
            </Text>
          </Card>
        )}

        {part === "condition" && (pdc?.cp == null || strengths.length + weaknesses.length === 0) && <Card>
          <Text as="h3" variant="subtitle">{t("gapCard.title")}</Text>
          <Text as="p" variant="bodySmall" tone="secondary">{t("condition.metrics.gapsUnavailable")}</Text>
          <Text as="p" variant="caption" tone="tertiary">{t("gapCard.sub")}</Text>
        </Card>}

        {/* 야외 페이싱 가이드 — 장거리/그란폰도 지속 목표. CP(임계파워)의 −10~−5%. bike + pdc.cp 있을 때만 */}
        {part === "all" && pacingCard}

        {(part === "condition" || !embedded && part === "analysis") && <Card><FitnessPdcProfile pdc={model.mobilePageProps.data.pdcSummary} /></Card>}
        {/* 사이클링 능력 — 모바일과 동일한 최근 90일 PDC 3축 실측 근거. */}
        {discipline === "bike" && cyclingAbility && (
          <CyclingAbilityCard cycling={cyclingAbility} variant="desktop" />
        )}
        {cyclingAbility && riderBlock && pdcSufficiency && (
          <SufficiencyInline set={pdcSufficiency} block={riderBlock} testId="K5-1-1-sufficiency-inline" />
        )}
        {!cyclingAbility && pdcSufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(pdcSufficiency, riderBlock) && (
          <div style={{ marginTop: "var(--space-4)" }}><SufficiencyCard set={pdcSufficiency} block={riderBlock} testId="K5-1-1-sufficiency" /></div>
        )}
        </ConditionMetricSection></div>
        )}

  </>;

  const periodPowerCard = discipline === "bike" && <Card padding="none" style={{ padding: "var(--space-5)" }}><PowerCurvePeriodsPanel nativeActivities={disciplineActivities.filter(activity => activity.userId === user.uid && activity.source === "orider").map(activity => ({ activityId: activity.id, title: new Date(activity.startTime).toLocaleDateString(i18n.language), headBinding: JSON.stringify([activity.id, activity.startTime, activity.endTime, activity.contentRevision, activity.contentSelectedRevision]) }))} callableEnabled={getRuntimeConfig().activityAnalysisExpansionEnabled === true} ownerUid={user.uid} /></Card>;

  const performanceCurves = <>
          {part !== "condition" && periodPowerCard}
          {discipline === "run" && !user.isAnonymous && (part === "all" || getRuntimeConfig().appEnvironment === "stage") && <RunningRaceEstimatesPanel key={user.uid} ownerUid={user.uid} />}


          {/* 파워 커브 / 페이스 커브 (종목 분기) */}
          {part === "condition" && discipline === "bike" ? <BikePowerCurveEvidence
            current={currentPowerCurve?.points ?? []} previous={prevPowerCurve?.points ?? []} expected={expectedCurvePoints}
            emptyContent={activityWindowSufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(activityWindowSufficiency, curveBlock)
              ? <SufficiencyCard set={activityWindowSufficiency} block={curveBlock} testId="K5-2-1-sufficiency" /> : undefined}
          /> : <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            {discipline === "run" ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
                  <div>
                    <Text as="h3" variant="title" style={{ margin: 0, marginBottom: "var(--space-1)" }}>{t("paceCurve.title")}</Text>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("paceCurve.sub")}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <span style={{ width: 10, height: 2, borderTop: "1px dashed var(--ink-3)", display: "inline-block" }} /> {t("powerCurve.prevSeason")}
                  </span>
                </div>
                <div data-testid="K5-2-3"><CriticalPaceCurve recentPoints={runPaceCurve.recent28} prevPoints={runPaceCurve.prev28} /></div>
              </>
            ) : discipline === "swim" ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
                  <div>
                    <Text as="h3" variant="title" style={{ margin: 0, marginBottom: "var(--space-1)" }}>{t("cssCurve.title")}</Text>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("cssCurve.sub")}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <span style={{ width: 10, height: 2, borderTop: "1px dashed var(--ink-3)", display: "inline-block" }} /> {t("powerCurve.prevSeason")}
                  </span>
                </div>
                <div data-testid="K5-2-4"><CSSCurve css={profile?.css} recentPoints={swimCssCurve.recent28} prevPoints={swimCssCurve.prev28} /></div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
                  <div>
                    <Text as="h3" variant="title" style={{ margin: 0, marginBottom: "var(--space-1)" }}>{t("powerCurve.title")}</Text>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("powerCurve.sub")}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: "flex", gap: 'var(--space-4)', flexWrap: "wrap" }}>
                    {prevPowerCurve && (
                      <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                        <span style={{ width: 10, height: 2, background: "var(--ink-4)", borderTop: "1px dashed var(--ink-4)" }} /> {t("powerCurve.prevSeason")}
                      </span>
                    )}
                    {expectedCurvePoints && expectedCurvePoints.length > 0 && (
                      <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                        <svg width="10" height="4" aria-hidden>
                          <line x1="0" y1="2" x2="10" y2="2" stroke="var(--aqua)" strokeWidth="1.5" strokeDasharray="2 3" />
                        </svg>
                        {t("powerCurve.expectedLegend")}
                      </span>
                    )}
                  </div>
                </div>
                {currentPowerCurve && currentPowerCurve.points.length > 0 ? (
                  <div data-testid="K5-2-1"><PowerCurveChart
                    current={currentPowerCurve.points}
                    previous={prevPowerCurve?.points ?? []}
                    expected={expectedCurvePoints}
                  /></div>
                ) : (
                  <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
                    {activityWindowSufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(activityWindowSufficiency, curveBlock)
                      ? <SufficiencyCard set={activityWindowSufficiency} block={curveBlock} testId="K5-2-1-sufficiency" /> : t("powerCurve.empty")}
                  </div>
                )}
                <div data-testid="K5-2-2" style={{ marginTop: "var(--space-3)", paddingTop: 14, borderTop: "1px solid var(--line-soft)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: "var(--space-2)" }}>
                  {pcKeyDurations.map((_, i) => (
                    <div key={i}>
                      <Text as="div" variant="caption" style={{ marginBottom: "var(--space-1)" }}>{pcKeyNames[i]} · {pcKeyLabels[i]}</Text>
                      <div>
                        <Text variant="dataMedium">{pcKeyValues[i] != null ? pcKeyValues[i]!.toLocaleString() : "—"}</Text>
                        {pcKeyValues[i] != null && <Text variant="unit">W</Text>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>}

          {part === "condition" && periodPowerCard}
</>;

  const zoneDistributionCard = part === "condition" || !embedded && part === "analysis" ? <FitnessZoneDistributions evidence={model.zoneEvidence} compact={!embedded && part === "analysis"} /> : <>
        {/* 존 분포 — 단독 풀폭 (오늘의 권장은 상단 hero 로 이동) */}
        {!runReadiness && <div data-testid="K5-3" style={{ marginTop: 'var(--space-5)' }}>
          <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            {(() => {
              // The supplied distribution is hrZoneSec for every sport; do not label it as power or pace.
              const zd = zoneDistribution;
              const zones = ["recovery", "endurance", "tempo", "threshold", "vo2"].map((name, index) => ({
                z: `Z${index + 1}`, name: name === "vo2" ? " VO₂" : ` ${t(`zone.${name}`)}`,
                pct: zd?.[index] ?? null, color: `var(--zone-${index + 1})`,
              }));
              const subLabel = t("zoneDist.hrSub");
              const allNullPct = zones.every((z) => z.pct === null);
              return (
                <>
                  <div style={{ borderBottom: '1px solid var(--line-soft)', marginBottom: 'var(--space-3)', paddingBottom: 'var(--space-3)' }}>
                    <Text as="h3" variant="title" style={{ margin: 0 }}><GlossaryText>{t("zoneDist.title")}</GlossaryText></Text>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-3)' }}><GlossaryText>{subLabel}</GlossaryText></span>
                  </div>
                  {zones.map((zone) => (
                    <div key={zone.z} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                      <div style={{ width: 60 }}>
                        <span style={{ color: zone.color, fontWeight: 600, fontSize: "var(--fs-xs)" }}>{zone.z}</span>
                        <span style={{ fontSize: "var(--fs-xs)" }}>{zone.name}</span>
                      </div>
                      <div style={{ flex: 1, height: 18, background: "var(--bg-2)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
                        <div style={{ width: zone.pct != null ? `${zone.pct}%` : "0%", height: "100%", background: zone.color }} />
                      </div>
                      <div style={{ width: 40, textAlign: "right", fontSize: "var(--fs-sm)", fontVariantNumeric: "tabular-nums" }}>{zone.pct != null ? `${zone.pct}%` : "—"}</div>
                    </div>
                  ))}
                  {allNullPct && (
                    <div style={{ marginTop: 'var(--space-2)', fontSize: "var(--fs-xs)", color: "var(--ink-4)", textAlign: "center" }}>
                      {activityWindowSufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(activityWindowSufficiency, zonesBlock)
                        ? <SufficiencyCard set={activityWindowSufficiency} block={zonesBlock} testId="K5-3-2-sufficiency" /> : t("zoneDist.empty")}
                    </div>
                  )}
                </>
              );
            })()}
          </Card>

        </div>}
  </>;

  // Web analysis owns performance changes and their supporting tools on every viewport.
  // The condition surface keeps load/recovery; embedded presentations retain their contract below.
  if (!embedded && part === "analysis") return <div className="fitness-reading">
    {pageHeader}
    <div className="site-shell" style={bodyPad}>
      <CanonicalFitnessNotice state={model.canonicalFitness} t={t} />
      <FitnessActivityWindowNotice incomplete={model.activityWindowIncomplete} t={t} />
      {discipline === "run" && <RunRecordsSummary evidence={model.runEvidence} readiness={runReadiness} />}
      <section id="analysis-comparison" className="condition-section-target" tabIndex={-1}>
        {discipline === "bike" ? <BikePowerCurveEvidence compact current={curveBlock && needsSufficiencyCard(activityWindowSufficiency!, curveBlock) ? [] : currentPowerCurve?.points ?? []} previous={prevPowerCurve?.points ?? []} expected={expectedCurvePoints} emptyContent={activityWindowSufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(activityWindowSufficiency, curveBlock) ? <SufficiencyCard set={activityWindowSufficiency} block={curveBlock} testId="K5-2-1-sufficiency" /> : undefined} />
          : <Card><Text as="h2" variant="subtitle">{t("criticalPace.title")}</Text><Text as="p" variant="caption" tone="secondary">{t("criticalPace.periodNote")}</Text><CriticalPaceCurve stableSelection recentPoints={runPaceCurve.recent28} prevPoints={runPaceCurve.prev28} /></Card>}
      </section>
      <SufficiencyGroup summaryOnly sets={analysisSets} testId="analysis-readiness-summary" />
      {analysisSummarySlot && <AnchoredDetailsSection queryDetail id="analysis-activity-flow" title={t("analysis.categories.activity")} >{analysisSummarySlot}</AnchoredDetailsSection>}
      {discipline === "bike" && <AnchoredDetailsSection queryDetail id="analysis-model" title={t("analysis.categories.model")}>{bikeMetrics}{pacingCard}</AnchoredDetailsSection>}
      {discipline === "run" && <AnchoredDetailsSection queryDetail id="analysis-run-records" title={t("analysis.categories.records")}><RunRecordsBoard run={runRecords} title={t("condition.metrics.runSourcesTitle")} additionalUnverified={!!model.runEvidence.unverifiedRecords?.length} /><MilestonesGrid achieved={milestones} />{!user.isAnonymous && getRuntimeConfig().appEnvironment === "stage" && <RunningRaceEstimatesPanel key={user.uid} ownerUid={user.uid} />}</AnchoredDetailsSection>}
      <AnchoredDetailsSection queryDetail id="analysis-periods" title={t("analysis.categories.periods")}>{periodPowerCard}{discipline !== "tri" && <FitnessPeriodEvidence discipline={discipline} inline timeseries={model.periodTimeseries} />}{zoneDistributionCard}</AnchoredDetailsSection>
      {discipline === "bike" && <FtpDecisionSection title={t("condition.basis.title")} anchorEnabled collapsible>
        <BikeThresholdDecisionCard inlineEvidence stableDetails decision={thresholdDecision} hasZoneData={!!zoneDistribution} ftpDecision={bikeFtpDecision} ftpReceipt={bikeFtpReceipt} ftpDeviceReceipts={bikeFtpDeviceReceipts} decisionBusy={decisionBusy} onAcceptDecision={acceptFtpDecision} progressionPoints={ftpProgression} ftpHistory={ftpHistory} t={t} />
      </FtpDecisionSection>}
      {isSufficiencyGrouped(...analysisSets) && <AnchoredDetailsSection queryDetail id="analysis-evidence" title={t("analysis.categories.evidence")}><SufficiencyGroup inline sets={analysisSets} testId="K5-sufficiency-group" /></AnchoredDetailsSection>}
    </div>
  </div>;

  const conditionNavigation = embedded && part === "condition" ? <ConditionSectionNav sections={[
    ...(currentPoint ? [{ id: "condition-current", label: t("condition.current.title") }, { id: "condition-trend", label: t("condition.chart.region") }, { id: "condition-activities", label: t("coach.recent.title") }] : []),
    { id: "condition-load", label: t("condition.load.title") },
    { id: "condition-metrics", label: t(discipline === "bike" ? "condition.metrics.bikeTitle" : "condition.metrics.runTitle") },
    ...(discipline === "bike" ? [{ id: "condition-ftp", label: t("condition.basis.title") }] : []),
    ...(!embedded && hasThresholdSettings ? [{ id: "thresholds", label: t("condition.settings.title") }] : []),
  ]} /> : null;

  return (
    <div className="fitness-reading">
      {pageHeader}

      <div className="site-shell" style={bodyPad}>

        <CanonicalFitnessNotice state={model.canonicalFitness} t={t} />
        <FitnessActivityWindowNotice incomplete={model.activityWindowIncomplete} t={t} />
        {part !== "condition" && <SufficiencyGroup sets={analysisSets} testId="K5-sufficiency-group" />}
        {part !== "analysis" && discipline !== "tri" && currentPoint && (
          <FitnessCoachBriefing
          showConditionChoices={embedded}
          currentDate={currentPoint.date}
          currentBasis={currentBasis}
            weekChangeSlot={part === "condition" ? null : weekChangeSlot}
            metricsNoteSlot={loadSufficiency && loadFormBlock
              ? <LoadQualityEvidence points={model.pmcHistoryPoints} set={loadSufficiency} block={loadFormBlock} testId="K1-1-1-sufficiency-inline" />
              : null}
          part={part === "condition" ? "condition" : "all"}
            key={`${discipline}-${currentPoint.date}`}
            impacts={activityImpacts}
            selectedActivityId={effectiveSelectedActivityId}
            onSelectActivity={setSelectedActivityId}
            forecast={recoveryForecast}
            current={{ ctl, atl, tsb }}
            locale={i18n.language}
            canonicalAvailable={hasCanonicalTimeseries}
            pendingActivity={pendingImpactActivity}
            pendingDayLoad={pendingDayLoad}
            metricsMap={metricsMap}
            discipline={discipline}
            userId={user.uid}
            decisionSlot={part === "all" ? <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" /> : null}
            evidenceNavSlot={conditionNavigation}
            statusSlot={currentStatusSlot && <><Text as="p" variant="eyebrow">{t("condition.current.title")}</Text>{currentStatusSlot}</>}
            trendSlot={part === "condition" ? <section id="condition-trend" tabIndex={-1} className="condition-trend-region condition-section-target" aria-label={t("condition.chart.region")}>
              <ToggleControls variant="axis" aria-label={t("condition.chart.view")}>
                {(["trend", "years", "activities"] as const).map(view => <ToggleButton key={view} selected={chartView === view} onClick={() => setChartView(view)}>{t(view === "activities" ? "condition.chart.activities" : `history.mode.${view}`)}</ToggleButton>)}
              </ToggleControls>
              <div hidden={chartView === "activities"}><PmcHistoryPanel suppressMethodNotes
              controlledMode={chartView === "years" ? "years" : "trend"} hideModeControls
              key={`${user.uid}-${discipline}`}
              points={model.pmcHistoryPoints}
              today={fitnessTodayKey(Date.now(), model.fitnessDateKeyBasis)}
              canonical={model.hasCanonicalHistory}
              controlledRange={historyRange}
              onControlledRangeChange={changeHistoryRange}
              rangeChoices={[30, 90, 180, 365, "3y", "all"]}
              ctlColor={getDisciplineColor(discipline)}
            /></div>
              <div data-testid="K1-2-5" hidden={chartView !== "activities"}>{activityPlanChart}</div>
            </section> : <PmcHistoryPanel
              key={`${user.uid}-${discipline}`}
              points={model.pmcHistoryPoints}
              today={fitnessTodayKey(Date.now(), model.fitnessDateKeyBasis)}
              canonical={model.hasCanonicalHistory}
              controlledRange={historyRange}
              onControlledRangeChange={changeHistoryRange}
              rangeChoices={[30, 90, 180, 365, "3y", "all"]}
              ctlColor={getDisciplineColor(discipline)}
            />}
          />
        )}
        {part === "condition" && discipline !== "tri" && !currentPoint && conditionNavigation}
        {part !== "analysis" && discipline !== "tri" && !currentPoint && (
          // 부하가 잡힌 날이 없다고 owner 가 판정했으면 빈 차트 대신 무엇이 필요한지 보인다.
          loadSufficiency && needsSufficiencyCard(loadSufficiency, loadTrendBlock)
            ? <SufficiencyCard set={loadSufficiency} block={loadTrendBlock} testId="K1-2-sufficiency" />
            : <PmcHistoryPanel
              key={`${user.uid}-${discipline}`}
              points={model.pmcHistoryPoints}
              today={fitnessTodayKey(Date.now(), model.fitnessDateKeyBasis)}
              canonical={model.hasCanonicalHistory}
              controlledRange={historyRange}
              onControlledRangeChange={changeHistoryRange}
              rangeChoices={[30, 90, 180, 365, "3y", "all"]}
              ctlColor={getDisciplineColor(discipline)}
            />
        )}
        {part === "condition" && goalSummary}
        {/* 거리별 기록 보드 — 러닝 탭 (§3.4a). 임계 페이스 곡선은 페이지 하단에 이미 있어
            여기선 표만 둔다(중복 방지). */}
        {part === "all" && discipline === "run" && <RunRecordsBoard run={runRecords} />}

        {part === "analysis" && discipline === "run" && <RunRecordsSummary evidence={model.runEvidence} readiness={runReadiness} />}

        {/* 마일스톤 그리드 — 러닝 탭 (§3.4b) */}
        {part === "all" && discipline === "run" && <MilestonesGrid achieved={milestones} />}

        {/* 신규 달성 축하 — celebrated:false 하나. 닫으면 서버에 celebrated:true 기록. */}
        {part === "all" && pendingMilestone && (
          <MilestoneCelebration
            milestoneId={pendingMilestone}
            onClose={() => {
              void markCelebrated(pendingMilestone);
              setDismissedMilestones((prev) => new Set(prev).add(pendingMilestone));
            }}
          />
        )}

        {part === "all" && <div data-testid="K1-2-5"><DetailsSection title={t("history.dailyDetails")}>{activityPlanChart}</DetailsSection></div>}

        {/* 상세 분석 — 기존 분석 화면의 위치를 유지한다. */}
        {part !== "condition" && bikeMetrics}

        {/* 종목별 CTL 요약 dead block (2026-05-28 제거) — tri 뷰에서만 표시하던
            컴포넌트. 시안 검토 결과 단일 뷰 (bike/run/swim) 에선 불필요로 결정.
            복구 필요 시 git history 참조: commit 5d00cf2 이전. */}

        <div data-testid={part === "condition" ? "K1-7" : "K5-2"}><ConditionLoadSection condition={part === "condition"} title={t(part === "condition" ? "condition.load.title" : "conclusion.trainingDetailToggle")} description={t("condition.load.description")} defaultOpen={part === "analysis"}>
        {part !== "analysis" && (activeGoal?.adaptationFlag || consistencyStreak || currentPoint) && (
          <div data-testid="K1-4" className="condition-load-evidence">
            {weekChangeSlot}
            {part === "all" && currentStatusSlot && <Card>{currentStatusSlot}</Card>}
            {/* Plan 적응 한 줄 요약 — warn/critical 일 때만 노출. 클릭 시 /coach/plan 으로 이동. */}
            {activeGoal?.adaptationFlag && (
              <AdaptationSummary
                href={`/coach/plan?sport=${discipline}`}
                flag={activeGoal.adaptationFlag}
                style={{ marginBottom: 'var(--space-4)' }}
              />
            )}

            {consistencyStreak && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <ConsistencyStreakCard summary={consistencyStreak} allSports={part === "condition"} />
              </div>
            )}

            {currentPoint && (
              <FitnessWeeklyInsight
                includeLoadSummary={part !== "condition"}
                ctlDelta={ctlDelta}
                ctl={ctl}
                atl={atl}
                tsb={tsb}
                dailyData={dailyData}
                asOf={weeklyStats.asOf}
                dateBasis={weeklyStats.dateBasis}
                ready={weeklyStats.insightReady}
                t={t}
              />
            )}


          </div>
        )}

        {/* 2열 하단: 일별 운동 부하 + 파워 커브 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))", gap: 'var(--space-5)', marginTop: 'var(--space-5)', alignItems: "start" }}>
          {part !== "analysis" && <>
          {/* 일별 운동 부하 */}
          <Card variant={part === "condition" ? "bare" : undefined} padding="none" style={{ padding: part === "condition" ? 0 : 'var(--space-5)' }}>
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
              <div>
                <Text as="h3" variant="title" style={{ margin: 0, marginBottom: "var(--space-1)" }}>{t("daily.title")}</Text>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("daily.sub")}</div>
              </div>
            </div>
            {rangeData.daily.length > 0 ? (
              <>
                <div data-testid="K1-7-1"><DailyTSSChart data={rangeData.daily} /></div>
                {rangeData.daily.some(day => day.unknownCount) && <Text variant="caption">{trainingT("log.loadPartial", { count: rangeData.daily.reduce((sum, day) => sum + (day.unknownCount ?? 0), 0) })}</Text>}
              </>
            ) : (
              <div style={{ height: 90, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
                {t("daily.empty")}
              </div>
            )}
            <div style={{ marginTop: "var(--space-3)", display: "flex", gap: 'var(--space-3)', fontSize: "var(--fs-xs)", color: "var(--ink-3)", flexWrap: "wrap" }}>
              {([
                [t("load.rest"), "var(--bg-3)"],
                [t("load.light"), "var(--aqua-dim, oklch(0.55 0.12 200))"],
                [t("load.moderate"), "var(--lime-dim, oklch(0.55 0.14 130))"],
                [t("load.heavy"), "var(--amber)"],
                [t("load.race"), "var(--rose)"],
              ] as const).map(([l, c]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)' }}>
                  <span style={{ width: 8, height: 8, background: c, borderRadius: "var(--r-xs)" }} />{l}
                </span>
              ))}
            </div>
            <div data-testid="K1-7-2" style={{ marginTop: 'var(--space-4)', paddingTop: 14, borderTop: "1px solid var(--line-soft)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)" }}>
              <div>
                <Text as="div" variant="caption" style={{ marginBottom: "var(--space-1)" }}>{t(weeklyStats.storedSummary ? "weekly.storedSummaryTitle" : "daily.weekTSS")}</Text>
                <div><Text variant="dataMedium">{weeklyStats.thisWeekUnknownCount && !weeklyStats.hasKnownThisWeekLoad ? "–" : weeklyStats.thisWeekTSS ?? "–"}</Text></div>
                <Text variant="bodyMedium">{t(`hub.weekly.basis.${weeklyStats.dateBasis}`, { date: weeklyStats.asOf })}</Text>
                {weeklyStats.partial && <Text variant="bodyMedium">{t("weekly.partial")}</Text>}
                {weeklyStats.thisWeekUnknownCount > 0 && <Text variant="caption">{trainingT("log.loadPartial", { count: weeklyStats.thisWeekUnknownCount })}</Text>}
              </div>
              <div>
                <Text as="div" variant="caption" style={{ marginBottom: "var(--space-1)" }}>{t("daily.avgWeekTSS")}</Text>
                <div><Text variant="dataMedium">{weeklyStats.unknownCount && !weeklyStats.hasKnownLoad ? "–" : weeklyStats.avgWeekTSS ?? "–"}</Text></div>
                {weeklyStats.unknownCount > 0 && <Text variant="caption">{trainingT("log.loadPartial", { count: weeklyStats.unknownCount })}</Text>}
              </div>
              <div>
                <Text as="div" variant="caption" style={{ marginBottom: "var(--space-1)" }}>{t("daily.restDays")}</Text>
                <div><Text variant="dataMedium">{weeklyStats.restDays ?? "–"}</Text><Text variant="unit">{t("daily.daysUnit")}</Text></div>
              </div>
            </div>
          </Card>

          </>}

          {part !== "condition" && performanceCurves}
        </div>

        {!embedded && part !== "condition" && discipline !== "tri" && <FitnessPeriodEvidence discipline={discipline} inline timeseries={model.periodTimeseries} />}

        {part !== "condition" && zoneDistributionCard}
        </ConditionLoadSection></div>
        {part === "condition" && embedded && <section id="condition-metrics" tabIndex={-1} className="condition-riding-metrics condition-section-target" aria-labelledby="condition-riding-metrics-title">
          <Text as="h2" variant="title" id="condition-riding-metrics-title">{t(discipline === "bike" ? "condition.metrics.bikeTitle" : "condition.metrics.runTitle")}</Text>
          <Text as="p" variant="bodySmall" tone="secondary">{t("condition.metrics.description")}</Text>
          {discipline === "run" && <>
            <RunRecordsBoard run={runRecords} title={t("condition.metrics.runSourcesTitle")} additionalUnverified={!runReadiness && qualifiedRunRecords(model.runEvidence).length === 0 && !!model.runEvidence.unverifiedRecords?.length} footer={!runReadiness && qualifiedRunRecords(model.runEvidence).length === 0 ? <RunRecordsSummary evidence={model.runEvidence} sourceBoard /> : undefined} />
            {(runReadiness || qualifiedRunRecords(model.runEvidence).length > 0) && <RunRecordsSummary evidence={model.runEvidence} readiness={runReadiness} />}
            <MilestonesGrid achieved={milestones} />
          </>}
          {embedded && discipline === "bike" && <FitnessPedalingEvidence activities={disciplineActivities} metricsMap={metricsMap} locale={i18n.language} />}
          <div className="condition-riding-metrics__evidence">{performanceCurves}{zoneDistributionCard}</div>
          <SufficiencyGroup inline={part === "condition"} sets={analysisSets} testId="condition-metrics-sufficiency" />
          {bikeMetrics}
        </section>}

        {part !== "analysis" && (part !== "condition" || embedded) && discipline === "bike" && (
          <FtpDecisionSection title={t(part === "condition" ? "condition.basis.title" : "conclusion.performanceDetailToggle")} anchorEnabled={!embedded && part === "condition"}>
            <BikeThresholdDecisionCard
              inlineEvidence={part === "condition"}
              decision={thresholdDecision}
              hasZoneData={!!zoneDistribution}
              ftpDecision={bikeFtpDecision}
              ftpReceipt={bikeFtpReceipt}
              ftpDeviceReceipts={bikeFtpDeviceReceipts}
              decisionBusy={decisionBusy}
              onAcceptDecision={acceptFtpDecision}
              progressionPoints={ftpProgression}
              ftpHistory={ftpHistory}
              t={t}
            />
            {part === "condition" && pacingCard}
          </FtpDecisionSection>
        )}

        {part === "condition" && <section className="condition-method-section"><DetailsSection title={t("condition.story.methodsTitle")}><PmcHistoryMethodNotes canonical={model.hasCanonicalHistory} /></DetailsSection></section>}
        {!embedded && part === "condition" && thresholdsSlot}

      </div>
    </div>
  );
}

export default function FitnessPage() {
  const [searchParams] = useSearchParams();
  const model = useFitnessModel(isSportUiEnabled(searchParams.get("sport") ?? "bike") ? searchParams.get("sport") : "bike", {
    decisionId: searchParams.get("decisionId"),
  });
  return <FitnessView model={model} />;
}

function ConditionLoadSection({ condition, title, description, defaultOpen, children }: { condition: boolean; title: string; description: string; defaultOpen: boolean; children: ReactNode }) {
  return condition ? <Section id="condition-load" tabIndex={-1} className="condition-load-section condition-section-target" title={title} description={description}>{children}</Section> : <DetailsSection title={title} defaultOpen={defaultOpen}>{children}</DetailsSection>;
}

function ConditionMetricSection({ condition, title, children }: { condition: boolean; title: string; children: ReactNode }) {
  return condition ? <Section headingLevel={3} title={title}><div className="condition-performance-evidence-grid">{children}</div></Section> : <DetailsSection title={title}>{children}</DetailsSection>;
}
