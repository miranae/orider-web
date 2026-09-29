/**
 * 활동 전 4주 러닝 평균 페이스 — 이번 활동과 이전 기간을 비교하는 기준선.
 *
 * 창은 **`startTime`(실제 운동 시각)** 기준이다. `createdAt`(동기화 시각) 기준이면 Strava 를 방금
 * 연결한 사용자의 수년치 백필이 전부 창에 들어와 "최근 4주 평균"이 과거 러닝의 평균이 된다.
 * 기존 인덱스(deletedAt, userId, startTime DESC)를 재사용하므로 새 복합 인덱스는 필요 없다.
 * 종목 필터만 클라이언트에서 적용한다.
 *
 * 거리 가중 평균을 쓴다 — 짧은 회복 조깅 하나가 기준선을 통째로 끌어내리면 안 되기 때문.
 */
import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError, debugLog } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { Activity } from "@shared/types";
import { isImplausibleAvgSpeed } from "../utils/activitySanity";
import { getSportCategory } from "../features/activity/detail/activityDetailUtils";

const FOUR_WEEKS_MS = 28 * 86400000;
/** 표본이 이보다 적으면 기준선을 만들지 않는다 — 우연한 한두 번의 러닝은 평균이라 부를 수 없다. */
const MIN_SAMPLES = 3;
const QUERY_LIMIT = 100;

export interface RunBaseline {
  /** 거리 가중 평균 페이스 (sec/km). 표본 부족이면 null. */
  paceSecPerKm: number | null;
  sampleCount: number;
  loading: boolean;
}

/**
 * @param excludeActivityId 지금 보고 있는 활동 — 자기 자신과 비교하지 않도록 제외.
 * @param enabled 본인 러닝 활동에서만 개인 활동을 쿼리한다.
 * @param activityStartTime 활동 직전까지의 4주 창. 100문서 한도에 도달하면 비교를 생략한다.
 */
export function useRunBaselinePace(excludeActivityId?: string, enabled = true, activityStartTime?: number | null): RunBaseline {
  const { user } = useAuth();
  const requestKey = `${user?.uid ?? ""}:${enabled}:${excludeActivityId ?? ""}:${activityStartTime ?? ""}`;
  const [state, setState] = useState<RunBaseline & { requestKey: string }>({ requestKey: "", paceSecPerKm: null, sampleCount: 0, loading: true });

  useEffect(() => {
    let cancelled = false;
    if (!user || !enabled || !activityStartTime || !Number.isFinite(activityStartTime)) {
      setState({ requestKey, paceSecPerKm: null, sampleCount: 0, loading: false });
      return;
    }
    setState({ requestKey, paceSecPerKm: null, sampleCount: 0, loading: true });

    const load = async () => {
      try {
        const cutoff = activityStartTime - FOUR_WEEKS_MS;
        const q = query(
          collection(firestore, "activities"),
          where("userId", "==", user.uid),
          where("deletedAt", "==", null),
          where("startTime", ">=", cutoff),
          where("startTime", "<", activityStartTime),
          orderBy("startTime", "desc"),
          limit(QUERY_LIMIT),
        );
        const snap = await getDocs(q);
        const runs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Activity)
          .filter((a) => a.id !== excludeActivityId && a.startTime >= cutoff && a.startTime < activityStartTime)
          .filter((a) => a.summary != null)
          .filter((a) => getSportCategory(a.type) === "run")
          .filter((a) => Number.isFinite(a.summary.distance) && a.summary.distance > 0 && Number.isFinite(a.summary.averageSpeed) && a.summary.averageSpeed > 0 && !isImplausibleAvgSpeed(a.summary.averageSpeed, "run"));

        // 거리 가중 평균: Σ(시간) / Σ(거리) = 전체 페이스
        let totalMeters = 0;
        let totalSeconds = 0;
        for (const a of runs) {
          const meters = a.summary.distance;
          const secPerKm = 3600 / a.summary.averageSpeed; // km/h → sec/km
          totalMeters += meters;
          totalSeconds += (meters / 1000) * secPerKm;
        }
        const paceSecPerKm =
          snap.docs.length < QUERY_LIMIT && runs.length >= MIN_SAMPLES && totalMeters > 0
            ? Math.round(totalSeconds / (totalMeters / 1000))
            : null;

        // 기준선이 왜 null 인지(표본 부족인지 쿼리 결과가 빈 것인지) 추적 가능해야 한다.
        debugLog("useRunBaselinePace.resolved", {
          sampleCount: runs.length,
          paceSecPerKm,
          totalKm: Math.round(totalMeters / 100) / 10,
          belowMinSamples: runs.length < MIN_SAMPLES,
        });

        if (!cancelled) setState({ requestKey, paceSecPerKm, sampleCount: runs.length, loading: false });
      } catch (err) {
        logClientError("useRunBaselinePace.load", err, { excludeActivityId });
        if (!cancelled) setState({ requestKey, paceSecPerKm: null, sampleCount: 0, loading: false });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, excludeActivityId, enabled, activityStartTime, requestKey]);

  return state.requestKey === requestKey ? state : { paceSecPerKm: null, sampleCount: 0, loading: !!user && enabled && !!activityStartTime };
}
