/**
 * 러닝 개인 기록 구독 — `users/{uid}/records/power` 문서의 `run` 필드 (설계 문서 §3.4a).
 *
 * 이 문서는 서버 트리거 `onActivityMetricsRecords` 가 쓴다(rules `if false` — 클라 write 금지).
 * 프론트는 read-only. bike PR 도 같은 문서에 있지만 이 훅은 run 만 노출한다.
 */
import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { logClientError, debugLog } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import type { PersonalRecords, RunPrTable } from "@shared/types/personal-records";

export interface RunRecordsState {
  run: RunPrTable | undefined;
  loading: boolean;
}

export function useRunRecords(enabled = true, active = true): RunRecordsState {
  const { user } = useAuth();
  const { firestore } = useFirebaseServices();
  const [state, setState] = useState<RunRecordsState>({ run: undefined, loading: true });

  const uid = user?.uid ?? null;
  const ownerUid = useRef(uid);
  const generationRef = useRef(0);
  useEffect(() => {
    const generation = ++generationRef.current;
    if (ownerUid.current !== uid) {
      setState({ run: undefined, loading: false });
      ownerUid.current = uid;
    }
    if (!active && user && enabled) return;
    if (!user || !enabled) {
      setState({ run: undefined, loading: false });
      return;
    }
    const ref = doc(firestore, "users", user.uid, "records", "power");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (generationRef.current !== generation) return;
        const data = snap.exists() ? (snap.data() as PersonalRecords) : null;
        debugLog("useRunRecords.snapshot", {
          exists: snap.exists(),
          version: data?.version ?? null,
          runDistances: data?.run ? Object.keys(data.run) : [],
        });
        setState({ run: data?.run, loading: false });
      },
      (err) => {
        if (generationRef.current !== generation) return;
        logClientError("useRunRecords.subscribe", err);
        setState({ run: undefined, loading: false });
      },
    );
    return () => {
      generationRef.current += 1;
      unsub();
    };
  }, [active, enabled, firestore, uid, user]);

  return ownerUid.current === uid ? state : { run: undefined, loading: false };
}
