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
) {
  const services = useFirebaseServices();
  const signalOnly = signal !== undefined;
  const signalTopic = signal?.topic;
  const scope = JSON.stringify([eventId, user?.uid, signalOnly, signalTopic, allowGuest]);
  const signalCurrent = useRef(signal);
  signalCurrent.current = signal;
  const options = useRef({ track, viewport, trackBib });
  options.current = { track, viewport, trackBib };
  const subscribeCurrent = useRef<(() => void) | null>(null);
  const [state, setState] = useState<EventState | null>(null);
  useEffect(() => {
    if (!endpoint || !eventId || (!user && !allowGuest) || !isEmulatorRuntime() ||
        !getRuntimeConfig().firebaseProjectId?.startsWith("demo-")) return;
    const url = endpoint;
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
    let generation = 0;
    let initial: ReturnType<typeof setTimeout> | undefined;
    const open = async () => {
      if (!ready || denied || disposed) return;
      const attempt = ++generation;
      try {
        const token = await identity?.getIdToken();
        if (disposed || !ready || attempt !== generation) return;
        const connection = new WebSocket(url);
        socket = connection;
        initial = setTimeout(() => {
          if (socket !== connection) return;
          report("RideWorld.eventFirstFrame", new Error("World event first frame timed out"), { eventId: event });
          connection.close();
        }, 3000);
        let latest: WorldEventFrame | null = null;
        const subscribe = () => {
          if (disposed || socket !== connection || connection.readyState !== WebSocket.OPEN) return;
          try {
            connection.send(JSON.stringify({ v: 1, type: "event_subscribe", eventId: event, token, guest: !identity && allowGuest, viewerSessionId, signalOnly, signalTopic, ...options.current }));
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
            if (disposed || socket !== connection || frame.v !== 1 || frame.eventId !== event) return;
            if (frame.type === "event_signal") {
              const version = signalTopic === "spectator" ? frame.spectatorVersion
                : signalTopic === "discord" ? frame.discordVersion : frame.meetingVersion;
              const validPhase = frame.meetingPhase !== undefined &&
                ["OPEN", "LIVE", "FINISHED", "CANCELLED"].includes(frame.meetingPhase);
              if (version === null || typeof version === "string" && /^\d+:\d{1,9}$/.test(version)) {
                clearTimeout(initial);
                signalAccepted = true;
                hasFrame = true;
                signalCurrent.current?.changed(version);
                delayMs = 1000;
              } else if (version !== undefined || !validPhase) {
                throw new Error("Invalid World event signal revision");
              }
              if (validPhase && frame.meetingPhase) {
                clearTimeout(initial);
                hasFrame = true;
                delayMs = 1000;
                signalCurrent.current?.phaseChanged?.(frame.meetingPhase);
              }
              return;
            }
            if (!Number.isSafeInteger(frame.revision) || frame.revision <= (latest?.revision ?? 0)) return;
            if (frame.type === "event_snapshot" && Array.isArray(frame.markers) && Array.isArray(frame.roster)) {
              clearTimeout(initial);
              latest = frame;
              hasFrame = true;
            } else if (frame.type === "event_delta") {
              if (!latest || frame.revision !== latest.revision + 1) {
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
          if (signalAccepted || denied) signalCurrent.current?.disconnected(code);
          signalAccepted = false;
          if (!denied && ready) {
            retry = setTimeout(() => void open(), delayMs);
            delayMs = Math.min(10000, delayMs * 2);
          }
        });
      } catch (error) {
        if (!disposed && attempt === generation) {
          if (signalAccepted) signalCurrent.current?.disconnected(1013);
          signalAccepted = false;
          report("RideWorld.connectEvent", error, { eventId: event });
          if (ready) retry = setTimeout(() => void open(), delayMs);
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
      if (signalAccepted && !denied) signalCurrent.current?.disconnected(1013);
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
  }, [eventId, scope, signalOnly, signalTopic, user, allowGuest, services]);
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
