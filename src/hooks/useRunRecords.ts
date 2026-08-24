/**
 * 러닝 개인 기록 구독 — `users/{uid}/records/power` 문서의 `run` 필드 (설계 문서 §3.4a).
 *
 * 이 문서는 서버 트리거 `onActivityMetricsRecords` 가 쓴다(rules `if false` — 클라 write 금지).
 * 프론트는 read-only. bike PR 도 같은 문서에 있지만 이 훅은 run 만 노출한다.
 */
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { logClientError, debugLog } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import type { PersonalRecords, RunPrTable } from "@shared/types/personal-records";

export interface RunRecordsState {
  run: RunPrTable | undefined;
  loading: boolean;
}

export function useRunRecords(enabled = true): RunRecordsState {
  const { user } = useAuth();
  const { firestore } = useFirebaseServices();
  const [state, setState] = useState<RunRecordsState>({ run: undefined, loading: true });

  useEffect(() => {
    if (!user || !enabled) {
      setState({ run: undefined, loading: false });
      return;
    }
    const ref = doc(firestore, "users", user.uid, "records", "power");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as PersonalRecords) : null;
        debugLog("useRunRecords.snapshot", {
          exists: snap.exists(),
          version: data?.version ?? null,
          runDistances: data?.run ? Object.keys(data.run) : [],
        });
        setState({ run: data?.run, loading: false });
      },
      (err) => {
        logClientError("useRunRecords.subscribe", err);
        setState({ run: undefined, loading: false });
      },
    );
    return unsub;
  }, [enabled, firestore, user]);

  return state;
}
