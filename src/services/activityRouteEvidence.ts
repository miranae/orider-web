import { httpsCallable } from "firebase/functions";
import type { ActivityCanonicalAverage, ActivityRouteEvidence, ActivityRouteEvidenceResponse, ObservedRouteComparison } from "@shared/activity-route-comparison";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { OBSERVED_ROUTE_POLICY_V1 } from "@shared/observed-route-comparison";
import { getRuntimeConfig } from "./runtimeConfig";
export const ROUTE_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
// 음수가 아닌 N개 구간의 합산 오차를 고려해 구간 수에 비례하는 부동소수점 허용오차를 쓴다.
const near = (a: number, b: number, terms = 1) => finite(a) && finite(b)
  && Math.abs(a - b) <= Number.EPSILON * Math.max(1, a, b) * Math.max(8, terms) * 8;
const opaque = (value: unknown): value is string => typeof value === "string" && !!value.trim() && value.length <= 256;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function observedRouteAvailable() {
  const config = getRuntimeConfig();
  return config.appEnvironment === "stage" && config.firebaseFunctionsBase === "https://asia-northeast3-orider-dev.cloudfunctions.net";
}
// 별도 선택 채널의 서버 계약35다. 일반 프런트 지표 version34는 변경하지 않는다.
export const ROUTE_CANONICAL_AVERAGE_VERSION = 35;
export interface RouteCanonicalAverageOption { includeCanonicalAverage: true; startTime: number; discipline: "bike" | "run" }
function validCanonicalAverage(value: unknown, expected?: RouteCanonicalAverageOption): value is ActivityCanonicalAverage {
  const average = record(value);
  if (!average || average.metricsRevision !== null && !digest(average.metricsRevision)) return false;
  if (average.state === "available") return Object.keys(average).length === 10 && average.reason === null && typeof average.metricsRevision === "string"
    && average.version === ROUTE_CANONICAL_AVERAGE_VERSION && ["bike", "run"].includes(String(average.discipline))
    && finite(average.startTime) && average.startTime > 0 && Number.isFinite(new Date(average.startTime).getTime())
    && finite(average.computedAt) && average.computedAt > 0 && Number.isFinite(new Date(average.computedAt).getTime())
    && (average.avgSpeedKph === null || finite(average.avgSpeedKph))
    && ["complete", "partial_terminal"].includes(String(average.inputCoverage)) && ["raw_parts", "inline_streams"].includes(String(average.sourceLayer))
    && (!expected || average.startTime === expected.startTime && average.discipline === expected.discipline);
  return Object.keys(average).length === 3 && (average.state === "pending" ? average.reason === "metrics_pending"
    : average.state === "changed_input" ? average.reason === "metrics_revision_changed"
      : average.state === "unavailable" && ["route_unconfirmed", "missing_metrics", "unsupported_metrics"].includes(String(average.reason)));
}
export function validateRouteEvidenceResponse(value: unknown, activityId: string, expectedRouteInputRevision?: string, canonical?: RouteCanonicalAverageOption): ActivityRouteEvidenceResponse {
  const invalid = () => { throw new Error("invalid_route_evidence_response"); };
  const data = record(value);
  if (!data || (Object.keys(data).length !== 7 && !(canonical && Object.prototype.hasOwnProperty.call(data, "canonicalAverage") && Object.keys(data).length === 8)) || data.mode !== "route_evidence" || data.activityId !== activityId
    || !["available", "pending", "changed_input", "unavailable"].includes(String(data.state))
    || data.routeInputRevision !== null && !digest(data.routeInputRevision)
    || data.sourceLayer !== null && !["raw_parts", "api_streams"].includes(String(data.sourceLayer))) return invalid();
  if (data.state !== "available") {
    if (data.route !== null || !["missing_gps", "unknown_axis", "invalid_input", "input_limit", "incomplete_input", "changed_input"].includes(String(data.reason))) return invalid();
  } else {
    const route = record(data.route);
    if (data.reason !== null || !route || Object.keys(route).length !== 11 || route.activityId !== activityId || route.routeInputRevision !== data.routeInputRevision
      || !digest(route.routeInputRevision) || expectedRouteInputRevision !== undefined && route.routeInputRevision !== expectedRouteInputRevision
      || !digest(route.routeFingerprint) || route.sourceLayer !== data.sourceLayer || !["raw_parts", "api_streams"].includes(String(route.sourceLayer))
      || !opaque(route.sourceSchemaVersion) || route.accuracy !== "unknown" || route.timingBasis !== "elapsed"
      || !["activity_start", "relative_to_first_gps_observation"].includes(String(route.timeOrigin))
      || route.sourceLayer === "raw_parts" && route.timeOrigin === "relative_to_first_gps_observation" && !finite(route.originEpochMs)
      || route.originEpochMs !== null && (!finite(route.originEpochMs) || !Number.isFinite(new Date(route.originEpochMs).getTime()))
      || !["complete", "partial", "unknown"].includes(String(route.coverage))
      || !Array.isArray(route.points) || route.points.length < 2 || route.points.length > 100000) return invalid();
    let previous = -1;
    for (const raw of Array.from(route.points)) {
      const point = record(raw);
      if (!point || Object.keys(point).length !== 3 || typeof point.lat !== "number" || !Number.isFinite(point.lat) || Math.abs(point.lat) > 90
        || typeof point.lon !== "number" || !Number.isFinite(point.lon) || Math.abs(point.lon) > 180
        || !finite(point.elapsedSec) || point.elapsedSec <= previous) return invalid();
      previous = point.elapsedSec;
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > ROUTE_RESPONSE_MAX_BYTES) throw new Error("route_input_limit");
  if (Object.prototype.hasOwnProperty.call(data, "canonicalAverage") && (!canonical || !validCanonicalAverage(data.canonicalAverage, canonical) || record(data.canonicalAverage)?.state === "available" && data.state !== "available")) {
    const { canonicalAverage: _invalidAverage, ...routeOnly } = data;
    return routeOnly as ActivityRouteEvidenceResponse;
  }
  return value as ActivityRouteEvidenceResponse;
}
export async function loadActivityRouteEvidence(services: FirebaseServices, uid: string, activityId: string, expectedRouteInputRevision?: string, canonical?: RouteCanonicalAverageOption) {
  const matches = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  if (!observedRouteAvailable() || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("route_not_supported");
  if (!opaque(activityId) || activityId.includes("/") || expectedRouteInputRevision !== undefined && !digest(expectedRouteInputRevision)) throw new Error("invalid_route_request");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const response = await httpsCallable<{ activityId: string; mode: "route_evidence"; expectedRouteInputRevision?: string; includeCanonicalAverage?: true }, ActivityRouteEvidenceResponse>(services.functions, "getActivityStreams")({ activityId, mode: "route_evidence", ...(expectedRouteInputRevision ? { expectedRouteInputRevision } : {}), ...(canonical ? { includeCanonicalAverage: true as const } : {}) });
  if (!matches()) throw new Error("account_changed");
  return validateRouteEvidenceResponse(response.data, activityId, expectedRouteInputRevision, canonical);
}
/** Worker 결과의 출처와 수치 경계를 메인 스레드에서도 검사한다. 재계산하지 않는다. */
export function validRouteComparison(value: unknown, routes: readonly ActivityRouteEvidence[]): value is ObservedRouteComparison {
  const result = record(value);
  if (!result || result.algorithmVersion !== "observed-route-comparison-v1" || result.scope !== "observed_gps") return false;
  if (result.state === "unavailable") return ["invalid_input", "input_limit"].includes(String(result.reason));
  if (!["available", "insufficient"].includes(String(result.state)) || !Array.isArray(result.sources) || result.sources.length !== 2 || !Array.isArray(result.diagnostics) || result.diagnostics.length !== 2
    || !finite(result.lengthRatio) || result.lengthRatio > 1 || !["forward", "reverse", "undetermined"].includes(String(result.direction))
    || !["observed_shapes_close", "observed_shapes_differ", "insufficient"].includes(String(result.shapeGuidance))
    || !Array.isArray(result.limitations) || !result.limitations.includes("sample_based") || !result.limitations.includes("no_loop_rotation")
    || result.limitations.some(item => !["sample_based", "gaps", "coverage_not_complete", "no_loop_rotation"].includes(item))) return false;
  for (let index = 0; index < 2; index++) {
    const source = record(result.sources[index]), route = routes[index], diagnostic = record(result.diagnostics[index]);
    if (!source || !route || Object.keys(source).length !== Object.keys(route).length - 1 || Object.entries(route).some(([key, entry]) => key !== "points" && source[key] !== entry)
      || !diagnostic || Object.keys(diagnostic).length !== 9 || diagnostic.coverage !== route.coverage || diagnostic.inputPointCount !== route.points.length
      || ![diagnostic.observedLengthM, diagnostic.observedElapsedSec, diagnostic.elapsedSpanSec, diagnostic.observedStartElapsedSec, diagnostic.observedEndElapsedSec, diagnostic.gapCount, diagnostic.omittedGapElapsedSec].every(finite)
      || diagnostic.observedStartElapsedSec !== route.points[0]?.elapsedSec || diagnostic.observedEndElapsedSec !== route.points[route.points.length - 1]?.elapsedSec
      || !near(Number(diagnostic.elapsedSpanSec), Number(diagnostic.observedEndElapsedSec) - Number(diagnostic.observedStartElapsedSec))
      || !near(Number(diagnostic.observedElapsedSec) + Number(diagnostic.omittedGapElapsedSec), Number(diagnostic.elapsedSpanSec), route.points.length)
      || !Number.isSafeInteger(diagnostic.gapCount) || Number(diagnostic.gapCount) > route.points.length - 1
      || Number(diagnostic.observedElapsedSec) > Number(diagnostic.elapsedSpanSec) + Math.max(1, Number(diagnostic.elapsedSpanSec)) * 1e-9 || Number(diagnostic.omittedGapElapsedSec) > Number(diagnostic.elapsedSpanSec) + Math.max(1, Number(diagnostic.elapsedSpanSec)) * 1e-9) return false;
  }
  const diagnostics = result.diagnostics as Array<Record<string, unknown>>;
  const lengths = diagnostics.map(item => Number(item.observedLengthM));
  const maximumLength = Math.max(...lengths), minimumLength = Math.min(...lengths);
  const ratio = maximumLength > 0 ? minimumLength / maximumLength : 0;
  if (!near(result.lengthRatio, ratio)
    || (result.state === "available") !== (minimumLength > OBSERVED_ROUTE_POLICY_V1.minimumObservedMeters)) return false;
  if (result.limitations.includes("coverage_not_complete") !== routes.some(route => route.coverage !== "complete")
    || result.limitations.includes("gaps") !== diagnostics.some(value => Number(value.gapCount) > 0)) return false;
  if (result.state === "insufficient") return result.reason === "insufficient_observed_length" && result.sampleCount === 0 && result.forward === null && result.reverse === null && result.direction === "undetermined" && result.shapeGuidance === "insufficient";
  return result.reason === null && result.sampleCount === 256 && result.shapeGuidance !== "insufficient" && [result.forward, result.reverse].every(direction => {
    const data = record(direction);
    return data && [data.meanSeparationM, data.p95SeparationM, data.startSeparationM, data.endSeparationM].every(finite);
  });
}
