import { getAuth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { logClientError } from "./errorLogger";
import { followWorldSignal } from "../features/ride-world/followWorldSignal";

export function subscribeDeviceDeliverySignal<T>(
  firestore: Firestore, uid: string, resource: string,
  read: () => Promise<T>, receive: (snapshot: T) => void, onError: (error: Error) => void,
  fallback: (serverOnly: boolean) => () => void,
): () => void {
  if (!import.meta.env.DEV || import.meta.env.VITE_ORIDER_LOCAL_WORLD !== "1" ||
      import.meta.env.VITE_ORIDER_LOCAL_DEVICE_REDIS !== "1" || firestore.app.options.projectId !== "demo-orider-lab") {
    return fallback(false);
  }
  const auth = getAuth(firestore.app);
  const user = auth.currentUser;
  let closed = false, revision = 0;
  let stopFallback: (() => void) | undefined;
  const active = () => !closed && auth.currentUser === user;
  const stopCanonical = () => { stopFallback?.(); stopFallback = undefined; };
  const restore = () => {
    if (!active()) return;
    revision++;
    stopFallback ??= fallback(true);
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
  restore();
  const stopWorld = followWorldSignal(
    "ws://127.0.0.1:19487/device-signals",
    async () => ({ v: 1, type: "device_subscribe", token: await user.getIdToken(), resource }),
    data => {
      if (!active()) return false;
      const frame = data as { v?: number; type?: string; revision?: string | null } | null;
      if (frame?.v !== 1 || frame.type !== "device_signal" ||
          (frame.revision !== null && (typeof frame.revision !== "string" || !/^\d{10}:\d{9}$/.test(frame.revision)))) return false;
      const expected = ++revision;
      stopCanonical();
      void read().then(snapshot => {
        if (!active() || revision !== expected) return;
        receive(snapshot);
      }).catch((error: Error & { code?: string }) => {
        logClientError("RideWorld.deviceDeliveryRead", error, { resourceKind: resource.split(":")[0] });
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
  );
  return () => { closed = true; revision++; stopWorld(); stopCanonical(); };
}
