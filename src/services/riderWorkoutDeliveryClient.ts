import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { collection, doc, getDocFromServer, onSnapshot, query, where, type DocumentSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
// eslint-disable-next-line design-system/no-firebase-singleton-in-embed -- 일반 웹 convenience exports 기본값. 임베드는 createRiderWorkoutDeliveryClient(services)를 사용한다.
import { auth, ensureAppCheckReady, firestore, functions, getAppCheckToken } from "./firebase";
import { logClientError } from "./errorLogger";
import type { WorldErrorReporter } from "../features/ride-world/worldReadiness";
import { subscribeDeviceDeliverySignal } from "./deviceDeliverySignal";
import {
  createRiderWorkoutDeliveryResponseSchema,
  parseRiderWorkoutDelivery,
  parseRiderWorkoutDeviceState,
  parseRiderWorkoutDeviceRegistration,
  type CreateRiderWorkoutDeliveryRequest,
  type CreateRiderWorkoutDeliveryResponse,
  type RiderWorkoutDelivery,
  type RiderWorkoutDeviceRegistration,
  type RiderWorkoutDeviceState,
} from "./riderWorkoutDeliveryContract";

export type RiderWorkoutDeliveryErrorKind =
  | "uncertain_network"
  | "feature_disabled"
  | "device_reconnect"
  | "ftp_required"
  | "auth"
  | "app_check"
  | "conflict"
  | "execution_active"
  | "cooldown"
  | "invalid"
  | "unknown";

function errorCode(error: unknown): string {
  const value = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return value.replace(/^functions\//, "");
}

export function classifyRiderWorkoutDeliveryError(error: unknown): RiderWorkoutDeliveryErrorKind {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (["unavailable", "deadline-exceeded", "internal"].includes(code)) return "uncertain_network";
  if (code === "not-found") return "feature_disabled";
  if (code === "unauthenticated") return "auth";
  if (code === "permission-denied") return "app_check";
  if (code === "already-exists" || code === "aborted") return "conflict";
  if (code === "resource-exhausted") return "cooldown";
  if (code === "invalid-argument") return "invalid";
  if (code === "failed-precondition") {
    if (/실행 중|execution/i.test(message)) return "execution_active";
    if (/FTP|canonical/i.test(message)) return "ftp_required";
    return "device_reconnect";
  }
  return "unknown";
}

export function createRiderWorkoutDeliveryClient(services: Pick<FirebaseServices, "firestore" | "functions" | "ensureAppCheckReady">
  & Partial<Pick<FirebaseServices, "auth" | "isSessionApproved" | "getAppCheckToken">>) {
  const { firestore, functions, ensureAppCheckReady } = services;
  function deviceReporter(): WorldErrorReporter {
    const loggingServices = services.auth ? { ...services, auth: services.auth } : undefined;
    const viewer = loggingServices?.auth.currentUser;
    return (source, error, context) => logClientError(source, error, context, loggingServices, viewer);
  }
  function subscribeRiderWorkoutDevices(
    uid: string,
    onChange: (devices: RiderWorkoutDeviceRegistration[]) => void,
    onError: (error: Error) => void,
  ): () => void {
    const ref = query(
      collection(firestore, "users", uid, "deviceRegistrations"),
      where("status", "==", "active"),
    );
    return onSnapshot(ref, (snapshot) => {
      onChange(snapshot.docs.flatMap((item) => {
        const device = parseRiderWorkoutDeviceRegistration(item.id, item.data());
        return device ? [device] : [];
      }).sort((left, right) => right.lastSeenAtMillis - left.lastSeenAtMillis));
    }, onError);
  }

  async function createRiderWorkoutDelivery(
    request: CreateRiderWorkoutDeliveryRequest,
  ): Promise<CreateRiderWorkoutDeliveryResponse> {
    await ensureAppCheckReady();
    const callable = httpsCallable<CreateRiderWorkoutDeliveryRequest, unknown>(functions, "createRiderWorkoutDelivery");
    const response = await callable(request);
    return createRiderWorkoutDeliveryResponseSchema.parse(response.data);
  }

  function subscribeRiderWorkoutDelivery(
    uid: string,
    deliveryId: string,
    onChange: (delivery: RiderWorkoutDelivery | null) => void,
    onError: (error: Error) => void,
  ): () => void {
    const ref = doc(firestore, "users", uid, "riderWorkoutDeliveries", deliveryId);
    const receive = (snapshot: DocumentSnapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      const delivery = parseRiderWorkoutDelivery(snapshot.data());
      if (!delivery) {
        onError(new Error("Rider workout delivery contract mismatch"));
        return;
      }
      onChange(delivery);
    };
    return subscribeDeviceDeliverySignal(firestore, uid, `workout-receipt:${deliveryId}`,
      () => getDocFromServer(ref), receive, onError, (serverOnly, isCurrent) => serverOnly
        ? onSnapshot(ref, { includeMetadataChanges: true }, snap => { if (isCurrent() && !snap.metadata.fromCache) receive(snap); }, error => { if (isCurrent()) onError(error); })
        : onSnapshot(ref, receive, onError), deviceReporter());
  }

  function subscribeRiderWorkoutDeviceState(
    uid: string,
    deviceId: string,
    onChange: (state: RiderWorkoutDeviceState | null) => void,
    onError: (error: Error) => void,
  ): () => void {
    const ref = doc(firestore, "users", uid, "riderWorkoutDeviceState", deviceId);
    const receive = (snapshot: DocumentSnapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      const state = parseRiderWorkoutDeviceState(snapshot.data());
      if (!state || state.deviceId !== deviceId) {
        onError(new Error("Rider workout device state contract mismatch"));
        return;
      }
      onChange(state);
    };
    return subscribeDeviceDeliverySignal(firestore, uid, `workout-device:${deviceId}`,
      () => getDocFromServer(ref), receive, onError, (serverOnly, isCurrent) => serverOnly
        ? onSnapshot(ref, { includeMetadataChanges: true }, snap => { if (isCurrent() && !snap.metadata.fromCache) receive(snap); }, error => { if (isCurrent()) onError(error); })
        : onSnapshot(ref, receive, onError), deviceReporter());
  }

  return { subscribeRiderWorkoutDevices, createRiderWorkoutDelivery, subscribeRiderWorkoutDelivery, subscribeRiderWorkoutDeviceState };
}
export const subscribeRiderWorkoutDevices: ReturnType<typeof createRiderWorkoutDeliveryClient>["subscribeRiderWorkoutDevices"] = (...args) => createRiderWorkoutDeliveryClient({ firestore, functions, ensureAppCheckReady }).subscribeRiderWorkoutDevices(...args);
export const createRiderWorkoutDelivery: ReturnType<typeof createRiderWorkoutDeliveryClient>["createRiderWorkoutDelivery"] = (...args) => createRiderWorkoutDeliveryClient({ firestore, functions, ensureAppCheckReady }).createRiderWorkoutDelivery(...args);
export const subscribeRiderWorkoutDelivery: ReturnType<typeof createRiderWorkoutDeliveryClient>["subscribeRiderWorkoutDelivery"] = (...args) => createRiderWorkoutDeliveryClient({ auth, firestore, functions, ensureAppCheckReady, getAppCheckToken }).subscribeRiderWorkoutDelivery(...args);
export const subscribeRiderWorkoutDeviceState: ReturnType<typeof createRiderWorkoutDeliveryClient>["subscribeRiderWorkoutDeviceState"] = (...args) => createRiderWorkoutDeliveryClient({ auth, firestore, functions, ensureAppCheckReady, getAppCheckToken }).subscribeRiderWorkoutDeviceState(...args);
