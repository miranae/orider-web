import { useEffect, useRef, useState } from "react";
import type { Activity } from "@shared/types";
import type { ActivityBikeDistanceEvidenceResponse } from "@shared/activity-bike-distance-evidence";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { getDiscipline } from "../utils/disciplineFilter";
import { loadActivityBikeDistanceEvidence, manualBikeDistanceAvailable } from "../services/activityBikeDistanceEvidence";
export function useActivityBikeDistanceEvidence(activity: Activity, observedMetricsIdentity: string) {
  const { user } = useAuth(), services = useFirebaseServices();
  const uid = user?.uid;
  const eligible = !!uid && !user?.isAnonymous && activity.userId === uid && activity.deletedAt == null && getDiscipline(activity.type) === "bike" && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous && manualBikeDistanceAvailable();
  const key = JSON.stringify([uid, eligible, activity.id, activity.userId, activity.contentRevision, activity.contentSelectedRevision, activity.startTime, activity.endTime, activity.source, activity.deletedAt, observedMetricsIdentity]);
  const scope = useRef({ key, services, generation: 0 });
  const busy = useRef<number | null>(null), revision = useRef<string | undefined>(undefined);
  if (scope.current.key !== key || scope.current.services !== services) {
    scope.current = { key, services, generation: scope.current.generation + 1 }; busy.current = null; revision.current = undefined;
  }
  const generation = scope.current.generation;
  const requestEpoch = useRef(0);
  const [result, setResult] = useState<{ generation: number; state: "loading" | "error" | ActivityBikeDistanceEvidenceResponse["state"]; response: ActivityBikeDistanceEvidenceResponse | null } | null>(null);
  useEffect(() => () => { requestEpoch.current++; busy.current = null; revision.current = undefined; }, []);
  const visible = eligible && result?.generation === generation ? result : null;
  const inspect = async () => {
    if (!eligible || !uid || busy.current === generation) return;
    busy.current = generation;
    const epoch = ++requestEpoch.current;
    const current = () => requestEpoch.current === epoch && scope.current.generation === generation && scope.current.key === key && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
    setResult({ generation, state: "loading", response: null });
    try {
      const response = await loadActivityBikeDistanceEvidence(services, uid, activity.id, revision.current, activity.startTime);
      if (!current()) return;
      revision.current = response.distanceInputRevision ?? undefined;
      setResult({ generation, state: response.state, response });
    } catch {
      if (current()) setResult({ generation, state: "error", response: null });
    } finally { if (current()) busy.current = null; }
  };
  return { available: eligible, state: visible?.state ?? "idle", response: visible?.response ?? null, inspect };
}
