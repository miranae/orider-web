import { useEffect, useMemo, useState } from "react";
import { and, collection, getDocs, orderBy, query, where } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import {
  CONSISTENCY_STREAK_LOOKBACK_MS,
  computeConsistencyStreak,
  type ConsistencyStreakSummary,
} from "../utils/consistencyStreak";

/**
 * 이미 읽어 둔 활동으로 연속 기록을 계산할 수 있으면 넘긴다 (#1028).
 * `coversSinceMs` 이후 시작한 활동이 모두 들어 있어야 한다 — 조회 기간이 연속 기록 기간보다 짧으면
 * 훅이 직접 조회한다. `ready` 가 false 면 조회하지 않고 기다린다(같은 문서를 두 번 읽지 않게).
 */
export interface PreloadedStreakActivities {
  activities: Activity[];
  coversSinceMs: number;
  ready: boolean;
}

function streakCutoff(nowMs: number): number {
  return nowMs - CONSISTENCY_STREAK_LOOKBACK_MS;
}

function summarize(activities: Activity[], uid: string, nowMs: number): ConsistencyStreakSummary | null {
  const cutoff = streakCutoff(nowMs);
  return computeConsistencyStreak(activities.filter((activity) =>
    activity.userId === uid && activity.summary != null && activity.startTime >= cutoff), nowMs);
}

export function useConsistencyStreak(
  uid: string | null | undefined,
  preloaded?: PreloadedStreakActivities | null,
) {
  const { firestore } = useFirebaseServices();
  const [queried, setQueried] = useState<{ uid: string; summary: ConsistencyStreakSummary | null } | null>(null);
  const [loading, setLoading] = useState(false);
  // 미리 읽은 활동이 연속 기록 기간 전체를 덮으면 별도 조회를 하지 않는다.
  const usePreloaded = preloaded != null && preloaded.coversSinceMs <= streakCutoff(Date.now());
  const preloadedReady = usePreloaded && preloaded.ready;
  const preloadedActivities = usePreloaded ? preloaded.activities : null;

  const preloadedSummary = useMemo(
    () => (uid && preloadedReady && preloadedActivities
      ? summarize(preloadedActivities, uid, Date.now())
      : null),
    [uid, preloadedReady, preloadedActivities],
  );

  useEffect(() => {
    if (!uid || usePreloaded) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        // 시작 시각으로 기간을 자른다. 예전에는 최근 "등록" 200건(createdAt)을 읽고 시작 시각으로
        // 걸렀는데, 이력 가져오기 직후에는 최근 등록이 대부분 수년 전 활동이라 200건을 읽고
        // 대부분 버렸고 연속 기록도 틀렸다 (#1028). 체력 화면과 같은 (userId, deletedAt, startTime) 인덱스.
        const nowMs = Date.now();
        const snap = await getDocs(query(
          collection(firestore, "activities"),
          and(
            where("userId", "==", uid),
            where("deletedAt", "==", null),
            where("startTime", ">=", streakCutoff(nowMs)),
          ),
          orderBy("startTime", "asc"),
        ));
        if (cancelled) return;
        const activities = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Activity);
        setQueried({ uid, summary: summarize(activities, uid, nowMs) });
      } catch (err) {
        logClientError("useConsistencyStreak.load", err, { uid });
        if (!cancelled) setQueried({ uid, summary: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [firestore, uid, usePreloaded]);

  if (!uid) return { summary: null, loading: false };
  if (usePreloaded) return { summary: preloadedSummary, loading: !preloadedReady };
  return { summary: queried?.uid === uid ? queried.summary : null, loading };
}
