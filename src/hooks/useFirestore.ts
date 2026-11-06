import { useMemo, useState, useEffect } from "react";
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
  docId: string | undefined
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // 임베드는 별도 Firebase app 을 쓴다 — 싱글턴 대신 주입된 인스턴스(#847).
  const { firestore } = useFirebaseServices();

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      return;
    }

    const docRef = doc(firestore, collectionPath, docId);
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
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [firestore, collectionPath, docId]);

  return { data, loading, error };
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
  const { firestore } = useFirebaseServices();

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
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
     
  }, [firestore, collectionPath, stableConstraints]);

  return { data, loading, error };
}

export { where, orderBy, limit, collection, doc, getDoc };
