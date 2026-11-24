import { logClientError } from "../../services/errorLogger";
type Viewer = { getIdToken(forceRefresh?: boolean): Promise<string> };

export const LOCAL_OPERATOR_SNAPSHOT_ENDPOINT = "ws://127.0.0.1:19494/operator-snapshots";
export const PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT = "wss://world.orider.co.kr/operator-snapshots";
/** 첫 세대(모든 페이지)를 기다리는 시간. 월드는 5초 안에 못 보내면 1013으로 닫는다. */
export const OPERATOR_SNAPSHOT_FIRST_FRAME_MS = 6000;
/** 연결 시도(핸드셰이크 포함)부터 open까지의 제한 시간. 넘으면 개인 연결 문제로 보고 재연결한다. */
export const OPERATOR_SNAPSHOT_CONNECT_MS = 6000;
/**
 * 핸드셰이크가 한 번도 성공하지 못한(open 없음) 연속 실패를 견디는 시간. 넘으면 월드 서버 접속 불가 = 서버 장애로 보고
 * Firestore로 넘어간다(최초 접속·재연결 모두, 2026-11-25 사용자 결정). 토큰·App Check 발급 실패는 넣지 않는다.
 */
export const OPERATOR_SNAPSHOT_UNREACHABLE_MS = 30_000;
/** ID 토큰·App Check 발급 대기 상한. 연결 제한 시간에는 넣지 않지만 발급이 멈추면 발급 실패와 같이 처리한다. */
export const OPERATOR_SNAPSHOT_CREDENTIAL_MS = 15_000;

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
  /** 개인 연결 끊김으로 재연결 중이면 true, 월드 세대를 다시 받거나 Firestore로 넘어가면 false. */
  reconnecting?: (retrying: boolean) => void;
}

/** 개인 연결 끊김 재연결 백오프 상한. 재연결은 횟수 제한 없이 계속한다. */
export const OPERATOR_SNAPSHOT_MAX_BACKOFF_MS = 60_000;
/** 월드가 느린 운영자 소켓을 닫는 코드(#4079). 서버 장애(1013)가 아니라 개별 끊김이므로 재연결한다. */
export const OPERATOR_SNAPSHOT_SLOW_CONSUMER_CODE = 4008;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validLocations = (value: unknown): value is unknown[] =>
  Array.isArray(value) && value.every(row => isObject(row) && typeof row.uid === "string");

/**
 * 월드가 전달하는 Functions 정본 스냅샷을 받는다(#4049). 월드가 정상인 동안 화면 전체를 이 값으로만 그린다(섞지 않음).
 * - 서버 쪽 신호(1013 Redis 구독 끊김·세대 정지, 4004 Firestore 전용 행사, 최초 접속에서 첫 세대 지연, 디코딩(스키마) 오류)만
 *   `fallback`(Firestore onSnapshot)으로 넘어가 이 구독이 끝날 때까지 그쪽만 쓴다(P11 서버 장애 자동 복귀).
 * - 월드 서버 접속 불가(open 없이 핸드셰이크 실패·시간 초과가 30초 넘게 이어짐)도 서버 장애로 보고 Firestore로 넘어간다.
 * - 개인 연결 끊김(열린 뒤 1006·4008 slow_consumer, 30초 미만의 핸드셰이크 실패, 토큰/App Check 발급 실패·지연)은 Firestore로 넘어가지 않는다.
 *   마지막 월드 화면을 그대로 두고 `reconnecting(true)`로 알린 뒤 최대 60초 백오프로 계속 다시 연결한다(온라인·탭 복귀 시 즉시).
 *   재연결 후 완성 세대를 받으면 그대로 갱신한다. 끊긴 동안의 공백은 허용한다(P11, 새로고침으로 회복).
 * - 토큰 만료(4001)는 새 토큰으로 다시 연결한다. 권한 철회(4003)는 `denied`.
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
  // Firestore 표시 해제 함수(서버 쪽 사용 불가로 넘어간 뒤에만 있다).
  let stopFallback: (() => void) | undefined;
  let permanent = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let refreshed = false;
  let reconnects = 0;
  // 마지막으로 화면에 넘긴 세대. 버전은 0으로 채운 스냅샷 시각이라 문자열 비교가 시간 순서와 같다.
  let deliveredVersion: string | undefined;
  // 위치 공개 철회(snapshot: null) 때 넘겼거나 조립 중이던 세대. 이 버전 이하는 다시 그리지 않는다.
  let revokedThrough: string | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  // 월드 세대를 한 번이라도 받았는지. 최초 접속의 첫 세대 지연만 서버 쪽 사용 불가로 본다.
  let received = false;
  let retrying = false;
  // open 없이 실패한 연결 시도가 이어지기 시작한 시각. open이 한 번이라도 오면 지운다.
  let unreachableSince: number | undefined;
  const setRetrying = (value: boolean) => {
    if (retrying === value) return;
    retrying = value;
    options.reconnecting?.(value);
  };
  const detach = () => {
    if (typeof window !== "undefined") window.removeEventListener("online", retryNow);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", retryNow);
  };
  const closeSocket = () => {
    const current = socket;
    socket = undefined;
    current?.close();
  };
  // 서버 쪽 사용 불가: 이 구독이 끝날 때까지 Firestore만 쓴다.
  const useFallback = () => {
    if (!active || permanent) return;
    permanent = true;
    clearTimeout(timeout);
    clearTimeout(retry);
    retry = undefined;
    detach();
    closeSocket();
    setRetrying(false);
    receive(null);
    try { stopFallback = fallback(); }
    catch (error) {
      report("operatorSnapshotStream.fallback", error, { eventId });
      active = false;
      denied();
    }
  };
  const reconnect = (forceRefresh: boolean) => {
    void connect(forceRefresh).catch(error => {
      // 토큰·App Check 발급 실패·지연은 개인 쪽 문제로 보고 Firestore로 넘어가지 않고 다시 시도한다.
      report("operatorSnapshotStream.connect", error, { eventId });
      scheduleRetry();
    });
  };
  // 개인 연결 끊김: 마지막 화면을 그대로 두고 횟수 제한 없이 백오프로 다시 연결한다.
  function scheduleRetry(code?: number) {
    clearTimeout(timeout);
    clearTimeout(retry);
    if (!active || permanent) return;
    // 끊김 한 번(재연결 성공 전까지)에 한 번만 기록한다.
    if (reconnects === 0) report("operatorSnapshotStream.reconnect", new Error("Operator snapshot stream dropped"), { eventId, code });
    setRetrying(true);
    const delay = Math.min(1000 * 2 ** reconnects, OPERATOR_SNAPSHOT_MAX_BACKOFF_MS);
    reconnects++;
    retry = setTimeout(() => {
      retry = undefined;
      if (active && !permanent) reconnect(false);
    }, delay);
  }
  // open 없이 실패한 연결 시도: 30초 넘게 이어지면 월드 서버 접속 불가로 보고 Firestore로, 아니면 재연결한다.
  function handshakeFailed(startedAt: number, code?: number) {
    unreachableSince ??= startedAt;
    if (Date.now() - unreachableSince >= OPERATOR_SNAPSHOT_UNREACHABLE_MS) {
      report("operatorSnapshotStream.unreachable", new Error("Operator snapshot world unreachable"), { eventId, code });
      useFallback();
    } else scheduleRetry(code);
  }
  // 온라인 복귀·탭 복귀 시 기다리던 재연결을 바로 시도한다.
  function retryNow() {
    if (!active || permanent || !retry) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    clearTimeout(retry);
    retry = undefined;
    reconnect(false);
  }
  if (typeof window !== "undefined") window.addEventListener("online", retryNow);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", retryNow);

  const connect = async (forceRefresh: boolean) => {
    clearTimeout(timeout);
    const issue = <V>(pending: Promise<V>, what: string) => {
      let limit: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([pending, new Promise<never>((_, reject) => {
        limit = setTimeout(() => reject(new Error(`Operator snapshot ${what} timed out`)), OPERATOR_SNAPSHOT_CREDENTIAL_MS);
      })]).finally(() => clearTimeout(limit));
    };
    const token = await issue(viewer.getIdToken(forceRefresh || undefined), "ID token");
    const appCheck = options.appCheck ? await issue(options.appCheck(forceRefresh || undefined), "App Check token") : undefined;
    if (options.appCheck && !appCheck) throw new Error("Operator snapshot App Check token unavailable");
    if (!active || permanent) return;
    closeSocket();
    const startedAt = Date.now();
    let opened = false;
    const connection = new WebSocket(options.endpoint);
    socket = connection;
    let assembling: { version: string; total: number; pages: Frame[] } | undefined;
    // 핸드셰이크가 멈추면 open이 오지 않으므로 연결 시도부터 제한 시간을 둔다(토큰 발급 대기는 제외). 개인 연결 문제로 다시 연결한다.
    timeout = setTimeout(() => {
      if (!active || permanent || socket !== connection) return;
      report("operatorSnapshotStream.connectTimeout", new Error("Operator snapshot connection timed out"), { eventId });
      closeSocket();
      handshakeFailed(startedAt);
    }, OPERATOR_SNAPSHOT_CONNECT_MS);
    connection.addEventListener("open", () => {
      if (!active || permanent || socket !== connection) return;
      opened = true;
      unreachableSince = undefined;
      try { connection.send(JSON.stringify({ v: 1, type: "operator_snapshot_subscribe", eventId, token, ...(appCheck ? { appCheck } : {}) })); }
      catch (error) { report("operatorSnapshotStream.send", error, { eventId }); useFallback(); return; }
      // 첫 세대 대기는 구독을 보낸 뒤부터 잰다(토큰 발급·연결 시간은 넣지 않는다).
      // 최초 접속에서 연결은 됐는데 세대가 오지 않으면 서버 쪽 사용 불가로 본다. 재연결 뒤라면 다시 연결한다.
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!active || permanent || socket !== connection) return;
        report("operatorSnapshotStream.timeout", new Error("Initial snapshot timed out"), { eventId, received });
        if (received) { closeSocket(); scheduleRetry(); } else useFallback();
      }, OPERATOR_SNAPSHOT_FIRST_FRAME_MS);
    });
    connection.addEventListener("message", ({ data }) => {
      if (!active || permanent || socket !== connection) return;
      try {
        const frame = JSON.parse(String(data)) as Frame;
        if (!isObject(frame) || frame.eventId !== eventId) return;
        if (frame.v !== 1 || frame.type !== "operator_snapshot") throw new Error("Unsupported operator snapshot protocol");
        if (frame.snapshot === null && frame.version === null) {
          // 위치 공개 철회: 새 revision 세대가 올 때까지 비우고, 철회 전 세대는 다시 받지 않는다.
          for (const seen of [deliveredVersion, assembling?.version]) {
            if (seen !== undefined && (revokedThrough === undefined || seen > revokedThrough)) revokedThrough = seen;
          }
          assembling = undefined;
          clearTimeout(timeout);
          refreshed = false;
          reconnects = 0;
          received = true;
          setRetrying(false);
          receive(null);
          return;
        }
        const { page, pages, version, snapshot } = frame;
        if (typeof version !== "string" || !Number.isSafeInteger(page) || !Number.isSafeInteger(pages) ||
            pages! < 1 || page! < 0 || page! >= pages! || !isObject(snapshot) || !validLocations(snapshot.locations)) {
          throw new Error("Invalid operator snapshot page");
        }
        // 첫 페이지는 화면 머리(시각·인원·체크포인트)를 반드시 가진다. 빠지면 디코딩 오류로 Firestore로 넘어간다.
        if (page === 0 && (!Number.isSafeInteger(snapshot.timestamp) || !isObject(snapshot.counts) || !Array.isArray(snapshot.checkpoints))) {
          throw new Error("Invalid operator snapshot head");
        }
        if (revokedThrough !== undefined && version <= revokedThrough) return;
        // 이미 넘긴 세대나 조립 중인 세대보다 오래된 페이지는 버린다. 더 새로운 세대가 오면 그 세대로 바꾼다.
        // (같은 세대 재전송은 재연결 직후의 최신 세대일 수 있으므로 다시 조립한다.)
        if (deliveredVersion !== undefined && version < deliveredVersion) return;
        if (assembling && version < assembling.version) return;
        if (assembling?.version !== version) assembling = { version, total: pages!, pages: [] };
        if (assembling.total !== pages) throw new Error("Inconsistent operator snapshot page count");
        assembling.pages[page!] = frame;
        if (assembling.pages.filter(Boolean).length !== pages) return;
        const [head, ...rest] = assembling.pages;
        assembling = undefined;
        clearTimeout(timeout);
        refreshed = false;
        reconnects = 0;
        received = true;
        deliveredVersion = version;
        setRetrying(false);
        receive({ ...head!.snapshot, locations: [head!, ...rest].flatMap(part => part.snapshot!.locations!) } as T);
      } catch (error) {
        report("operatorSnapshotStream.decode", error, { eventId });
        useFallback();
      }
    });
    connection.addEventListener("close", ({ code }) => {
      if (!active || permanent || socket !== connection) return;
      socket = undefined;
      if (code === 4003) {
        clearTimeout(timeout);
        clearTimeout(retry);
        active = false;
        detach();
        setRetrying(false);
        denied();
      } else if (code === 4001 && !refreshed) {
        refreshed = true;
        clearTimeout(timeout);
        reconnect(true);
      } else if (code !== 1013 && code !== 4004 && code !== 4001) {
        // 개별 연결 끊김(1006·4008 등): 화면은 그대로 두고 다시 연결한다. 재연결하면 월드가 최신 세대를 다시 보낸다.
        // 열리지도 못하고 닫혔다면 접속 불가 시간을 함께 잰다.
        if (opened) scheduleRetry(code); else handshakeFailed(startedAt, code);
      } else {
        report("operatorSnapshotStream.close", new Error("Operator snapshot stream closed"), { eventId, code });
        useFallback();
      }
    });
  };
  reconnect(false);
  return () => {
    active = false;
    clearTimeout(timeout);
    clearTimeout(retry);
    detach();
    stopFallback?.();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  };
}
