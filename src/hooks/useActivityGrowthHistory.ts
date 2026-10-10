import { useCallback, useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query, startAfter, where, type DocumentData, type Firestore, type QueryDocumentSnapshot } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";

type Coverage = "loading" | "ready" | "partial" | "error" | "unavailable";
type HistoryPage = { activities: Activity[]; cursor: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean; serverConfirmed: boolean };
function boundedRead<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error("activity-growth-read-timeout")), 12000);
    request.then((value) => { globalThis.clearTimeout(timer); resolve(value); },
      (error) => { globalThis.clearTimeout(timer); reject(error); });
  });
}
const ownerGenerations = new WeakMap<Firestore, { uid: string | null; generation: number }>();
const historyRequests = new WeakMap<Firestore, Map<string, Promise<HistoryPage>>>();
type HistoryState = { serverConfirmed: boolean; firestore: Firestore; key: string; activities: Activity[]; coverage: Coverage; hasMore: boolean; cursor: QueryDocumentSnapshot<DocumentData> | null };
export interface StatisticsWindow { fromInclusive: number; toExclusive: number }
/** 소유자 요약만 읽고 스트림은 읽지 않는다. 통계는 200건씩 명시적 추가 조회, 최대 1,000건이다. */
export function useActivityGrowthHistory(mode: "comparison" | "statistics", now: number, enabled = true, window?: StatisticsWindow) {
  const { user } = useAuth();
  const { firestore } = useFirebaseServices();
  const uid = user?.uid ?? null;
  let ownerGeneration = ownerGenerations.get(firestore);
  if (!ownerGeneration || ownerGeneration.uid !== uid) {
    ownerGeneration = { uid, generation: (ownerGeneration?.generation ?? 0) + 1 };
    ownerGenerations.set(firestore, ownerGeneration);
  }
  const requestGeneration = ownerGeneration.generation;
  const fromInclusive = window?.fromInclusive ?? now - 12 * 7 * 86400000;
  const toExclusive = window?.toExclusive;
  const validWindow = !window || Number.isSafeInteger(fromInclusive) && fromInclusive >= 0 && Number.isSafeInteger(toExclusive) && toExclusive! > fromInclusive && toExclusive! <= now + 1;
  const enabledForWindow = enabled && (mode !== "statistics" || validWindow);
  const key = `${uid}:${mode}:${mode === "statistics" ? `${now}:${fromInclusive}:${toExclusive ?? "open"}` : "history"}`;
  const epoch = useRef(0);
  const servicesRef = useRef(firestore);
  if (servicesRef.current !== firestore) { servicesRef.current = firestore; epoch.current += 1; }
  const [state, setState] = useState<HistoryState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const currentKey = useRef(key);
  if (currentKey.current !== key) { currentKey.current = key; epoch.current += 1; }
  const read = useCallback(async (size: number, cursor: QueryDocumentSnapshot<DocumentData> | null) => {
    if (!uid) return null;
    let requests = historyRequests.get(firestore);
    if (!requests) { requests = new Map(); historyRequests.set(firestore, requests); }
    const requestKey = JSON.stringify([uid, requestGeneration, mode, mode === "statistics" ? [now, fromInclusive, toExclusive] : null, size, cursor?.ref.path ?? null]);
    const pending = requests.get(requestKey);
    if (pending) return pending;
    const request = (async (): Promise<HistoryPage> => {
      const snap = await boundedRead(getDocs(query(collection(firestore, "activities"),
        where("userId", "==", uid), where("deletedAt", "==", null),
        ...(mode === "statistics" ? [where("startTime", ">=", fromInclusive), ...(toExclusive == null ? [] : [where("startTime", "<", toExclusive)])] : []),
        orderBy("startTime", "desc"), limit(size), ...(cursor ? [startAfter(cursor)] : []))));
      return {
        activities: snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Activity)
          .filter((activity) => activity.userId === uid && activity.deletedAt == null && Number.isFinite(activity.startTime)),
        cursor: snap.docs[snap.docs.length - 1] ?? cursor,
        hasMore: snap.docs.length === size,
        serverConfirmed: snap.metadata?.fromCache === false && snap.metadata.hasPendingWrites === false
          && snap.docs.every((doc) => { const data = doc.data(); return data.userId === uid && data.deletedAt == null && Number.isFinite(data.startTime); }),
      };
    })();
    requests.set(requestKey, request);
    void request.finally(() => { if (requests?.get(requestKey) === request) requests.delete(requestKey); }).catch(() => {});
    return request;
  }, [firestore, fromInclusive, mode, now, requestGeneration, toExclusive, uid]);
  useEffect(() => {
    const generation = ++epoch.current;
    let active = true;
    const current = () => active && generation === epoch.current && currentKey.current === key;
    setLoadingMore(false);
    if (!uid || !enabledForWindow) { setState(null); return; }
    setState({ firestore, key, activities: [], coverage: "loading", hasMore: false, cursor: null, serverConfirmed: false });
    const load = async () => {
      try {
        const page = await read(mode === "statistics" ? 200 : 3, null);
        if (!page || !current()) return;
        const coverage: Coverage = page.serverConfirmed && !page.hasMore ? "ready" : "partial";
        setState({ firestore, key, ...page, coverage });
        // 첫 비교 선택지를 먼저 보이고 나머지 첫 10개를 이어 읽는다.
        if (mode === "comparison" && page.hasMore) {
          setLoadingMore(true);
          const rest = await read(7, page.cursor);
          if (!rest || !current()) return;
          setLoadingMore(false);
          setState({ firestore, key, activities: [...page.activities, ...rest.activities], cursor: rest.cursor, hasMore: rest.hasMore, serverConfirmed: page.serverConfirmed && rest.serverConfirmed,
            coverage: page.serverConfirmed && rest.serverConfirmed && !rest.hasMore ? "ready" : "partial" });
        }
      } catch (error) {
        if (!current()) return;
        setState((previous) => ({ firestore, key, activities: previous?.key === key ? previous.activities : [], coverage: "error", hasMore: false, cursor: null, serverConfirmed: false }));
        setLoadingMore(false);
        logClientError("useActivityGrowthHistory.load", error, { mode });
      }
    };
    void load();
    return () => { active = false; };
  }, [enabledForWindow, firestore, key, mode, read, retryGeneration, uid]);
  const visible = state?.key === key && state.firestore === firestore && enabledForWindow && uid ? state : null;
  const loadMore = useCallback(async () => {
    if (!visible?.hasMore || loadingMore || mode === "statistics" && visible.activities.length >= 1000) return;
    const generation = epoch.current;
    setLoadingMore(true);
    try {
      const page = await read(mode === "statistics" ? 200 : 10, visible.cursor);
      if (!page || generation !== epoch.current || currentKey.current !== key) return;
      setState({ firestore, key, activities: [...visible.activities, ...page.activities], cursor: page.cursor, hasMore: page.hasMore, serverConfirmed: visible.serverConfirmed && page.serverConfirmed,
        coverage: visible.serverConfirmed && page.serverConfirmed && !page.hasMore ? "ready" : "partial" });
    } catch (error) {
      if (generation !== epoch.current) return;
      setState((previous) => previous?.key === key ? { ...previous, coverage: "error" } : previous);
      logClientError("useActivityGrowthHistory.loadMore", error, { mode });
    } finally { if (generation === epoch.current) setLoadingMore(false); }
  }, [firestore, key, loadingMore, mode, read, visible]);
  return {
    activities: visible?.activities ?? [], sourceActivities: visible?.activities ?? [],
    coverage: visible?.coverage ?? (!enabledForWindow || !uid ? "unavailable" : "loading") as Coverage,
    loading: visible?.coverage === "loading" || (!!uid && enabledForWindow && !visible),
    error: visible?.coverage === "error", hasMore: visible?.hasMore ?? false, loadingMore,
    canLoadMore: !!visible?.hasMore && (mode !== "statistics" || visible.activities.length < 1000),
    loadMore, retry: () => setRetryGeneration((generation) => generation + 1),
  };
}
