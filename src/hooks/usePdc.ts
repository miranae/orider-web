/**
 * usePdc — `users/{uid}/fitness/pdc_bike` 실시간 구독.
 *
 * 서버(`pdc-trigger.ts`)가 90일 윈도우 활동 MMP 로 계산한
 * CP/W'·pdcModel(FTP추정·TTE·pmax)·파워 프로파일 등을 읽어온다.
 *
 * Firestore rules: 소유자만 read. uid 없으면 구독 안 함.
 */

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import type { PdcDoc } from "@shared/types/pdc";
import { parsePersistedPdc, unknownPdcTopLevelKeys } from "../services/pdcContract";

export type UsePdcState =
  | { status: "loading"; pdc: null }
  | { status: "missing"; pdc: null }
  | { status: "partial"; pdc: null }
  | { status: "ready"; pdc: PdcDoc };

/**
 * @param uid Firebase Auth uid. null/undefined 이면 구독 안 함 (status="loading" 유지).
 */
export function usePdc(uid: string | null | undefined, active = true): UsePdcState {
  const { firestore } = useFirebaseServices();
  const [snapshot, setSnapshot] = useState<{ uid: typeof uid; firestore: typeof firestore; generation: number; state: UsePdcState } | null>(null);
  const generationRef = useRef(0);
  const identityRef = useRef({ uid, firestore });
  if (identityRef.current.uid !== uid || identityRef.current.firestore !== firestore) {
    identityRef.current = { uid, firestore };
    generationRef.current += 1;
  }
  useEffect(() => {
    const generation = ++generationRef.current;
    const setState = (state: UsePdcState) => setSnapshot({ uid, firestore, generation, state });

    if (!active && uid) return;
    if (!uid) {
      setState({ status: "loading", pdc: null });
      return undefined;
    }
    const unsub = onSnapshot(
      doc(firestore, "users", uid, "fitness", "pdc_bike"),
      (snap) => {
        if (generationRef.current !== generation) return;
        if (!snap.exists()) {
          setState({ status: "missing", pdc: null });
          return;
        }
        try {
          // 모르는 키는 읽기를 막지 않는다 — 대신 드러낸다. 서버가 필드를 더했을 뿐인지,
          // 내부 데이터가 샌 것인지는 사람이 판단해야 한다.
          const unknownKeys = unknownPdcTopLevelKeys(snap.data());
          if (unknownKeys.length > 0) {
            logClientError("usePdc.unknownFields", new Error(unknownKeys.join(",")), { uid });
          }
          const parsed = parsePersistedPdc(snap.data());
          setState(parsed.version === 6 && parsed.status === "partial"
            ? { status: "partial", pdc: null }
            : { status: "ready", pdc: parsed });
        } catch (error) {
          logClientError("usePdc.invalidContract", error, { uid });
          setState({ status: "missing", pdc: null });
        }
      },
      (err) => {
        if (generationRef.current !== generation) return;
        logClientError("usePdc", err, { uid });
        setState({ status: "missing", pdc: null });
      },
    );
    return () => {
      generationRef.current += 1;
      unsub();
    };
  }, [active, firestore, uid]);

  return snapshot && snapshot.uid === uid && snapshot.firestore === firestore && snapshot.generation === generationRef.current ? snapshot.state : { status: "loading", pdc: null };
}
