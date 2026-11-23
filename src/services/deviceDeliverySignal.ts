import { getAuth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { WorldErrorReporter } from "../features/ride-world/worldReadiness";
import { followWorldSignal } from "../features/ride-world/followWorldSignal";
import { accountWorldEndpoint, accountWorldExpiresAt, accountWorldSubscription } from "../features/ride-world/accountWorldSignal";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";

export function subscribeDeviceDeliverySignal<T>(
  firestore: Firestore, uid: string, resource: string,
  read: () => Promise<T>, receive: (snapshot: T) => void, onError: (error: Error) => void,
  fallback: (serverOnly: boolean, isCurrent: () => boolean) => () => void,
  report: WorldErrorReporter,
  getAppCheckToken?: FirebaseServices["getAppCheckToken"],
): () => void {
  const endpoint = accountWorldEndpoint("device", firestore.app?.options?.projectId);
  const hosted = endpoint?.startsWith("wss:");
  if (!endpoint || (hosted && !getAppCheckToken)) {
    return fallback(false, () => true);
  }
  const auth = getAuth(firestore.app);
  const user = auth.currentUser;
  let closed = false, revision = 0;
  let stopFallback: (() => void) | undefined;
  const active = () => !closed && auth.currentUser === user;
  const stopCanonical = () => { stopFallback?.(); stopFallback = undefined; };
  const restore = (serverOnly = true) => {
    if (!active()) return;
    revision++;
    stopFallback ??= fallback(serverOnly, active);
  };
  const denied = () => {
    if (!active()) return;
    revision++;
    stopCanonical();
    onError(Object.assign(new Error("기기 전달 상태 접근이 거절됐습니다."), { code: "permission-denied" }));
  };
  if (!user || user.uid !== uid || user.isAnonymous) {
    denied();
    return () => {};
  }
  restore(!hosted);
  const stopWorld = followWorldSignal(
    endpoint,
    () => accountWorldSubscription(endpoint, "device", user, getAppCheckToken, resource),
    data => {
      if (!active()) return false;
      const frame = data as { v?: number; type?: string; revision?: string | null } | null;
      if (frame?.v !== 1 || frame.type !== "device_signal" ||
          (frame.revision !== null && (typeof frame.revision !== "string" || !/^\d{10}:\d{9}$/.test(frame.revision)))) return false;
      if (hosted && frame.revision === null) return true;
      const expected = ++revision;
      stopCanonical();
      void read().then(snapshot => {
        if (!active() || revision !== expected) return;
        receive(snapshot);
      }).catch((error: Error & { code?: string }) => {
        report("RideWorld.deviceDeliveryRead", error, { resourceKind: resource.split(":")[0] });
        if (!active() || revision !== expected) return;
        if (error.code === "permission-denied") denied();
        else {
          if (error.code === "unauthenticated") onError(error);
          restore();
        }
      });
      return true;
    },
    code => { if (code === 4003 || code === 4004) denied(); else restore(); },
    report,
    hosted ? accountWorldExpiresAt : undefined,
  );
  return () => { closed = true; revision++; stopWorld(); stopCanonical(); };
}
