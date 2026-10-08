import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { describePmcHistory, hasFitnessLoadLifecycle, pmcHistoryDeadline } from "../features/fitness/pmcHistory";
import {
  FITNESS_TIMESERIES_SCHEMA_VERSION,
  type FitnessTimeseriesDoc,
  type TimeseriesDiscipline,
} from "@shared/types/fitness-timeseries";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";

import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { Goal, FitnessProjection } from "@shared/types/goal";
import type { MilestoneId } from "@shared/types/milestone";
import { resolveBikeThresholdDecision } from "@shared/training/bikeThresholdDecision";
import { deriveEstimatedFtpProgression } from "@shared/training/ftpProgression";
import { hasDefinitiveRiderProfile } from "@shared/training/pdcRiderGate";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useToast } from "../contexts/ToastContext";
import { aggregateRecentZoneSeconds } from "../features/fitness/mobileFitnessMetrics";
import {
  authoritativeCombinedLoad,
  buildRunEvidence,
  buildSwimEvidence,
  computeCyclingAbility,
  computeIntegratedLoadFocus,
} from "../features/fitness/multisportPerformance";
import {
  buildCanonicalRiderFitnessView,
  cyclingAbilityFromCanonicalRider,
} from "../features/fitness/riderInsightParity";
import { useActivityDerivedDocuments } from "../features/fitness/useActivityDerivedDocuments";
import { activityDerivedDocumentRevision } from "../features/fitness/derivedDocumentReadAttempts";
import {
  makeDurationLabel,
  secToMmss,
  type RangeOption,
} from "../features/fitness/fitnessPageUtils";
import type { MobileFitnessData } from "../components/mobile/MobileFitnessPage";
import { useCoachRiderInsight } from "./useCoachRiderInsight";
import { useConsistencyStreak } from "./useConsistencyStreak";
import { useFitnessClock } from "./useFitnessClock";
import { useFitnessTimeseries } from "./useFitnessTimeseries";
import { useFreshTraining } from "./useFreshTraining";
import { useFtpHistory } from "./useFtpHistory";
import { useMilestones } from "./useMilestones";
import { useMobile } from "./useMobile";
import { usePdc } from "./usePdc";
import { useFitnessCurves } from "../features/fitness/useFitnessCurves";
import { useRunRecords } from "./useRunRecords";
import { useUserFitness } from "./useUserFitness";
import { filterByDiscipline, getDiscipline, type Discipline } from "../utils/disciplineFilter";
import { toLocalDate } from "../utils/dateUtils";
import {
  aggregateDailyLoad,
  ATL_DAYS,
  calculateFitness,
  CTL_DAYS,
  type ActivityLoadEntry,
  type DailyLoad,
  type FitnessPoint,
} from "../utils/fitnessMetrics";
import { acceptedActivityLoad } from "@shared/training/acceptedActivityLoad";
import { acceptedTrainingActivities } from "../utils/estimateTSS";
import { logClientError } from "../services/errorLogger";
import { useBikeFtpDecision } from "./useBikeFtpDecision";
import { useCanonicalFitnessSummary } from "./useCanonicalFitnessSummary";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { acceptBikeThresholdDecision } from "../services/bikeFtpDecisionClient";
import {
  clearTrainingSurfaceCache,
  getTrainingSurfaceCache,
  prepareTrainingSurfaceCacheOwner,
  setTrainingSurfaceCache,
} from "../embedded/trainingSurfaceCache";

export function resolveFitnessDiscipline(value: string | null | undefined): Discipline {
  return value === "bike" || value === "run" || value === "swim" || value === "tri"
    ? value
    : "bike";
}

export interface TriDisciplineFitness {
  fitness: FitnessPoint[];
  weeklyTSS: number | null;
  canonical: boolean;
  dailyData?: DailyLoad[];
  unknownCount?: number;
  weeklyUnknownCount?: number;
  hasKnownWeeklyLoad?: boolean;
}

export type TriFitnessBreakdown = Record<TimeseriesDiscipline, TriDisciplineFitness>;

export function normalizeFitnessRange(
  discipline: Discipline,
  range: RangeOption | 42,
): RangeOption | 42 {
  if (discipline === "tri" && range === 30) return 90;
  return discipline !== "tri" && range === 42 ? 90 : range;
}

export interface TriFitnessTimelinePoint {
  date: string;
  bike: FitnessPoint | null;
  run: FitnessPoint | null;
  swim: FitnessPoint | null;
  integrated: FitnessPoint;
}

export function buildTriFitnessTimeline(breakdown: TriFitnessBreakdown): TriFitnessTimelinePoint[] {
  const disciplines = ["bike", "run", "swim"] as const;
  const dayMs = 24 * 60 * 60 * 1000;
  const ctlDecay = 1 - 1 / CTL_DAYS;
  const atlDecay = 1 - 1 / ATL_DAYS;
  const round1 = (value: number) => Math.round(value * 10) / 10;
  const dates = Array.from(new Set(
    disciplines.flatMap((discipline) => breakdown[discipline].fitness.map((point) => point.date)),
  )).sort();
  const pointsByDiscipline = {
    bike: new Map(breakdown.bike.fitness.map((point) => [point.date, point])),
    run: new Map(breakdown.run.fitness.map((point) => [point.date, point])),
    swim: new Map(breakdown.swim.fitness.map((point) => [point.date, point])),
  };
  const previous: Record<TimeseriesDiscipline, { date: string; ctl: number; atl: number } | null> = {
    bike: null,
    run: null,
    swim: null,
  };
  return dates.map((date) => {
    const resolved = Object.fromEntries(disciplines.map((discipline) => {
      const exact = pointsByDiscipline[discipline].get(date);
      let point: FitnessPoint | null = exact ?? null;
      if (!exact && previous[discipline]) {
        const elapsedDays = Math.max(0, Math.round(
          (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previous[discipline]!.date}T00:00:00Z`)) / dayMs,
        ));
        const ctl = previous[discipline]!.ctl * Math.pow(ctlDecay, elapsedDays);
        const atl = previous[discipline]!.atl * Math.pow(atlDecay, elapsedDays);
        point = {
          date,
          ctl: round1(ctl),
          atl: round1(atl),
          tsb: round1(ctl - atl),
          dailyLoad: 0,
        };
        previous[discipline] = { date, ctl, atl };
      } else if (exact) {
        previous[discipline] = { date, ctl: exact.ctl, atl: exact.atl };
      }
      return [discipline, point];
    })) as Record<TimeseriesDiscipline, FitnessPoint | null>;
    const ctl = disciplines.reduce((sum, discipline) => sum + (resolved[discipline]?.ctl ?? 0), 0);
    const atl = disciplines.reduce((sum, discipline) => sum + (resolved[discipline]?.atl ?? 0), 0);
    const dailyLoad = disciplines.reduce((sum, discipline) => sum + (resolved[discipline]?.dailyLoad ?? 0), 0);
    return {
      date,
      ...resolved,
      integrated: {
        date,
        ctl: round1(ctl),
        atl: round1(atl),
        tsb: round1(ctl - atl),
        dailyLoad,
      },
    };
  });
}

function hasModernFitnessContract(timeseries: FitnessTimeseriesDoc | null): boolean {
  return timeseries !== null && ("loadSnapshot" in timeseries || "pmc" in timeseries || "inputInvalidatedAt" in timeseries);
}

function isCanonicalTimeseries(
  timeseries: FitnessTimeseriesDoc | null,
  discipline: TimeseriesDiscipline,
): boolean {
  if (!timeseries
    || !Array.isArray(timeseries.points)
    || timeseries.schemaVersion !== FITNESS_TIMESERIES_SCHEMA_VERSION
    || timeseries.discipline !== discipline
    || timeseries.pointCount !== timeseries.points.length) return false;
  if (hasModernFitnessContract(timeseries) && !hasFitnessLoadLifecycle(timeseries)) return false;
  if (timeseries.points.length === 0) {
    return timeseries.startDate === null && timeseries.endDate === null;
  }
  const orderedFinitePoints = (timeseries.points as unknown[]).every((candidate, index, points) => {
    if (typeof candidate !== "object" || candidate === null) return false;
    const point = candidate as Partial<FitnessPoint>;
    const previousPoint = points[index - 1] as Partial<FitnessPoint> | undefined;
    return typeof point.date === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(point.date)
      && (index === 0 || (typeof previousPoint?.date === "string" && previousPoint.date < point.date))
      && [point.ctl, point.atl, point.tsb, point.dailyLoad].every(Number.isFinite);
  });
  return orderedFinitePoints
    && timeseries.startDate === timeseries.points[0]?.date
    && timeseries.endDate === timeseries.points[timeseries.points.length - 1]?.date;
}

function calculateClientFitness(
  activities: Activity[],
  discipline: TimeseriesDiscipline,
  ftp?: number,
): { fitnessData: FitnessPoint[]; dailyData: DailyLoad[] } {
  const disciplineActivities = filterByDiscipline(acceptedTrainingActivities(activities, ftp), discipline);
  if (disciplineActivities.length === 0) return { fitnessData: [], dailyData: [] };
  const entries: ActivityLoadEntry[] = [];
  const unknownByDate = new Map<string, number>();
  for (const activity of disciplineActivities) {
    const load = acceptedActivityLoad(activity as unknown as Record<string, unknown>, discipline, ftp);
    if (!load.known) {
      const date = toLocalDate(activity.startTime);
      unknownByDate.set(date, (unknownByDate.get(date) ?? 0) + 1);
      continue;
    }
    entries.push({ date: toLocalDate(activity.startTime), load: load.value,
      source: load.source === "trimp" ? "trimp" : load.source === "time" ? "time" : "tss" });
  }
  entries.sort((left, right) => left.date.localeCompare(right.date));
  const today = toLocalDate(Date.now());
  const startDate = disciplineActivities.reduce((first, activity) => {
    const date = toLocalDate(activity.startTime);
    return date < first ? date : first;
  }, today);
  const dailyData = aggregateDailyLoad(entries, startDate, today).map(day => ({
    ...day, unknownCount: unknownByDate.get(day.date) ?? 0,
  }));
  // 확인된 부분합계는 보존하지만 불완전한 입력으로 PMC를 확정하지 않는다.
  return { fitnessData: unknownByDate.size ? [] : calculateFitness(dailyData), dailyData };
}

export function useFitnessModel(
  sportParam: string | null | undefined,
  options: { enableCoachRiderInsight?: boolean; decisionId?: string | null } = {},
) {
  const { t, i18n } = useTranslation("fitness");
  const durationLabel = makeDurationLabel(t);
  const { user, profile } = useAuth();
  const canonicalFitness = useCanonicalFitnessSummary("fitnessSummary");
  const canonicalPending = canonicalFitness.rolloutState === "pending";
  const canonicalActive = canonicalFitness.rolloutState === "on";
  const { firestore } = useFirebaseServices();
  const { entries: ftpHistory } = useFtpHistory(user?.uid);
  const { showToast } = useToast();
  const discipline = resolveFitnessDiscipline(sportParam);
  const [range, setRange] = useState<RangeOption | 42>(90);
  const normalizedRange = normalizeFitnessRange(discipline, range);
  const activityQueryRange = discipline === "tri" ? 365 : normalizedRange;
  const cacheLocale = options.enableCoachRiderInsight === false
    ? (i18n.resolvedLanguage ?? i18n.language)
    : null;
  const cacheKey = user && cacheLocale
    ? {
      uid: user.uid,
      surface: "fitness" as const,
      sport: discipline,
      locale: cacheLocale,
      range: activityQueryRange,
    }
    : null;
  const [initialCache] = useState(() => cacheKey
    && prepareTrainingSurfaceCacheOwner(user!.uid, user!.isAnonymous === true)
    ? getTrainingSurfaceCache<{ activities: Activity[] }>(cacheKey)
    : null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const activityDataKey = user
    ? `${user.uid}\u0000${discipline}\u0000${cacheLocale ?? "uncached"}\u0000${activityQueryRange}`
    : null;
  const [activityState, setActivityState] = useState<{ key: string | null; items: Activity[] }>({
    key: activityDataKey,
    items: initialCache?.activities ?? [],
  });
  const activities = canonicalPending
    ? []
    : activityState.key === activityDataKey ? activityState.items : [];
  const disciplineActivities = useMemo(
    () => discipline === "tri" ? activities : filterByDiscipline(activities, discipline),
    [activities, discipline],
  );
  const { fitness: userFitness } = useUserFitness(!!user);
  const latestActivityStart = activities.reduce((latest, activity) => Math.max(latest, activity.startTime), 0);
  const activityRefreshKey = `${activities.length}:${latestActivityStart}`;
  const fitnessClock = useFitnessClock(userFitness?.updatedAt, activityRefreshKey);
  // 활동 이력/PMC의 긴 조회 창은 유지하되 metrics는 실제 카드의 최대 소비 창만 읽는다.
  // 파워 비교는 28일 두 구간, 수영 근거는 90일이며 철인은 활동 종목별 창을 적용한다.
  const metricActivities = useMemo(() => activities.filter((activity) => {
    const windowDays = discipline === "swim"
      || (discipline === "tri" && getDiscipline(activity.type) === "swim") ? 90 : 56;
    return activity.startTime >= fitnessClock - windowDays * 86_400_000
      && activity.startTime <= fitnessClock;
  }), [activities, discipline, fitnessClock]);
  const { metricsMap, metricStatusMap } = useActivityDerivedDocuments(user?.uid, metricActivities);
  const currentMetricStatuses = (discipline === "tri"
    ? metricActivities
    : filterByDiscipline(metricActivities, discipline)).map((activity) => {
    const status = metricStatusMap.get(activity.id);
    return status?.revision === activityDerivedDocumentRevision(activity) ? status.state : "loading";
  });
  const derivedMetricsSettled = currentMetricStatuses.every((status) => status !== "loading");
  const derivedMetricsError = currentMetricStatuses.some((status) => status === "error");
  const [loading, setLoading] = useState(initialCache === null);
  const [cacheHit, setCacheHit] = useState(initialCache !== null);
  const [freshLoaded, setFreshLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);
  const [projection, setProjection] = useState<FitnessProjection | null>(null);
  const [, setGoalQueryDone] = useState(false);
  const isMobile = useMobile();
  const { pdc } = usePdc(user?.uid);
  const { run: runPaceCurve, swim: swimCssCurve } = useFitnessCurves(user?.uid);
  // 다음 라이드 FTP 브리핑(#837) — 결정 문서를 구독하고 수락만 수행한다.
  // 임베드 표면은 decisionId 를 넘기지 않아 딥링크로 특정 결정을 열지 않는다.
  const {
    decision: bikeFtpDecision,
    receipt: bikeFtpReceipt,
    deviceReceipts: bikeFtpDeviceReceipts,
  } = useBikeFtpDecision({
    uid: user?.uid,
    decisionId: options.decisionId ?? null,
    enabled: discipline === "bike",
  });
  const riderInsightEnabled = options.enableCoachRiderInsight !== false
    && getRuntimeConfig().coachRiderInsightEnabled === true
    && discipline === "bike";
  const { insight: coachRiderInsight } = useCoachRiderInsight(user?.uid, riderInsightEnabled);
  // 연속 기록은 이미 읽은 체력 기간 활동으로 계산한다 — 기간이 연속 기록 기간(97일)을 덮을 때만.
  // 예전에는 화면을 열 때마다 최근 등록 200건을 따로 읽었다 (#1028).
  const streakPreload = useMemo(() => ({
    activities,
    coversSinceMs: Date.now() - (activityQueryRange + 42) * 24 * 60 * 60 * 1000,
    ready: !canonicalPending && !loading && activityState.key === activityDataKey,
  }), [activities, activityQueryRange, canonicalPending, loading, activityState.key, activityDataKey]);
  const { summary: consistencyStreak } = useConsistencyStreak(user?.uid, streakPreload);
  useEffect(() => {
    if (normalizedRange !== range) setRange(normalizedRange);
  }, [normalizedRange, range]);

  const canonicalFtpW = profile?.ftp ?? null;
  const thresholdDecision = useMemo(
    () => resolveBikeThresholdDecision(canonicalFtpW, pdc),
    [canonicalFtpW, pdc],
  );

  async function acceptFtpDecision() {
    if (!user || !bikeFtpDecision || decisionBusy) return;
    setDecisionBusy(true);
    try {
      await acceptBikeThresholdDecision(user.uid, bikeFtpDecision);
      showToast(t("ftpDecision.accepted"));
    } catch (acceptError) {
      logClientError("useFitnessModel.acceptBikeThresholdDecision", acceptError, {
        decisionId: bikeFtpDecision.decisionId,
      });
      showToast(t("ftpDecision.acceptFailed"), "error");
    } finally {
      setDecisionBusy(false);
    }
  }

  const { run: runRecords } = useRunRecords(discipline === "run");
  const { achieved: milestones, markCelebrated } = useMilestones(discipline === "run");
  const [dismissedMilestones, setDismissedMilestones] = useState<ReadonlySet<MilestoneId>>(new Set());
  const pendingMilestone = useMemo(() => {
    for (const milestone of milestones.values()) {
      if (!milestone.celebrated && !dismissedMilestones.has(milestone.id)) return milestone.id;
    }
    return null;
  }, [dismissedMilestones, milestones]);

  const { revalidating, justRecomputed } = useFreshTraining(
    discipline,
  );
  const projUnsubRef = useRef<(() => void) | null>(null);
  const projectionGoalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      clearTrainingSurfaceCache();
      setActivityState({ key: null, items: [] });
      setLoading(false);
      setCacheHit(false);
      setFreshLoaded(true);
      return undefined;
    }
    if (canonicalPending) {
      // 판정 전에는 legacy 계산 입력도 canonical API도 시작하지 않는다.
      setActivityState({ key: activityDataKey, items: [] });
      setLoading(true);
      setCacheHit(false);
      setFreshLoaded(false);
      setError(null);
      return undefined;
    }
    const uid = user.uid;
    let active = true;
    const nextCacheKey = cacheLocale
      ? {
        uid,
        surface: "fitness" as const,
        sport: discipline,
        locale: cacheLocale,
        range: activityQueryRange,
      }
      : null;
    const cacheEnabled = nextCacheKey !== null
      && prepareTrainingSurfaceCacheOwner(uid, user.isAnonymous === true);
    const cached = cacheEnabled
      ? getTrainingSurfaceCache<{ activities: Activity[] }>(nextCacheKey)
      : null;
    setActivityState({ key: activityDataKey, items: cached?.activities ?? [] });
    setError(null);
    setLoading(cached === null);
    setCacheHit(cached !== null);
    setFreshLoaded(false);
    const cutoff = Date.now() - (activityQueryRange + 42) * 24 * 60 * 60 * 1000;
    const activitiesQuery = query(
      collection(firestore, "activities"),
      where("userId", "==", uid),
      where("deletedAt", "==", null),
      where("startTime", ">=", cutoff),
      orderBy("startTime", "asc"),
    );
    const unsubscribe = onSnapshot(
      activitiesQuery,
      (snapshot) => {
        if (!active) return;
        try {
          const items = snapshot.docs
            .map((entry) => ({ id: entry.id, ...entry.data() }) as Activity)
            .filter((activity) => activity.userId === uid);
          setActivityState({ key: activityDataKey, items });
          setLoading(false);
          setFreshLoaded(true);
          if (cacheEnabled) setTrainingSurfaceCache(nextCacheKey, { activities: items });
        } catch (snapshotError) {
          if (cached === null) {
            setError(snapshotError instanceof Error ? snapshotError.message : t("error.loadFailed"));
          }
          setLoading(false);
          setFreshLoaded(cached === null);
        }
      },
      (subscriptionError) => {
        if (!active) return;
        logClientError("FitnessPage.activitiesSubscription", subscriptionError, { range: activityQueryRange });
        if (cached === null) setError(t("error.loadFailed"));
        setLoading(false);
        setFreshLoaded(cached === null);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activityDataKey, activityQueryRange, cacheLocale, canonicalPending, discipline, firestore, reloadKey, t, user]);

  const retryLoad = useCallback(() => {
    setError(null);
    setLoading(true);
    setReloadKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!user || discipline === "tri") return undefined;
    setActiveGoal(null);
    setProjection(null);
    setGoalQueryDone(false);
    if (projUnsubRef.current) {
      projUnsubRef.current();
      projUnsubRef.current = null;
    }
    const goalQuery = query(
      collection(firestore, "goals"),
      where("userId", "==", user.uid),
      where("status", "==", "active"),
      where("discipline", "==", discipline),
      limit(1),
    );
    const goalUnsubscribe = onSnapshot(
      goalQuery,
      (goalSnapshot) => {
        if (goalSnapshot.empty) {
          setActiveGoal(null);
          setGoalQueryDone(true);
          if (projUnsubRef.current) {
            projUnsubRef.current();
            projUnsubRef.current = null;
          }
          projectionGoalIdRef.current = null;
          return;
        }
        const goalDocument = goalSnapshot.docs[0]!;
        const nextGoal = { id: goalDocument.id, ...goalDocument.data() } as Goal;
        setActiveGoal(nextGoal);
        setGoalQueryDone(true);
        if (projectionGoalIdRef.current !== nextGoal.id) {
          if (projUnsubRef.current) projUnsubRef.current();
          projectionGoalIdRef.current = nextGoal.id;
          projUnsubRef.current = onSnapshot(
            doc(firestore, "users", user.uid, "fitness", `projection_${discipline}`),
            (snapshot) => {
              if (!snapshot.exists()) return;
              const nextProjection = snapshot.data() as FitnessProjection;
              if (nextProjection.goalId === nextGoal.id) setProjection(nextProjection);
            },
            (projectionError) => logClientError("FitnessPage.projectionSubscription", projectionError, {
              discipline,
              goalId: nextGoal.id,
            }),
          );
        }
      },
      (goalError) => {
        logClientError("FitnessPage.goalSubscription", goalError, { discipline });
        setGoalQueryDone(true);
      },
    );
    return () => {
      goalUnsubscribe();
      if (projUnsubRef.current) {
        projUnsubRef.current();
        projUnsubRef.current = null;
      }
      projectionGoalIdRef.current = null;
    };
  }, [discipline, firestore, user]);

  const clientFitness = useMemo(
    () => canonicalActive || canonicalPending || discipline === "tri"
      ? { fitnessData: [], dailyData: [] }
      : calculateClientFitness(activities, discipline, canonicalFtpW ?? undefined),
    [activities, canonicalActive, canonicalPending, canonicalFtpW, discipline],
  );
  const selectedTimeseriesDiscipline = discipline === "tri" ? "bike" : discipline;
  const {
    timeseries,
    loaded: selectedTimeseriesLoaded,
    error: selectedTimeseriesError,
    cacheHit: selectedTimeseriesCacheHit,
    freshLoaded: selectedTimeseriesFreshLoaded,
  } = useFitnessTimeseries(
    canonicalActive || canonicalPending ? undefined : user?.uid,
    selectedTimeseriesDiscipline,
    reloadKey,
    cacheLocale ?? undefined,
    user?.isAnonymous === true,
  );
  const triUid = discipline === "tri" && !canonicalActive && !canonicalPending ? user?.uid : undefined;
  const {
    timeseries: triRunTimeseries,
    loaded: triRunTimeseriesLoaded,
    error: triRunTimeseriesError,
    cacheHit: triRunTimeseriesCacheHit,
    freshLoaded: triRunTimeseriesFreshLoaded,
  } = useFitnessTimeseries(triUid, "run", reloadKey, cacheLocale ?? undefined, user?.isAnonymous === true);
  const {
    timeseries: triSwimTimeseries,
    loaded: triSwimTimeseriesLoaded,
    error: triSwimTimeseriesError,
    cacheHit: triSwimTimeseriesCacheHit,
    freshLoaded: triSwimTimeseriesFreshLoaded,
  } = useFitnessTimeseries(triUid, "swim", reloadKey, cacheLocale ?? undefined, user?.isAnonymous === true);
  const canonicalProcessing = canonicalActive
    && canonicalFitness.values === null
    && (canonicalFitness.display === null || canonicalFitness.display === "loading");
  const timeseriesLoaded = canonicalPending
    ? false
    : canonicalActive
    ? !canonicalProcessing
    : selectedTimeseriesLoaded && (discipline !== "tri" || (triRunTimeseriesLoaded && triSwimTimeseriesLoaded));
  const timeseriesError = canonicalActive && canonicalFitness.status === "failed"
    ? t("canonical.errorBody")
    : selectedTimeseriesError ?? (discipline === "tri" ? triRunTimeseriesError ?? triSwimTimeseriesError : null);
  const timeseriesCacheHit = selectedTimeseriesCacheHit
    && (discipline !== "tri" || (triRunTimeseriesCacheHit && triSwimTimeseriesCacheHit));
  const timeseriesFreshLoaded = selectedTimeseriesFreshLoaded
    && (discipline !== "tri" || (triRunTimeseriesFreshLoaded && triSwimTimeseriesFreshLoaded));
  const apiTimeseries = canonicalFitness.values?.timeseries ?? null;
  const selectedApiTimeseries = discipline === "tri" ? apiTimeseries?.bike ?? null : apiTimeseries?.[discipline] ?? null;
  const hasCanonicalTimeseries = Boolean(discipline !== "tri" && (
    canonicalActive
      ? isCanonicalTimeseries(selectedApiTimeseries, discipline)
      : isCanonicalTimeseries(timeseries, discipline)
  ));
  const canonicalWeeklySummaries = useMemo(() => Object.fromEntries((["bike", "run", "swim"] as const).map(sport => {
    const summary = canonicalFitness.values?.weeklySummaries?.[sport];
    const current = summary
      && new Date(summary.computedAt).toISOString().slice(0, 10) === new Date(fitnessClock).toISOString().slice(0, 10);
    return [sport, current ? summary.totalTss : null];
  })) as Record<TimeseriesDiscipline, number | null>, [canonicalFitness.values, fitnessClock]);
  const resolvedTriFitness = useMemo<TriFitnessBreakdown>(() => {
    const resolve = (
      triDiscipline: TimeseriesDiscipline,
      canonical: FitnessTimeseriesDoc | null,
    ): TriDisciplineFitness => {
      const apiCanonical = canonicalActive ? apiTimeseries?.[triDiscipline] ?? null : canonical;
      const hasCanonical = isCanonicalTimeseries(apiCanonical, triDiscipline);
      const fallback = !hasCanonical && !canonicalActive && !canonicalPending && !hasModernFitnessContract(apiCanonical)
        ? calculateClientFitness(activities, triDiscipline, canonicalFtpW ?? undefined) : null;
      const fitness = hasCanonical
        ? apiCanonical!.points
        : fallback?.fitnessData ?? [];
      const dailyData: DailyLoad[] = fallback?.dailyData ?? fitness.map(point => ({date:point.date,totalLoad:point.dailyLoad,activities:[]}));
      const today = hasCanonical ? new Date(fitnessClock).toISOString().slice(0, 10) : toLocalDate(fitnessClock);
      const weekStartDate = new Date(fitnessClock);
      if (hasCanonical) weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 6);
      else weekStartDate.setDate(weekStartDate.getDate() - 6);
      const weekStart = hasCanonical ? weekStartDate.toISOString().slice(0, 10) : toLocalDate(weekStartDate.getTime());
      const recentDays = dailyData.filter(day => day.date >= weekStart && day.date <= today);
      return {
        fitness,
        dailyData,
        weeklyUnknownCount: recentDays.reduce((sum, day) => sum + (day.unknownCount ?? 0), 0),
        hasKnownWeeklyLoad: canonicalActive && !hasCanonical ? canonicalWeeklySummaries[triDiscipline] !== null : recentDays.some(day =>
          day.activities.length > 0 || day.totalLoad > 0 || (!day.unknownCount && (hasCanonical || fitness.length > 0))),
        unknownCount: dailyData.reduce((sum, day) => sum + (day.unknownCount ?? 0), 0),
        weeklyTSS: canonicalActive && !hasCanonical
          ? canonicalWeeklySummaries[triDiscipline]
          : recentDays.reduce((sum, day) => sum + day.totalLoad, 0),
        canonical: hasCanonical,
      };
    };
    return {
      bike: resolve("bike", timeseries),
      run: resolve("run", triRunTimeseries),
      swim: resolve("swim", triSwimTimeseries),
    };
  }, [activities, apiTimeseries, canonicalActive, canonicalFitness.values, canonicalPending, canonicalFtpW, canonicalWeeklySummaries, fitnessClock, timeseries, triRunTimeseries, triSwimTimeseries]);
  const triFitnessTimeline = useMemo(
    // API는 현재 통합값만 제공하고 통합 과거 시계열은 제공하지 않는다. canonical ON에서
    // 브라우저가 종목별 CTL을 합산해 새 정본을 만들지 않는다.
    () => canonicalActive || Object.values(resolvedTriFitness).some(entry => entry.unknownCount) ? [] : buildTriFitnessTimeline(resolvedTriFitness),
    [canonicalActive, resolvedTriFitness],
  );
  // 주간 부하는 각 종목의 원본 날짜 기준(정본 UTC, 클라이언트 local)으로 확정한다.
  const triFitnessBreakdown = resolvedTriFitness;
  const { fitnessData, dailyData } = useMemo<{ fitnessData: FitnessPoint[]; dailyData: DailyLoad[] }>(() => {
    if (discipline === "tri" && Object.values(resolvedTriFitness).some(entry => entry.unknownCount)) {
      const days = new Map<string, DailyLoad>();
      for (const entry of Object.values(resolvedTriFitness)) for (const day of entry.dailyData ?? []) {
        const current = days.get(day.date) ?? { date: day.date, totalLoad: 0, activities: [], unknownCount: 0 };
        days.set(day.date, { ...current, totalLoad: current.totalLoad + day.totalLoad,
          activities: [...current.activities, ...day.activities], unknownCount: (current.unknownCount ?? 0) + (day.unknownCount ?? 0) });
      }
      return { fitnessData: [], dailyData: [...days.values()].sort((a,b) => a.date.localeCompare(b.date)) };
    }
    const points = discipline === "tri"
      ? triFitnessTimeline.map((point) => point.integrated)
      : hasCanonicalTimeseries
        ? (canonicalActive ? selectedApiTimeseries?.points : timeseries?.points)
        : undefined;
    if (points) {
      return {
        fitnessData: points,
        dailyData: points.map((point) => ({
          date: point.date,
          totalLoad: point.dailyLoad,
          activities: [] as DailyLoad["activities"],
        })),
      };
    }
    // 현대 서버 계약이 손상된 경우 브라우저 재계산으로 오류를 감추지 않는다.
    if (hasModernFitnessContract(timeseries)) return { fitnessData: [], dailyData: [] };
    return clientFitness;
  }, [canonicalActive, clientFitness, discipline, hasCanonicalTimeseries, resolvedTriFitness, selectedApiTimeseries, timeseries, triFitnessTimeline]);
  // 장기 PMC는 기존 일별 값만 요약한다. 페이지 range / 활동 상세 조회 범위와 독립이다.
  const hasCanonicalHistory = discipline === "tri"
    ? Object.values(resolvedTriFitness).every((entry) => entry.canonical)
    : hasCanonicalTimeseries;
  const [pmcHistoryTick, setPmcHistoryTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const deadlines = [timeseries, triRunTimeseries, triSwimTimeseries]
      .map(pmcHistoryDeadline).filter((deadline): deadline is number => deadline !== null && deadline >= now);
    if (!deadlines.length) return;
    const timer = setTimeout(() => setPmcHistoryTick(Date.now()), Math.min(...deadlines) - now + 1);
    return () => clearTimeout(timer);
  }, [timeseries, triRunTimeseries, triSwimTimeseries, pmcHistoryTick]);
  const pmcHistoryPoints = useMemo(() => {
    if (canonicalActive && discipline === "tri") return [];
    const source = (doc: FitnessTimeseriesDoc | null, sport: TimeseriesDiscipline) => doc?.discipline === sport
      && (isCanonicalTimeseries(doc, sport) || hasModernFitnessContract(doc)) ? doc : null;
    const historyValues = !canonicalActive && discipline !== "tri" && hasModernFitnessContract(timeseries)
      ? (Array.isArray(timeseries?.points) ? timeseries.points.filter((point) => point && typeof point.date === "string"
        && [point.ctl, point.atl, point.tsb, point.dailyLoad].every(Number.isFinite)) : []) : fitnessData;
    return describePmcHistory(historyValues,
    discipline === "tri" ? [
      source(timeseries, "bike"), source(triRunTimeseries, "run"), source(triSwimTimeseries, "swim"),
    ] : [source(timeseries, discipline)], Math.max(pmcHistoryTick, Date.now()));
  }, [canonicalActive, fitnessData, discipline, timeseries, triRunTimeseries, triSwimTimeseries, pmcHistoryTick]);
  const rangeData = useMemo(() => {
    return { fitness: fitnessData.slice(-range), daily: dailyData.slice(-range) };
  }, [dailyData, fitnessData, range]);
  const canonicalCurrent = canonicalActive && canonicalFitness.values
    ? discipline === "tri"
      ? canonicalFitness.values
      : canonicalFitness.values.breakdown[discipline]
    : null;
  const canonicalCurrentPoint = canonicalCurrent
    ? {
      date: toLocalDate(canonicalFitness.values?.asOf ?? Date.now()),
      ctl: canonicalCurrent.ctl,
      atl: canonicalCurrent.atl,
      tsb: canonicalCurrent.tsb,
      dailyLoad: 0,
    }
    : null;
  const currentPoint = canonicalCurrentPoint ?? rangeData.fitness[rangeData.fitness.length - 1] ?? null;
  const rangeStartPoint = rangeData.fitness[0] ?? null;

  const powerCurveProgressions = useMemo(() => {
    const durationSeconds: Record<string, number> = {
      "1s": 1, "5s": 5, "10s": 10, "30s": 30, "1m": 60, "2m": 120,
      "5m": 300, "10m": 600, "20m": 1200, "30m": 1800, "1h": 3600,
    };
    const now = Date.now();
    const period = 28 * 24 * 60 * 60 * 1000;
    const aggregate = (items: ActivityMetrics[]) => {
      const maxima: Record<string, number> = {};
      for (const metrics of items) {
        if (!metrics.mmp) continue;
        for (const [key, value] of Object.entries(metrics.mmp)) {
          if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
          if (!(key in maxima) || value > maxima[key]!) maxima[key] = value;
        }
      }
      return Object.entries(maxima)
        .map(([key, value]) => ({ durationSeconds: durationSeconds[key] ?? 0, maxPower: Math.round(value) }))
        .filter((point) => point.durationSeconds > 0)
        .sort((left, right) => left.durationSeconds - right.durationSeconds);
    };
    const recent: ActivityMetrics[] = [];
    const previous: ActivityMetrics[] = [];
    for (const activity of disciplineActivities) {
      const metrics = metricsMap.get(activity.id);
      if (!metrics) continue;
      if (activity.startTime >= now - period) recent.push(metrics);
      else if (activity.startTime >= now - period * 2) previous.push(metrics);
    }
    return [
      { label: t("period.recent"), color: "var(--lime)", points: aggregate(recent) },
      { label: t("period.previous"), color: "var(--ink-3)", points: aggregate(previous) },
    ];
  }, [disciplineActivities, metricsMap, t]);

  const weeklyStats = useMemo(() => {
    // 기록점 개수가 아닌 현재 날짜까지의 실제 달력 창을 사용한다. 서버 날짜는 UTC,
    // 클라이언트 계산 날짜는 로컬이며 통합 화면도 각 종목의 날짜 근거를 유지한다.
    const sources = discipline === "tri"
      ? Object.entries(resolvedTriFitness).map(([sport, entry]) => ({ days: entry.dailyData ?? [], canonical: entry.canonical, weekly: canonicalActive && !entry.canonical ? canonicalWeeklySummaries[sport as TimeseriesDiscipline] : undefined }))
      : [{ days: dailyData, canonical: hasCanonicalTimeseries, weekly: canonicalActive && !hasCanonicalTimeseries ? canonicalWeeklySummaries[discipline] : undefined }];
    const recent = new Map<number, { load: number; unknown: number; known: boolean }>();
    for (const source of sources) {
      const today = source.canonical ? new Date(fitnessClock).toISOString().slice(0, 10) : toLocalDate(fitnessClock);
      const todayDate = Date.parse(`${today}T00:00:00Z`);
      for (const day of source.days) {
        const offset = (todayDate - Date.parse(`${day.date}T00:00:00Z`)) / 86_400_000;
        if (!Number.isInteger(offset) || offset < 0 || offset >= 42) continue;
        const previous = recent.get(offset) ?? { load: 0, unknown: 0, known: false };
        recent.set(offset, {
          load: previous.load + day.totalLoad,
          unknown: previous.unknown + (day.unknownCount ?? 0),
          known: previous.known || day.activities.length > 0 || day.totalLoad > 0 || (source.canonical && !day.unknownCount),
        });
      }
    }
    const thisWeek = [...recent].filter(([offset]) => offset < 7).map(([, day]) => day);
    const allDays = [...recent.values()];
    const weekCount = Math.max(1, Math.ceil((Math.max(-1, ...recent.keys()) + 1) / 7));
    const summarySources = sources.filter(source => source.weekly !== undefined);
    const knownSummaries = summarySources.flatMap(source => source.weekly === null ? [] : [source.weekly!]);
    const summaryLoad = knownSummaries.reduce((sum, load) => sum + load, 0);
    const hasKnownThisWeek = thisWeek.some(day => day.known) || knownSummaries.length > 0;
    const hasKnownRecent = allDays.some(day => day.known) || knownSummaries.length > 0;
    const unknownSummaryOnly = summarySources.length > 0 && !hasKnownThisWeek;
    let restDays = 0;
    // 날짜가 빠졌거나 부하가 미확인이면 확인된 연속 휴식일로 연장하지 않는다.
    while (restDays < 42 && summarySources.length === 0) {
      const day = recent.get(restDays);
      if (!day || day.load !== 0 || day.unknown || !day.known) break;
      restDays += 1;
    }
    return {
      thisWeekTSS: unknownSummaryOnly ? null : thisWeek.reduce((sum, day) => sum + day.load, 0) + summaryLoad,
      avgWeekTSS: summarySources.length > 0 ? null : Math.round(allDays.reduce((sum, day) => sum + day.load, 0) / weekCount),
      restDays: summarySources.length > 0 ? null : restDays,
      partial: summarySources.length > 0,
      thisWeekUnknownCount: thisWeek.reduce((sum, day) => sum + day.unknown, 0),
      unknownCount: allDays.reduce((sum, day) => sum + day.unknown, 0),
      hasKnownLoad: hasKnownRecent,
      hasKnownThisWeekLoad: hasKnownThisWeek,
      weeklyTSS: summarySources.length > 0
        ? (hasKnownThisWeek ? [thisWeek.reduce((sum, day) => sum + day.load, 0) + summaryLoad] : [])
        : [3, 2, 1, 0].map(week => Math.round([...recent].reduce((sum, [offset, day]) =>
          sum + (offset >= week * 7 && offset < (week + 1) * 7 ? day.load : 0), 0) + (week === 0 ? summaryLoad : 0))),
    };
  }, [canonicalActive, canonicalWeeklySummaries, dailyData, discipline, fitnessClock, hasCanonicalTimeseries, resolvedTriFitness]);
  const zoneDistribution = useMemo(() => {
    const { counts, total } = aggregateRecentZoneSeconds(
      disciplineActivities,
      metricsMap,
      "hrZoneSec",
      fitnessClock,
      30,
    );
    return total === 0 ? null : counts.map((count) => Math.round((count / total) * 100));
  }, [disciplineActivities, fitnessClock, metricsMap]);
  const mobileZoneDistribution = useMemo(() => {
    const { counts, total } = aggregateRecentZoneSeconds(
      disciplineActivities,
      metricsMap,
      "hrZoneSec",
      fitnessClock,
    );
    return total === 0 ? null : counts.map((count) => Math.round((count / total) * 100));
  }, [disciplineActivities, fitnessClock, metricsMap]);
  const combinedLoad = useMemo(() => {
    if (canonicalActive) {
      const current = canonicalFitness.values;
      if (!current) return null;
      return {
        ctl: current.ctl,
        atl: current.atl,
        tsb: current.tsb,
        contributions: (["bike", "run", "swim"] as const).map((contributionDiscipline) => ({
          discipline: contributionDiscipline,
          ctl: current.breakdown[contributionDiscipline].ctl,
        })),
      };
    }
    if (discipline === "tri") {
      const latest = triFitnessTimeline[triFitnessTimeline.length - 1];
      if (!latest) return null;
      const ctl = latest.integrated.ctl;
      const atl = latest.integrated.atl;
      return {
        ctl,
        atl,
        tsb: latest.integrated.tsb,
        contributions: (["bike", "run", "swim"] as const).map((contributionDiscipline) => ({
          discipline: contributionDiscipline,
          ctl: latest?.[contributionDiscipline]?.ctl ?? 0,
        })),
      };
    }
    return authoritativeCombinedLoad(userFitness, fitnessClock);
  }, [canonicalActive, canonicalFitness.values, discipline, fitnessClock, triFitnessTimeline, userFitness]);
  const integratedLoadFocus = useMemo(
    () => canonicalActive ? null : computeIntegratedLoadFocus(activities, metricsMap, fitnessClock),
    [activities, canonicalActive, fitnessClock, metricsMap],
  );
  const canonicalRiderView = useMemo(
    () => buildCanonicalRiderFitnessView(pdc, coachRiderInsight),
    [coachRiderInsight, pdc],
  );
  const mayUsePersistedPdcFallback = !riderInsightEnabled || coachRiderInsight === null;
  const cyclingAbility = useMemo(
    () => cyclingAbilityFromCanonicalRider(canonicalRiderView)
      ?? (mayUsePersistedPdcFallback ? computeCyclingAbility(pdc) : null),
    [canonicalRiderView, mayUsePersistedPdcFallback, pdc],
  );
  const runEvidence = useMemo(
    () => buildRunEvidence(userFitness?.thresholds?.run?.thresholdPace ?? profile?.thresholdPace, runRecords),
    [profile?.thresholdPace, runRecords, userFitness],
  );
  const swimEvidence = useMemo(
    () => buildSwimEvidence(
      userFitness?.thresholds?.swim?.css ?? profile?.css,
      activities,
      metricsMap,
      fitnessClock,
    ),
    [activities, fitnessClock, metricsMap, profile?.css, userFitness],
  );

  const mobilePageData = useMemo<MobileFitnessData>(() => {
    const ftp = canonicalFtpW ?? 0;
    const pmcHistory = rangeData.fitness.map((point) => ({
      ctl: point.ctl,
      atl: point.atl,
      tsb: point.tsb,
      date: point.date,
    }));
    const weeklyTSS = weeklyStats.weeklyTSS;
    const { counts: powerZoneCounts, total: powerSamples } = discipline === "bike"
      ? aggregateRecentZoneSeconds(disciplineActivities, metricsMap, "powerZoneSec", fitnessClock)
      : { counts: [0, 0, 0, 0, 0, 0, 0], total: 0 };
    const hrFractions = mobileZoneDistribution ?? [0, 0, 0, 0, 0];
    const maxHr = profile?.maxHr ?? 200;
    let zoneSource: MobileFitnessData["zoneSource"] = "none";
    let zones: MobileFitnessData["zones"] = [];
    if (discipline === "bike" && (powerSamples > 0 || (ftp > 0 && mobileZoneDistribution))) {
      let percentages = [0, 0, 0, 0, 0, 0, 0];
      if (powerSamples > 0) {
        zoneSource = "power";
        percentages = powerZoneCounts.map((count) => Math.round((count / powerSamples) * 100));
      } else if (mobileZoneDistribution) {
        zoneSource = "hr";
        percentages = [...hrFractions, 0, 0];
      }
      if (zoneSource !== "none") {
        zones = [
          { name: t("zone.recovery"), pct: percentages[0]!, color: "var(--ink-3)", rangeLabel: "", percentLabel: "" },
          { name: t("zone.endurance"), pct: percentages[1]!, color: "var(--aqua)", rangeLabel: "", percentLabel: "" },
          { name: t("zone.tempo"), pct: percentages[2]!, color: "var(--lime)", rangeLabel: "", percentLabel: "" },
          { name: t("zone.threshold"), pct: percentages[3]!, color: "var(--amber)", rangeLabel: "", percentLabel: "" },
          { name: "VO₂max", pct: percentages[4]!, color: "var(--rose)", rangeLabel: "", percentLabel: "" },
          { name: t("zone.anaerobic"), pct: percentages[5]!, color: "var(--zone-5)", rangeLabel: "", percentLabel: "" },
          { name: t("zone.neuromuscular"), pct: percentages[6]!, color: "var(--zone-5)", rangeLabel: "", percentLabel: "" },
        ];
      }
    } else if (mobileZoneDistribution) {
      zoneSource = "hr";
      const bounds = [{ lo: 0, hi: 60 }, { lo: 60, hi: 70 }, { lo: 70, hi: 80 }, { lo: 80, hi: 90 }, { lo: 90, hi: 100 }];
      const colors = ["var(--ink-3)", "var(--aqua)", "var(--lime)", "var(--amber)", "var(--rose)"];
      const names = [t("hrZone.recovery"), t("hrZone.endurance"), t("hrZone.tempo"), t("hrZone.threshold"), t("hrZone.vo2max")];
      zones = bounds.map((bound, index) => ({
        name: names[index]!,
        pct: hrFractions[index] ?? 0,
        color: colors[index]!,
        rangeLabel: `${Math.round(maxHr * bound.lo / 100)}–${Math.round(maxHr * bound.hi / 100)} bpm`,
        percentLabel: `${bound.lo}–${bound.hi}% maxHR`,
      }));
    }
    const recentPowerCurve = powerCurveProgressions.find((item) => item.label === t("period.recent"));
    const powerCurve = recentPowerCurve?.points
      .filter((point) => point.maxPower > 0)
      .map((point) => ({ durationSeconds: point.durationSeconds, maxPower: Math.round(point.maxPower) }));
    let threshold: MobileFitnessData["threshold"] = null;
    if (discipline === "run" && profile?.thresholdPace) {
      threshold = { label: t("mobile.threshold.runLabel"), value: secToMmss(profile.thresholdPace), unit: "/km", sub: t("mobile.threshold.runSub") };
    } else if (discipline === "swim" && profile?.css) {
      threshold = { label: "CSS", value: secToMmss(profile.css), unit: "/100m", sub: t("mobile.threshold.swimSub") };
    } else if (ftp > 0) {
      threshold = { label: "FTP", value: String(ftp), unit: "W", sub: t("mobile.threshold.bikeSub") };
    }
    return {
      ctl: currentPoint?.ctl ?? 0,
      atl: currentPoint?.atl ?? 0,
      tsb: currentPoint?.tsb ?? 0,
      pmcHistory,
      pmcProjection: discipline === "tri" ? null : projection?.series ?? null,
      today: hasCanonicalTimeseries ? new Date(fitnessClock).toISOString().slice(0, 10) : toLocalDate(fitnessClock),
      weeklyTSS,
      thisWeekTSS: weeklyStats.thisWeekTSS,
      avgWeekTSS: weeklyStats.avgWeekTSS,
      restDays: weeklyStats.restDays,
      weeklyLoadPartial: weeklyStats.partial,
      loadUnknownCount: weeklyStats.unknownCount,
      thisWeekUnknownCount: weeklyStats.thisWeekUnknownCount,
      hasKnownWeeklyLoad: weeklyStats.hasKnownLoad,
      hasKnownThisWeekLoad: weeklyStats.hasKnownThisWeekLoad,
      threshold,
      ftp,
      weightKg: profile?.weightKg,
      hasLoadData: currentPoint != null,
      combinedLoad: discipline === "tri" ? combinedLoad : null,
      loadFocus: integratedLoadFocus,
      cyclingAbility,
      runEvidence,
      swimEvidence,
      pdcSummary: discipline === "bike" ? canonicalRiderView ? {
        riderType: canonicalRiderView.profile,
        abilityScore: canonicalRiderView.ability?.overallPercentile ?? null,
        vo2maxEst: canonicalRiderView.vo2maxEst,
        activityCount: canonicalRiderView.activityCount,
        weightKgSnapshot: canonicalRiderView.weightKgSnapshot,
        version: 5,
        provenanceVersion: 2,
        measuredPower: true,
        sourceRevision: canonicalRiderView.sourceRevision,
        asOf: canonicalRiderView.asOf,
      } : mayUsePersistedPdcFallback ? {
        riderType: hasDefinitiveRiderProfile(pdc) ? pdc.riderType : null,
        abilityScore: hasDefinitiveRiderProfile(pdc) ? pdc.ability?.overallPercentile ?? null : null,
        vo2maxEst: pdc?.vo2maxEst ?? null,
        activityCount: pdc?.activityCount ?? null,
        weightKgSnapshot: pdc?.weightKgSnapshot ?? null,
        version: pdc?.version ?? null,
        provenanceVersion: pdc?.provenance?.version ?? null,
        measuredPower: pdc?.provenance?.power === "measured" && pdc?.provenance?.excludesVirtualPower === true,
      } : null : null,
      zones,
      zoneSource,
      powerCurve,
      ftpProgression: deriveEstimatedFtpProgression(pdc?.history),
      ftpHistory,
      thresholdDecision,
      discipline,
    };
  }, [
    canonicalFtpW, canonicalRiderView, combinedLoad, currentPoint, cyclingAbility, hasCanonicalTimeseries,
    discipline, disciplineActivities, fitnessClock, ftpHistory, integratedLoadFocus, mayUsePersistedPdcFallback,
    metricsMap, mobileZoneDistribution, pdc, powerCurveProgressions, profile, projection,
    runEvidence, swimEvidence, t, thresholdDecision, weeklyStats,
  ]);

  return {
    t,
    i18n,
    durationLabel,
    user,
    profile,
    ftpHistory,
    canonicalFtpW,
    canonicalFitness,
    activities,
    disciplineActivities,
    metricsMap,
    derivedMetricsSettled,
    derivedMetricsError,
    loading: canonicalPending || canonicalProcessing || (!canonicalActive && loading),
    cacheHit: !canonicalActive && cacheHit && timeseriesCacheHit,
    freshLoaded: canonicalActive
      ? !canonicalProcessing
      : freshLoaded && timeseriesFreshLoaded,
    // canonical 핵심 데이터가 준비된 뒤 독립 보조 데이터의 실패가 전체 화면을 막지 않는다.
    error: canonicalActive ? null : error,
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
    timeseriesError,
    retryLoad,
    hasCanonicalTimeseries,
    hasCanonicalHistory,
    pmcHistoryPoints,
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
    canonicalRiderView,
    mayUsePersistedPdcFallback,
    cyclingAbility,
    runEvidence,
    swimEvidence,
    runPaceCurve,
    swimCssCurve,
    mobilePageProps: {
      data: mobilePageData,
      pmcHistoryPoints,
      pmcHistoryCanonical: hasCanonicalHistory,
      consistencyStreak,
      ftpDecision: bikeFtpDecision,
      ftpReceipt: bikeFtpReceipt,
      ftpDeviceReceipts: bikeFtpDeviceReceipts,
      decisionBusy,
      onAcceptDecision: acceptFtpDecision,
    },
  };
}

export type FitnessModel = ReturnType<typeof useFitnessModel>;
