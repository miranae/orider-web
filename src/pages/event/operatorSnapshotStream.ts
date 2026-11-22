import { logClientError } from "../../services/errorLogger";
type Viewer = { getIdToken(): Promise<string> };

export function subscribeOperatorSnapshot<T>(
  eventId: string,
  viewer: Viewer,
  receive: (snapshot: T | null) => void,
  denied: () => void,
  fallback: () => () => void,
  refresh?: (current: () => boolean) => void,
  report: typeof logClientError = logClientError,
): () => void {
  let active = true;
  let generation = 0;
  let socket: WebSocket | undefined;
  let stopFallback: (() => void) | undefined;
  const useFallback = () => {
    if (!active || stopFallback) return;
    clearTimeout(timeout);
    socket?.close();
    receive(null);
    try { stopFallback = fallback(); }
    catch (error) {
      report("operatorSnapshotStream.fallback", error, { eventId });
      active = false; generation++;
      denied();
    }
  };
  const timeout = setTimeout(() => {
    report("operatorSnapshotStream.timeout", new Error("Initial signal timed out"), { eventId });
    useFallback();
  }, 2500);
  void viewer.getIdToken().then(token => {
    if (!active || stopFallback) return;
    const connection = new WebSocket("ws://127.0.0.1:19494/operator-snapshots");
    socket = connection;
    connection.addEventListener("open", () => {
      if (active && !stopFallback) {
        try { connection.send(JSON.stringify({ v: 1, type: "operator_snapshot_subscribe", eventId, token })); }
        catch (error) { report("operatorSnapshotStream.send", error, { eventId }); useFallback(); }
      }
    });
    connection.addEventListener("message", ({ data }) => {
      if (!active || stopFallback) return;
      try {
        const frame = JSON.parse(String(data));
        if (frame.eventId !== eventId) return;
        if (frame.v !== 1 || frame.type !== "operator_snapshot_signal") {
          throw new Error("Unsupported operator snapshot signal protocol");
        }
        if (typeof frame.revision !== "string" && frame.revision !== null) {
          throw new Error("Invalid operator snapshot revision");
        }
        clearTimeout(timeout);
        const ticket = ++generation;
        if (frame.revision === null) receive(null);
        refresh?.(() => active && !stopFallback && ticket === generation);
      } catch (error) {
        report("operatorSnapshotStream.decode", error, { eventId });
        useFallback();
      }
    });
    connection.addEventListener("close", ({ code }) => {
      if (!active || stopFallback) return;
      if (code === 4003) {
        clearTimeout(timeout);
        active = false; generation++;
        denied();
      } else {
        report("operatorSnapshotStream.close", new Error("Operator signal closed"), { eventId, code });
        generation++; useFallback();
      }
    });
  }).catch(error => { report("operatorSnapshotStream.connect", error, { eventId }); useFallback(); });
  return () => {
    active = false;
    clearTimeout(timeout);
    stopFallback?.();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  };
}
