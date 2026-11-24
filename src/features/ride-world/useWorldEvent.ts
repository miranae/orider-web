import { viewerSessionIdForEvent } from "../event/viewerPresence";
import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { getRuntimeConfig, isEmulatorRuntime } from "../../services/runtimeConfig";
import { logClientError } from "../../services/errorLogger";
import { watchWorldReadiness, type WorldErrorReporter } from "./worldReadiness";
import { useFirebaseServices, type FirebaseServices } from "../../contexts/FirebaseServicesContext";

export interface WorldEventMarker {
  id: string;
  uid?: string;
  kind: "outdoor" | "virtual";
  lat: number;
  lon: number;
  speedMps?: number | null;
  heading?: number | null;
  status: "riding" | "paused";
  capturedAt: number;
  eventStatus?: "sos" | "off_course" | "lost_signal";
  distanceM?: number;
  durationSec?: number;
  bib?: number;
  power?: number;
  powerExpiresAtMs?: number;
  hr?: number;
  hrExpiresAtMs?: number;
  /** 운영 회원 관전 마커의 서버 계산 코스 진행·격차(g1-web#4005). 값은 숫자 또는 null이고 웹은 다시 계산하지 않는다. */
  progressM?: number | null;
  gapToLeaderM?: number | null;
  leaderGapExpiresAtMs?: number | null;
  gapToSelectedM?: number | null;
  selectedGapExpiresAtMs?: number | null;
  /** 위 진행·격차를 계산한 서버 시각(g1-web#4037). 값이 바뀐 플러시에서만 올라간다. 배포 전 서버는 보내지 않는다. */
  progressComputedAtMs?: number;
}

export interface WorldEventFrame {
  v: 1;
  type: "event_snapshot";
  eventId: string;
  revision: number;
  updatedAt: number;
  viewers: number;
  counts: { riding: number; total: number };
  roster: { uid: string; state: string }[];
  markers: WorldEventMarker[];
  /** 이 프레임을 만든 구독의 선택 대상(`event_subscribe.track`). 클라이언트가 붙이며 선택 격차의 기준을 가린다. */
  track?: string | null;
  /** 어느 구독의 응답인지 가릴 수 없는 프레임이면 true. 선택 격차를 쓰지 않는다. */
  trackUnknown?: boolean;
}

type WorldEventDelta = Partial<Pick<WorldEventFrame, "roster" | "counts" | "viewers">> &
  Pick<WorldEventFrame, "v" | "eventId" | "revision" | "updatedAt"> & {
    type: "event_delta";
    add?: WorldEventMarker[];
    remove?: string[];
    order?: string[];
  };

const configuredPort = import.meta.env.VITE_ORIDER_LOCAL_WORLD_PORT;
const localPort = configuredPort === "19466" || configuredPort === "19486" || configuredPort === "19487" ? configuredPort : "18766";
const localEndpoint = `ws://127.0.0.1:${localPort}/events`;
const endpoint = import.meta.env.DEV && import.meta.env.VITE_ORIDER_LOCAL_WORLD === "1" ? localEndpoint : null;
export function isLocalWorldEventEnabled(): boolean {
  return endpoint !== null && isEmulatorRuntime() && getRuntimeConfig().firebaseProjectId?.startsWith("demo-") === true;
}
const productionEndpoint = "wss://world.orider.co.kr/events";
/**
 * 운영 월드 `/events` 관전 구독(#1855). 꺼져 있으면 호출부는 기존 콜러블·Firestore 경로만 쓴다.
 * 운영 Firebase 프로젝트를 공유하는 스테이지(appEnvironment "stage", production-parity-stage·bundled-development 프로필)는
 * 운영 월드에 구독을 만들지 않는다.
 */
export function isProductionWorldEventEnabled(): boolean {
  const config = getRuntimeConfig();
  return config.firebaseProjectId === "miranae-orider-g1" && !isEmulatorRuntime() && config.worldEventViewsEnabled === true &&
    config.appEnvironment !== "stage" && config.deploymentProfile !== "production-parity-stage" && config.deploymentProfile !== "bundled-development";
}

/** 선택 기준을 모르는 동안 현재 선택으로 다시 구독하는 간격과 연속 재전송 상한. */
export const TRACK_RETRY_MS = 3000;
export const TRACK_RETRY_LIMIT = 5;

interface EventState { scope: string; services: FirebaseServices; viewer: User | null; frame: WorldEventFrame }

export interface WorldViewport { lat: number; lon: number }

interface MeetingSignal {
  v: 1;
  type: "event_signal";
  eventId: string;
  meetingVersion?: string | null;
  discordVersion?: string | null;
  spectatorVersion?: string | null;
  meetingPhase?: "OPEN" | "LIVE" | "FINISHED" | "CANCELLED";
}

interface SignalSubscription {
  topic?: "discord" | "spectator";
  changed: (version: string | null) => void;
  disconnected: (code: number) => void;
  phaseChanged?: (phase: NonNullable<MeetingSignal["meetingPhase"]>) => void;
}

export function useWorldEvent(
  eventId: string | undefined, user: User | null | undefined, track?: string | null, viewport?: WorldViewport, signal?: SignalSubscription, trackBib?: number, allowGuest = false,
  production = false,
) {
  const services = useFirebaseServices();
  const signalOnly = signal !== undefined;
  const signalTopic = signal?.topic;
  const scope = JSON.stringify([eventId, user?.uid, signalOnly, signalTopic, allowGuest]);
  const liveScope = useRef(scope);
  liveScope.current = scope;
  const signalCurrent = useRef(signal);
  signalCurrent.current = signal;
  const options = useRef({ track, viewport, trackBib });
  options.current = { track, viewport, trackBib };
  const subscribeCurrent = useRef<(() => void) | null>(null);
  const [state, setState] = useState<EventState | null>(null);
  useEffect(() => {
    const url = production && !signalOnly && user && isProductionWorldEventEnabled() ? productionEndpoint
      : isLocalWorldEventEnabled() ? endpoint : null;
    if (!url || !eventId || (!user && !allowGuest)) return;
    const event = eventId;
    const identity = user ?? null;
    const report: WorldErrorReporter = (source, error, context) =>
      logClientError(source, error, context, services, identity);
    const viewerSessionId = !identity && allowGuest ? viewerSessionIdForEvent(event) : undefined;
    let disposed = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let readinessGrace: ReturnType<typeof setTimeout> | undefined;
    let delayMs = 1000;
    let ready = false;
    let denied = false;
    let signalAccepted = false;
    let hasFrame = false;
    let refreshCredentials = false;
    let generation = 0;
    let initial: ReturnType<typeof setTimeout> | undefined;
    let trackRetry: ReturnType<typeof setTimeout> | undefined;
    const open = async () => {
      if (!ready || denied || disposed) return;
      const attempt = ++generation;
      try {
        // 운영 월드는 ID 토큰과 App Check 토큰을 함께 확인하고, 만료 시 4001로 닫으면 새 토큰으로 다시 연결한다.
        const refresh = refreshCredentials;
        refreshCredentials = false;
        const token = await identity?.getIdToken(refresh || undefined);
        const appCheck = url === productionEndpoint ? await services.getAppCheckToken(refresh || undefined) : undefined;
        if (url === productionEndpoint && !appCheck) throw new Error("World event App Check token unavailable");
        if (disposed || !ready || attempt !== generation) return;
        const connection = new WebSocket(url);
        socket = connection;
        initial = setTimeout(() => {
          if (socket !== connection) return;
          report("RideWorld.eventFirstFrame", new Error("World event first frame timed out"), { eventId: event });
          connection.close();
        }, 3000);
        let latest: WorldEventFrame | null = null;
        // track을 바꿔 다시 구독하면 서버가 새 event_snapshot을 보낸다(track 에코 없음). 그 전 delta는 이전 선택 기준이다.
        // 서버는 구독을 순서대로 처리하되 다음 flush 전에 온 구독들을 snapshot 하나로 합칠 수 있어서, snapshot 하나는 대기 큐
        // 앞쪽의 하나 이상 구독에 대한 응답이고 그 선택 기준은 큐에 남은 track 중 하나다. 그래서 snapshot마다 큐 앞에서 하나만
        // 지우고(실제로 답한 수 이하), 큐에 남은 track이 모두 현재 선택과 같을 때만 선택 격차를 믿는다. 그 밖에는 기준을
        // 모른다고 표시하고 현재 선택으로 다시 구독한다.
        const pendingTracks: (string | null)[] = [];
        let lastSentAt = 0;
        let trackRetries = 0;
        const subscribe = () => {
          if (disposed || socket !== connection || connection.readyState !== WebSocket.OPEN) return;
          try {
            pendingTracks.push(options.current.track ?? null);
            lastSentAt = Date.now();
            connection.send(JSON.stringify({ v: 1, type: "event_subscribe", eventId: event, token, ...(appCheck ? { appCheck } : {}), guest: !identity && allowGuest, viewerSessionId, signalOnly, signalTopic, ...options.current }));
          } catch (error) {
            report("RideWorld.subscribeEvent", error, { eventId: event });
            connection.close();
          }
        };
        // 서버는 처리 중에 온 구독을 버리고, 연속 구독을 snapshot 하나로 합친다. 현재 선택 기준이 확인될 때까지 현재 선택으로
        // 다시 구독한다. 대기 큐 맨 뒤가 이미 현재 선택이고 최근에 보냈으면 응답을 기다리고, 응답이 없으면 간격마다 상한까지
        // 재전송한다. 상한에 닿으면 마지막 재구독의 응답을 한 간격 더 기다린 뒤에도 미확인일 때만 기록한다.
        const confirmTrack = () => {
          clearTimeout(trackRetry);
          if (disposed || signalOnly || socket !== connection) return;
          const current = options.current.track ?? null;
          if (latest && !latest.trackUnknown && latest.track === current) return;
          if (trackRetries > TRACK_RETRY_LIMIT) {
            // 상한 도달은 한 번만 기록한다(선택 변경·기준 모름 snapshot에서 카운터가 다시 0이 된다).
            if (trackRetries === TRACK_RETRY_LIMIT + 1) {
              trackRetries++;
              report("ride-world.event.trackConfirm", new Error("track-confirm-exhausted"),
                { eventId: event, retries: TRACK_RETRY_LIMIT, pending: pendingTracks.length, trackUnknown: latest?.trackUnknown ?? null });
            }
            return;
          }
          if (pendingTracks[pendingTracks.length - 1] !== current || Date.now() - lastSentAt >= TRACK_RETRY_MS) subscribe();
          trackRetry = setTimeout(() => { trackRetries++; confirmTrack(); }, TRACK_RETRY_MS);
        };
        const resubscribe = () => { trackRetries = 0; subscribe(); confirmTrack(); };
        subscribeCurrent.current = resubscribe;
        connection.addEventListener("open", subscribe);
        connection.addEventListener("error", () => {
          if (disposed || socket !== connection) return;
          report("RideWorld.eventTransport", new Error("World event WebSocket failed"), { eventId: event });
          connection.close();
        });
        connection.addEventListener("message", ({ data }) => {
          try {
            const frame = JSON.parse(String(data)) as WorldEventFrame | WorldEventDelta | MeetingSignal;
            if (disposed || liveScope.current !== scope || socket !== connection || frame.eventId !== event) return;
            if (frame.v !== 1) throw new Error("Unsupported World event protocol version");
            if (frame.type === "event_signal") {
              const version = signalTopic === "spectator" ? frame.spectatorVersion
                : signalTopic === "discord" ? frame.discordVersion : frame.meetingVersion;
              const validPhase = frame.meetingPhase !== undefined &&
                ["OPEN", "LIVE", "FINISHED", "CANCELLED"].includes(frame.meetingPhase);
              if (version === null || typeof version === "string" && /^\d+:\d{1,9}$/.test(version)) {
                clearTimeout(initial);
                signalAccepted = true;
                hasFrame = true;
                (liveScope.current === scope ? signalCurrent.current : undefined)?.changed(version);
                delayMs = 1000;
              } else if (version !== undefined || !validPhase) {
                throw new Error("Invalid World event signal revision");
              }
              if (validPhase && frame.meetingPhase) {
                clearTimeout(initial);
                hasFrame = true;
                delayMs = 1000;
                (liveScope.current === scope ? signalCurrent.current : undefined)?.phaseChanged?.(frame.meetingPhase);
              }
              return;
            }
            if (frame.type === "event_snapshot" && (!Array.isArray(frame.markers) || !Array.isArray(frame.roster))) {
              throw new Error("Invalid World event snapshot arrays");
            }
            if (!Number.isSafeInteger(frame.revision)) throw new Error("Invalid World event revision");
            if (frame.revision <= (latest?.revision ?? 0)) return;
            if (frame.type === "event_snapshot" && Array.isArray(frame.markers) && Array.isArray(frame.roster)) {
              clearTimeout(initial);
              const current = options.current.track ?? null;
              const known = pendingTracks.length > 0 && pendingTracks.every((pending) => pending === current);
              pendingTracks.shift();
              latest = known ? { ...frame, track: current } : { ...frame, track: null, trackUnknown: true };
              hasFrame = true;
              // 합쳐지거나 버려진 구독으로 큐에 답 없는 항목이 남아도 멈추지 않도록 현재 선택 기준 확인을 이어 간다.
              if (known) clearTimeout(trackRetry);
              else { trackRetries = 0; confirmTrack(); }
            } else if (frame.type === "event_delta") {
              if (!latest || frame.revision !== latest.revision + 1) {
                report("RideWorld.deltaGap", new Error("World delta has no matching snapshot revision"), { eventId: event });
                latest = null;
                setState(null);
                resubscribe();
                return;
              }
              let markers = latest.markers;
              if (frame.order) {
                const byId = new Map(markers.map((marker) => [marker.id, marker]));
                for (const id of frame.remove ?? []) byId.delete(id);
                for (const marker of frame.add ?? []) byId.set(marker.id, marker);
                markers = frame.order.flatMap((id) => byId.get(id) ?? []);
              }
              latest = {
                ...latest, revision: frame.revision, updatedAt: frame.updatedAt, markers,
                roster: frame.roster ?? latest.roster, viewers: frame.viewers ?? latest.viewers,
                counts: frame.counts ?? latest.counts,
              };
            } else return;
            delayMs = 1000;
            setState({ scope, services, viewer: identity, frame: latest });
          } catch (error) {
            report("RideWorld.decodeEvent", error, { eventId: event });
            if (socket === connection) connection.close();
          }
        });
        connection.addEventListener("close", ({ code }) => {
          if (disposed || socket !== connection) return;
          if (code !== 1000 || !hasFrame) {
            report("RideWorld.eventClosed", new Error("World event socket closed"), { eventId: event, code });
          }
          socket = undefined;
          hasFrame = false;
          clearTimeout(initial);
          clearTimeout(trackRetry);
          if (subscribeCurrent.current === resubscribe) subscribeCurrent.current = null;
          setState(null);
          denied = code === 4003 || code === 4004;
          if (code === 4001) refreshCredentials = true;
          if (signalAccepted || denied) (liveScope.current === scope ? signalCurrent.current : undefined)?.disconnected(code);
          signalAccepted = false;
          if (!denied && ready) {
            retry = setTimeout(() => void open(), delayMs);
            delayMs = Math.min(10000, delayMs * 2);
          }
        });
      } catch (error) {
        if (!disposed && attempt === generation) {
          if (signalAccepted) (liveScope.current === scope ? signalCurrent.current : undefined)?.disconnected(1013);
          signalAccepted = false;
          report("RideWorld.connectEvent", error, { eventId: event });
          if (ready) retry = setTimeout(() => void open(), delayMs);
          if (url === productionEndpoint) delayMs = Math.min(10000, delayMs * 2);
        }
      }
    };
    const fallBack = () => {
      generation++;
      clearTimeout(retry);
      clearTimeout(initial);
      clearTimeout(trackRetry);
      const connection = socket;
      socket = undefined;
      hasFrame = false;
      subscribeCurrent.current = null;
      connection?.close();
      setState(null);
      if (signalAccepted && !denied) (liveScope.current === scope ? signalCurrent.current : undefined)?.disconnected(1013);
      signalAccepted = false;
    };
    const stopWatching = watchWorldReadiness(url, available => {
      ready = available;
      clearTimeout(readinessGrace);
      if (available) {
        if (!socket) void open();
        return;
      }
      // An established stream can outlive a transient readiness probe failure.
      if (socket && hasFrame) readinessGrace = setTimeout(fallBack, 2000);
      else fallBack();
    }, report);
    return () => {
      disposed = true;
      subscribeCurrent.current = null;
      stopWatching();
      clearTimeout(readinessGrace);
      clearTimeout(retry);
      clearTimeout(initial);
      clearTimeout(trackRetry);
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    };
  }, [eventId, scope, signalOnly, signalTopic, user, allowGuest, services, production]);
  useEffect(() => { subscribeCurrent.current?.(); }, [track, viewport?.lat, viewport?.lon, trackBib]);
  return state?.scope === scope && state.services === services && state.viewer === (user ?? null) ? state.frame : null;
}

export function worldLocation(marker: WorldEventMarker) {
  return {
    uid: marker.uid ?? marker.id,
    rideKind: marker.kind,
    lat: marker.lat,
    lng: marker.lon,
    speed: marker.speedMps == null ? null : marker.speedMps * 3.6,
    distance: marker.distanceM ?? null,
    status: marker.eventStatus?.toUpperCase() ?? (marker.status === "paused" ? "STOPPED" : "RIDING"),
    displayName: marker.kind === "virtual" ? "가상" : "실외",
    bib: marker.bib ?? null,
    category: null,
    rank: null,
    overallRank: null,
    lastCp: null,
    geohash: null,
  };
}
