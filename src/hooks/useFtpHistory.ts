import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, documentId, getDocs, limit, onSnapshot, orderBy, query, startAfter, where, type QueryConstraint } from "firebase/firestore";

import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { withReadDeadline } from "../utils/withReadDeadline";
import { logClientError } from "../services/errorLogger";
import { parseFtpHistoryEntry, type FtpHistoryEntry } from "@shared/training/ftpHistory";

export interface FtpHistoryControls {
  windowStart: number;
  loading: boolean;
  error: boolean;
  loadingOlder: boolean;
  olderLoaded: boolean;
  hasMoreOlder: boolean;
  loadOlder: () => Promise<void>;
  retry: () => void;
}

export function useFtpHistory(uid: string | null | undefined, active = true) {
  const { firestore, auth } = useFirebaseServices();
  // 마운트된 소유자/SDK 세션 안에서는 기준일을 고정한다. 렌더마다 재구독하지 않는다.
  const sdkUser = auth.currentUser;
  const scope = useMemo(() => ({ uid, firestore, auth, sdkUser, windowStart: Date.now() - 120 * 86400000 }), [uid, firestore, auth, sdkUser]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const operation = useMemo(() => ({ scope, active }), [scope, active]);
  const currentOperation = useRef(operation);
  currentOperation.current = operation;
  const busy = useRef<typeof operation | null>(null);
  const pageGeneration = useRef(0);
  useEffect(() => () => { pageGeneration.current++; }, [operation]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(() => ({
    scope,
    recent: [] as FtpHistoryEntry[],
    baseline: [] as FtpHistoryEntry[],
    older: [] as FtpHistoryEntry[],
    ready: [false, false],
    errors: [false, false, false],
    cursor: null as { changedAt: number; id: string } | null,
    loadingOlder: false,
    invalidOlder: false,
    olderLoaded: false,
    hasMoreOlder: true,
  }));
  const validOwner = () => currentScope.current === scope && auth.currentUser === scope.sdkUser && scope.sdkUser?.uid === uid;

  useEffect(() => {
    const request = ++generation.current;
    setState(previous => previous.scope === scope ? (active ? previous : { ...previous, loadingOlder: false }) : {
      scope, recent: [], baseline: [], older: [], ready: [false, false], errors: [false, false, false],
      cursor: null, loadingOlder: false, invalidOlder: false, olderLoaded: false, hasMoreOlder: true,
    });
    if (!active || !uid || auth.currentUser !== scope.sdkUser || scope.sdkUser?.uid !== uid) return;
    const valid = () => currentScope.current === scope && generation.current === request && auth.currentUser === scope.sdkUser && scope.sdkUser?.uid === uid;
    const ref = collection(firestore, "users", uid, "ftpHistory");
    const requests = [
      query(ref, where("changedAt", ">=", scope.windowStart), orderBy("changedAt", "asc"), orderBy(documentId(), "asc")),
      query(ref, where("changedAt", "<", scope.windowStart), orderBy("changedAt", "desc"), orderBy(documentId(), "desc"), limit(1)),
    ];
    const stops = requests.map((target, index) => onSnapshot(target, snapshot => {
      if (!valid()) return;
      const entries = snapshot.docs.flatMap(row => {
        const entry = parseFtpHistoryEntry(row.id, row.data());
        return entry ? [entry] : [];
      });
      setState(previous => {
        const ready = [...previous.ready]; ready[index] = true;
        const errors = [...previous.errors]; errors[index] = entries.length !== snapshot.docs.length;
        return { ...previous, [index === 0 ? "recent" : "baseline"]: entries, ready, errors };
      });
    }, error => {
      if (!valid()) return;
      setState(previous => {
        const ready = [...previous.ready]; ready[index] = true;
        const errors = [...previous.errors]; errors[index] = true;
        return { ...previous, ready, errors };
      });
      logClientError("useFtpHistory.load", error, { uid });
    }));
    return () => { generation.current++; stops.forEach(stop => stop()); };
  }, [active, attempt, auth, firestore, scope, uid]);

  const loadOlder = useCallback(async (restart = false) => {
    if (!active || !uid || !validOwner() || state.scope !== scope || busy.current === operation || (!state.hasMoreOlder && !restart)) return;
    const pageRequest = pageGeneration.current;
    const valid = () => pageGeneration.current === pageRequest && currentScope.current === scope && currentOperation.current === operation && auth.currentUser === scope.sdkUser && scope.sdkUser?.uid === uid;
    busy.current = operation;
    setState(previous => ({ ...previous, loadingOlder: true }));
    try {
      const constraints: QueryConstraint[] = [where("changedAt", "<", scope.windowStart), orderBy("changedAt", "desc"), orderBy(documentId(), "desc")];
      if (state.cursor && !restart) constraints.push(startAfter(state.cursor.changedAt, state.cursor.id));
      const snapshot = await withReadDeadline(getDocs(query(collection(firestore, "users", uid, "ftpHistory"), ...constraints, limit(50))), "ftp-history-timeout");
      if (!valid()) return;
      const entries = snapshot.docs.flatMap(row => {
        const entry = parseFtpHistoryEntry(row.id, row.data());
        return entry ? [entry] : [];
      });
      const last = snapshot.docs[snapshot.docs.length - 1];
      setState(previous => ({
        ...previous, older: [...new Map([...(restart ? [] : previous.older), ...entries].map(entry => [entry.id, entry])).values()],
        cursor: last ? { changedAt: last.data().changedAt as number, id: last.id } : previous.cursor,
        errors: [previous.errors[0]!, previous.errors[1]!, false],
        invalidOlder: (!restart && previous.invalidOlder) || entries.length !== snapshot.docs.length,
        loadingOlder: false, olderLoaded: true, hasMoreOlder: snapshot.docs.length === 50,
      }));
    } catch (error) {
      if (!valid()) return;
      setState(previous => ({ ...previous, loadingOlder: false, errors: [previous.errors[0]!, previous.errors[1]!, true] }));
      logClientError("useFtpHistory.older", error, { uid });
    } finally {
      if (valid()) busy.current = null;
    }
  }, [active, auth, firestore, operation, scope, state, uid]);
  const retry = useCallback(() => {
    if (state.errors[2] || state.invalidOlder) void loadOlder(state.invalidOlder);
    if (state.errors[0] || state.errors[1]) setAttempt(value => value + 1);
  }, [loadOlder, state.errors, state.invalidOlder]);
  const visible = state.scope === scope && validOwner();
  // 실시간 기준점/최근 값이 수동 페이지 캐시보다 우선한다.
  const entries = visible ? [...new Map([...state.older, ...state.baseline, ...state.recent].map(entry => [entry.id, entry])).values()]
    .sort((a, b) => {
      if (a.changedAt !== b.changedAt) return a.changedAt - b.changedAt;
      const left = Array.from(a.id, character => character.codePointAt(0)!);
      const right = Array.from(b.id, character => character.codePointAt(0)!);
      for (let index = 0; index < Math.min(left.length, right.length); index++) {
        if (left[index] !== right[index]) return left[index]! - right[index]!;
      }
      return left.length - right.length;
    }) : [];
  return {
    entries, windowStart: scope.windowStart,
    loading: Boolean(uid) && (!visible || !state.ready.every(Boolean)),
    error: visible && (state.invalidOlder || state.errors.some(Boolean)),
    loadingOlder: visible && state.loadingOlder,
    olderLoaded: visible && state.olderLoaded,
    hasMoreOlder: !visible || state.hasMoreOlder,
    loadOlder, retry,
  };
}
