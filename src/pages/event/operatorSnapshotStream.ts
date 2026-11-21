type Viewer = { getIdToken(): Promise<string> };

export function subscribeOperatorSnapshot<T>(
  eventId: string,
  viewer: Viewer,
  receive: (snapshot: T | null) => void,
  denied: () => void,
  fallback: () => () => void,
): () => void {
  let active = true;
  let socket: WebSocket | undefined;
  let stopFallback: (() => void) | undefined;
  const useFallback = () => {
    if (!active || stopFallback) return;
    clearTimeout(timeout);
    socket?.close();
    receive(null);
    stopFallback = fallback();
  };
  const timeout = setTimeout(useFallback, 2500);
  void viewer.getIdToken().then(token => {
    if (!active || stopFallback) return;
    const connection = new WebSocket("ws://127.0.0.1:19494/operator-snapshots");
    socket = connection;
    connection.addEventListener("open", () => {
      if (active && !stopFallback) connection.send(JSON.stringify({ v: 1, type: "operator_snapshot_subscribe", eventId, token }));
    });
    connection.addEventListener("message", ({ data }) => {
      if (!active || stopFallback) return;
      try {
        const frame = JSON.parse(String(data));
        if (frame.v !== 1 || frame.eventId !== eventId || frame.type !== "operator_snapshot") return;
        const snapshot = frame.snapshot;
        if (snapshot !== null && (!snapshot || !Number.isFinite(snapshot.timestamp) || !snapshot.counts ||
          !Array.isArray(snapshot.checkpoints) || !Array.isArray(snapshot.locations))) return;
        clearTimeout(timeout);
        receive(snapshot as T | null);
      } catch {
        useFallback();
      }
    });
    connection.addEventListener("close", ({ code }) => {
      if (!active || stopFallback) return;
      if (code === 4003) {
        clearTimeout(timeout);
        denied();
      } else useFallback();
    });
  }).catch(useFallback);
  return () => {
    active = false;
    clearTimeout(timeout);
    stopFallback?.();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  };
}
