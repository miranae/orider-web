import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { classifyGaps, computeExpectedCurve, computeOutdoorPacingGuide, type GapEntry } from "@shared/training/expectedPower";
import type { PowerDurationKey } from "@shared/types/personal-records";
import { deriveEstimatedFtpProgression } from "@shared/training/ftpProgression";
import AdaptationSummary from "../components/training/AdaptationSummary";
import ConsistencyStreakCard from "../components/training/ConsistencyStreakCard";
import CriticalPaceCurve from "../components/charts/CriticalPaceCurve";
import CSSCurve from "../components/charts/CSSCurve";
import FitnessChart from "../components/FitnessChart";
import CyclingAbilityCard from "../components/fitness/CyclingAbilityCard";
import MilestoneCelebration from "../components/fitness/MilestoneCelebration";
import MilestonesGrid from "../components/fitness/MilestonesGrid";
import RunRecordsBoard from "../components/fitness/RunRecordsBoard";
import TrainingStatusCard from "../components/fitness/TrainingStatusCard";
import GuestValuePreview from "../components/guest/GuestValuePreview";
import MobileFitnessPage from "../components/mobile/MobileFitnessPage";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/redesign";
import DetailsSection from "../components/redesign/DetailsSection";
import DisciplineTabs from "../components/redesign/DisciplineTabs";
import SectionHeader from "../components/redesign/SectionHeader";
import { RevalidatingIndicator } from "../components/training/RevalidatingIndicator";
import BikeThresholdDecisionCard from "../features/fitness/components/BikeThresholdDecisionCard";
import FitnessCoachBriefing from "../features/fitness/components/FitnessCoachBriefing";
import DailyTSSChart from "../features/fitness/components/DailyTSSChart";
import PowerCurveChart from "../features/fitness/components/PowerCurveChart";
import {
  activityIdsCoveredByImpacts,
  deriveActivityImpacts,
  forecastFitness48Hours,
} from "../features/fitness/activityImpact";
import { deriveMonthlyCyclingVo2maxTrend } from "../features/fitness/deriveMonthlyCyclingVo2maxTrend";
import {
  POWER_DURATION_KEY_SEC,
  formatKoreanDate,
  formatMonthDay,
  getRangeOptions,
  secToMmss,
  type PowerCurvePoint,
} from "../features/fitness/fitnessPageUtils";
import { PMC_LINE_PALETTE } from "../features/fitness/chartPalette";
import { FitnessWeeklyInsight } from "../features/trainingHub/TrainingHubOpportunityPanel";
import TodayTrainingDecisionCard from "../features/trainingDecision/TodayTrainingDecisionCard";
import { useFitnessModel, type FitnessModel } from "../hooks/useFitnessModel";
import { Card, Chip, Text, buttonClass } from "../theme/components";
import { getDisciplineColor } from "../utils/disciplineFilter";
import { toLocalDate } from "../utils/dateUtils";
import TriFitnessView from "./fitness/TriFitnessView";

export interface FitnessViewProps {
  embedded?: boolean;
  model: FitnessModel;
}

export function FitnessView({ embedded = false, model }: FitnessViewProps) {
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const {
    t,
    i18n,
    durationLabel,
    user,
    profile,
    ftpHistory,
    activities,
    disciplineActivities,
    streamsMap,
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
    runPaceStreams,
  } = model;
  const renderMobile = embedded || isMobile;
  const activityImpacts = discipline === "tri" || !hasCanonicalTimeseries
    ? []
    : deriveActivityImpacts(fitnessData, disciplineActivities, { limit: 6 });
  const coveredActivityIds = activityIdsCoveredByImpacts(disciplineActivities, activityImpacts);
  const newestDisciplineActivity = disciplineActivities.reduce<(typeof disciplineActivities)[number] | null>(
    (latest, activity) => !latest || activity.startTime > latest.startTime ? activity : latest,
    null,
  );
  const pendingImpactActivity = newestDisciplineActivity
    && !coveredActivityIds.has(newestDisciplineActivity.id)
    ? newestDisciplineActivity
    : null;
  const selectedActivityIsAvailable = selectedActivityId != null && (
    pendingImpactActivity?.id === selectedActivityId
    || activityImpacts.some((entry) => entry.activity.id === selectedActivityId)
  );
  const effectiveSelectedActivityId = selectedActivityIsAvailable
    ? selectedActivityId
    : pendingImpactActivity?.id ?? activityImpacts[0]?.activity.id ?? null;
  const recoveryForecast = currentPoint ? forecastFitness48Hours(currentPoint, 35) : null;

  if (!user) {
    return <GuestValuePreview kind="fitness" lang={i18n.language} />;
  }

  if (renderMobile && (loading || !timeseriesLoaded)) {
    return (
      <div style={{ padding: "20px 16px 40px" }}>
        <LoadingSkeleton kind="chart" />
      </div>
    );
  }

  if (renderMobile && error) {
    return (
      <div style={{ padding: "20px 16px 40px" }}>
        {discipline !== "tri" && <div style={{ marginBottom: "var(--space-5)" }}>
          <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />
        </div>}
        <ErrorState title={t("error.dataFailed")} description={error} />
      </div>
    );
  }

  if (renderMobile && activities.length === 0) {
    return (
      <div style={{ padding: "20px 16px 40px" }}>
        {discipline !== "tri" && <div style={{ marginBottom: "var(--space-5)" }}>
          <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />
        </div>}
        <EmptyState
          icon="📈"
          title={t("empty.noActivities")}
          description={t("empty.hint")}
          actions={[
            { label: t("empty.connectStrava"), variant: "primary", href: "/settings?section=connections" },
          ]}
        />
      </div>
    );
  }

  // TriFitnessView 는 데스크톱 전용 레이아웃이다. 모바일 tri 는 아래의
  // MobileFitnessPage 로 보내 좁은 화면에서 헤더와 카드가 눌리지 않게 한다.
  if (!renderMobile && discipline === "tri") {
    return (
      <TriFitnessView
        range={range}
        onRangeChange={setRange}
        breakdown={triFitnessBreakdown}
        timeline={triFitnessTimeline}
        combinedLoad={combinedLoad}
        loadFocus={integratedLoadFocus}
      />
    );
  }

  if (renderMobile) {
    const mobileCoachBriefing = discipline !== "tri" && currentPoint ? (
      <FitnessCoachBriefing
        key={`${discipline}-${currentPoint.date}`}
        impacts={activityImpacts}
        selectedActivityId={effectiveSelectedActivityId}
        onSelectActivity={setSelectedActivityId}
        forecast={recoveryForecast}
        current={{ ctl: currentPoint.ctl, atl: currentPoint.atl, tsb: currentPoint.tsb }}
        locale={i18n.language}
        canonicalAvailable={hasCanonicalTimeseries}
        pendingActivity={pendingImpactActivity}
        metricsMap={metricsMap}
        discipline={discipline}
        userId={user.uid}
        decisionSlot={<TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />}
      />
    ) : null;
    return (
      <MobileFitnessPage
        {...model.mobilePageProps}
        embedded={embedded}
        coachSlot={mobileCoachBriefing}
      />
    );
  }

  // loading/error/empty 분기는 헤더 정의(pageHeader) 이후로 이동 — 어느 상태든
  // 헤더(h1)를 즉시 렌더해 LCP 요소를 차트가 아닌 정적 헤더로 고정한다. (아래 참조)

  // KPI 계산
  const ctl = currentPoint?.ctl ?? 0;
  const atl = currentPoint?.atl ?? 0;
  const tsb = currentPoint?.tsb ?? 0;
  const ctlDelta = rangeStartPoint ? ctl - rangeStartPoint.ctl : 0;

  // 훈련 상태 판정용 CTL 램프 — 선택된 range(최대 365일)로 나누면 희석되므로
  // 항상 최근 28일 기울기를 쓴다. 표본이 모자라면 null(램프 승격 규칙 비활성).
  const RAMP_WINDOW_DAYS = 28;
  const rampStartPoint = fitnessData.length > RAMP_WINDOW_DAYS
    ? fitnessData[fitnessData.length - 1 - RAMP_WINDOW_DAYS]
    : null;
  const ctlRampPerWeek = rampStartPoint
    ? ((ctl - rampStartPoint.ctl) / RAMP_WINDOW_DAYS) * 7
    : null;

  // 자막 생성
  const subtitleParts: string[] = [];
  if (projection) {
    const projDays = projection.series.length;
    subtitleParts.push(t("header.subtitle.actualWithProjection", { range, projDays }));
  } else {
    subtitleParts.push(t("header.subtitle.actual", { range }));
  }
  if (activeGoal && projection) {
    const goalDateObj = new Date(activeGoal.eventDate);
    const goalDateStr = `${goalDateObj.getMonth() + 1}/${goalDateObj.getDate()}`;
    const tsbVal = Math.round(projection.goalDay.tsb);
    subtitleParts.push(
      t("header.subtitle.goal", {
        course: activeGoal.courseName,
        date: goalDateStr,
        ctl: Math.round(projection.goalDay.ctl),
        tsb: tsbVal >= 0 ? `+${tsbVal}` : tsbVal,
      })
    );
  }

  // 파워 커브 데이터 분리
  const currentPowerCurve = powerCurveProgressions.find((p) => p.label === t("period.recent"));
  const prevPowerCurve = powerCurveProgressions.find((p) => p.label === t("period.previous"));

  // 파워 커브 주요 구간 값
  const pcKeyDurations = [5, 60, 300, 1200];
  const pcKeyLabels = [t("powerCurve.label.sprint"), t("powerCurve.label.anaerobic"), t("powerCurve.label.vo2"), t("powerCurve.label.ftp")];
  const pcKeyNames = [t("powerCurve.duration.5s"), t("powerCurve.duration.1m"), t("powerCurve.duration.5m"), t("powerCurve.duration.20m")];
  const pcKeyValues = pcKeyDurations.map((d) => {
    const pt = currentPowerCurve?.points.find((p) => p.durationSeconds === d);
    return pt?.maxPower ?? null;
  });

  // 기대파워 (CP/W' 모델) — bike + pdc.cp 있을 때만. 서버 저장 없이 클라 파생.
  const expectedCurvePoints: PowerCurvePoint[] | undefined =
    discipline === "bike" && pdc?.cp != null
      ? computeExpectedCurve(pdc.cp.value, pdc.cp.wPrime).map((p) => ({
          durationSeconds: p.durationSeconds,
          maxPower: p.watts,
        }))
      : undefined;

  // 야외 페이싱 가이드 — CP 기반 장거리 지속파워 권장 범위. bike + pdc.cp 있을 때만.
  const pacingGuide =
    discipline === "bike" && pdc?.cp != null
      ? computeOutdoorPacingGuide(pdc.cp.value, profile?.weightKg)
      : null;

  const vo2maxTrend = discipline === "bike"
    ? deriveMonthlyCyclingVo2maxTrend(pdc?.history, profile?.weightKg ?? pdc?.weightKgSnapshot)
    : [];

  const ftpProgression = deriveEstimatedFtpProgression(pdc?.history);
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
  const strengths = powerGaps.filter((g) => g.label === "strength");
  const weaknesses = powerGaps.filter((g) => g.label === "weakness");

  // 페이지 헤더 — PageHeader 패턴. const 로 추출해 loading/error/empty/정상 4상태가
  // 동일 헤더를 공유한다. 콜드 진입 시 차트 데이터가 도착하기 전에도 헤더(h1)가 즉시
  // 페인트돼 LCP 요소가 늦게 뜨는 차트가 아닌 정적 헤더로 고정 → LCP 꼬리 제거.
  const pageHeader = (
    <div className="site-shell" style={{ padding: "24px 28px 18px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "flex-end", gap: 'var(--space-6)' }}>
      <div style={{ flex: 1 }}>
        <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)', display: "flex", alignItems: "center", gap: 'var(--space-3)' }}>
          <span>{t("header.eyebrow", { date: formatMonthDay(i18n.language) })}</span>
          <RevalidatingIndicator
            visible={revalidating || justRecomputed}
            mode={revalidating ? "updating" : "success"}
          />
        </Text>
        <Text as="h1" variant="pageTitle" style={{ marginBottom: "var(--space-1-5)" }}>
          {t("header.title")}
        </Text>
        <div style={{ color: "var(--ink-2)", fontSize: "var(--fs-sm)" }}>
          {subtitleParts.join(" ")}
        </div>
      </div>
      <div style={{ display: "flex", gap: 'var(--space-2)', alignItems: "center" }}>
        <DisciplineTabs includeTri />
          <div style={{ display: "flex", gap: "var(--space-0-5)", background: "var(--bg-1)", padding: "var(--space-1)", borderRadius: "var(--r-md)", border: "1px solid var(--line-soft)" }}>
            {getRangeOptions(t).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                style={{
                  padding: "5px 12px",
                  fontSize: "var(--fs-xs)",
                  borderRadius: "var(--r-sm)",
                  background: range === opt.value ? "var(--bg-3)" : "transparent",
                  color: range === opt.value ? "var(--ink-0)" : "var(--ink-3)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
        </div>
      </div>
    </div>
  );

  const bodyPad = { padding: "20px 24px 40px" };

  // 데이터 의존 본문만 상태별로 스왑 — 헤더는 항상 즉시 페인트.
  // 정본 timeseries doc 이 도착하기 전(doc 보유 유저)엔 스켈레톤 유지 — 클라 폴백(부정확
  // 콜드 CTL)으로 한 번 그렸다가 정본으로 스왑하며 곡선/KPI 가 튀는 깜빡임 방지(리뷰 #340).
  // doc 부재/미인증은 훅이 loaded=true 를 즉시 세팅하므로 추가 대기 없음. (이 지점은 이미
  // tri·미인증 early-return 뒤라 discipline 은 bike/run/swim, user 는 truthy 로 좁혀져 있다.)
  if (loading || !timeseriesLoaded) {
    return (
      <div>
        {pageHeader}
        <div className="site-shell" style={bodyPad}><LoadingSkeleton kind="chart" /></div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        {pageHeader}
        <div className="site-shell" style={bodyPad}>
          {discipline !== "tri" && <div style={{ marginBottom: "var(--space-5)" }}>
            <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />
          </div>}
          <ErrorState title={t("error.dataFailed")} description={error} />
        </div>
      </div>
    );
  }
  if (activities.length === 0) {
    return (
      <div>
        {pageHeader}
        <div className="site-shell" style={bodyPad}>
          {discipline !== "tri" && <div style={{ marginBottom: "var(--space-5)" }}>
            <TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />
          </div>}
          <EmptyState
            icon="📈"
            title={t("empty.noActivities")}
            description={t("empty.hint")}
            actions={[
              { label: t("empty.connectStrava"), variant: "primary", href: "/settings?section=connections" },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {pageHeader}

      <div className="site-shell" style={bodyPad}>
        {discipline !== "tri" && currentPoint && (
          <FitnessCoachBriefing
            key={`${discipline}-${currentPoint.date}`}
            impacts={activityImpacts}
            selectedActivityId={effectiveSelectedActivityId}
            onSelectActivity={setSelectedActivityId}
            forecast={recoveryForecast}
            current={{ ctl, atl, tsb }}
            locale={i18n.language}
            canonicalAvailable={hasCanonicalTimeseries}
            pendingActivity={pendingImpactActivity}
            metricsMap={metricsMap}
            discipline={discipline}
            userId={user.uid}
            decisionSlot={<TodayTrainingDecisionCard user={user} discipline={discipline} surface="fitness" />}
          />
        )}
        {(activeGoal?.adaptationFlag || consistencyStreak || currentPoint) && (
          <DetailsSection title={t("conclusion.evidenceToggle")}>
            {/* Plan 적응 한 줄 요약 — warn/critical 일 때만 노출. 클릭 시 /plan 으로 이동. */}
            {activeGoal?.adaptationFlag && (
              <AdaptationSummary
                flag={activeGoal.adaptationFlag}
                style={{ marginBottom: 'var(--space-4)' }}
              />
            )}

            {consistencyStreak && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <ConsistencyStreakCard summary={consistencyStreak} />
              </div>
            )}

            {currentPoint && (
              <FitnessWeeklyInsight
                ctlDelta={ctlDelta}
                ctl={ctl}
                atl={atl}
                tsb={tsb}
                dailyData={dailyData}
                t={t}
              />
            )}

            {/* 훈련 상태 — 숫자(KPI) 앞에 일상어 라벨을 먼저 (§3.5) */}
            {currentPoint && (
              <TrainingStatusCard
                tsb={tsb}
                ctl={ctl}
                atl={atl}
                ctlRampPerWeek={ctlRampPerWeek}
                sport={discipline}
              />
            )}
          </DetailsSection>
        )}

        {/* 거리별 기록 보드 — 러닝 탭 (§3.4a). 임계 페이스 곡선은 페이지 하단에 이미 있어
            여기선 표만 둔다(중복 방지). */}
        {discipline === "run" && <RunRecordsBoard run={runRecords} />}

        {/* 마일스톤 그리드 — 러닝 탭 (§3.4b) */}
        {discipline === "run" && <MilestonesGrid achieved={milestones} />}

        {/* 신규 달성 축하 — celebrated:false 하나. 닫으면 서버에 celebrated:true 기록. */}
        {pendingMilestone && (
          <MilestoneCelebration
            milestoneId={pendingMilestone}
            onClose={() => {
              void markCelebrated(pendingMilestone);
              setDismissedMilestones((prev) => new Set(prev).add(pendingMilestone));
            }}
          />
        )}

        {/* PMC 차트 */}
        <Card padding="none" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)' }}>
          <div style={{ display: "flex", alignItems: "flex-end", marginBottom: "var(--space-3)" }}>
            <div>
              <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("pmc.title")}</h3>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{projection ? t("pmc.subWithProjection", { range }) : t("pmc.subActual", { range })}</div>
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
              {projection && (
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
              projection={projection?.series ?? null}
              today={toLocalDate(Date.now())}
              goalDate={activeGoal?.eventDate ?? null}
              goalCTL={projection?.goalDay.ctl ?? null}
              goalTSB={projection?.goalDay.tsb ?? null}
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

          {/* 목표 요약 스트립 */}
          {activeGoal && (() => {
            const now = Date.now();
            const daysLeft = Math.max(0, Math.ceil((activeGoal.eventDate - now) / 86400000));
            const eventDateStr = formatKoreanDate(activeGoal.eventDate);
            const goalCTLVal = projection?.goalDay.ctl;
            const goalTSBVal = projection?.goalDay.tsb;
            const adherence = projection?.goalDay.adherenceRate;
            const currentCTL = currentPoint?.ctl ?? 0;

            return (
              <div
                style={{
                  marginTop: 'var(--space-4)',
                  padding: "var(--space-3)",
                  // 카드 안 서피스는 테두리 없이 배경 틴트만 — surface 3단계 유지 (이슈 401)
                  background: "color-mix(in oklch, var(--lime) 5%, var(--bg-2))",
                  borderRadius: "var(--r-md)",
                  display: "grid",
                  gridTemplateColumns: "2fr repeat(3, 1fr) auto",
                  gap: 'var(--space-5)',
                  alignItems: "center",
                }}
              >
                <div>
                  <Text as="div" variant="eyebrow" style={{ color: "var(--lime)", marginBottom: 'var(--space-1)' }}>
                    {t("goal.eyebrow", { course: activeGoal.courseName })}
                  </Text>
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", fontWeight: 500 }}>
                    {eventDateStr} · D-<Text variant="mono" style={{ color: "var(--lime)" }}>{daysLeft}</Text>
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
                  <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("goal.ctl")}</Text>
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
                  <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("goal.tsb")}</Text>
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
                  <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("goal.adherence")}</Text>
                  {adherence != null ? (
                    <div>
                      <Text variant="dataMedium">{Math.round(adherence * 100)}</Text>
                      <Text variant="unit">%</Text>
                    </div>
                  ) : (
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>—</span>
                  )}
                </div>
                <a href="/plan" className={`${buttonClass({ variant: 'secondary', size: 'sm' })}`} style={{ whiteSpace: "nowrap", fontSize: "var(--fs-xs)" }}>
                  {t("goal.viewPlan")}
                </a>
              </div>
            );
          })()}
        </Card>

        {/* 상세 분석 — 바이크 개선 액션·VO2max·강점/약점·야외 페이싱·라이더 유형. */}
        {discipline === "bike" && (
        <DetailsSection title={t("conclusion.detailToggle")}>
        {/* PDC 기반 VO2max 근거와 월별 추이. 현재 적용 FTP 공식값과 구분한다. */}
        {pdc?.vo2maxEst != null && (
          <Card padding="none" style={{ marginTop: "var(--space-4)", padding: "16px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
              <div>
                <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("vo2maxCard.pdcLabel")}</Text>
                <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)" }}>
                  <Text variant="dataLarge" style={{ color: "var(--aqua)" }}>~{pdc.vo2maxEst}</Text>
                  <Text variant="unit">ml/kg/min</Text>
                </div>
                <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>{t("vo2maxCard.pdcSub")}</Text>
              </div>
              {vo2maxTrend.length >= 2 && (() => {
                const vals = vo2maxTrend.map((point) => point.v);
                const lo = Math.min(...vals), hi = Math.max(...vals);
                const w = 132, h = 40, span = hi - lo || 1;
                const sx = (index: number) => (index / (vals.length - 1)) * w;
                const sy = (value: number) => h - ((value - lo) / span) * h;
                const path = vals.map((value, index) => `${index ? "L" : "M"}${sx(index).toFixed(1)} ${sy(value).toFixed(1)}`).join(" ");
                const delta = vals[vals.length - 1]! - vals[0]!;
                const first = vo2maxTrend[0]!, last = vo2maxTrend[vo2maxTrend.length - 1]!;
                const trendDescription = t("vo2maxCard.trendAriaValues", { startPeriod: first.period, start: first.v, endPeriod: last.period, end: last.v, delta: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}` });
                return (
                  <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1)" }}>
                    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={trendDescription} style={{ width: w, height: h, display: "block" }} preserveAspectRatio="none">
                      <desc>{trendDescription}</desc>
                      <path d={`M0 ${h} ${path.replace(/^M/, "L")} L${w} ${h} Z`} fill="var(--aqua)" opacity="0.14" />
                      <path d={path} stroke="var(--aqua)" strokeWidth="1.5" fill="none" />
                    </svg>
                    <Text as="div" variant="mono" className="text-[length:var(--fs-xs)]" style={{ color: delta >= 0 ? "var(--lime)" : "var(--rose)" }}>
                      {delta >= 0 ? "+" : ""}{delta.toFixed(1)} · {t("vo2maxCard.trendSpan", { n: vo2maxTrend.length })}
                    </Text>
                  </div>
                );
              })()}
            </div>
          </Card>
        )}
        {/* 강점/약점 — CP 모델 기대파워 대비 실제 best 갭. bike + pdc.cp + 분류 결과 있을 때만 */}
        {discipline === "bike" && pdc?.cp != null && (strengths.length > 0 || weaknesses.length > 0) && (
          <Card padding="none" style={{ marginTop: 'var(--space-4)', padding: "16px 24px" }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>{t("gapCard.title")}</Text>
            <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-3)' }}>
              {strengths.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', flexWrap: "wrap" }}>
                  <Text variant="eyebrow" style={{ width: 48, color: "var(--ink-3)" }}>{t("gapCard.strengthLabel")}</Text>
                  {strengths.map((g) => (
                    <Chip key={g.durationSeconds} variant="success" dot>
                      {durationLabel(g.durationSeconds)} +{Math.round(g.gapPct)}%
                    </Chip>
                  ))}
                </div>
              )}
              {weaknesses.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', flexWrap: "wrap" }}>
                  <Text variant="eyebrow" style={{ width: 48, color: "var(--ink-3)" }}>{t("gapCard.weaknessLabel")}</Text>
                  {weaknesses.map((g) => (
                    <Chip key={g.durationSeconds} variant="warning" dot>
                      {durationLabel(g.durationSeconds)} {Math.round(g.gapPct)}%
                    </Chip>
                  ))}
                </div>
              )}
            </div>
            <Text as="div" variant="eyebrow" style={{ marginTop: 'var(--space-3)', color: "var(--ink-4)" }}>
              {t("gapCard.sub")}
            </Text>
          </Card>
        )}

        {/* 야외 페이싱 가이드 — 장거리/그란폰도 지속 목표. CP(임계파워)의 −10~−5%. bike + pdc.cp 있을 때만 */}
        {pacingGuide && pdc?.cp != null && (
          <Card padding="none" style={{ marginTop: 'var(--space-4)', padding: "16px 24px" }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("pacing.title")}</Text>
            <Text as="div" variant="num" style={{ fontSize: "var(--fs-xl)", color: "var(--ink-0)", lineHeight: 1.1 }}>
              {pacingGuide.lowerW}–{pacingGuide.upperW}
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-4)", marginLeft: "var(--space-1)" }}>W</span>
              {pacingGuide.lowerWkg != null && pacingGuide.upperWkg != null && (
                <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginLeft: "var(--space-2)" }}>
                  · {pacingGuide.lowerWkg.toFixed(2)}–{pacingGuide.upperWkg.toFixed(2)} W/kg
                </span>
              )}
            </Text>
            <Text as="div" variant="eyebrow" style={{ marginTop: 'var(--space-2)', color: "var(--ink-4)" }}>
              {t("pacing.note", { cp: Math.round(pdc.cp.value) })}
            </Text>
          </Card>
        )}

        {/* 사이클링 능력 — 모바일과 동일한 최근 90일 PDC 3축 실측 근거. */}
        {discipline === "bike" && cyclingAbility && (
          <CyclingAbilityCard cycling={cyclingAbility} variant="desktop" />
        )}
        </DetailsSection>
        )}

        {discipline === "bike" && (
          <DetailsSection title={t("conclusion.performanceDetailToggle")}>
            <BikeThresholdDecisionCard
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
          </DetailsSection>
        )}

        {/* 종목별 CTL 요약 dead block (2026-05-28 제거) — tri 뷰에서만 표시하던
            컴포넌트. 시안 검토 결과 단일 뷰 (bike/run/swim) 에선 불필요로 결정.
            복구 필요 시 git history 참조: commit 5d00cf2 이전. */}

        <DetailsSection title={t("conclusion.trainingDetailToggle")}>
        {/* 2열 하단: 일별 운동 부하 + 파워 커브 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 'var(--space-5)', marginTop: 'var(--space-5)' }}>
          {/* 일별 운동 부하 */}
          <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
              <div>
                <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("daily.title")}</h3>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("daily.sub")}</div>
              </div>
            </div>
            {rangeData.daily.length > 0 ? (
              <DailyTSSChart data={rangeData.daily} />
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
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 14, borderTop: "1px solid var(--line-soft)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)" }}>
              <div>
                <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("daily.weekTSS")}</Text>
                <div><Text variant="dataMedium">{weeklyStats.thisWeekTSS}</Text></div>
              </div>
              <div>
                <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("daily.avgWeekTSS")}</Text>
                <div><Text variant="dataMedium">{weeklyStats.avgWeekTSS}</Text></div>
              </div>
              <div>
                <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{t("daily.restDays")}</Text>
                <div><Text variant="dataMedium">{weeklyStats.restDays}</Text><Text variant="unit">{t("daily.daysUnit")}</Text></div>
              </div>
            </div>
          </Card>

          {/* 파워 커브 / 페이스 커브 (종목 분기) */}
          <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            {discipline === "run" ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("paceCurve.title")}</h3>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("paceCurve.sub")}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <span style={{ width: 10, height: 2, borderTop: "1px dashed var(--ink-3)", display: "inline-block" }} /> {t("powerCurve.prevSeason")}
                  </span>
                </div>
                <CriticalPaceCurve recentStreams={runPaceStreams.recentStreams} prevStreams={runPaceStreams.prevStreams} />
              </>
            ) : discipline === "swim" ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("cssCurve.title")}</h3>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("cssCurve.sub")}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: "var(--space-1-5)" }}>
                    <span style={{ width: 10, height: 2, borderTop: "1px dashed var(--ink-3)", display: "inline-block" }} /> {t("powerCurve.prevSeason")}
                  </span>
                </div>
                {(() => {
                  const now = Date.now();
                  const d28 = 28 * 24 * 60 * 60 * 1000;
                  const recentLaps: import("@shared/types").LapData[][] = [];
                  const prevLaps: import("@shared/types").LapData[][] = [];
                  for (const a of disciplineActivities) {
                    const stream = streamsMap.get(a.id);
                    if (!stream?.laps || stream.laps.length === 0) continue;
                    if (a.startTime >= now - d28) recentLaps.push(stream.laps);
                    else if (a.startTime >= now - d28 * 2) prevLaps.push(stream.laps);
                  }
                  return <CSSCurve css={profile?.css} recentLaps={recentLaps} prevLaps={prevLaps} />;
                })()}
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: "var(--space-1)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{t("powerCurve.title")}</h3>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("powerCurve.sub", { range })}</div>
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
                  <PowerCurveChart
                    current={currentPowerCurve.points}
                    previous={prevPowerCurve?.points ?? []}
                    expected={expectedCurvePoints}
                  />
                ) : (
                  <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
                    {t("powerCurve.empty")}
                  </div>
                )}
                <div style={{ marginTop: "var(--space-3)", paddingTop: 14, borderTop: "1px solid var(--line-soft)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: "var(--space-2)" }}>
                  {pcKeyDurations.map((_, i) => (
                    <div key={i}>
                      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{pcKeyNames[i]} · {pcKeyLabels[i]}</Text>
                      <div>
                        <Text variant="dataMedium">{pcKeyValues[i] != null ? pcKeyValues[i]!.toLocaleString() : "—"}</Text>
                        {pcKeyValues[i] != null && <Text variant="unit">W</Text>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 존 분포 — 단독 풀폭 (오늘의 권장은 상단 hero 로 이동) */}
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            {(() => {
              const threshPace = profile?.thresholdPace ?? null;
              const css = profile?.css ?? null;
              type ZoneRow = { z: string; name: string; range: string; pct: number | null; time: string; color: string };
              const zd = zoneDistribution;
              const zdPct = (i: number): number | null => (zd ? zd[i] ?? null : null);
              const zones: ZoneRow[] = discipline === "run"
                ? [
                    { z: "Z1", name: ` ${t("zone.recovery")}`,  range: threshPace ? `> ${secToMmss(threshPace + 90)}/km` : "—",                                              pct: zdPct(0), time: "—", color: "var(--zone-1)" },
                    { z: "Z2", name: ` ${t("zone.endurance")}`, range: threshPace ? `${secToMmss(threshPace + 30)}–${secToMmss(threshPace + 90)}/km` : "—",                  pct: zdPct(1), time: "—", color: "var(--zone-2)" },
                    { z: "Z3", name: ` ${t("zone.tempo")}`,  range: threshPace ? `${secToMmss(threshPace - 10)}–${secToMmss(threshPace + 30)}/km` : "—",                  pct: zdPct(2), time: "—", color: "var(--zone-3)" },
                    { z: "Z4", name: ` ${t("zone.threshold")}`,  range: threshPace ? `${secToMmss(threshPace - 30)}–${secToMmss(threshPace - 10)}/km` : "—",                  pct: zdPct(3), time: "—", color: "var(--zone-4)" },
                    { z: "Z5", name: " VO2",   range: threshPace ? `< ${secToMmss(threshPace - 30)}/km` : "—",                                               pct: zdPct(4), time: "—", color: "var(--zone-5)" },
                  ]
                : discipline === "swim"
                ? [
                    { z: "Z1", name: ` ${t("zone.recovery")}`,  range: css ? `> ${secToMmss(css + 25)}/100m` : "—",                                  pct: zdPct(0), time: "—", color: "var(--zone-1)" },
                    { z: "Z2", name: ` ${t("zone.endurance")}`, range: css ? `${secToMmss(css + 10)}–${secToMmss(css + 25)}/100m` : "—",            pct: zdPct(1), time: "—", color: "var(--zone-2)" },
                    { z: "Z3", name: ` ${t("zone.tempo")}`,  range: css ? `${secToMmss(css)}–${secToMmss(css + 10)}/100m` : "—",                  pct: zdPct(2), time: "—", color: "var(--zone-3)" },
                    { z: "Z4", name: ` ${t("zone.threshold")}`,  range: css ? `${secToMmss(css - 10)}–${secToMmss(css)}/100m` : "—",                  pct: zdPct(3), time: "—", color: "var(--zone-4)" },
                    { z: "Z5", name: " VO2",   range: css ? `< ${secToMmss(css - 10)}/100m` : "—",                                  pct: zdPct(4), time: "—", color: "var(--zone-5)" },
                  ]
                : [
                    { z: "Z1", name: ` ${t("zone.recovery")}`,  range: "< 55% FTP",    pct: zdPct(0), time: "—", color: "var(--zone-1)" },
                    { z: "Z2", name: ` ${t("zone.endurance")}`, range: "55–75% FTP",   pct: zdPct(1), time: "—", color: "var(--zone-2)" },
                    { z: "Z3", name: ` ${t("zone.tempo")}`,  range: "75–90% FTP",   pct: zdPct(2), time: "—", color: "var(--zone-3)" },
                    { z: "Z4", name: ` ${t("zone.threshold")}`,  range: "90–105% FTP",  pct: zdPct(3), time: "—", color: "var(--zone-4)" },
                    { z: "Z5", name: " VO2",   range: "> 105% FTP",   pct: zdPct(4), time: "—", color: "var(--zone-5)" },
                  ];
              const subLabel = discipline === "run" ? t("zoneDist.subRun") : discipline === "swim" ? t("zoneDist.subSwim") : t("zoneDist.subBike");
              const allNullPct = zones.every((z) => z.pct === null);
              return (
                <>
                  <SectionHeader title={t("zoneDist.title")} sub={subLabel} />
                  {zones.map((zone) => (
                    <div key={zone.z} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                      <div style={{ width: 60 }}>
                        <span style={{ color: zone.color, fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "var(--fs-xs)" }}>{zone.z}</span>
                        <span style={{ fontSize: "var(--fs-xs)" }}>{zone.name}</span>
                      </div>
                      <div style={{ width: 90, fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{zone.range}</div>
                      <div style={{ flex: 1, height: 18, background: "var(--bg-2)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
                        <div style={{ width: zone.pct != null ? `${zone.pct}%` : "0%", height: "100%", background: zone.color }} />
                      </div>
                      <div style={{ width: 40, textAlign: "right", fontSize: "var(--fs-sm)", fontFamily: "var(--font-mono)" }}>{zone.pct != null ? `${zone.pct}%` : "—"}</div>
                      <div style={{ width: 50, textAlign: "right", fontSize: "var(--fs-xs)", color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>{zone.time}</div>
                    </div>
                  ))}
                  {allNullPct && (
                    <div style={{ marginTop: 'var(--space-2)', fontSize: "var(--fs-xs)", color: "var(--ink-4)", textAlign: "center" }}>
                      {t("zoneDist.empty")}
                    </div>
                  )}
                </>
              );
            })()}
          </Card>

        </div>
        </DetailsSection>
      </div>
    </div>
  );
}

export default function FitnessPage() {
  const [searchParams] = useSearchParams();
  const model = useFitnessModel(searchParams.get("sport"), {
    decisionId: searchParams.get("decisionId"),
  });
  return <FitnessView model={model} />;
}
