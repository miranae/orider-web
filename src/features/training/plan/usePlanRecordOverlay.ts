import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import type { PlanWeek } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { getWorkoutDiscipline } from "../../../utils/workoutDiscipline";
import { logClientError } from "../../../services/errorLogger";
import { readActivePlanGoals, readPreferredActiveGoal } from "./readActivePlanGoals";
import type { PlanRecordEntry } from "./PlanRecordEvidence";

type Sport = "bike" | "run" | "swim" | "all";
interface OverlayState { key: string; state: "loading" | "ready" | "error"; plans: Map<string, PlanRecordEntry[]> }

/** Read existing active plans, without making a same-date activity into a completed workout. */
export function usePlanRecordOverlay(uid: string | null | undefined, sport: Sport) {
  const { firestore } = useFirebaseServices();
  const key = `${uid ?? "signed-out"}:${sport}`;
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<OverlayState>({ key: "", state: "loading", plans: new Map() });
  const retry = useCallback(() => setReload(value => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    if (!uid) return;
    setResult({ key, state: "loading", plans: new Map() });
    async function load() {
      try {
        const selected = sport === "all" ? await readActivePlanGoals(firestore, uid!) : [await readPreferredActiveGoal(firestore, uid!, sport)];
        if (cancelled) return;
        const goals = selected.filter(goal => goal != null && (sport === "all" || !goal.discipline || goal.discipline === sport));
        const loaded = await Promise.all(goals.map(async goal => {
          const weeks = await getDocs(query(collection(firestore, "goals", goal!.id, "plan"), orderBy("weekNumber")));
          return { goal: goal!, weeks: weeks.docs.map(document => ({ id: document.id, ...document.data() }) as PlanWeek) };
        }));
        if (cancelled) return;
        const plans = new Map<string, PlanRecordEntry[]>();
        for (const { goal, weeks } of loaded) {
          const fallback = goal.discipline === "run" || goal.discipline === "swim" ? goal.discipline : sport === "run" || sport === "swim" ? sport : "bike";
          for (const week of weeks) for (const day of week.days ?? []) {
            const inferred = getWorkoutDiscipline(day.workout, fallback);
            const discipline = inferred === "rest" ? fallback : inferred;
            if (sport !== "all" && discipline !== sport) continue;
            if (!Number.isFinite(day.date)) continue;
            const date = planDayKey(day.date);
            const rows = plans.get(date) ?? [];
            rows.push({ ...day, discipline, plannedTSS: day.adjustedTSS ?? day.plannedTSS, plannedDurationMin: day.adjustedDurationMin ?? day.plannedDurationMin });
            plans.set(date, rows);
          }
        }
        setResult({ key, state: "ready", plans });
      } catch (error) {
        if (cancelled) return;
        setResult({ key, state: "error", plans: new Map() });
        logClientError("TrainingLogPage.loadPlanOverlay", error, { sport });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [firestore, key, uid, sport, reload]);
  return { state: !uid ? "ready" as const : result.key === key ? result.state : "loading" as const, plans: result.key === key ? result.plans : new Map<string, PlanRecordEntry[]>(), retry };
}
