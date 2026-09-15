import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityOverviewResponse } from "@shared/types/activity-overview";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityOverview } from "../services/activityOverview";
import { canonicalRolloutAllows, useCanonicalRollout } from "./useCanonicalRollout";

export function useActivityOverview(activityId: string | undefined, isOwner: boolean, revision: string) {
  const { user } = useAuth();
  const uid = user?.uid;
  const services = useFirebaseServices();
  const rollout = useCanonicalRollout();
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "ko";
  const allowed = !!activityId && isOwner && !!user && canonicalRolloutAllows(rollout, "activityDetail") && !(rollout.gateEnabled && rollout.loading);
  const key = allowed ? JSON.stringify([user?.uid, activityId, lang, revision]) : null;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; services: typeof services; response?: ActivityOverviewResponse; error?: boolean } | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!key || !uid || !activityId) return;
    let active = true;
    setState(null);
    void loadActivityOverview(services, uid, activityId, lang, revision, attempt > 0)
      .then((response) => { if (active) setState({ key, services, response }); })
      .catch(() => { if (active) setState({ key, services, error: true }); });
    return () => { active = false; };
  }, [key, uid, activityId, lang, revision, services, attempt]);
  const current = state?.key === key && state?.services === services ? state : null;
  return { enabled: allowed, loading: allowed && !current, response: current?.response ?? null, error: current?.error === true, retry };
}
