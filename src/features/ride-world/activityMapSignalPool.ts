import type { User } from "firebase/auth";
import type { FirebaseServices } from "../../contexts/FirebaseServicesContext";
import { watchWorldReadiness } from "./worldReadiness";
import { logClientError } from "../../services/errorLogger";
import { getRuntimeConfig, isEmulatorRuntime } from "../../services/runtimeConfig";

const productionEndpoint = "wss://world.orider.co.kr/activity-map-signals";

/**
 * 공개 활동 지도 신호의 월드 엔드포인트. 로컬 실험실은 데모 에뮬레이터, 운영은 런타임 설정
 * `worldActivityMapSignalsEnabled`(g1-web#4214)로만 켠다. 운영 월드는 로그인 회원만 받으므로 익명·비로그인은 Firestore 신호만 쓴다.
 */
export function activityMapWorldEndpoint(projectId: string | undefined, user: User | null): string | undefined {
  if (import.meta.env.DEV && import.meta.env.VITE_ORIDER_LOCAL_WORLD === "1" &&
      import.meta.env.VITE_ORIDER_LOCAL_ACTIVITY_MAP_REDIS === "1" && projectId === "demo-orider-lab") {
    return "ws://127.0.0.1:19487/activity-map-signals";
  }
  if (projectId === "miranae-orider-g1" && !isEmulatorRuntime() && user && !user.isAnonymous &&
      getRuntimeConfig().worldActivityMapSignalsEnabled === true) {
    return productionEndpoint;
  }
}

type Listener = (ready: boolean, failed: boolean) => void;
type Pool = ReturnType<typeof createPool>;
const pools = new WeakMap<FirebaseServices, Map<User | null, Pool>>();

export function subscribeActivityMapSignals(
  services: FirebaseServices, user: User | null, endpoint: string, ids: string[], listener: Listener,
): () => void {
  const accounts = pools.get(services) ?? new Map<User | null, Pool>();
  pools.set(services, accounts);
  const pool = accounts.get(user) ?? createPool(services, user, endpoint, () => accounts.delete(user));
  accounts.set(user, pool);
  return pool.subscribe(ids, listener);
}

function createPool(services: FirebaseServices, user: User | null, endpoint: string, onEmpty: () => void) {
  const listeners = new Map<Listener, Set<string>>();
  let subscribed: string[] = [];
  let sockets: WebSocket[] = [];
  let connected = false;
  let generation = 0;
  let backoff = 500;
  let baselineTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let scopeTimer: ReturnType<typeof setTimeout> | undefined;
  let available = false;
  let unwatch: (() => void) | undefined;

  function notify(ready: boolean, failed: boolean, activityId?: string) {
    for (const [listener, ids] of listeners) {
      if (!activityId || ids.has(activityId)) listener(ready, failed);
    }
  }
  function disconnect() {
    generation++;
    connected = false;
    clearTimeout(baselineTimer);
    sockets.forEach(socket => socket.close());
    sockets = [];
  }
  function retry() {
    disconnect();
    notify(false, true);
    if (available) reconnectTimer = setTimeout(() => void connect(), backoff);
    backoff = Math.min(backoff * 2, 5000);
  }
  async function connect() {
    if (!available || !subscribed.length || !listeners.size || services.auth.currentUser !== user) return;
    const sequence = ++generation;
    try {
      const token = await user?.getIdToken();
      // 운영 월드는 ID 토큰과 App Check 토큰을 함께 확인한다.
      const appCheck = endpoint === productionEndpoint ? await services.getAppCheckToken() : undefined;
      if (endpoint === productionEndpoint && !appCheck) throw new Error("Activity map App Check token unavailable");
      if (generation !== sequence || services.auth.currentUser !== user) return;
      const request = (activityIds: string[]) => JSON.stringify({ v: 1, type: "activity_map_subscribe", activityIds, token, ...(appCheck ? { appCheck } : {}) });
      const encoder = new TextEncoder();
      const batches: string[][] = [[]];
      for (const id of subscribed) {
        const batch = batches[batches.length - 1]!;
        if (batch.length === 100 || encoder.encode(request([...batch, id])).byteLength > 4096) batches.push([id]);
        else batch.push(id);
      }
      if (batches.some(batch => !batch.length || encoder.encode(request(batch)).byteLength > 4096)) {
        throw Error("activity map signal request too large");
      }
      const ready = new Set<WebSocket>();
      const lost = (phase: string, error: unknown) => {
        if (generation !== sequence) return;
        logClientError("RideWorld.activityMapSignal", error, { phase }, services, user);
        retry();
      };
      baselineTimer = setTimeout(() => lost("first-frame", new Error("Activity map signal timed out")), 6000);
      for (const batch of batches) {
        const socket = new WebSocket(endpoint);
        sockets.push(socket);
        socket.onopen = () => {
          try { socket.send(request(batch)); }
          catch (error) { lost("subscribe", error); }
        };
        socket.onerror = () => lost("transport", new Error("Activity map WebSocket failed"));
        socket.onclose = ({ code }) => lost("close", new Error(`Activity map WebSocket closed (${code})`));
        socket.onmessage = ({ data }) => {
          if (generation !== sequence || services.auth.currentUser !== user) return;
          try {
            const frame = JSON.parse(String(data)) as { v?: number; type?: string; activityId?: string } | null;
            if (frame?.v !== 1 || frame.type !== "activity_map_signal") {
              lost("protocol", new Error("Invalid activity map signal frame")); return;
            }
            if (frame.activityId !== undefined && !batch.includes(frame.activityId)) {
              lost("scope", new Error("Unexpected activity map signal scope")); return;
            }
            ready.add(socket);
            if (ready.size !== batches.length) return;
            clearTimeout(baselineTimer);
            backoff = 500;
            const changed = connected ? frame.activityId : undefined;
            connected = true;
            notify(true, false, changed);
          } catch (error) { lost("decode", error); }
        };
      }
    } catch (error) {
      if (generation === sequence) {
        logClientError("RideWorld.activityMapSignal", error, { phase: "connect" }, services, user);
        retry();
      }
    }
  }
  function scheduleScope() {
    if (scopeTimer !== undefined) return;
    scopeTimer = setTimeout(() => {
      scopeTimer = undefined;
      const ids = [...new Set([...listeners.values()].flatMap(values => [...values]))].sort();
      if (ids.length === subscribed.length && ids.every((id, index) => id === subscribed[index])) return;
      subscribed = ids;
      clearTimeout(reconnectTimer);
      disconnect();
      notify(false, false);
      void connect();
    }, 25);
  }
  return {
    subscribe(ids: string[], listener: Listener) {
      listeners.set(listener, new Set(ids));
      unwatch ??= watchWorldReadiness(endpoint, ready => {
        available = ready;
        if (ready) void connect();
        else {
          clearTimeout(reconnectTimer);
          disconnect();
          notify(false, true);
        }
      }, (source, error, context) => logClientError(source, error, context, services, user));
      if (connected && ids.every(id => subscribed.includes(id))) listener(true, false);
      scheduleScope();
      return () => {
        listeners.delete(listener);
        if (listeners.size) { scheduleScope(); return; }
        clearTimeout(scopeTimer);
        clearTimeout(reconnectTimer);
        unwatch?.();
        disconnect();
        onEmpty();
      };
    },
  };
}
