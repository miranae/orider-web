import { getAuth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

export function subscribeDeviceDeliverySignal<T>(
  firestore: Firestore, uid: string, resource: string,
  read: () => Promise<T>, receive: (snapshot: T) => void, onError: (error: Error) => void,
  fallback: () => () => void,
): () => void {
  if (!import.meta.env.DEV || import.meta.env.VITE_ORIDER_LOCAL_WORLD !== "1" ||
      import.meta.env.VITE_ORIDER_LOCAL_DEVICE_REDIS !== "1" || firestore.app.options.projectId !== "demo-orider-lab") {
    return fallback();
  }
  const auth = getAuth(firestore.app);
  const user = auth.currentUser;
  let closed = false, revision = 0, switched = false;
  let socket: WebSocket | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopFallback: (() => void) | undefined;
  const active = () => !closed && auth.currentUser === user;
  const restore = () => {
    if (!active() || switched) return;
    switched = true; revision++;
    clearTimeout(timeout);
    socket?.close();
    stopFallback = fallback();
  };
  const denied = () => {
    if (!active() || switched) return;
    revision++;
    clearTimeout(timeout);
    onError(new Error("Device delivery access denied"));
  };
  void (async () => {
    if (!user || user.uid !== uid || user.isAnonymous) { denied(); return; }
    try {
      const token = await user.getIdToken();
      if (!active()) return;
      const live = new WebSocket("ws://127.0.0.1:19487/device-signals");
      socket = live;
      timeout = setTimeout(restore, 6000);
      live.onopen = () => live.send(JSON.stringify({ v: 1, type: "device_subscribe", token, resource }));
      live.onclose = event => event.code === 4003 ? denied() : restore();
      live.onmessage = ({ data }) => {
        if (!active() || switched) return;
        try {
          const frame = JSON.parse(String(data)) as { v?: number; type?: string } | null;
          if (frame?.v !== 1 || frame.type !== "device_signal") return;
          clearTimeout(timeout);
          const expected = ++revision;
          void read().then(snapshot => {
            if (active() && revision === expected) receive(snapshot);
          }).catch((error: Error & { code?: string }) => {
            if (!active() || revision !== expected) return;
            if (error.code === "permission-denied" || error.code === "unauthenticated") denied();
            else restore();
          });
        } catch { restore(); }
      };
    } catch { restore(); }
  })();
  return () => { closed = true; revision++; clearTimeout(timeout); socket?.close(); stopFallback?.(); };
}
