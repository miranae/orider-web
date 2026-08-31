import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyRiderWorkoutDeliveryError, createRiderWorkoutDelivery, subscribeRiderWorkoutDelivery,
  subscribeRiderWorkoutDevices, subscribeRiderWorkoutDeviceState, type RiderWorkoutDeliveryErrorKind,
} from "../../services/riderWorkoutDeliveryClient";
import {
  canAdvanceRiderWorkoutDeliveryState, canCreateAfterDelivery, deliveryPresentationState,
  type RiderWorkoutDelivery, type RiderWorkoutDeviceRegistration, type RiderWorkoutDeviceState, type RiderWorkoutType,
} from "../../services/riderWorkoutDeliveryContract";

type SubmitState = "idle" | "submitting" | "watching" | "error";

function requestId(): string {
  const random = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `fitness_${random.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

export function useRiderWorkoutDelivery(uid: string | null, workoutType: RiderWorkoutType) {
  const [devices, setDevices] = useState<RiderWorkoutDeviceRegistration[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(Boolean(uid));
  const [devicesError, setDevicesError] = useState<Error | null>(null);
  const [targetDeviceId, setTargetDeviceIdState] = useState("");
  const [pointer, setPointer] = useState<RiderWorkoutDeviceState | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [delivery, setDelivery] = useState<RiderWorkoutDelivery | null>(null);
  const [queued, setQueued] = useState<{ deliveryId: string; generation: number; state: RiderWorkoutDelivery["state"] } | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const [submitErrorKind, setSubmitErrorKind] = useState<RiderWorkoutDeliveryErrorKind | null>(null);
  const [now, setNow] = useState(Date.now());
  const requestRef = useRef<{ key: string; id: string } | null>(null);
  const deviceScopeRef = useRef(0);
  const operationRef = useRef(0);
  const expectedNewDeliveryRef = useRef<{ deliveryId: string; generation: number } | null>(null);
  const latestConfirmedDeliveryRef = useRef<{ deliveryId: string; generation: number } | null>(null);

  useEffect(() => {
    const operation = ++deviceScopeRef.current;
    setDevices([]); setDevicesLoading(Boolean(uid)); setDevicesError(null); setTargetDeviceIdState("");
    if (!uid) return;
    return subscribeRiderWorkoutDevices(uid, (next) => {
      if (deviceScopeRef.current !== operation) return;
      setDevices(next);
      setTargetDeviceIdState((current) => next.some((device) => device.deviceId === current) ? current : next[0]?.deviceId ?? "");
      setDevicesLoading(false); setDevicesError(null);
    }, (error) => {
      if (deviceScopeRef.current !== operation) return;
      setDevicesError(error); setDevicesLoading(false);
    });
  }, [uid]);

  useEffect(() => {
    const operation = ++operationRef.current;
    let unsubscribeDelivery: (() => void) | null = null;
    let deliverySubscriptionRevision = 0;
    setPointer(null); setDelivery(null); setQueued(null); setRestoreLoading(Boolean(uid && targetDeviceId));
    setSubmitState("idle"); setSubmitError(null); setSubmitErrorKind(null);
    requestRef.current = null; expectedNewDeliveryRef.current = null; latestConfirmedDeliveryRef.current = null;
    if (!uid || !targetDeviceId) return;
    const unsubscribePointer = subscribeRiderWorkoutDeviceState(uid, targetDeviceId, (nextPointer) => {
      if (operationRef.current !== operation) return;
      const confirmed = latestConfirmedDeliveryRef.current;
      if (nextPointer && confirmed && (nextPointer.latestGeneration < confirmed.generation
        || (nextPointer.latestGeneration === confirmed.generation && nextPointer.latestDeliveryId !== confirmed.deliveryId))) return;
      const expected = expectedNewDeliveryRef.current;
      if (expected && nextPointer?.latestDeliveryId !== expected.deliveryId) {
        if (!nextPointer || nextPointer.latestGeneration < expected.generation) return;
        expectedNewDeliveryRef.current = null;
        setQueued(null);
      }
      const subscriptionRevision = ++deliverySubscriptionRevision;
      unsubscribeDelivery?.(); unsubscribeDelivery = null; setPointer(nextPointer);
      if (!nextPointer) { setDelivery(null); setRestoreLoading(false); return; }
      setRestoreLoading(true);
      unsubscribeDelivery = subscribeRiderWorkoutDelivery(uid, nextPointer.latestDeliveryId, (nextDelivery) => {
        if (operationRef.current !== operation || deliverySubscriptionRevision !== subscriptionRevision) return;
        if (!nextDelivery) {
          if (expectedNewDeliveryRef.current) return;
          setPointer(null); setDelivery(null); setRestoreLoading(false); setSubmitState("idle");
          setSubmitError(null); setSubmitErrorKind(null); return;
        }
        if (nextDelivery.deliveryId !== nextPointer.latestDeliveryId || nextDelivery.generation !== nextPointer.latestGeneration
          || nextDelivery.targetDeviceId !== targetDeviceId) {
          setSubmitState("error"); setSubmitErrorKind("conflict");
          setSubmitError(new Error("Rider workout pointer and delivery identity mismatch")); setRestoreLoading(true); return;
        }
        setDelivery((current) => current && current.deliveryId === nextDelivery.deliveryId
          && !canAdvanceRiderWorkoutDeliveryState(current.state, nextDelivery.state) ? current : nextDelivery);
        latestConfirmedDeliveryRef.current = { deliveryId: nextDelivery.deliveryId, generation: nextDelivery.generation };
        setQueued(null); expectedNewDeliveryRef.current = null; setSubmitState("watching");
        setSubmitError(null); setSubmitErrorKind(null); setRestoreLoading(false);
      }, (error) => {
        if (operationRef.current !== operation || deliverySubscriptionRevision !== subscriptionRevision) return;
        setSubmitState("error"); setSubmitErrorKind("conflict"); setSubmitError(error); setRestoreLoading(true);
      });
    }, (error) => {
      if (operationRef.current !== operation) return;
      setSubmitState("error"); setSubmitErrorKind("conflict"); setSubmitError(error); setRestoreLoading(true);
    });
    return () => { deliverySubscriptionRevision += 1; unsubscribePointer(); unsubscribeDelivery?.(); };
  }, [targetDeviceId, uid, workoutType]);

  useEffect(() => {
    const expiresAt = delivery?.bundle.expiresAt;
    if (!expiresAt || expiresAt <= Date.now()) { setNow(Date.now()); return; }
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.min(expiresAt - Date.now() + 10, 2_147_000_000));
    return () => window.clearTimeout(timeout);
  }, [delivery?.bundle.expiresAt]);

  const presentationState = queued?.state ?? deliveryPresentationState(delivery, now);
  const canCreate = !restoreLoading && queued === null && canCreateAfterDelivery(presentationState);
  const setTargetDeviceId = useCallback((deviceId: string) => {
    if (submitState !== "submitting") setTargetDeviceIdState(deviceId);
  }, [submitState]);

  const submit = useCallback(async () => {
    if (!uid || !targetDeviceId || submitState === "submitting" || !canCreate) return;
    if (pointer && delivery && (pointer.latestDeliveryId !== delivery.deliveryId
      || pointer.latestGeneration !== delivery.generation || delivery.targetDeviceId !== targetDeviceId)) return;
    const key = `${uid}:${targetDeviceId}:${workoutType}`;
    if (requestRef.current?.key !== key) requestRef.current = { key, id: requestId() };
    const operation = operationRef.current;
    setSubmitState("submitting"); setSubmitError(null); setSubmitErrorKind(null);
    try {
      const response = await createRiderWorkoutDelivery({ expectedUid: uid, requestId: requestRef.current.id, targetDeviceId, workoutType });
      if (operationRef.current !== operation) return;
      requestRef.current = null;
      const confirmed = latestConfirmedDeliveryRef.current;
      if (!confirmed || confirmed.generation < response.generation) {
        expectedNewDeliveryRef.current = { deliveryId: response.deliveryId, generation: response.generation };
        setQueued({ deliveryId: response.deliveryId, generation: response.generation, state: response.state });
      }
      setSubmitState("watching");
    } catch (error) {
      if (operationRef.current !== operation) return;
      const kind = classifyRiderWorkoutDeliveryError(error);
      if (kind !== "uncertain_network") requestRef.current = null;
      setSubmitState("error"); setSubmitErrorKind(kind);
      setSubmitError(error instanceof Error ? error : new Error(String(error)));
    }
  }, [canCreate, delivery, pointer, submitState, targetDeviceId, uid, workoutType]);

  const prepareNewRequest = useCallback(() => {
    if (submitState !== "error" || submitErrorKind === "uncertain_network") return;
    requestRef.current = null;
    setSubmitError(null); setSubmitErrorKind(null); setSubmitState("idle");
  }, [submitErrorKind, submitState]);

  return {
    devices, devicesLoading, devicesError, targetDeviceId, setTargetDeviceId,
    delivery, deliveryState: presentationState, restoreLoading, canCreate,
    submitState, submitError, submitErrorKind, submit, prepareNewRequest,
    canSafelyReplay: submitState === "error" && submitErrorKind === "uncertain_network"
      && expectedNewDeliveryRef.current === null && requestRef.current !== null,
  };
}
