import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, firestore, functions } from "./firebase";
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

export function subscribeRiderWorkoutDevices(
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

export async function createRiderWorkoutDelivery(
  request: CreateRiderWorkoutDeliveryRequest,
): Promise<CreateRiderWorkoutDeliveryResponse> {
  await ensureAppCheckReady();
  const callable = httpsCallable<CreateRiderWorkoutDeliveryRequest, unknown>(functions, "createRiderWorkoutDelivery");
  const response = await callable(request);
  return createRiderWorkoutDeliveryResponseSchema.parse(response.data);
}

export function subscribeRiderWorkoutDelivery(
  uid: string,
  deliveryId: string,
  onChange: (delivery: RiderWorkoutDelivery | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(firestore, "users", uid, "riderWorkoutDeliveries", deliveryId),
    (snapshot) => {
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
    },
    onError,
  );
}

export function subscribeRiderWorkoutDeviceState(
  uid: string,
  deviceId: string,
  onChange: (state: RiderWorkoutDeviceState | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(firestore, "users", uid, "riderWorkoutDeviceState", deviceId),
    (snapshot) => {
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
    },
    onError,
  );
}
