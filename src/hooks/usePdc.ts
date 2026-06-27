/**
 * usePdc — `users/{uid}/fitness/pdc_bike` 실시간 구독.
 *
 * 서버(`pdc-trigger.ts`)가 90일 윈도우 활동 MMP 로 계산한
 * CP/W'·pdcModel(FTP추정·TTE·pmax)·파워 프로파일 등을 읽어온다.
 *
 * Firestore rules: 소유자만 read. uid 없으면 구독 안 함.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import type { PdcDoc } from "@shared/types/pdc";

export type UsePdcState =
  | { status: "loading"; pdc: null }
  | { status: "missing"; pdc: null }
  | { status: "ready"; pdc: PdcDoc };

/**
 * @param uid Firebase Auth uid. null/undefined 이면 구독 안 함 (status="loading" 유지).
 */
export function usePdc(uid: string | null | undefined): UsePdcState {
  const [state, setState] = useState<UsePdcState>({ status: "loading", pdc: null });

  useEffect(() => {
    if (!uid) {
      setState({ status: "loading", pdc: null });
      return undefined;
    }
    setState({ status: "loading", pdc: null });
    const unsub = onSnapshot(
      doc(firestore, "users", uid, "fitness", "pdc_bike"),
      (snap) => {
        if (!snap.exists()) {
          setState({ status: "missing", pdc: null });
          return;
        }
        setState({ status: "ready", pdc: snap.data() as PdcDoc });
      },
      (err) => {
        logClientError("usePdc", err, { uid });
        setState({ status: "missing", pdc: null });
      },
    );
    return () => unsub();
  }, [uid]);

  return state;
}
