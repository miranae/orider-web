import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";

import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { Goal, FitnessProjection } from "@shared/types/goal";
import type { MilestoneId } from "@shared/types/milestone";
import { resolveBikeThresholdDecision } from "@shared/training/bikeThresholdDecision";
import { isConservativeDrop } from "@shared/training/ftpTest";
import { deriveEstimatedFtpProgression } from "@shared/training/ftpProgression";
import { hasDefinitiveRiderProfile } from "@shared/training/pdcRiderGate";
import { useAuth } from "../contexts/AuthContext";
import { useDialog } from "../contexts/DialogContext";
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
import { useRunRecords } from "./useRunRecords";
import { useUserFitness } from "./useUserFitness";
import { filterByDiscipline, type Discipline } from "../utils/disciplineFilter";
import { toLocalDate } from "../utils/dateUtils";
import {
  aggregateDailyLoad,
  calculateFitness,
  estimateActivityLoad,
  type ActivityLoadEntry,
  type DailyLoad,
} from "../utils/fitnessMetrics";
import { logClientError } from "../services/errorLogger";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { persistRiderMetrics } from "../services/syncRiderMetrics";

export function resolveFitnessDiscipline(value: string | null | undefined): Discipline {
  return value === "bike" || value === "run" || value === "swim" || value === "tri"
    ? value
    : "bike";
}

export function useFitnessModel(
  sportParam: string | null | undefined,
  options: { enableCoachRiderInsight?: boolean } = {},
) {
  const { t, i18n } = useTranslation("fitness");
  const durationLabel = makeDurationLabel(t);
  const { user, profile } = useAuth();
  const { firestore } = useFirebaseServices();
  const { entries: ftpHistory } = useFtpHistory(user?.uid);
  const dialog = useDialog();
  const { showToast } = useToast();
  const discipline = resolveFitnessDiscipline(sportParam);
  const [appliedFtpW, setAppliedFtpW] = useState<number | null>(null);
  const [applyingFtp, setApplyingFtp] = useState(false);
  const [activityState, setActivityState] = useState<{ ownerUid: string | null; items: Activity[] }>({
    ownerUid: user?.uid ?? null,
    items: [],
  });
  const activities = activityState.ownerUid === (user?.uid ?? null) ? activityState.items : [];
  const { streamsMap, metricsMap } = useActivityDerivedDocuments(user?.uid, activities);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeOption>(90);
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);
  const [projection, setProjection] = useState<FitnessProjection | null>(null);
  const [, setGoalQueryDone] = useState(false);
  const isMobile = useMobile();
  const { pdc } = usePdc(user?.uid);
  const riderInsightEnabled = options.enableCoachRiderInsight !== false
    && getRuntimeConfig().coachRiderInsightEnabled === true
    && discipline === "bike";
  const { insight: coachRiderInsight } = useCoachRiderInsight(user?.uid, riderInsightEnabled);
  const { fitness: userFitness } = useUserFitness(!!user);
  const latestActivityStart = activities.reduce((latest, activity) => Math.max(latest, activity.startTime), 0);
  const activityRefreshKey = `${activities.length}:${latestActivityStart}`;
  const fitnessClock = useFitnessClock(userFitness?.updatedAt, activityRefreshKey);
  const { summary: consistencyStreak } = useConsistencyStreak(user?.uid);

  const canonicalFtpW = appliedFtpW ?? profile?.ftp ?? null;
  const thresholdDecision = useMemo(
    () => resolveBikeThresholdDecision(canonicalFtpW, pdc),
    [canonicalFtpW, pdc],
  );

  async function applyAutomaticFtp(candidateW: number) {
    if (!user || applyingFtp) return;
    if (isConservativeDrop(thresholdDecision.activeFtpW, candidateW)) {
      const confirmed = await dialog.confirm(
        t("thresholdDecision.dropConfirm", { current: thresholdDecision.activeFtpW, candidate: candidateW }),
        { title: t("thresholdDecision.dropConfirmTitle"), destructive: true },
      );
      if (!confirmed) return;
    }
    setApplyingFtp(true);
    try {
      const result = await persistRiderMetrics(
        user.uid,
        { ftp: candidateW },
        { ftpHistorySource: "detected" },
      );
      setAppliedFtpW(candidateW);
      if (result.failures.length > 0) {
        showToast(t("thresholdDecision.partial", { count: result.failures.length }), "error");
      } else {
        showToast(t("thresholdDecision.applied", { value: candidateW }));
      }
    } catch (applyError) {
      showToast(t("thresholdDecision.applyFailed", {
        message: applyError instanceof Error ? applyError.message : String(applyError),
      }), "error");
    } finally {
      setApplyingFtp(false);
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
    discipline === "tri" ? undefined : discipline,
  );
  const projUnsubRef = useRef<(() => void) | null>(null);
  const projectionGoalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setActivityState({ ownerUid: null, items: [] });
      setLoading(false);
      return undefined;
    }
    const uid = user.uid;
    let active = true;
    setActivityState({ ownerUid: uid, items: [] });
    setLoading(true);
    const cutoff = Date.now() - (range + 42) * 24 * 60 * 60 * 1000;
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
            .filter((activity) => activity.userId === uid && activity.summary != null);
          setActivityState({ ownerUid: uid, items });
          setLoading(false);
        } catch (snapshotError) {
          setError(snapshotError instanceof Error ? snapshotError.message : t("error.loadFailed"));
          setLoading(false);
        }
      },
      (subscriptionError) => {
        if (!active) return;
        logClientError("FitnessPage.activitiesSubscription", subscriptionError, { range });
        setError(t("error.loadFailed"));
        setLoading(false);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [firestore, range, t, user]);

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

  const disciplineActivities = useMemo(
    () => discipline === "tri" ? activities : filterByDiscipline(activities, discipline),
    [activities, discipline],
  );
  const clientFitness = useMemo(() => {
    if (disciplineActivities.length === 0) return { fitnessData: [], dailyData: [] };
    const entries: ActivityLoadEntry[] = disciplineActivities.map((activity) => {
      const metrics = metricsMap.get(activity.id);
      const load = estimateActivityLoad({
        precomputedTss: metrics?.tss
          ?? (activity as { tss?: number | null }).tss
          ?? activity.summary.tss,
        relativeEffort: activity.summary.relativeEffort,
        ridingTimeMillis: activity.summary.ridingTimeMillis,
        discipline: discipline === "tri" ? undefined : discipline,
      });
      return { date: toLocalDate(activity.startTime), load: load.value, source: load.source };
    });
    const today = toLocalDate(Date.now());
    const daily = aggregateDailyLoad(entries, entries[0]?.date ?? today, today);
    return { fitnessData: calculateFitness(daily), dailyData: daily };
  }, [discipline, disciplineActivities, metricsMap]);
  const { timeseries, loaded: timeseriesLoaded } = useFitnessTimeseries(user?.uid, discipline);
  const { fitnessData, dailyData } = useMemo(() => {
    const points = timeseries?.points;
    if (points && points.length > 0) {
      return {
        fitnessData: points,
        dailyData: points.map((point) => ({
          date: point.date,
          totalLoad: point.dailyLoad,
          activities: [] as DailyLoad["activities"],
        })),
      };
    }
    return clientFitness;
  }, [clientFitness, timeseries]);
  const rangeData = useMemo(() => {
    if (fitnessData.length === 0) return { fitness: [], daily: [] };
    const sliceStart = Math.max(0, fitnessData.length - range);
    return { fitness: fitnessData.slice(sliceStart), daily: dailyData.slice(sliceStart) };
  }, [dailyData, fitnessData, range]);
  const currentPoint = rangeData.fitness[rangeData.fitness.length - 1] ?? null;
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
    const recent = dailyData.slice(-42);
    const thisWeekTSS = recent.slice(-7).reduce((sum, day) => sum + day.totalLoad, 0);
    const avgWeekTSS = Math.round(
      recent.reduce((sum, day) => sum + day.totalLoad, 0) / Math.max(1, Math.ceil(recent.length / 7)),
    );
    let restDays = 0;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      if (recent[index]!.totalLoad === 0) restDays += 1;
      else break;
    }
    return { thisWeekTSS, avgWeekTSS, restDays };
  }, [dailyData]);
  const zoneDistribution = useMemo(() => {
    const { counts, total } = aggregateRecentZoneSeconds(
      disciplineActivities,
      metricsMap,
      "hrZoneSec",
      5,
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
      5,
      fitnessClock,
    );
    return total === 0 ? null : counts.map((count) => Math.round((count / total) * 100));
  }, [disciplineActivities, fitnessClock, metricsMap]);
  const combinedLoad = useMemo(
    () => authoritativeCombinedLoad(userFitness, fitnessClock),
    [fitnessClock, userFitness],
  );
  const integratedLoadFocus = useMemo(
    () => computeIntegratedLoadFocus(activities, metricsMap, fitnessClock),
    [activities, fitnessClock, metricsMap],
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
  const runPaceStreams = useMemo(() => {
    const now = Date.now();
    const period = 28 * 24 * 60 * 60 * 1000;
    const recentStreams: { velocity: number[]; time?: number[] }[] = [];
    const prevStreams: { velocity: number[]; time?: number[] }[] = [];
    for (const activity of disciplineActivities) {
      const stream = streamsMap.get(activity.id);
      if (!stream?.velocity_smooth || stream.velocity_smooth.length < 30) continue;
      const paceStream = { velocity: stream.velocity_smooth, time: stream.time };
      if (activity.startTime >= now - period) recentStreams.push(paceStream);
      else if (activity.startTime >= now - period * 2) prevStreams.push(paceStream);
    }
    return { recentStreams, prevStreams };
  }, [disciplineActivities, streamsMap]);

  const mobilePageData = useMemo<MobileFitnessData>(() => {
    const ftp = canonicalFtpW ?? 0;
    const pmcHistory = rangeData.fitness.map((point) => ({
      ctl: point.ctl,
      atl: point.atl,
      tsb: point.tsb,
      date: point.date,
    }));
    const last28 = dailyData.slice(-28);
    const weeklyTSS = [0, 1, 2, 3].map((week) => Math.round(
      last28.slice(week * 7, week * 7 + 7).reduce((sum, day) => sum + day.totalLoad, 0),
    ));
    const { counts: powerZoneCounts, total: powerSamples } = discipline === "bike"
      ? aggregateRecentZoneSeconds(disciplineActivities, metricsMap, "powerZoneSec", 6)
      : { counts: [0, 0, 0, 0, 0, 0], total: 0 };
    const hrFractions = mobileZoneDistribution ?? [0, 0, 0, 0, 0];
    const maxHr = profile?.maxHr ?? 200;
    let zoneSource: MobileFitnessData["zoneSource"] = "none";
    let zones: MobileFitnessData["zones"] = [];
    if (discipline === "bike" && ftp > 0) {
      let percentages = [0, 0, 0, 0, 0, 0];
      if (powerSamples > 0) {
        zoneSource = "power";
        percentages = powerZoneCounts.map((count) => Math.round((count / powerSamples) * 100));
      } else if (mobileZoneDistribution) {
        zoneSource = "hr";
        percentages = [...hrFractions, 0];
      }
      if (zoneSource !== "none") {
        zones = [
          { name: t("zone.recovery"), pct: percentages[0]!, color: "var(--ink-3)", rangeLabel: `< ${Math.round(ftp * 0.55)} W`, percentLabel: "~55%" },
          { name: t("zone.endurance"), pct: percentages[1]!, color: "var(--aqua)", rangeLabel: `${Math.round(ftp * 0.55)}–${Math.round(ftp * 0.75)} W`, percentLabel: "55–75%" },
          { name: t("zone.tempo"), pct: percentages[2]!, color: "var(--lime)", rangeLabel: `${Math.round(ftp * 0.75)}–${Math.round(ftp * 0.9)} W`, percentLabel: "75–90%" },
          { name: t("zone.threshold"), pct: percentages[3]!, color: "var(--amber)", rangeLabel: `${Math.round(ftp * 0.9)}–${Math.round(ftp * 1.05)} W`, percentLabel: "90–105%" },
          { name: "VO₂max", pct: percentages[4]!, color: "var(--rose)", rangeLabel: `${Math.round(ftp * 1.05)}–${Math.round(ftp * 1.2)} W`, percentLabel: "105–120%" },
          { name: t("zone.anaerobic"), pct: percentages[5]!, color: "var(--zone-5)", rangeLabel: `> ${Math.round(ftp * 1.2)} W`, percentLabel: ">120%" },
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
      today: toLocalDate(Date.now()),
      weeklyTSS,
      thisWeekTSS: weeklyStats.thisWeekTSS,
      avgWeekTSS: weeklyStats.avgWeekTSS,
      restDays: weeklyStats.restDays,
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
    canonicalFtpW, canonicalRiderView, combinedLoad, currentPoint, cyclingAbility, dailyData,
    discipline, disciplineActivities, ftpHistory, integratedLoadFocus, mayUsePersistedPdcFallback,
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
    applyingFtp,
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
    applyAutomaticFtp,
    pendingMilestone,
    setDismissedMilestones,
    markCelebrated,
    revalidating,
    justRecomputed,
    timeseriesLoaded,
    fitnessData,
    dailyData,
    rangeData,
    currentPoint,
    rangeStartPoint,
    powerCurveProgressions,
    weeklyStats,
    zoneDistribution,
    combinedLoad,
    integratedLoadFocus,
    canonicalRiderView,
    mayUsePersistedPdcFallback,
    cyclingAbility,
    runEvidence,
    swimEvidence,
    runPaceStreams,
    mobilePageProps: {
      data: mobilePageData,
      consistencyStreak,
      applyingFtp,
      onApplyFtp: applyAutomaticFtp,
    },
  };
}

export type FitnessModel = ReturnType<typeof useFitnessModel>;
