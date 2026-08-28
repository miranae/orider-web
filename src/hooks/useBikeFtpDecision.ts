import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import {
  parseBikeThresholdDecisionV2,
  parseFtpDeviceReceipt,
  parseFtpMutationReceipt,
  type BikeThresholdDecisionV2,
  type FtpDeviceReceipt,
  type FtpMutationReceipt,
} from "@shared/types/threshold";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";

interface Options {
  uid?: string | null;
  decisionId?: string | null;
  sourceActivityId?: string | null;
  enabled?: boolean;
}

interface State {
  decision: BikeThresholdDecisionV2 | null;
  receipt: FtpMutationReceipt | null;
  deviceReceipts: FtpDeviceReceipt[];
  loading: boolean;
  error: string | null;
}

interface ScopedState extends State {
  scopeKey: string;
}

const EMPTY_STATE: State = {
  decision: null,
  receipt: null,
  deviceReceipts: [],
  loading: false,
  error: null,
};

export function useBikeFtpDecision({ uid, decisionId, sourceActivityId, enabled = true }: Options): State {
  const scopeKey = enabled && uid
    ? JSON.stringify([uid, decisionId ?? null, sourceActivityId ?? null])
    : "";
  // 임베드 진입(`/embed/*`)은 일반 Firebase 를 초기화하지 않고 **임베드 전용 named app**
  // 을 쓴다. `services/firebase` 의 모듈 싱글턴을 직접 쓰면 그 경로에서 undefined 라
  // `collection()` 이 던지고, 피트니스 표면이 통째로 렌더되지 않는다 (#847).
  const { firestore } = useFirebaseServices();
  const [state, setState] = useState<ScopedState>({ ...EMPTY_STATE, scopeKey: "" });
  const decisionGeneration = useRef(0);
  const receiptGeneration = useRef(0);

  useEffect(() => {
    const generation = ++decisionGeneration.current;
    if (!uid || !enabled) {
      setState({ ...EMPTY_STATE, scopeKey });
      return;
    }
    setState({ ...EMPTY_STATE, scopeKey, loading: true });
    const coll = collection(firestore, "users", uid, "bike_threshold_decisions");
    const safeDecisionId = decisionId && decisionId.length <= 512 && !decisionId.includes("/")
      ? decisionId
      : null;
    const publish = (candidates: Array<{ id: string; value: unknown }>) => {
        if (decisionGeneration.current !== generation) return;
        const decision = candidates
          .map(({ id, value }) => {
            const parsed = parseBikeThresholdDecisionV2(value);
            return parsed && parsed.decisionId === id ? parsed : null;
          })
          .filter((item): item is BikeThresholdDecisionV2 => item !== null)
          .filter((item) => !sourceActivityId || item.evidence.activityId === sourceActivityId)
          .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
        setState((current) => current.scopeKey === scopeKey
          ? { ...current, decision, receipt: null, deviceReceipts: [], loading: false, error: null }
          : current);
    };
    const onError = (error: Error) => {
        if (decisionGeneration.current !== generation) return;
        logClientError("useBikeFtpDecision.decision", error, { decisionId, sourceActivityId });
        setState((current) => current.scopeKey === scopeKey
          ? { ...current, decision: null, loading: false, error: error.message }
          : current);
    };
    if (decisionId && !safeDecisionId) {
      publish([]);
      return;
    }
    const unsubscribe = safeDecisionId
      ? onSnapshot(
          doc(coll, safeDecisionId),
          (snapshot) => publish(snapshot.exists() ? [{ id: snapshot.id, value: snapshot.data() }] : []),
          onError,
        )
      : onSnapshot(
          sourceActivityId
            ? query(coll, where("evidence.activityId", "==", sourceActivityId), limit(10))
            : query(coll, orderBy("createdAt", "desc"), limit(10)),
          (snapshot) => publish(snapshot.docs.map((item) => ({ id: item.id, value: item.data() }))),
          onError,
        );
    return () => {
      if (decisionGeneration.current === generation) decisionGeneration.current += 1;
      unsubscribe();
    };
  }, [decisionId, enabled, firestore, scopeKey, sourceActivityId, uid]);

  const mutationId = state.scopeKey === scopeKey ? state.decision?.ftpMutationId ?? null : null;
  useEffect(() => {
    const generation = ++receiptGeneration.current;
    if (!uid || !enabled || !mutationId) {
      setState((current) => current.scopeKey === scopeKey
        ? { ...current, receipt: null, deviceReceipts: [] }
        : current);
      return;
    }
    const receiptRef = doc(firestore, "users", uid, "ftpMutationReceipts", encodeURIComponent(mutationId));
    const unsubscribeReceipt = onSnapshot(receiptRef, (snapshot) => {
      if (receiptGeneration.current !== generation) return;
      const parsed = snapshot.exists() ? parseFtpMutationReceipt(snapshot.data()) : null;
      setState((current) => current.scopeKey === scopeKey ? {
          ...current,
          receipt: parsed?.mutationId === mutationId ? parsed : null,
        } : current);
    }, (error) => logClientError("useBikeFtpDecision.receipt", error, { mutationId }));

    const deviceQuery = query(
      collection(firestore, "users", uid, "deviceStateReceipts"),
      where("ftpRevision", "==", mutationId),
      limit(25),
    );
    const unsubscribeDevices = onSnapshot(deviceQuery, (snapshot) => {
      if (receiptGeneration.current !== generation) return;
      const deviceReceipts = snapshot.docs
        .map((item) => parseFtpDeviceReceipt({ ...item.data(), deviceId: item.id }))
        .filter((item): item is FtpDeviceReceipt => item?.ftpRevision === mutationId);
      setState((current) => current.scopeKey === scopeKey ? { ...current, deviceReceipts } : current);
    }, (error) => logClientError("useBikeFtpDecision.deviceReceipts", error, { mutationId }));

    return () => {
      if (receiptGeneration.current === generation) receiptGeneration.current += 1;
      unsubscribeReceipt();
      unsubscribeDevices();
    };
  }, [enabled, firestore, mutationId, scopeKey, uid]);

  if (state.scopeKey !== scopeKey) {
    return { ...EMPTY_STATE, loading: Boolean(uid && enabled) };
  }
  return {
    ...state,
    receipt: state.receipt?.mutationId === mutationId ? state.receipt : null,
    deviceReceipts: state.deviceReceipts.filter((item) => item.ftpRevision === mutationId),
  };
}
