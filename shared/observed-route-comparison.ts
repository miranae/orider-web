import type { ActivityRouteEvidence, ObservedRoutePoint, ObservedRouteDiagnostics,
  ObservedRouteComparison, ObservedRouteDirectionComparison, RouteComparisonAttribution } from "./activity-route-comparison";

export const OBSERVED_ROUTE_POLICY_V1 = Object.freeze({
  maxInputPoints: 100000, maxComparisonPoints: 256, maxGapSeconds: 30, maxGapMeters: 500,
  minimumObservedMeters: 300, minimumLengthRatio: 0.90, maximumEndpointSeparationM: 100,
  maximumMeanSeparationM: 50, maximumP95SeparationM: 100,
});
const EARTH_RADIUS_M = 6371000;
const RAD = Math.PI / 180;
interface Edge { a: ObservedRoutePoint; b: ObservedRoutePoint; length: number; from: number; to: number }
interface Prepared { evidence: ActivityRouteEvidence; edges: Edge[]; diagnostics: ObservedRouteDiagnostics }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function opaque(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function validEvidence(e: ActivityRouteEvidence): boolean {
  if (!e || !opaque(e.activityId) || e.activityId.includes("/") || !digest(e.routeInputRevision)
    || !digest(e.routeFingerprint) || !opaque(e.sourceSchemaVersion) || e.accuracy !== "unknown"
    || !["raw_parts", "api_streams"].includes(e.sourceLayer) || e.timingBasis !== "elapsed"
    || !["activity_start", "relative_to_first_gps_observation"].includes(e.timeOrigin)
    || !["complete", "partial", "unknown"].includes(e.coverage)
    || (e.originEpochMs !== null && (!finite(e.originEpochMs) || e.originEpochMs < 0))
    || !Array.isArray(e.points) || e.points.length < 1) return false;
  let previous = -1;
  // indexed 접근은 sparse 배열을 유효한 입력으로 오인하지 않는다.
  for (let i = 0; i < e.points.length; i++) {
    const p = e.points[i];
    if (!p || !finite(p.lat) || p.lat < -90 || p.lat > 90 || !finite(p.lon) || p.lon < -180 || p.lon > 180
      || !finite(p.elapsedSec) || p.elapsedSec < 0 || p.elapsedSec <= previous) return false;
    previous = p.elapsedSec;
  }
  return true;
}
/** antimeridian과 극점에서도 유효한 구면 거리. 반올림으로 asin 범위를 벗어나지 않는다. */
function distance(a: ObservedRoutePoint, b: ObservedRoutePoint): number {
  const h = Math.sin((b.lat - a.lat) * RAD / 2) ** 2
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin((b.lon - a.lon) * RAD / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
function prepare(evidence: ActivityRouteEvidence): Prepared {
  const edges: Edge[] = [];
  let length = 0; let observedElapsedSec = 0; let gapCount = 0; let omittedGapElapsedSec = 0;
  // validEvidence가 비어 있지 않은 dense 배열을 검증했고 loop가 두 첨자의 범위를 보장한다.
  for (let i = 1; i < evidence.points.length; i++) {
    const a = evidence.points[i - 1]!; const b = evidence.points[i]!;
    const dt = b.elapsedSec - a.elapsedSec; const meters = distance(a, b);
    if (dt > OBSERVED_ROUTE_POLICY_V1.maxGapSeconds || meters > OBSERVED_ROUTE_POLICY_V1.maxGapMeters) {
      gapCount++; omittedGapElapsedSec += dt; continue;
    }
    observedElapsedSec += dt; // 같은 좌표의 정지 시간도 남긴다.
    if (meters > 0) {
      edges.push({ a, b, length: meters, from: length, to: length + meters }); length += meters;
    }
  }
  return { evidence, edges, diagnostics: {
    inputPointCount: evidence.points.length, observedLengthM: length, observedElapsedSec,
    elapsedSpanSec: evidence.points[evidence.points.length - 1]!.elapsedSec - evidence.points[0]!.elapsedSec,
    observedStartElapsedSec: evidence.points[0]!.elapsedSec,
    observedEndElapsedSec: evidence.points[evidence.points.length - 1]!.elapsedSec,
    gapCount, omittedGapElapsedSec, coverage: evidence.coverage,
  } };
}
/** 유효한 짧은 edge 안에서만 구면 보간한다. 결측 edge는 prepare 단계에서 제외된다. */
function interpolate(edge: Edge, fraction: number): ObservedRoutePoint {
  if (fraction <= 0) return edge.a;
  if (fraction >= 1) return edge.b;
  const vector = (p: ObservedRoutePoint): [number, number, number] => [Math.cos(p.lat * RAD) * Math.cos(p.lon * RAD),
    Math.cos(p.lat * RAD) * Math.sin(p.lon * RAD), Math.sin(p.lat * RAD)];
  const a = vector(edge.a); const b = vector(edge.b); const angle = edge.length / EARTH_RADIUS_M;
  const denominator = Math.sin(angle);
  const left = Math.sin((1 - fraction) * angle) / denominator;
  const right = Math.sin(fraction * angle) / denominator;
  const x = left * a[0] + right * b[0]; const y = left * a[1] + right * b[1]; const z = left * a[2] + right * b[2];
  return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD,
    elapsedSec: edge.a.elapsedSec + fraction * (edge.b.elapsedSec - edge.a.elapsedSec) };
}
function samples(route: Prepared): ObservedRoutePoint[] {
  // 관측 길이 >300m 분기에서만 호출하므로 edge가 있고 index는 마지막 edge를 넘지 않는다.
  const result: ObservedRoutePoint[] = []; let index = 0;
  for (let i = 0; i < OBSERVED_ROUTE_POLICY_V1.maxComparisonPoints; i++) {
    const target = route.diagnostics.observedLengthM * i / (OBSERVED_ROUTE_POLICY_V1.maxComparisonPoints - 1);
    while (index < route.edges.length - 1 && route.edges[index]!.to < target) index++;
    const edge = route.edges[index]!;
    result.push(interpolate(edge, Math.min(1, Math.max(0, (target - edge.from) / edge.length))));
  }
  return result;
}
function compare(a: readonly ObservedRoutePoint[], b: readonly ObservedRoutePoint[], reverse: boolean): ObservedRouteDirectionComparison {
  // samples가 양쪽에 같은 길이의 256개 dense 표본을 생성한다.
  const separations = a.map((p, i) => distance(p, b[reverse ? b.length - 1 - i : i]!));
  const sorted = [...separations].sort((x, y) => x - y);
  return { meanSeparationM: separations.reduce((sum, value) => sum + value, 0) / separations.length,
    // nearest-rank p95를 고정 정책으로 사용한다.
    p95SeparationM: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
    startSeparationM: separations[0]!, endSeparationM: separations[separations.length - 1]! };
}
function attribution(e: ActivityRouteEvidence): RouteComparisonAttribution {
  return { activityId: e.activityId, routeInputRevision: e.routeInputRevision, routeFingerprint: e.routeFingerprint,
    sourceLayer: e.sourceLayer, sourceSchemaVersion: e.sourceSchemaVersion, accuracy: e.accuracy,
    timingBasis: e.timingBasis, timeOrigin: e.timeOrigin, originEpochMs: e.originEpochMs, coverage: e.coverage };
}
/** IO가 없는 관측 형태 비교. 같은 코스 판정·좌표 정확도 판정·순환 시작점 회전 정렬은 하지 않는다. */
export function compareObservedRoutes(first: ActivityRouteEvidence, second: ActivityRouteEvidence): ObservedRouteComparison {
  const base = { algorithmVersion: "observed-route-comparison-v1" as const, scope: "observed_gps" as const };
  if ((Array.isArray(first?.points) && first.points.length > OBSERVED_ROUTE_POLICY_V1.maxInputPoints)
    || (Array.isArray(second?.points) && second.points.length > OBSERVED_ROUTE_POLICY_V1.maxInputPoints)) {
    return { ...base, state: "unavailable", reason: "input_limit" };
  }
  if (!validEvidence(first) || !validEvidence(second)) return { ...base, state: "unavailable", reason: "invalid_input" };
  const a = prepare(first); const b = prepare(second);
  const lengthRatio = Math.max(a.diagnostics.observedLengthM, b.diagnostics.observedLengthM) > 0
    ? Math.min(a.diagnostics.observedLengthM, b.diagnostics.observedLengthM) / Math.max(a.diagnostics.observedLengthM, b.diagnostics.observedLengthM) : 0;
  const limitations: Extract<ObservedRouteComparison, { diagnostics: unknown }> ["limitations"] = ["sample_based", "no_loop_rotation"];
  if (a.diagnostics.gapCount > 0 || b.diagnostics.gapCount > 0) limitations.push("gaps");
  if (first.coverage !== "complete" || second.coverage !== "complete") limitations.push("coverage_not_complete");
  const common = { ...base, sources: [attribution(first), attribution(second)] as [RouteComparisonAttribution, RouteComparisonAttribution],
    diagnostics: [a.diagnostics, b.diagnostics] as [ObservedRouteDiagnostics, ObservedRouteDiagnostics], lengthRatio, limitations };
  if (Math.min(a.diagnostics.observedLengthM, b.diagnostics.observedLengthM) <= OBSERVED_ROUTE_POLICY_V1.minimumObservedMeters) {
    return { ...common, state: "insufficient", reason: "insufficient_observed_length", sampleCount: 0,
      forward: null, reverse: null, direction: "undetermined", shapeGuidance: "insufficient" };
  }
  const aa = samples(a); const bb = samples(b); const forward = compare(aa, bb, false); const reverse = compare(aa, bb, true);
  const direction = Math.abs(forward.meanSeparationM - reverse.meanSeparationM) < 1e-9 ? "undetermined"
    : reverse.meanSeparationM < forward.meanSeparationM ? "reverse" : "forward";
  const best = direction === "reverse" ? reverse : forward;
  const close = lengthRatio >= OBSERVED_ROUTE_POLICY_V1.minimumLengthRatio
    && best.startSeparationM <= OBSERVED_ROUTE_POLICY_V1.maximumEndpointSeparationM
    && best.endSeparationM <= OBSERVED_ROUTE_POLICY_V1.maximumEndpointSeparationM
    && best.meanSeparationM <= OBSERVED_ROUTE_POLICY_V1.maximumMeanSeparationM
    && best.p95SeparationM <= OBSERVED_ROUTE_POLICY_V1.maximumP95SeparationM;
  return { ...common, state: "available", reason: null, sampleCount: aa.length, forward, reverse, direction,
    shapeGuidance: close ? "observed_shapes_close" : "observed_shapes_differ" };
}
