import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";

export const MONTHLY_CHALLENGE_TIERS = [300, 500, 1000] as const;
export type MonthlyChallengeTier = typeof MONTHLY_CHALLENGE_TIERS[number];

export interface MonthlyChallengeParticipation {
  tierKm: MonthlyChallengeTier;
  joinedAt: number;
}

export function monthlyChallengeParticipationWrite(tierKm: MonthlyChallengeTier, joinedAt = Date.now()) {
  return { tierKm, joinedAt };
}

export function kstMonthWindow(now = Date.now()) {
  const kst = new Date(now + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const monthIndex = kst.getUTCMonth();
  return {
    monthKey: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    startMs: Date.UTC(year, monthIndex, 1) - 9 * 60 * 60 * 1000,
    endMs: Date.UTC(year, monthIndex + 1, 1) - 9 * 60 * 60 * 1000,
  };
}

export function monthlyChallengeProgress(distanceMeters: unknown, tierKm: MonthlyChallengeTier) {
  const meters = typeof distanceMeters === "number" && Number.isFinite(distanceMeters)
    ? Math.max(0, distanceMeters)
    : 0;
  const distanceKm = meters / 1000;
  return {
    distanceKm,
    percent: Math.min(100, (distanceKm / tierKm) * 100),
    remainingKm: Math.max(0, tierKm - distanceKm),
    completed: distanceKm >= tierKm,
  };
}

function isTier(value: unknown): value is MonthlyChallengeTier {
  return MONTHLY_CHALLENGE_TIERS.includes(value as MonthlyChallengeTier);
}

export function useMonthlyChallenge(uid: string | null | undefined, now = Date.now()) {
  const window = useMemo(() => kstMonthWindow(now), [now]);
  const [participation, setParticipation] = useState<MonthlyChallengeParticipation | null>(null);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [loading, setLoading] = useState(Boolean(uid));
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!uid) {
      setParticipation(null);
      setDistanceMeters(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    let participationReady = false;
    let activitiesReady = false;
    const finishPart = () => { participationReady = true; if (activitiesReady) setLoading(false); };
    const finishActivities = () => { activitiesReady = true; if (participationReady) setLoading(false); };

    const unsubscribeParticipation = onSnapshot(
      doc(firestore, "users", uid, "monthly_challenge_participation", window.monthKey),
      (snapshot) => {
        const data = snapshot.data();
        setParticipation(data && isTier(data.tierKm) && typeof data.joinedAt === "number"
          ? { tierKm: data.tierKm, joinedAt: data.joinedAt }
          : null);
        finishPart();
      },
      (err) => {
        setParticipation(null);
        finishPart();
        logClientError("useMonthlyChallenge.participation", err, { uid, monthKey: window.monthKey });
      },
    );

    const unsubscribeActivities = onSnapshot(
      query(
        collection(firestore, "activities"),
        where("userId", "==", uid),
        where("deletedAt", "==", null),
        where("createdAt", ">=", window.startMs),
        orderBy("createdAt", "desc"),
      ),
      (snapshot) => {
        const total = snapshot.docs.reduce((sum, activityDoc) => {
          const activity = activityDoc.data() as Activity;
          if (activity.startTime < window.startMs || activity.startTime >= window.endMs) return sum;
          const distance = activity.summary?.distance;
          return sum + (typeof distance === "number" && Number.isFinite(distance) ? Math.max(0, distance) : 0);
        }, 0);
        setDistanceMeters(total);
        finishActivities();
      },
      (err) => {
        setDistanceMeters(0);
        finishActivities();
        logClientError("useMonthlyChallenge.activities", err, { uid, monthKey: window.monthKey });
      },
    );
    return () => { unsubscribeParticipation(); unsubscribeActivities(); };
  }, [uid, window.endMs, window.monthKey, window.startMs]);

  const join = useCallback(async (tierKm: MonthlyChallengeTier) => {
    if (!uid || joining) return;
    setJoining(true);
    try {
      await setDoc(doc(firestore, "users", uid, "monthly_challenge_participation", window.monthKey), {
        ...monthlyChallengeParticipationWrite(tierKm),
      });
    } finally {
      setJoining(false);
    }
  }, [joining, uid, window.monthKey]);

  return {
    monthKey: window.monthKey,
    participation,
    progress: participation ? monthlyChallengeProgress(distanceMeters, participation.tierKm) : null,
    loading,
    joining,
    join,
  };
}
