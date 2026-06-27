/**
 * useCohortPercentiles — `stats/percentiles_bike` 단일 공개 doc 구독.
 *
 * G9 (2026-06-06)
 *
 * 서버(cohort-percentiles.ts)가 주 1회 cron 으로 집계한 코호트(전체·성별·연령대)별
 *  FTP·W/kg·VO2max 백분위 구간표. 로그인 사용자 누구나 read (firestore rules: stats 공개).
 *  doc 1회 read 후 클라가 percentileOf 로 자기 값의 백분위를 로컬 매핑.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import type { CohortPercentiles } from "@shared/types/cohort-percentiles";

export type UseCohortPercentilesState =
  | { status: "loading"; stats: null }
  | { status: "missing"; stats: null }
  | { status: "ready"; stats: CohortPercentiles };

export function useCohortPercentiles(enabled: boolean): UseCohortPercentilesState {
  const [state, setState] = useState<UseCohortPercentilesState>({ status: "loading", stats: null });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading", stats: null });
      return undefined;
    }
    setState({ status: "loading", stats: null });
    const unsub = onSnapshot(
      doc(firestore, "stats", "percentiles_bike"),
      (snap) => {
        if (!snap.exists()) {
          setState({ status: "missing", stats: null });
          return;
        }
        setState({ status: "ready", stats: snap.data() as CohortPercentiles });
      },
      (err) => {
        logClientError("useCohortPercentiles", err, {});
        setState({ status: "missing", stats: null });
      },
    );
    return () => unsub();
  }, [enabled]);

  return state;
}
