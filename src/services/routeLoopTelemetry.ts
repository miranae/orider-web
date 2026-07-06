import { stripLangPrefix } from "../i18n/detector";
import { track } from "./analytics";

const LOOP_WINDOW_MS = 60_000;
const LOOP_THRESHOLD = 3;
const LOOP_COOLDOWN_MS = 5 * 60_000;

type RouteHit = {
  at: number;
  fromPath: string;
  reason: string;
};

const routeRedirectHits = new Map<string, RouteHit[]>();
const routeVisitHits = new Map<string, RouteHit[]>();
const lastLoopEventAt = new Map<string, number>();

export function resetRouteLoopTelemetryForTest(): void {
  routeRedirectHits.clear();
  routeVisitHits.clear();
  lastLoopEventAt.clear();
}

export function normalizeRouteForTelemetry(path: string): string {
  return stripLangPrefix(path)
    .replace(/\/activity\/[^/?#]+/g, "/activity/:id")
    .replace(/\/segment\/[^/?#]+/g, "/segment/:id")
    .replace(/\/course\/[^/?#]+/g, "/course/:id")
    .replace(/\/athlete\/[^/?#]+/g, "/athlete/:id")
    .replace(/\/group\/[^/?#]+/g, "/group/:id")
    .replace(/\/event\/[^/?#]+/g, "/event/:id")
    .replace(/\/board\/[^/?#]+/g, "/board/:id");
}

function safeTrack(eventName: string, params?: Record<string, unknown>): void {
  try {
    track(eventName, params);
  } catch {
    // Telemetry must never block navigation.
  }
}

function hashRouteKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function recordLoopHit(input: {
  bucket: Map<string, RouteHit[]>;
  route: string;
  detectionKey?: string;
  fromPath: string;
  reason: string;
  onboardingStep?: string | null;
  now: number;
}): number {
  const detectionKey = input.detectionKey ?? input.route;
  const hits = (input.bucket.get(detectionKey) ?? [])
    .filter((hit) => input.now - hit.at <= LOOP_WINDOW_MS);
  hits.push({ at: input.now, fromPath: input.fromPath, reason: input.reason });
  input.bucket.set(detectionKey, hits);

  const cooldownKey = `${input.reason}:${detectionKey}`;
  const lastEventAt = lastLoopEventAt.get(cooldownKey);
  if (
    hits.length >= LOOP_THRESHOLD &&
    (lastEventAt == null || input.now - lastEventAt >= LOOP_COOLDOWN_MS)
  ) {
    lastLoopEventAt.set(cooldownKey, input.now);
    const uniqueFromPaths = [...new Set(hits.map((hit) => hit.fromPath))];
    safeTrack("route_loop_detected", {
      route: input.route,
      route_key_hash: hashRouteKey(detectionKey),
      occurrences: hits.length,
      window_sec: Math.round(LOOP_WINDOW_MS / 1000),
      reason: input.reason,
      onboarding_step: input.onboardingStep ?? "unknown",
      from_paths: uniqueFromPaths.slice(0, 5).join(","),
    });
  }

  return hits.length;
}

export function recordRouteRedirect(input: {
  fromPath: string;
  toPath: string;
  reason: string;
  onboardingStep?: string | null;
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  const fromPath = normalizeRouteForTelemetry(input.fromPath);
  const toPath = normalizeRouteForTelemetry(input.toPath);

  safeTrack("route_redirect", {
    from_path: fromPath,
    to_path: toPath,
    reason: input.reason,
    onboarding_step: input.onboardingStep ?? "unknown",
  });

  return recordLoopHit({
    bucket: routeRedirectHits,
    route: toPath,
    fromPath,
    reason: input.reason,
    onboardingStep: input.onboardingStep,
    now,
  });
}

export function recordRouteVisit(input: {
  path: string;
  fromPath?: string | null;
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  const detectionKey = stripLangPrefix(input.path);
  const route = normalizeRouteForTelemetry(input.path);
  const fromPath = input.fromPath ? normalizeRouteForTelemetry(input.fromPath) : "direct";

  return recordLoopHit({
    bucket: routeVisitHits,
    route,
    detectionKey,
    fromPath,
    reason: "route_revisit",
    now,
  });
}
