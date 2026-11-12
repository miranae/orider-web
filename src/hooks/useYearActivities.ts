import { useState, useEffect, useCallback } from "react";
import { logClientError } from "../services/errorLogger";
import type { Activity } from "@shared/types";
import { readRecapYears, readYearActivities } from "./yearActivitiesRead";

/** 연도 목록은 계정별 point query 두 번, 활동은 선택한 로컬 연도만 조회한다. */
export function useYearActivities(uid: string | null | undefined, selectedYear?: number) {
  const [calendar, setCalendar] = useState<{ uid: typeof uid; years: number[]; loading: boolean; error: boolean }>({ uid, years: [], loading: !!uid, error: false });
  const years = calendar.uid === uid ? calendar.years : [];
  const year = selectedYear ?? years[0] ?? new Date().getFullYear();
  const [state, setState] = useState<{ uid: typeof uid; year: number; activities: Activity[]; loading: boolean; error: boolean }>({ uid, year, activities: [], loading: !!uid, error: false });
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [calendarRetry, setCalendarRetry] = useState(0);
  const retry = useCallback(() => {
    if (calendar.uid === uid && calendar.error) setCalendarRetry((generation) => generation + 1);
    setRetryGeneration((generation) => generation + 1);
  }, [calendar.uid, calendar.error, uid]);

  useEffect(() => {
    if (!uid) {
      setCalendar({ uid, years: [], loading: false, error: false });
      return;
    }
    let cancelled = false;
    setCalendar({ uid, years: [], loading: true, error: false });
    const fail = (err: unknown) => {
      if (cancelled) return;
      cancelled = true;
      setCalendar({ uid, years: [], loading: false, error: true });
      logClientError("useYearActivities.calendar", err, { uid });
    };
    const timer = globalThis.setTimeout(() => fail(new Error("year-calendar-read-timeout")), 12_000);
    void readRecapYears(uid, () => cancelled).then((loaded) => {
      if (!cancelled) setCalendar({ uid, years: loaded, loading: false, error: false });
    }, fail).finally(() => globalThis.clearTimeout(timer));
    return () => { cancelled = true; globalThis.clearTimeout(timer); };
  }, [uid, calendarRetry]);

  const calendarReady = calendar.uid === uid && !calendar.loading && !calendar.error;
  const ready = selectedYear !== undefined || calendarReady;
  useEffect(() => {
    if (!uid || !ready) return;
    let cancelled = false;
    setState({ uid, year, activities: [], loading: true, error: false });
    const fail = (err: unknown) => {
      if (cancelled) return;
      cancelled = true;
      setState({ uid, year, activities: [], loading: false, error: true });
      logClientError("useYearActivities.load", err, { uid, year });
    };
    const timer = globalThis.setTimeout(() => fail(new Error("year-activities-read-timeout")), 12_000);
    void readYearActivities(uid, year, () => cancelled).then((activities) => {
      if (!cancelled) setState({ uid, year, activities, loading: false, error: false });
    }, fail).finally(() => globalThis.clearTimeout(timer));
    return () => { cancelled = true; globalThis.clearTimeout(timer); };
  }, [uid, year, ready, retryGeneration]);

  const current = state.uid === uid && state.year === year;
  const error = !!uid && ((calendar.uid === uid && calendar.error) || (current && state.error));
  const loading = !!uid && !error && (!calendarReady || !current || state.loading);
  return { year, years, activities: uid && current && !loading && !error ? state.activities : [], loading, error, retry };
}
