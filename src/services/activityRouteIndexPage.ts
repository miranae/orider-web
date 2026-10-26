import { matchesAnalysisCapability } from "./analysisCapability";
import { httpsCallable } from "firebase/functions";
import type { ActivityRouteIndexCursor, ActivityRouteIndexPageRequest, ActivityRouteIndexPageResponse } from "@shared/activity-route-index-page";
import { OBSERVED_ROUTE_POLICY_V1 as policy } from "@shared/observed-route-comparison";
import { observedRouteAvailable, validCanonicalAverage } from "./activityRouteEvidence";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";

export const ROUTE_INDEX_SCAN_CAP = 5000;
export const ROUTE_INDEX_PAGE_LIMIT = 20;
export const ROUTE_INDEX_TTL_MS = 1800000;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, keys: string[]) => record(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const digest = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(value);
function dense(value: unknown, cap: number): value is unknown[] {
  if (!Array.isArray(value) || value.length > cap) return false;
  for (let index = 0; index < value.length; index++) if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  return true;
}
export const routeIndexTimeMs = (time: ActivityRouteIndexCursor["readTime"]) => time.seconds * 1000 + time.nanoseconds / 1e6;
function validTime(value: unknown): value is ActivityRouteIndexCursor["readTime"] {
  if (!exact(value, ["seconds", "nanoseconds"])) return false;
  const t = value as ActivityRouteIndexCursor["readTime"];
  return count(t.seconds) && t.seconds <= 253402300799 && count(t.nanoseconds) && t.nanoseconds < 1e9;
}
/** Firestore의 동일 위도는 UTF8 문서 ID 순이다. digest를 인증에 사용하지 않는다. */
export function routeIndexPositionAfter(next: ActivityRouteIndexCursor["after"], previous: ActivityRouteIndexCursor["after"]): boolean {
  if (next.startLatitude !== previous.startLatitude) return next.startLatitude > previous.startLatitude;
  const a = new TextEncoder().encode(next.activityId), b = new TextEncoder().encode(previous.activityId);
  for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index]! > b[index]!;
  return a.length > b.length;
}
function validCursor(value: unknown, now: number): value is ActivityRouteIndexCursor {
  if (!exact(value, ["readTime", "anchorPrivateSourceRevision", "policyVersion", "queryPolicyVersion", "after", "scannedCount", "requestBinding"])) return false;
  const c = value as ActivityRouteIndexCursor;
  return validTime(c.readTime) && c.readTime.nanoseconds % 1000 === 0 && routeIndexTimeMs(c.readTime) <= now && now - routeIndexTimeMs(c.readTime) < ROUTE_INDEX_TTL_MS
    && digest(c.anchorPrivateSourceRevision) && c.policyVersion === "observed-route-index-v1" && c.queryPolicyVersion === "start-latitude-band-v1"
    && exact(c.after, ["startLatitude", "activityId"]) && typeof c.after.startLatitude === "number" && Number.isFinite(c.after.startLatitude) && Math.abs(c.after.startLatitude) <= 90 && id(c.after.activityId)
    && count(c.scannedCount) && c.scannedCount > 0 && c.scannedCount < ROUTE_INDEX_SCAN_CAP && digest(c.requestBinding);
}
export function validActivityRouteIndexPageRequest(value: unknown, now = Date.now()): value is ActivityRouteIndexPageRequest {
  if (!record(value) || !exact(value, ["mode", "anchorActivityId", "discipline", ...(Object.prototype.hasOwnProperty.call(value, "cursor") ? ["cursor"] : [])])) return false;
  return value.mode === "route_index_page" && id(value.anchorActivityId) && (value.discipline === "run" || value.discipline === "bike")
    && (!Object.prototype.hasOwnProperty.call(value, "cursor") || validCursor(value.cursor, now));
}
function validMatch(value: unknown): boolean {
  if (!exact(value, ["state", "direction", "guidance", "forwardCandidate", "coverage", "lengthRatio", "forward", "reverse", "limitations"])) return false;
  const m = value as ActivityRouteIndexPageResponse["candidates"][number]["match"];
  if (m.state !== "available" || m.direction !== "forward" || m.guidance !== "observed_similar" || m.forwardCandidate !== true
    || !["complete", "not_complete"].includes(m.coverage) || !finite(m.lengthRatio) || m.lengthRatio < policy.minimumLengthRatio || m.lengthRatio > 1
    || !dense(m.limitations, 4) || new Set(m.limitations).size !== m.limitations.length || !m.limitations.includes("sample_based") || !m.limitations.includes("no_loop_rotation")
    || m.limitations.some(v => !["sample_based", "no_loop_rotation", "gaps", "coverage_not_complete"].includes(v)) || m.limitations.includes("coverage_not_complete") !== (m.coverage === "not_complete")) return false;
  for (const side of [m.forward, m.reverse]) if (!exact(side, ["meanSeparationM", "p95SeparationM", "startSeparationM", "endSeparationM"]) || !Object.values(side).every(finite)) return false;
  return m.reverse.meanSeparationM - m.forward.meanSeparationM >= 1e-9
    && m.forward.meanSeparationM <= policy.maximumMeanSeparationM && m.forward.p95SeparationM <= policy.maximumP95SeparationM
    && m.forward.startSeparationM <= policy.maximumEndpointSeparationM && m.forward.endSeparationM <= policy.maximumEndpointSeparationM;
}
/** 문자열 enum을 암묵적으로 변환하지 않고 이 채널에서 먼저 검사한다. */
function strictCanonicalAverage(value: unknown): boolean {
  if (!record(value) || typeof value.state !== "string" || value.metricsRevision !== null && !digest(value.metricsRevision)) return false;
  if (value.state === "available") return value.reason === null && digest(value.metricsRevision)
    && typeof value.discipline === "string" && ["run", "bike"].includes(value.discipline)
    && typeof value.inputCoverage === "string" && ["complete", "partial_terminal"].includes(value.inputCoverage)
    && typeof value.sourceLayer === "string" && ["raw_parts", "inline_streams"].includes(value.sourceLayer);
  if (typeof value.reason !== "string") return false;
  return value.state === "pending" ? value.reason === "metrics_pending"
    : value.state === "changed_input" ? value.reason === "metrics_revision_changed"
      : value.state === "unavailable" && ["route_unconfirmed", "missing_metrics", "unsupported_metrics"].includes(value.reason);
}
/** 좌표·위도 범위를 재계산하지 않는다. 반환된 범위 계약과 페이지 연속성을 검증한다. */
export function validateActivityRouteIndexPageResponse(value: unknown, request: ActivityRouteIndexPageRequest, now = Date.now()): ActivityRouteIndexPageResponse {
  const invalid = (): never => { throw new Error("invalid_route_index_page"); };
  if (request.cursor && validTime(request.cursor.readTime) && now - routeIndexTimeMs(request.cursor.readTime) >= ROUTE_INDEX_TTL_MS) throw new Error("route_index_expired");
  if (!validActivityRouteIndexPageRequest(request, now) || !exact(value, ["mode", "anchorActivityId", "state", "reason", "readTime", "expiresAt", "searchScope", "scannedCount", "pageScannedCount", "queryFetchedCount", "geometryPrefilteredCount", "sourceValidatedCount", "nextCursor", "exhausted", "scanCapReached", "candidates", "omitted", "io", "limitations"])) invalid();
  const r = value as ActivityRouteIndexPageResponse;
  if (r.mode !== request.mode || r.anchorActivityId !== request.anchorActivityId || !validTime(r.readTime) || routeIndexTimeMs(r.readTime) > now) invalid();
  if (now - routeIndexTimeMs(r.readTime) >= ROUTE_INDEX_TTL_MS) throw new Error("route_index_expired");
  if (r.expiresAt !== r.readTime.seconds * 1000 + Math.floor(r.readTime.nanoseconds / 1e6) + ROUTE_INDEX_TTL_MS || !exact(r.searchScope, ["kind", "queryPolicyVersion"])
    || r.searchScope.kind !== "stored_index_start_latitude_band" || r.searchScope.queryPolicyVersion !== "start-latitude-band-v1"
    || ![r.scannedCount, r.pageScannedCount, r.queryFetchedCount, r.geometryPrefilteredCount, r.sourceValidatedCount].every(count)
    || r.pageScannedCount > ROUTE_INDEX_PAGE_LIMIT || r.queryFetchedCount > ROUTE_INDEX_PAGE_LIMIT + 1 || r.pageScannedCount > r.queryFetchedCount
    || r.scannedCount !== (request.cursor?.scannedCount ?? 0) + r.pageScannedCount || r.scannedCount > ROUTE_INDEX_SCAN_CAP
    || r.geometryPrefilteredCount + r.sourceValidatedCount > r.pageScannedCount || typeof r.exhausted !== "boolean" || r.scanCapReached !== (r.scannedCount === ROUTE_INDEX_SCAN_CAP)
    || !dense(r.candidates, ROUTE_INDEX_PAGE_LIMIT) || r.candidates.length > r.sourceValidatedCount || !dense(r.omitted, ROUTE_INDEX_PAGE_LIMIT + 1)
    || !exact(r.io, ["documents", "metadata", "rawDownloads", "writes"]) || !count(r.io.documents) || r.io.documents > 200 || !count(r.io.metadata) || r.io.metadata > 40 || r.io.rawDownloads !== 0 || r.io.writes !== 0
    || !dense(r.limitations, 4) || JSON.stringify(r.limitations) !== JSON.stringify(["direct_anchor_only", "scanned_page_only", "source_geo_quality_unknown", "gcs_firestore_non_atomic"])) invalid();
  if (request.cursor && (r.readTime.seconds !== request.cursor.readTime.seconds || r.readTime.nanoseconds !== request.cursor.readTime.nanoseconds)) invalid();
  if (r.nextCursor !== null) {
    const c = r.nextCursor;
    if (r.exhausted || r.scanCapReached || r.pageScannedCount === 0 || !validCursor(c, now) || c.scannedCount !== r.scannedCount || c.readTime.seconds !== r.readTime.seconds || c.readTime.nanoseconds !== r.readTime.nanoseconds
      || request.cursor && (c.anchorPrivateSourceRevision !== request.cursor.anchorPrivateSourceRevision || !routeIndexPositionAfter(c.after, request.cursor.after))) invalid();
  } else if (!r.exhausted && !r.scanCapReached && ["available", "no_forward_candidates_in_scanned_page"].includes(r.state)) invalid();
  const reasons: Record<ActivityRouteIndexPageResponse["state"], Array<string | null>> = { available: [null], index_missing: ["index_missing"], changed_input: ["changed_input", "anchor_source_changed"], unsupported_source: ["unsupported_source"], budget_partial: ["validation_budget_exceeded"], no_forward_candidates_in_scanned_page: [null, "stored_geometry_prefilter_not_source_verified"] };
  if (!Object.prototype.hasOwnProperty.call(reasons, r.state) || !reasons[r.state].includes(r.reason) || r.state === "available" && r.candidates.length === 0
    || !["available", "budget_partial"].includes(r.state) && r.candidates.length !== 0) invalid();
  const seen = new Set<string>();
  for (const row of r.candidates) {
    if (!exact(row, ["activityId", "startTime", "match", "canonicalAverage"]) || !id(row.activityId) || row.activityId === request.anchorActivityId || seen.has(row.activityId)
      || !finite(row.startTime) || row.startTime <= 0 || !Number.isFinite(new Date(row.startTime).getTime()) || row.startTime > routeIndexTimeMs(r.readTime) || !validMatch(row.match)
      || !exact(row.canonicalAverage, row.canonicalAverage?.state === "available" ? ["state", "reason", "metricsRevision", "version", "discipline", "startTime", "computedAt", "avgSpeedKph", "inputCoverage", "sourceLayer"] : ["state", "reason", "metricsRevision"])
      || !strictCanonicalAverage(row.canonicalAverage) || !validCanonicalAverage(row.canonicalAverage, { includeCanonicalAverage: true, discipline: request.discipline, startTime: row.startTime })) invalid();
    seen.add(row.activityId);
  }
  for (const row of r.omitted) {
    if (!exact(row, ["activityId", "state"]) || !id(row.activityId) || row.activityId === request.anchorActivityId || seen.has(row.activityId) || !["changed_input", "unsupported_source", "validation_budget_exceeded", "stored_geometry_not_forward_unverified"].includes(row.state)) invalid();
    seen.add(row.activityId);
  }
  if (r.omitted.filter(row => row.state === "stored_geometry_not_forward_unverified").length !== r.geometryPrefilteredCount
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024) invalid();
  return r;
}
export async function loadActivityRouteIndexPage(services: FirebaseServices, uid: string, request: ActivityRouteIndexPageRequest) {
  const auth = services.auth, app = auth.app, viewer = auth.currentUser, functions = services.functions;
  const matches = () => !!uid && !!viewer && viewer.uid === uid && !viewer.isAnonymous && services.auth === auth
    && auth.app === app && auth.currentUser === viewer && services.functions === functions && functions.app === app;
  if (!matches()) throw new Error("account_changed");
  if (!observedRouteAvailable() || !matchesAnalysisCapability(services, "routes")) throw new Error("route_index_not_supported");
  if (!validActivityRouteIndexPageRequest(request)) throw new Error("invalid_route_index_request");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  if (!matchesAnalysisCapability(services, "routes")) throw new Error("route_not_supported");
  const response = await httpsCallable<ActivityRouteIndexPageRequest, unknown>(services.functions, "getActivityStreams")(request);
  if (!matches()) throw new Error("account_changed");
  if (!matchesAnalysisCapability(services, "routes")) throw new Error("route_not_supported");
  return validateActivityRouteIndexPageResponse(response.data, request);
}
