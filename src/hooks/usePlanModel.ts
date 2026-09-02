import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import type { Goal, PlanDay, PlanWeek } from "@shared/types/goal";
import { computePlanProgress } from "@shared/training/planMetrics";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { useFitnessTimeseries } from "./useFitnessTimeseries";
import { useFreshTraining } from "./useFreshTraining";
import {
  clearTrainingSurfaceCache,
  getTrainingSurfaceCache,
  prepareTrainingSurfaceCacheOwner,
  setTrainingSurfaceCache,
} from "../embedded/trainingSurfaceCache";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PlanDiscipline = "bike" | "run" | "swim";

export function normalizePlanSport(sport: string | null | undefined): PlanDiscipline {
  return sport === "run" || sport === "swim" || sport === "bike" ? sport : "bike";
}

export interface PlanModel {
  user: ReturnType<typeof useAuth>["user"];
  discipline: PlanDiscipline;
  goal: Goal | null;
  weeks: PlanWeek[];
  goalLoading: boolean;
  planLoading: boolean;
  goalError: unknown;
  planError: unknown;
  loading: boolean;
  loadError: unknown;
  goalMatchesDiscipline: boolean;
  revalidating: boolean;
  justRecomputed: boolean;
  currentTsb: number | null;
  todayMs: number;
  goalDate: Date | null;
  daysLeft: number;
  totalTSS: number;
  completedTSS: number;
  progress: number;
  weeksLeft: number;
  isTodayCell: (day: PlanDay) => boolean;
  retryLoad: () => void;
  refreshPlanWeeks: () => Promise<void>;
  cacheHit: boolean;
  freshLoaded: boolean;
}

/** Plan data model shared by the full page and embedded surface. */
export function usePlanModel(sport?: string | null): PlanModel {
  const { firestore } = useFirebaseServices();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const discipline = normalizePlanSport(sport);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const initialCacheKey = user
    ? { uid: user.uid, surface: "plan" as const, sport: discipline, locale }
    : null;
  const initialCache = initialCacheKey
    && prepareTrainingSurfaceCacheOwner(user!.uid, user!.isAnonymous === true)
    ? getTrainingSurfaceCache<{ goal: Goal | null; weeks: PlanWeek[] }>(initialCacheKey)
    : null;
  const [goal, setGoal] = useState<Goal | null>(initialCache?.goal ?? null);
  const [weeks, setWeeks] = useState<PlanWeek[]>(initialCache?.weeks ?? []);
  const [goalLoading, setGoalLoading] = useState(initialCache === null);
  const [planLoading, setPlanLoading] = useState(initialCache === null);
  const [cacheHit, setCacheHit] = useState(initialCache !== null);
  const [freshLoaded, setFreshLoaded] = useState(false);
  const [goalError, setGoalError] = useState<unknown>(null);
  const [planError, setPlanError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { revalidating, justRecomputed } = useFreshTraining(discipline);
  const legacyRecoveryEnabled = getRuntimeConfig().trainingDecisionEnabled !== true;
  const { timeseries } = useFitnessTimeseries(
    legacyRecoveryEnabled ? user?.uid : undefined,
    discipline,
  );
  const tsbFresh = timeseries?.endDate != null
    && (Date.now() - new Date(`${timeseries.endDate}T00:00:00Z`).getTime()) <= 3 * DAY_MS;
  const currentTsb = legacyRecoveryEnabled && tsbFresh && timeseries!.points.length
    ? timeseries!.points[timeseries!.points.length - 1]!.tsb
    : null;

  useEffect(() => {
    if (!user) {
      clearTrainingSurfaceCache();
      setGoal(null);
      setWeeks([]);
      setGoalError(null);
      setPlanError(null);
      setGoalLoading(false);
      setPlanLoading(false);
      setCacheHit(false);
      setFreshLoaded(true);
      return;
    }

    let cancelled = false;
    const cacheKey = { uid: user.uid, surface: "plan" as const, sport: discipline, locale };
    const cacheEnabled = prepareTrainingSurfaceCacheOwner(user.uid, user.isAnonymous === true);
    const cached = cacheEnabled
      ? getTrainingSurfaceCache<{ goal: Goal | null; weeks: PlanWeek[] }>(cacheKey)
      : null;
    const load = async () => {
      setGoal(cached?.goal ?? null);
      setWeeks(cached?.weeks ?? []);
      setGoalLoading(cached === null);
      setPlanLoading(cached === null);
      setCacheHit(cached !== null);
      setFreshLoaded(false);
      setGoalError(null);
      setPlanError(null);
      try {
        let snap = await getDocs(
          query(
            collection(firestore, "goals"),
            where("userId", "==", user.uid),
            where("status", "==", "active"),
            where("discipline", "==", discipline),
            limit(1),
          ),
        );
        if (snap.empty) {
          snap = await getDocs(
            query(
              collection(firestore, "goals"),
              where("userId", "==", user.uid),
              where("status", "==", "active"),
              limit(1),
            ),
          );
        }
        if (cancelled) return;
        if (snap.empty) {
          setGoal(null);
          setWeeks([]);
          setGoalLoading(false);
          setPlanLoading(false);
          setFreshLoaded(true);
          if (cacheEnabled) setTrainingSurfaceCache(cacheKey, { goal: null, weeks: [] });
          return;
        }

        const docSnap = snap.docs[0]!;
        const nextGoal = { id: docSnap.id, ...docSnap.data() } as Goal;
        setGoal(nextGoal);
        setGoalLoading(false);
        try {
          const planSnap = await getDocs(
            query(
              collection(firestore, "goals", nextGoal.id, "plan"),
              orderBy("weekNumber"),
            ),
          );
          if (cancelled) return;
          const nextWeeks = planSnap.docs.map((item) => ({ id: item.id, ...item.data() }) as PlanWeek);
          setWeeks(nextWeeks);
          setFreshLoaded(true);
          if (cacheEnabled) setTrainingSurfaceCache(cacheKey, { goal: nextGoal, weeks: nextWeeks });
        } catch (error) {
          if (cancelled) return;
          if (cached === null) {
            setWeeks([]);
            setPlanError(error);
          }
          setFreshLoaded(cached === null);
          logClientError("PlanPage.planLoad", error, { discipline, goalId: nextGoal.id });
        } finally {
          if (!cancelled) setPlanLoading(false);
        }
      } catch (error) {
        if (cancelled) return;
        if (cached === null) {
          setGoal(null);
          setWeeks([]);
          setGoalError(error);
        }
        setGoalLoading(false);
        setPlanLoading(false);
        setFreshLoaded(cached === null);
        logClientError("PlanPage.goalLoad", error, { discipline });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [discipline, firestore, locale, reloadKey, user]);

  const todayMs = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }, []);
  const goalDate = goal ? new Date(goal.eventDate) : null;
  const daysLeft = goalDate
    ? Math.max(0, Math.round((goalDate.getTime() - todayMs) / DAY_MS))
    : 0;
  const {
    totalTSS,
    completedTSS,
    progressPct: progress,
    weeksLeft,
  } = computePlanProgress(weeks, todayMs);
  const goalMatchesDiscipline = !goal || !goal.discipline || goal.discipline === discipline;
  const loading = goalLoading || planLoading;
  const loadError = goalError ?? planError;

  const isTodayCell = useCallback((day: PlanDay): boolean => {
    const date = new Date(day.date);
    date.setHours(0, 0, 0, 0);
    return date.getTime() === todayMs;
  }, [todayMs]);

  const retryLoad = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const refreshPlanWeeks = useCallback(async () => {
    if (!goal || !user) return;
    const planSnap = await getDocs(
      query(
        collection(firestore, "goals", goal.id, "plan"),
        orderBy("weekNumber"),
      ),
    );
    const nextWeeks = planSnap.docs.map((item) => ({ id: item.id, ...item.data() }) as PlanWeek);
    setWeeks(nextWeeks);
    const cacheKey = { uid: user.uid, surface: "plan" as const, sport: discipline, locale };
    if (prepareTrainingSurfaceCacheOwner(user.uid, user.isAnonymous === true)) {
      setTrainingSurfaceCache(cacheKey, { goal, weeks: nextWeeks });
    }
  }, [discipline, firestore, goal, locale, user]);

  return {
    user,
    discipline,
    goal,
    weeks,
    goalLoading,
    planLoading,
    goalError,
    planError,
    loading,
    loadError,
    goalMatchesDiscipline,
    revalidating,
    justRecomputed,
    currentTsb,
    todayMs,
    goalDate,
    daysLeft,
    totalTSS,
    completedTSS,
    progress,
    weeksLeft,
    isTodayCell,
    retryLoad,
    refreshPlanWeeks,
    cacheHit,
    freshLoaded,
  };
}
