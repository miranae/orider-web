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
import type { SufficiencySet } from "@shared/types/sufficiency";
import { parsePersistedEmptyPdc, parsePersistedPdc, unknownPdcTopLevelKeys } from "../services/pdcContract";
import { parseSufficiencySet } from "../services/sufficiencyContract";

/**
 * `sufficiency` 는 서버가 같은 문서에 함께 쓴 충분도 블록이다. 블록이 없는 문서(도입 이전)·모양이
 * 틀린 블록이면 null — 화면은 기존 표시를 그대로 쓴다. 값 없는 PDC(status "empty")는 곡선이 없으므로
 * `missing` 으로 두고 블록만 싣는다 — 기존 소비자는 PDC 없음과 똑같이 동작한다.
 */
export type UsePdcState =
  | { status: "loading"; pdc: null; sufficiency?: null }
  | { status: "missing"; pdc: null; sufficiency?: SufficiencySet | null }
  | { status: "partial"; pdc: null; sufficiency?: SufficiencySet | null }
  | { status: "ready"; pdc: PdcDoc; sufficiency?: SufficiencySet | null };

function readSufficiency(raw: unknown, uid: string): SufficiencySet | null {
  const value = raw != null && typeof raw === "object" ? (raw as { sufficiency?: unknown }).sufficiency : undefined;
  if (value === undefined) return null;
  const parsed = parseSufficiencySet(value);
  if (!parsed) {
    logClientError("usePdc.invalidSufficiency", new Error("INVALID_SUFFICIENCY_SET"), { uid });
    return null;
  }
  if (parsed.dropped > 0) {
    logClientError("usePdc.droppedSufficiencyBlocks", new Error(String(parsed.dropped)), { uid });
  }
  return parsed.set;
}

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
          const set = readSufficiency(snap.data(), uid);
          // 블록이 있을 때만 키를 싣는다 — 블록 없는 문서의 상태 모양은 도입 전과 같다.
          const sufficiency = set ? { sufficiency: set } : {};
          if (parsePersistedEmptyPdc(snap.data())) {
            setState({ status: "missing", pdc: null, ...sufficiency });
            return;
          }
          const parsed = parsePersistedPdc(snap.data());
          setState(parsed.version === 6 && parsed.status === "partial"
            ? { status: "partial", pdc: null, ...sufficiency }
            : { status: "ready", pdc: parsed, ...sufficiency });
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
