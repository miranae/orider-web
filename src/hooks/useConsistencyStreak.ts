import { useEffect, useState } from "react";
import { and, collection, getDocs, orderBy, query, where } from "firebase/firestore";
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
        // Query the lookback window directly. The previous query read the newest 200 activities by
        // createdAt on every Home open and dropped the out-of-window ones in the browser, so users with
        // 200+ activities always paid 200 reads (orider-web#1025). Same index as useFitnessModel.
        const cutoff = Date.now() - CONSISTENCY_STREAK_LOOKBACK_MS;
        const snap = await getDocs(query(
          collection(firestore, "activities"),
          and(where("userId", "==", uid), where("deletedAt", "==", null), where("startTime", ">=", cutoff)),
          orderBy("startTime", "asc"),
        ));
        if (cancelled) return;
        const activities = snap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as Activity)
          .filter((activity) => activity.summary != null);
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
