import { logClientError } from "../../services/errorLogger";
type Viewer = { getIdToken(forceRefresh?: boolean): Promise<string> };

export const LOCAL_OPERATOR_SNAPSHOT_ENDPOINT = "ws://127.0.0.1:19494/operator-snapshots";
export const PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT = "wss://world.orider.co.kr/operator-snapshots";
/** 첫 세대(모든 페이지)를 기다리는 시간. 월드는 5초 안에 못 보내면 1013으로 닫는다. */
export const OPERATOR_SNAPSHOT_FIRST_FRAME_MS = 6000;

interface Frame {
  v: number;
  type: string;
  eventId: string;
  version: string | null;
  page?: number;
  pages?: number;
  snapshot: { locations?: unknown[] } & Record<string, unknown> | null;
}

export interface OperatorSnapshotOptions {
  endpoint: string;
  /** 운영 월드는 App Check 토큰을 함께 요구한다. */
  appCheck?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
}

/**
 * 월드가 전달하는 Functions 정본 스냅샷을 받는다(#4049). 월드가 정상인 동안 화면 전체를 이 값으로만 그리고,
 * 끊기거나 첫 세대가 늦으면 `fallback`(Firestore onSnapshot)으로 넘어가 이 구독이 끝날 때까지 그쪽만 쓴다(섞지 않음).
 * 토큰 만료(4001)는 새 토큰으로 한 번 다시 연결한다. 권한 철회(4003)는 `denied`.
 */
export function subscribeOperatorSnapshot<T>(
  eventId: string,
  viewer: Viewer,
  receive: (snapshot: T | null) => void,
  denied: () => void,
  fallback: () => () => void,
  options: OperatorSnapshotOptions = { endpoint: LOCAL_OPERATOR_SNAPSHOT_ENDPOINT },
  report: typeof logClientError = logClientError,
): () => void {
  let active = true;
  let socket: WebSocket | undefined;
  let stopFallback: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let refreshed = false;
  const useFallback = () => {
    if (!active || stopFallback) return;
    clearTimeout(timeout);
    const current = socket;
    socket = undefined;
    current?.close();
    receive(null);
    try { stopFallback = fallback(); }
    catch (error) {
      report("operatorSnapshotStream.fallback", error, { eventId });
      active = false;
      denied();
    }
  };
  const connect = async (forceRefresh: boolean) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      report("operatorSnapshotStream.timeout", new Error("Initial snapshot timed out"), { eventId });
      useFallback();
    }, OPERATOR_SNAPSHOT_FIRST_FRAME_MS);
    const token = await viewer.getIdToken(forceRefresh || undefined);
    const appCheck = options.appCheck ? await options.appCheck(forceRefresh || undefined) : undefined;
    if (options.appCheck && !appCheck) throw new Error("Operator snapshot App Check token unavailable");
    if (!active || stopFallback) return;
    const connection = new WebSocket(options.endpoint);
    socket = connection;
    let assembling: { version: string; pages: Frame[] } | undefined;
    connection.addEventListener("open", () => {
      if (!active || stopFallback || socket !== connection) return;
      try { connection.send(JSON.stringify({ v: 1, type: "operator_snapshot_subscribe", eventId, token, ...(appCheck ? { appCheck } : {}) })); }
      catch (error) { report("operatorSnapshotStream.send", error, { eventId }); useFallback(); }
    });
    connection.addEventListener("message", ({ data }) => {
      if (!active || stopFallback || socket !== connection) return;
      try {
        const frame = JSON.parse(String(data)) as Frame;
        if (frame.eventId !== eventId) return;
        if (frame.v !== 1 || frame.type !== "operator_snapshot") throw new Error("Unsupported operator snapshot protocol");
        if (frame.snapshot === null && frame.version === null) {
          // 위치 공개 철회: 새 revision 세대가 올 때까지 비운다.
          assembling = undefined;
          clearTimeout(timeout);
          receive(null);
          return;
        }
        const { page, pages, version } = frame;
        if (typeof version !== "string" || !Number.isSafeInteger(page) || !Number.isSafeInteger(pages) ||
            pages! < 1 || page! < 0 || page! >= pages! || !frame.snapshot || !Array.isArray(frame.snapshot.locations)) {
          throw new Error("Invalid operator snapshot page");
        }
        if (assembling?.version !== version) assembling = { version, pages: [] };
        assembling.pages[page!] = frame;
        if (assembling.pages.filter(Boolean).length !== pages) return;
        const [head, ...rest] = assembling.pages;
        assembling = undefined;
        clearTimeout(timeout);
        refreshed = false;
        receive({ ...head!.snapshot, locations: [head!, ...rest].flatMap(part => part.snapshot!.locations!) } as T);
      } catch (error) {
        report("operatorSnapshotStream.decode", error, { eventId });
        useFallback();
      }
    });
    connection.addEventListener("close", ({ code }) => {
      if (!active || stopFallback || socket !== connection) return;
      socket = undefined;
      if (code === 4003) {
        clearTimeout(timeout);
        active = false;
        denied();
      } else if (code === 4001 && !refreshed) {
        refreshed = true;
        void connect(true).catch(error => { report("operatorSnapshotStream.connect", error, { eventId }); useFallback(); });
      } else {
        report("operatorSnapshotStream.close", new Error("Operator snapshot stream closed"), { eventId, code });
        useFallback();
      }
    });
  };
  void connect(false).catch(error => { report("operatorSnapshotStream.connect", error, { eventId }); useFallback(); });
  return () => {
    active = false;
    clearTimeout(timeout);
    stopFallback?.();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  };
}
