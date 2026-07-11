/**
 * 최근 4주 러닝 평균 페이스 — 활동 상세의 "지난 4주 평균보다 8초 빨라졌어요" 문장의 기준선.
 *
 * 쿼리는 `useWeeklyStats` 와 **동일한 인덱스 조합**(userId, deletedAt, createdAt)을 재사용한다.
 * 새 복합 인덱스를 만들지 않기 위해 종목 필터는 클라이언트에서 적용한다.
 *
 * 거리 가중 평균을 쓴다 — 짧은 회복 조깅 하나가 기준선을 통째로 끌어내리면 안 되기 때문.
 */
import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError, debugLog } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { Activity } from "@shared/types";
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
 * @param enabled 러닝 활동에서만 쿼리한다. 자전거·수영 상세에서 100문서를 읽을 이유가 없다.
 */
export function useRunBaselinePace(excludeActivityId?: string, enabled = true): RunBaseline {
  const { user } = useAuth();
  const [state, setState] = useState<RunBaseline>({ paceSecPerKm: null, sampleCount: 0, loading: true });

  useEffect(() => {
    let cancelled = false;
    if (!user || !enabled) {
      setState({ paceSecPerKm: null, sampleCount: 0, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));

    const load = async () => {
      try {
        const cutoff = Date.now() - FOUR_WEEKS_MS;
        const q = query(
          collection(firestore, "activities"),
          where("userId", "==", user.uid),
          where("deletedAt", "==", null),
          where("createdAt", ">=", cutoff),
          orderBy("createdAt", "desc"),
          limit(QUERY_LIMIT),
        );
        const snap = await getDocs(q);
        const runs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Activity)
          .filter((a) => a.id !== excludeActivityId)
          .filter((a) => a.summary != null)
          .filter((a) => getSportCategory(a.type) === "run")
          // createdAt(동기화 시각) 창만으로는 부족하다: Strava 를 방금 연결하면 수년치 활동이
          // createdAt ≈ now 로 한꺼번에 들어와 "최근 4주 평균"이 과거 러닝의 평균이 된다.
          // 실제 운동 시각(startTime)으로 다시 자른다.
          .filter((a) => a.startTime >= cutoff)
          .filter((a) => a.summary.distance > 0 && a.summary.averageSpeed > 0);

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
          runs.length >= MIN_SAMPLES && totalMeters > 0
            ? Math.round(totalSeconds / (totalMeters / 1000))
            : null;

        // 기준선이 왜 null 인지(표본 부족인지 쿼리 결과가 빈 것인지) 추적 가능해야 한다.
        debugLog("useRunBaselinePace.resolved", {
          sampleCount: runs.length,
          paceSecPerKm,
          totalKm: Math.round(totalMeters / 100) / 10,
          belowMinSamples: runs.length < MIN_SAMPLES,
        });

        if (!cancelled) setState({ paceSecPerKm, sampleCount: runs.length, loading: false });
      } catch (err) {
        logClientError("useRunBaselinePace.load", err, { excludeActivityId });
        if (!cancelled) setState({ paceSecPerKm: null, sampleCount: 0, loading: false });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, excludeActivityId, enabled]);

  return state;
}
