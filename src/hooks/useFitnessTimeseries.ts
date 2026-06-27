/**
 * useFitnessTimeseries — `users/{uid}/fitness/timeseries_{discipline}` 정본 시계열 구독.
 *
 * 서버(functions/src/training/fitness-timeseries.ts)가 활동 인입/revalidate 시 전체
 * 라이프타임 CTL/ATL/TSB 를 사전계산해 저장한 doc. FitnessPage 가 차트/KPI 의 정본
 * 소스로 사용하고, doc 부재(미배포/미백필/신규유저) 시 클라 재계산으로 폴백한다.
 *
 * tri 는 단일 종목 doc 이 없으므로 구독하지 않는다(null 반환 → 클라 폴백).
 */
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import type { Discipline } from "../utils/disciplineFilter";

export function useFitnessTimeseries(
  uid: string | undefined,
  discipline: Discipline,
): { timeseries: FitnessTimeseriesDoc | null; loaded: boolean } {
  const [timeseries, setTimeseries] = useState<FitnessTimeseriesDoc | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!uid || discipline === "tri") {
      setTimeseries(null);
      setLoaded(true);
      return undefined;
    }
    setLoaded(false);
    setTimeseries(null);
    const ref = doc(firestore, "users", uid, "fitness", `timeseries_${discipline}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setTimeseries(snap.exists() ? (snap.data() as FitnessTimeseriesDoc) : null);
        setLoaded(true);
      },
      (err) => {
        logClientError("useFitnessTimeseries", err, { discipline });
        setTimeseries(null);
        setLoaded(true);
      },
    );
    return () => unsub();
  }, [uid, discipline]);

  return { timeseries, loaded };
}
