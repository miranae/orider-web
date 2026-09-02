/**
 * useFitnessTimeseries — `users/{uid}/fitness/timeseries_{discipline}` 정본 시계열 구독.
 *
 * 서버(functions/src/training/fitness-timeseries.ts)가 활동 인입/revalidate 시 전체
 * 라이프타임 CTL/ATL/TSB 를 사전계산해 저장한 doc. FitnessPage 가 차트/KPI 의 정본
 * 소스로 사용하고, doc 부재(미배포/미백필/신규유저) 시 클라 재계산으로 폴백한다.
 *
 * tri 는 단일 종목 doc 이 없으므로 구독하지 않는다(null 반환 → 클라 폴백).
 */
import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { logClientError } from "../services/errorLogger";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import type { Discipline } from "../utils/disciplineFilter";
import {
  getTrainingSurfaceCache,
  prepareTrainingSurfaceCacheOwner,
  setTrainingSurfaceCache,
} from "../embedded/trainingSurfaceCache";

export function useFitnessTimeseries(
  uid: string | undefined,
  discipline: Discipline,
  reloadKey = 0,
  cacheLocale?: string,
  cacheAnonymous = false,
): {
  timeseries: FitnessTimeseriesDoc | null;
  loaded: boolean;
  error: unknown;
  cacheHit: boolean;
  freshLoaded: boolean;
} {
  const { firestore } = useFirebaseServices();
  const [timeseries, setTimeseries] = useState<FitnessTimeseriesDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [cacheHit, setCacheHit] = useState(false);
  const [freshLoaded, setFreshLoaded] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    let active = true;
    if (!uid || discipline === "tri") {
      setTimeseries(null);
      setError(null);
      setLoaded(true);
      setCacheHit(false);
      setFreshLoaded(true);
      return undefined;
    }
    const cacheEnabled = cacheLocale !== undefined
      && prepareTrainingSurfaceCacheOwner(uid, cacheAnonymous);
    const cacheKey = {
      uid,
      surface: "fitness-timeseries" as const,
      sport: discipline,
      locale: cacheLocale ?? "",
    };
    const cached = cacheEnabled
      ? getTrainingSurfaceCache<{ timeseries: FitnessTimeseriesDoc | null }>(cacheKey)
      : null;
    const hasCachedValue = cached !== null;
    setLoaded(hasCachedValue);
    setError(null);
    setTimeseries(cached?.timeseries ?? null);
    setCacheHit(hasCachedValue);
    setFreshLoaded(false);
    const ref = doc(firestore, "users", uid, "fitness", `timeseries_${discipline}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!active || generationRef.current !== generation) return;
        const next = snap.exists() ? (snap.data() as FitnessTimeseriesDoc) : null;
        setTimeseries(next);
        setError(null);
        setLoaded(true);
        setFreshLoaded(true);
        if (cacheEnabled) setTrainingSurfaceCache(cacheKey, { timeseries: next });
      },
      (err) => {
        if (!active || generationRef.current !== generation) return;
        logClientError("useFitnessTimeseries", err, { discipline });
        if (!hasCachedValue) setTimeseries(null);
        setError(hasCachedValue ? null : err);
        setLoaded(true);
        setFreshLoaded(!hasCachedValue);
      },
    );
    return () => {
      active = false;
      unsub();
    };
  }, [cacheAnonymous, cacheLocale, discipline, firestore, reloadKey, uid]);

  return { timeseries, loaded, error, cacheHit, freshLoaded };
}
