import { useCallback, useMemo, useState, useEffect } from "react";
import { logClientError } from "../services/errorLogger";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  onSnapshot,
  type QueryConstraint,
  type DocumentData,
} from "firebase/firestore";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { subscribeCourseDetail } from "../features/courses/courseDetailAsset";


function stableStringify(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (seen.has(value)) return '"[Circular]"';
  seen.add(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key], seen)}`).join(",")}}`;
}

function serializeQueryConstraints(constraints: QueryConstraint[]): string {
  return constraints.map((constraint) => stableStringify(constraint)).join("|");
}

/**
 * Firestore 문서 하나 조회
 */
export function useDocument<T = DocumentData>(
  collectionPath: string,
  docId: string | undefined,
  courseTrackAssets = false
) {
  const services = useFirebaseServices();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // 읽기 실패 문구를 누르면 다시 구독한다. 다시 읽은 실패는 기록한다(첫 실패는 예전처럼 호출부 몫).
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setError(null); setLoading(true); setAttempt(value => value + 1); }, []);
  // 임베드는 별도 Firebase app 을 쓴다 — 싱글턴 대신 주입된 인스턴스(#847).
  const { firestore } = services;

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      return;
    }

    if (collectionPath === "courses" && courseTrackAssets) {
      let stopCourse: (() => void) | undefined;
      const stopAuth = onAuthStateChanged(services.auth, () => {
        stopCourse?.();
        setData(null); setError(null); setLoading(true);
        stopCourse = subscribeCourseDetail(services, docId, (value) => { setData(value as T | null); setError(null); setLoading(false); },
          (failure) => { setError(failure); setLoading(false); });
      });
      return () => { stopAuth(); stopCourse?.(); };
    }
    const docRef = doc(services.firestore, collectionPath, docId);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setData({ id: snap.id, ...snap.data() } as T);
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (err) => {
        if (attempt > 0) logClientError("useDocument.retry", err, { collectionPath, docId, attempt }, services);
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [firestore, collectionPath, docId, services, courseTrackAssets, attempt]);


  return { data, loading, error, retry };
}

/**
 * Firestore 컬렉션 조회
 */
export function useCollection<T = DocumentData>(
  collectionPath: string,
  constraints: QueryConstraint[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const constraintsKey = serializeQueryConstraints(constraints);
  const stableConstraints = useMemo(() => constraints, [constraintsKey]);
  const services = useFirebaseServices();
  const { firestore } = services;
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setError(null); setLoading(true); setAttempt(value => value + 1); }, []);

  useEffect(() => {
    const q = query(collection(firestore, collectionPath), ...stableConstraints);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as T
        );
        setData(items);
        setLoading(false);
      },
      (err) => {
        if (attempt > 0) logClientError("useCollection.retry", err, { collectionPath, attempt }, services);
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
     
  }, [firestore, collectionPath, stableConstraints, attempt]);

  return { data, loading, error, retry };
}

export { where, orderBy, limit, collection, doc, getDoc };
