import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, limit, onSnapshot, query, where, type Firestore, type DocumentSnapshot, type QuerySnapshot } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { acceptedPhysicalActivities } from "../utils/estimateTSS";

export const MAX_MISSING_REPRESENTATIVES = 30;
export const MAX_REPRESENTATIVE_WITNESSES = 200;
const MAX_CACHED_GROUPS = 50;
type LinkedActivity = Activity & { rollupSupersededBy?: unknown; invalidSummary?: unknown };
type CacheEntry = { representative?: Activity | null; witnesses?: Activity[]; docError?: boolean; groupError?: boolean; docToken?: symbol; groupToken?: symbol; docConfirmed?: boolean; groupConfirmed?: boolean };
const flag = (row: Activity, uid: string) => {
  if ((row as LinkedActivity).invalidSummary) return null;
  const id = (row as LinkedActivity).rollupSupersededBy;
  return row.userId === uid && typeof id === "string" && id.length > 0 && !id.includes("/") && id !== row.id ? id : null;
};
const normalize = (row: Activity): Activity => ({ ...row, summary: row.summary ?? {} as Activity["summary"] });

/** 원본 목록을 유지하고, 현재 월과 연결된 본인 대표·그룹 증거만 집계 후보로 보강한다. */
export function withActivityRepresentatives(rows: readonly Activity[], representatives: ReadonlyMap<string, Activity | null>, uid: string): Activity[] {
  const siblings = new Map<string, Activity[]>();
  for (const row of representatives.values()) {
    if (!row) continue;
    const id = flag(row, uid);
    if (id) siblings.set(id, [...(siblings.get(id) ?? []), row]);
  }
  const result = new Map<string, Activity>();
  const add = (row: Activity) => { if (!result.has(row.id)) result.set(row.id, normalize(row)); };
  for (const row of rows) {
    const current = row.userId === uid && representatives.has(row.id) ? representatives.get(row.id) : row;
    if (current) add(current);
  }
  const queue = [...result.values()];
  for (let index = 0; index < queue.length; index++) {
    const id = flag(queue[index]!, uid);
    if (!id) continue;
    const related = [representatives.get(id), ...(siblings.get(id) ?? [])];
    for (const row of related) {
      if (!row || row.userId !== uid || result.has(row.id)) continue;
      add(row);
      queue.push(row);
    }
  }
  return [...result.values()];
}

/** 현재 월만 구독한다. 비활성 월은 즉시 해제하고 uid별 최대 50그룹의 캐시만 보존한다.
 * 그룹 증거는 직접 대표와 겹치지 않을 때만 조회하며, flag 자체를 집계 제외 근거로 쓰지 않는다.
 */
export function useActivityRepresentatives(rows: readonly Activity[], uid: string | null | undefined, knownRows: readonly Activity[] = rows, injectedFirestore?: Firestore, requireServerConfirmation = false) {
  const services = useFirebaseServices();
  const firestore = injectedFirestore ?? services.firestore;
  const [state, setState] = useState<{ uid: typeof uid; cache: Map<string, CacheEntry>; active: Map<string, symbol> }>({ uid, cache: new Map(), active: new Map() });
  const subscriptions = useRef(new Map<string, () => void>());
  const pendingGroups = useRef(new Set<string>());
  const listenerTokens = useRef(new Map<string, symbol>());
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setState({ uid, cache: new Map(), active: new Map() });
    return () => {
      generation.current++;
      for (const unsubscribe of subscriptions.current.values()) unsubscribe();
      subscriptions.current.clear();
      listenerTokens.current.clear();
      pendingGroups.current.clear();
    };
  }, [uid, firestore, requireServerConfirmation]);
  const cache = useMemo(() => state.uid === uid ? state.cache : new Map<string, CacheEntry>(), [state, uid]);
  const active = useMemo(() => state.uid === uid ? state.active : new Map<string, symbol>(), [state.uid, state.active, uid]);
  const known = useMemo(() => new Map(knownRows.filter(row => row.userId === uid).map(row => [row.id, normalize(row)])), [knownRows, uid]);
  const representatives = useMemo(() => {
    const values = new Map<string, Activity | null>(known);
    for (const [id, entry] of cache) {
      for (const row of entry.witnesses ?? []) {
        if (!known.has(row.id) || active.get(`group:${id}`) === entry.groupToken && entry.groupToken !== undefined) values.set(row.id, row);
      }
    }
    // 활성 direct snapshot이 권위다. 범위 쿼리 도착 순서·객체 identity로 신선도를 추측하지 않는다.
    // 비활성 LRU는 known이 없을 때만 last-good을 제공한다.
    for (const [id, entry] of cache) {
      if ("representative" in entry && (!known.has(id) || active.get(`doc:${id}`) === entry.docToken && entry.docToken !== undefined)) values.set(id, entry.representative ?? null);
    }
    return values;
  }, [known, cache, active]);
  const candidates = useMemo(() => uid ? withActivityRepresentatives(rows, representatives, uid) : [...rows], [rows, representatives, uid]);
  const targets = useMemo(() => {
    const direct = new Set<string>();
    const groups = new Set<string>();
    if (!uid) return { direct, groups };
    // 합성 대표로 원본 조각이 가려져도, 활성 월 원본의 유효 링크 동안 이미 연 구독을 유지한다.
    for (const row of rows) {
      const id = flag(row, uid);
      if (id && active.has(`doc:${id}`)) direct.add(id);
      if (id && active.has(`group:${id}`)) groups.add(id);
    }
    for (const row of candidates) {
      const id = flag(row, uid);
      if (!id) continue;
      const original = known.get(id);
      const current = representatives.get(id);
      // 고정 원본에 대표가 없거나 연결이 증명되지 않으면 현재 대표를 직접 확인한다.
      if (!original || acceptedPhysicalActivities([row, original]).length > 1) direct.add(id);
      if (current && acceptedPhysicalActivities([row, current]).length > 1) groups.add(id);
    }
    return { direct, groups };
  }, [candidates, known, representatives, uid, rows, active]);
  const activeIds = new Set([...targets.direct, ...targets.groups]);
  const witnessCount = [...targets.groups].reduce((total, id) => total + (cache.get(id)?.witnesses?.length ?? 0), 0);
  const overBudget = activeIds.size > MAX_MISSING_REPRESENTATIVES || witnessCount > MAX_REPRESENTATIVE_WITNESSES;
  useEffect(() => {
    const desired = new Set([...targets.direct].map(id => `doc:${id}`).concat([...targets.groups].map(id => `group:${id}`)));
    for (const [key, unsubscribe] of subscriptions.current) {
      if (desired.has(key) && !overBudget) continue;
      unsubscribe();
      subscriptions.current.delete(key);
      listenerTokens.current.delete(key);
      if (key.startsWith("group:")) pendingGroups.current.delete(key.slice(6));
    }
    const syncActive = () => setState(previous => {
      const next = new Map(listenerTokens.current);
      if (previous.uid === uid && next.size === previous.active.size && [...next].every(([key, token]) => previous.active.get(key) === token)) return previous;
      return { uid, cache: previous.uid === uid ? previous.cache : new Map(), active: next };
    });
    syncActive();
    if (!uid || overBudget) return;
    const currentGeneration = generation.current;
    const update = (id: string, value: Partial<CacheEntry>) => {
      if (generation.current !== currentGeneration) return;
      setState(previous => {
        const next = new Map(previous.uid === uid ? previous.cache : []);
        const entry = { ...next.get(id), ...value };
        next.delete(id);
        next.set(id, entry);
        while (next.size > MAX_CACHED_GROUPS) {
          const inactive = [...next.keys()].find(key => !subscriptions.current.has(`doc:${key}`) && !subscriptions.current.has(`group:${key}`));
          if (!inactive) break;
          next.delete(inactive);
        }
        return { uid, cache: next, active: new Map(listenerTokens.current) };
      });
    };
    for (const id of targets.direct) {
      const key = `doc:${id}`;
      if (subscriptions.current.has(key)) continue;
      const token = Symbol(key);
      listenerTokens.current.set(key, token);
      subscriptions.current.set(key, () => {});
      const reference = doc(firestore, "activities", id);
      const next = (snapshot: DocumentSnapshot) => {
        if (generation.current !== currentGeneration || listenerTokens.current.get(key) !== token) return;
        const confirmed = snapshot.metadata?.fromCache === false && snapshot.metadata.hasPendingWrites === false;
        if (requireServerConfirmation && !confirmed) { update(id, { docToken: token, docConfirmed: false }); return; }
        const row = snapshot.exists() ? normalize({ ...snapshot.data(), id } as Activity) : null;
        update(id, { docToken: token, docConfirmed: confirmed, representative: row?.userId === uid ? row : null, docError: Boolean(row && row.userId !== uid) });
      };
      const failed = () => {
        if (listenerTokens.current.get(key) === token) update(id, { docError: true });
      };
      subscriptions.current.set(key, requireServerConfirmation
        ? onSnapshot(reference, { includeMetadataChanges: true }, next, failed) : onSnapshot(reference, next, failed));
    }
    syncActive();
    // 최초 그룹 스캔을 직렬화해 총 후보 예산을 다음 조회 limit에 반영한다.
    if (pendingGroups.current.size) return;
    const id = [...targets.groups].find(group => !subscriptions.current.has(`group:${group}`));
    if (!id) return;
    const remaining = MAX_REPRESENTATIVE_WITNESSES - witnessCount + (cache.get(id)?.witnesses?.length ?? 0);
    const readLimit = Math.min(31, remaining + 1);
    const key = `group:${id}`;
    pendingGroups.current.add(id);
    const token = Symbol(key);
    listenerTokens.current.set(key, token);
    subscriptions.current.set(key, () => {});
    const reference = query(collection(firestore, "activities"), where("userId", "==", uid),
      where("rollupSupersededBy", "==", id), limit(readLimit));
    const next = (snapshot: QuerySnapshot) => {
      if (generation.current !== currentGeneration || listenerTokens.current.get(key) !== token) return;
      const confirmed = snapshot.metadata?.fromCache === false && snapshot.metadata.hasPendingWrites === false;
      if (requireServerConfirmation && !confirmed) { update(id, { groupToken: token, groupConfirmed: false }); return; }
      pendingGroups.current.delete(id);
      const witnesses = snapshot.docs.map(document => normalize({ ...document.data(), id: document.id } as Activity));
      update(id, { groupToken: token, groupConfirmed: confirmed, witnesses: witnesses.filter(row => row.userId === uid),
        groupError: witnesses.length >= readLimit || witnesses.some(row => row.userId !== uid) });
    };
    const failed = () => {
      if (listenerTokens.current.get(key) !== token) return;
      pendingGroups.current.delete(id);
      update(id, { groupError: true });
    };
    subscriptions.current.set(key, requireServerConfirmation
      ? onSnapshot(reference, { includeMetadataChanges: true }, next, failed) : onSnapshot(reference, next, failed));
    syncActive();
  }, [targets, cache, uid, overBudget, witnessCount, firestore, requireServerConfirmation]);
  const retry = useCallback(() => {
    generation.current++;
    for (const unsubscribe of subscriptions.current.values()) unsubscribe();
    subscriptions.current.clear();
    listenerTokens.current.clear();
    pendingGroups.current.clear();
    setState({ uid, cache: new Map(), active: new Map() });
  }, [uid, firestore, requireServerConfirmation]);
  const error = overBudget || [...targets.direct].some(id => cache.get(id)?.docError)
    || [...targets.groups].some(id => cache.get(id)?.groupError);
  const loading = !error && ([...targets.direct].some(id => !("representative" in (cache.get(id) ?? {})) || requireServerConfirmation && (!cache.get(id)?.docConfirmed || !cache.get(id)?.docToken || active.get(`doc:${id}`) !== cache.get(id)?.docToken))
    || [...targets.groups].some(id => !cache.get(id)?.witnesses || requireServerConfirmation && (!cache.get(id)?.groupConfirmed || !cache.get(id)?.groupToken || active.get(`group:${id}`) !== cache.get(id)?.groupToken)));
  return { representatives, error, retry, loading };
}
