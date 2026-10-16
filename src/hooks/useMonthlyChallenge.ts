import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
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
  const [distanceState, setDistanceState] = useState<{ owner: string; meters: number } | null>(null);
  const owner = `${uid}:${window.monthKey}`;
  const distanceMeters = distanceState?.owner === owner ? distanceState.meters : null;
  const [loading, setLoading] = useState(Boolean(uid));
  const [ownerReady, setOwnerReady] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [activityError, setActivityError] = useState(false);

  useEffect(() => {
    if (!uid) {
      setParticipation(null);
      setDistanceState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setOwnerReady(null);
    setActivityError(false);
    setParticipation(null);
    let active = true;
    let participationReady = false;
    let activitiesReady = false;
    let ownerLoaded = false;
    const finishPart = () => { participationReady = true; if (activitiesReady && ownerLoaded) setLoading(false); };
    const finishActivities = () => { activitiesReady = true; if (participationReady && ownerLoaded) setLoading(false); };

    const unsubscribeParticipation = onSnapshot(
      doc(firestore, "users", uid, "monthly_challenge_participation", window.monthKey),
      (snapshot) => {
        if (!active) return;
        const data = snapshot.data();
        setParticipation(data && isTier(data.tierKm) && typeof data.joinedAt === "number"
          ? { tierKm: data.tierKm, joinedAt: data.joinedAt }
          : null);
        finishPart();
      },
      (err) => {
        if (!active) return;
        setParticipation(null);
        finishPart();
        logClientError("useMonthlyChallenge.participation", err, { uid, monthKey: window.monthKey });
      },
    );

    // 차단·미검증 계정은 오래된 버킷을 완료 합계로 표시하지 않는다.
    const unsubscribeOwner = onSnapshot(doc(firestore, "users", uid), snapshot => {
      if (!active) return;
      const data = snapshot.data();
      const coverage = data?.statsIntervalCoverage;
      ownerLoaded = true;
      if (participationReady && activitiesReady) setLoading(false);
      setOwnerReady(coverage?.schemaVersion === 1 && coverage.state === "ready" && coverage.ownerUid === uid
        && !data?.lastStatsReconciliationFailure ? owner : null);
    }, err => {
      if (!active) return;
      setOwnerReady(null);
      ownerLoaded = true;
      if (participationReady && activitiesReady) setLoading(false);
      logClientError("useMonthlyChallenge.owner", err, { uid });
    });

    // 거리 정본은 기여 원장과 같은 거래에서 갱신한 월 버킷이다. 원본을 재집계하지 않는다.
    const unsubscribeActivities = onSnapshot(
      doc(firestore, "users", uid, "stats_rollup", `m_${window.monthKey}`),
      (snapshot) => {
        if (!active) return;
        const data = snapshot.data();
        const meters = data?.distance;
        const valid = data?.schemaVersion === 1 && typeof meters === "number" && Number.isFinite(meters) && meters >= 0;
        setActivityError(!valid);
        setDistanceState(valid ? { owner, meters } : null);
        finishActivities();
      },
      (err) => {
        if (!active) return;
        setActivityError(true);
        setDistanceState(null);
        finishActivities();
        logClientError("useMonthlyChallenge.rollup", err, { uid, monthKey: window.monthKey });
      },
    );
    return () => { active = false; unsubscribeParticipation(); unsubscribeActivities(); unsubscribeOwner(); };
  }, [uid, window.monthKey, owner]);

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
    progress: participation && distanceMeters !== null && ownerReady === owner && !activityError ? monthlyChallengeProgress(distanceMeters, participation.tierKm) : null,
    loading,
    error: activityError || (!loading && (ownerReady !== owner || distanceMeters === null)),
    joining,
    join,
  };
}
