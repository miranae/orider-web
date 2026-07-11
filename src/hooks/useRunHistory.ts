/**
 * 최근 N주 러닝 이력 — 주간 리캡(§3.4c)과 러너 레벨 추정(§3.1)이 공유하는 단일 쿼리.
 *
 * 두 기능이 각자 쿼리하면 대시보드 한 화면에서 같은 문서를 두 번 읽는다. 더 긴 창(레벨: 8주)이
 * 짧은 창(리캡: 3주)을 포함하므로 한 번만 읽고 소비처에서 잘라 쓴다.
 *
 * 창은 **`startTime`(실제 운동 시각)** 기준이다. `createdAt`(동기화 시각) 기준이면 Strava 를
 * 방금 연결한 사용자의 수년치 백필이 전부 `createdAt ≈ now` 로 창에 들어오고, 그중 상위
 * QUERY_LIMIT 개만 읽히면서 **정작 지난주 러닝이 잘려 나갈 수 있다** — 리캡·레벨 추정이
 * 연결 직후(=aha moment)에 틀린 값을 말하게 된다. 기존 인덱스(deletedAt, userId, startTime DESC)를
 * 재사용하므로 새 복합 인덱스는 필요 없다. 종목 필터만 클라이언트에서 적용한다.
 */
import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError, debugLog } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { Activity } from "@shared/types";
import { getSportCategory } from "../features/activity/detail/activityDetailUtils";

const WEEK_MS = 7 * 86400000;
const QUERY_LIMIT = 200;

export interface RunHistory {
  runs: Activity[];
  loading: boolean;
}

/**
 * @param enabled 러닝 탭이 아닐 때는 쿼리하지 않는다 — 자전거 사용자에게 불필요한 읽기 비용.
 */
export function useRunHistory(weeks: number, enabled = true): RunHistory {
  const { user } = useAuth();
  const [state, setState] = useState<RunHistory>({ runs: [], loading: true });

  useEffect(() => {
    let cancelled = false;
    if (!user || !enabled) {
      setState({ runs: [], loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));

    const load = async () => {
      try {
        const cutoff = Date.now() - weeks * WEEK_MS;
        const q = query(
          collection(firestore, "activities"),
          where("userId", "==", user.uid),
          where("deletedAt", "==", null),
          where("startTime", ">=", cutoff),
          orderBy("startTime", "desc"),
          limit(QUERY_LIMIT),
        );
        const snap = await getDocs(q);
        const runs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Activity)
          .filter((a) => a.summary != null)
          .filter((a) => getSportCategory(a.type) === "run");

        debugLog("useRunHistory.loaded", {
          weeks,
          totalDocs: snap.size,
          runs: runs.length,
          hitLimit: snap.size >= QUERY_LIMIT,
        });

        if (!cancelled) setState({ runs, loading: false });
      } catch (err) {
        logClientError("useRunHistory.load", err, { weeks });
        if (!cancelled) setState({ runs: [], loading: false });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, weeks, enabled]);

  return state;
}
