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
        // track을 바꿔 다시 구독하면 서버가 새 event_snapshot을 보낸다(구독마다 최대 1개, track 에코 없음). 그 전 delta는
        // 이전 선택 기준이다. 응답을 기다리는 구독이 둘 이상일 때 온 snapshot은 어느 요청의 것인지 모르므로 선택 격차를
        // 쓰지 않고 현재 선택으로 한 번 더 구독해 짝을 맞춘다.
        let subscribedTrack: string | null = null;
        let pendingSubscribes = 0;
        const subscribe = () => {
          if (disposed || socket !== connection || connection.readyState !== WebSocket.OPEN) return;
          try {
            subscribedTrack = options.current.track ?? null;
            pendingSubscribes++;
            connection.send(JSON.stringify({ v: 1, type: "event_subscribe", eventId: event, token, ...(appCheck ? { appCheck } : {}), guest: !identity && allowGuest, viewerSessionId, signalOnly, signalTopic, ...options.current }));
          } catch (error) {
            report("RideWorld.subscribeEvent", error, { eventId: event });
            connection.close();
          }
        };
        subscribeCurrent.current = subscribe;
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
              const ambiguous = pendingSubscribes > 1;
              pendingSubscribes = 0;
              latest = ambiguous ? { ...frame, track: null, trackUnknown: true } : { ...frame, track: subscribedTrack };
              hasFrame = true;
              if (ambiguous) subscribe();
            } else if (frame.type === "event_delta") {
              if (!latest || frame.revision !== latest.revision + 1) {
                report("RideWorld.deltaGap", new Error("World delta has no matching snapshot revision"), { eventId: event });
                latest = null;
                setState(null);
                subscribe();
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
          if (subscribeCurrent.current === subscribe) subscribeCurrent.current = null;
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
