import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query, startAfter, where, type Firestore, type QueryDocumentSnapshot } from "firebase/firestore";
import type { Activity } from "@shared/types";
import type { PlanWeek } from "@shared/types/goal";
import { useAuth } from "../../../contexts/AuthContext";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { useActivityRepresentatives, withActivityRepresentatives } from "../../../hooks/useActivityRepresentatives";
import type { Discipline } from "../../../utils/disciplineFilter";
import { logClientError } from "../../../services/errorLogger";
import { computePlanLoadComparison, getPlanLoadRangeBounds, type PlanLoadComparison, type PlanLoadRange } from "./planLoadComparison";

const NO_ACTIVITIES: Activity[] = [];
const DAY_MS = 86_400_000;
const READ_TIMEOUT_MS = 12_000;
type State = "idle" | "loading" | "ready" | "error" | "incomplete" | "invalid";
interface Options { uid: string | null | undefined; discipline: Discipline; weeks: readonly PlanWeek[]; range: PlanLoadRange; enabled?: boolean; ftp?: number }
interface Loaded { key: string; firestore: Firestore; state: State; activities: Activity[]; now: number }
function boundedRead<T>(request: Promise<T>, timers: Set<ReturnType<typeof globalThis.setTimeout>>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => { timers.delete(timer); reject(new Error("plan-load-read-timeout")); }, READ_TIMEOUT_MS);
    timers.add(timer);
    request.then(value => { globalThis.clearTimeout(timer); timers.delete(timer); resolve(value); }, error => { globalThis.clearTimeout(timer); timers.delete(timer); reject(error); });
  });
}
function unavailableActual(comparison: PlanLoadComparison): PlanLoadComparison {
  return { summary: { ...comparison.summary, actualTss: null, ratioPct: null, deltaTss: null },
    days: comparison.days.map(row => ({ ...row, actualTss: null, ratioPct: null, deltaTss: null })) };
}

/** 소유자 기록을 완전히 읽고 대표를 보강한 후에만 정확한 달성률을 제공한다. */
export function usePlanLoadComparison({ uid, discipline, weeks, range, enabled = true, ftp }: Options) {
  const { user, loading: authLoading } = useAuth();
  const { firestore } = useFirebaseServices();
  const owner = !authLoading && user && !user.isAnonymous && user.uid === uid ? uid : null;
  const bounds = getPlanLoadRangeBounds(range);
  const inputKey = `${owner ?? "guest"}:${range.start}:${range.end}:${enabled}`;
  const identity = useRef({ inputKey, firestore, epoch: 0 });
  if (identity.current.inputKey !== inputKey || identity.current.firestore !== firestore) identity.current = { inputKey, firestore, epoch: identity.current.epoch + 1 };
  const key = `${inputKey}:${identity.current.epoch}`;
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const visible = loaded?.key === key && loaded.firestore === firestore ? loaded : null;
  const rows = visible?.state === "ready" ? visible.activities : NO_ACTIVITIES;
  const representatives = useActivityRepresentatives(rows, enabled && owner && bounds ? owner : null, rows, firestore, true);
  const [representativeTimeout, setRepresentativeTimeout] = useState<string | null>(null);
  const timeoutKey = `${key}:${generation}`;
  const retry = useCallback(() => { setRepresentativeTimeout(null); representatives.retry(); setGeneration(value => value + 1); }, [representatives.retry]);
  const startMs = bounds?.startMs;
  const endMs = bounds?.endExclusiveMs;
  useEffect(() => {
    if (!enabled || !owner || startMs === undefined || endMs === undefined) return;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof globalThis.setTimeout>>();
    const now = Date.now();
    setLoaded({ key, firestore, state: "loading", activities: [], now });
    const load = async () => {
      try {
        const activities: Activity[] = [];
        let cursor: QueryDocumentSnapshot | undefined;
        let complete = true;
        let fetchedCount = 0;
        const upper = Math.min(endMs + DAY_MS, now + 1);
        // 선택 기간 전체가 미래이면 실제 조회가 필요하지 않다.
        if (startMs <= now) while (true) {
          const snap = await boundedRead(getDocs(query(collection(firestore, "activities"),
            where("userId", "==", owner), where("deletedAt", "==", null),
            where("startTime", ">=", startMs - DAY_MS), where("startTime", "<", upper),
            orderBy("startTime", "desc"), limit(200), ...(cursor ? [startAfter(cursor)] : []))), timers);
          if (cancelled) return;
          fetchedCount += snap.docs.length;
          const valid = snap.docs.map(document => ({ ...document.data(), id: document.id }) as Activity);
          complete &&= snap.metadata?.fromCache === false && snap.metadata.hasPendingWrites === false;
          if (valid.some(activity => activity.userId !== owner || activity.deletedAt != null || !Number.isFinite(activity.startTime)
            || activity.startTime < startMs - DAY_MS || activity.startTime >= upper)) complete = false;
          activities.push(...valid.filter(activity => activity.userId === owner && activity.deletedAt == null && Number.isFinite(activity.startTime)));
          if (snap.docs.length < 200) break;
          if (fetchedCount >= 1000) { complete = false; break; }
          const next = snap.docs[snap.docs.length - 1]!;
          if (cursor?.id === next.id) { complete = false; break; }
          cursor = next;
        }
        if (!cancelled) setLoaded({ key, firestore, state: complete ? "ready" : "incomplete", activities, now });
      } catch (error) {
        if (cancelled) return;
        logClientError("usePlanLoadComparison.load", error);
        setLoaded({ key, firestore, state: "error", activities: [], now });
      }
    };
    void load();
    return () => { cancelled = true; for (const timer of timers) globalThis.clearTimeout(timer); timers.clear(); };
  }, [enabled, endMs, firestore, generation, key, owner, startMs]);
  useEffect(() => {
    if (!representatives.loading) { setRepresentativeTimeout(null); return; }
    const timer = globalThis.setTimeout(() => setRepresentativeTimeout(timeoutKey), READ_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timer);
  }, [representatives.loading, timeoutKey]);
  const comparison = useMemo(() => computePlanLoadComparison(weeks,
    owner ? withActivityRepresentatives(rows, representatives.representatives, owner) : NO_ACTIVITIES,
    range, discipline, visible?.now ?? Date.now(), ftp), [weeks, owner, rows, representatives.representatives, range, discipline, visible?.now, ftp]);
  const state: State = !enabled || !owner ? "idle" : !bounds ? "invalid" : !visible || visible.state === "loading" ? "loading"
    : visible.state !== "ready" ? visible.state : representatives.error || representatives.loading && representativeTimeout === timeoutKey ? "incomplete"
    : representatives.loading ? "loading" : "ready";
  return { state, ...(state === "ready" ? comparison : unavailableActual(comparison)), retry };
}
