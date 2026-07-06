import { track } from "./analytics";

const LOOP_WINDOW_MS = 60_000;
const LOOP_THRESHOLD = 3;
const LOOP_COOLDOWN_MS = 5 * 60_000;

type RouteHit = {
  at: number;
  fromPath: string;
  reason: string;
};

const routeHits = new Map<string, RouteHit[]>();
const lastLoopEventAt = new Map<string, number>();

export function resetRouteLoopTelemetryForTest(): void {
  routeHits.clear();
  lastLoopEventAt.clear();
}

export function normalizeRouteForTelemetry(path: string): string {
  return path
    .replace(/\/activity\/[^/?#]+/g, "/activity/:id")
    .replace(/\/segment\/[^/?#]+/g, "/segment/:id")
    .replace(/\/course\/[^/?#]+/g, "/course/:id")
    .replace(/\/athlete\/[^/?#]+/g, "/athlete/:id")
    .replace(/\/group\/[^/?#]+/g, "/group/:id")
    .replace(/\/event\/[^/?#]+/g, "/event/:id")
    .replace(/\/board\/[^/?#]+/g, "/board/:id");
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

  track("route_redirect", {
    from_path: fromPath,
    to_path: toPath,
    reason: input.reason,
    onboarding_step: input.onboardingStep ?? "unknown",
  });

  const hits = (routeHits.get(toPath) ?? [])
    .filter((hit) => now - hit.at <= LOOP_WINDOW_MS);
  hits.push({ at: now, fromPath, reason: input.reason });
  routeHits.set(toPath, hits);

  const lastEventAt = lastLoopEventAt.get(toPath);
  if (
    hits.length >= LOOP_THRESHOLD &&
    (lastEventAt == null || now - lastEventAt >= LOOP_COOLDOWN_MS)
  ) {
    lastLoopEventAt.set(toPath, now);
    const uniqueFromPaths = [...new Set(hits.map((hit) => hit.fromPath))];
    track("route_loop_detected", {
      route: toPath,
      occurrences: hits.length,
      window_sec: Math.round(LOOP_WINDOW_MS / 1000),
      reason: input.reason,
      onboarding_step: input.onboardingStep ?? "unknown",
      from_paths: uniqueFromPaths.slice(0, 5).join(","),
    });
  }

  return hits.length;
}
