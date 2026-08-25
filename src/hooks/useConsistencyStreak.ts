import { useEffect, useState } from "react";
import { and, collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import {
  CONSISTENCY_STREAK_LOOKBACK_MS,
  computeConsistencyStreak,
  type ConsistencyStreakSummary,
} from "../utils/consistencyStreak";

export function useConsistencyStreak(uid: string | null | undefined) {
  const { firestore } = useFirebaseServices();
  const [summary, setSummary] = useState<ConsistencyStreakSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) {
      setSummary(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const snap = await getDocs(query(
          collection(firestore, "activities"),
          and(where("userId", "==", uid), where("deletedAt", "==", null)),
          orderBy("createdAt", "desc"),
          limit(200),
        ));
        if (cancelled) return;
        const cutoff = Date.now() - CONSISTENCY_STREAK_LOOKBACK_MS;
        const activities = snap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as Activity)
          .filter((activity) => activity.summary != null && activity.startTime >= cutoff);
        setSummary(computeConsistencyStreak(activities));
      } catch (err) {
        logClientError("useConsistencyStreak.load", err, { uid });
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [firestore, uid]);

  return { summary, loading };
}
