import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import type { Goal, PlanWeek } from "@shared/types/goal";
import { planDayStartMs } from "@shared/training/planDate";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { loadTodayTrainingDecision } from "../services/todayTrainingDecisionGuard";
import { selectRunNextTraining, type RunNextTrainingSession } from "../features/activity/detail/runNextTraining";
export { buildRunPlanTarget, toRunNextTrainingSession, type RunNextTrainingSession } from "../features/activity/detail/runNextTraining";

export interface RunNextTrainingState {
  status: "loading" | "ready" | "none" | "error";
  session: RunNextTrainingSession | null;
}

/** 활동 소유자에게만 저장된 예정 러닝을 읽는다. 계획 생성·수정·예약·완료를 호출하지 않는다. */
export function useRunNextTraining(activityId: string | undefined, activityOwnerUid: string | undefined, enabled: boolean): RunNextTrainingState {
  const { user } = useAuth();
  const { firestore } = useFirebaseServices();
  const uid = user?.uid;
  const eligible = enabled && !!activityId && !!uid && uid === activityOwnerUid && user?.isAnonymous !== true;
  const config = getRuntimeConfig();
  const canonicalEnabled = config.trainingDecisionCanonicalEnabled === true;
  const todayEnabled = config.trainingDecisionEnabled === true;
  const modernEnabled = todayEnabled || canonicalEnabled;
  const key = `${uid ?? ""}:${activityId ?? ""}:${activityOwnerUid ?? ""}:${eligible}:${modernEnabled}:${canonicalEnabled}:${todayEnabled}`;
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<RunNextTrainingState & { key: string }>({ key: "", status: "none", session: null });
  useEffect(() => {
    if (!eligible || !uid) { setState({ key, status: "none", session: null }); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState({ key, status: "loading", session: null });
    void (async () => {
      try {
        const goals = await getDocs(query(collection(firestore, "goals"), where("userId", "==", uid), where("status", "==", "active"), where("discipline", "==", "run"), limit(2)));
        if (controller.signal.aborted) return;
        if (goals.metadata?.fromCache || goals.metadata?.hasPendingWrites) { setState({ key, status: "error", session: null }); return; }
        if (goals.docs.length !== 1) { setState({ key, status: goals.docs.length === 0 ? "none" : "error", session: null }); return; }
        const doc = goals.docs[0]!;
        const goal = { ...doc.data(), id: doc.id } as Goal;
        if (goal.userId !== uid || goal.status !== "active" || goal.discipline !== "run") { setState({ key, status: "none", session: null }); return; }
        const [weeks, decision] = await Promise.all([
          getDocs(query(collection(firestore, "goals", goal.id, "plan"), orderBy("weekNumber"), limit(105))),
          todayEnabled && !canonicalEnabled ? loadTodayTrainingDecision({ uid, discipline: "run", signal: controller.signal }).catch(() => null) : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        if (weeks.metadata?.fromCache || weeks.metadata?.hasPendingWrites) { setState({ key, status: "error", session: null }); return; }
        if (weeks.docs.length >= 105) { setState({ key, status: "error", session: null }); return; }
        const now = Date.now();
        const session = selectRunNextTraining(goal, weeks.docs.map(week => ({ ...week.data(), id: week.id } as PlanWeek)), uid, now, modernEnabled, decision);
        setState({ key, status: session ? "ready" : "none", session });
        const midnight = planDayStartMs(now) + 86400000;
        const expires = decision && decision.scheduledProjectionValidUntil > now ? Math.min(midnight, decision.scheduledProjectionValidUntil) : midnight;
        timer = setTimeout(() => setRefresh(value => value + 1), Math.max(1, expires - now));
      } catch {
        if (!controller.signal.aborted) setState({ key, status: "error", session: null });
      }
    })();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [key, eligible, uid, firestore, modernEnabled, todayEnabled, canonicalEnabled, refresh]);
  return eligible ? state.key === key ? state : { status: "loading", session: null } : { status: "none", session: null };
}
