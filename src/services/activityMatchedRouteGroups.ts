import { httpsCallable } from "firebase/functions";
import { MATCHED_ROUTE_GROUP_LIMITS as limits, type ActivityMatchedRouteGroupRequest, type ActivityMatchedRouteGroupResponse, type MatchedRouteMetricSummary } from "@shared/activity-matched-route-groups";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { observedRouteAvailable, validCanonicalAverage } from "./activityRouteEvidence";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const count = (value: unknown, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
const epoch = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(value);
const opaque = (value: unknown): value is string => typeof value === "string" && value.length <= 2800 && /^mrgg1\.[A-Za-z0-9_-]{39,}$/u.test(value);
const dense = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max && Array.from({ length: value.length }, (_, index) => Object.prototype.hasOwnProperty.call(value, index)).every(Boolean);
export const matchedRouteReadTimeMs = (value: ActivityMatchedRouteGroupResponse["readTime"]) => value.seconds * 1000 + value.nanoseconds / 1e6;
function timestamp(value: unknown): value is ActivityMatchedRouteGroupResponse["readTime"] {
  if (!exact(value, ["seconds", "nanoseconds"])) return false;
  const time = value as ActivityMatchedRouteGroupResponse["readTime"];
  return count(time.seconds, 253402300799) && count(time.nanoseconds, 999999999) && time.nanoseconds % 1000 === 0;
}
export function validActivityMatchedRouteGroupRequest(value: unknown): value is ActivityMatchedRouteGroupRequest {
  return record(value) && exact(value, ["mode", "anchorActivityId", "discipline", ...(Object.prototype.hasOwnProperty.call(value, "geometryPolicy") ? ["geometryPolicy"] : []), ...(Object.prototype.hasOwnProperty.call(value, "cursor") ? ["cursor"] : [])])
    && value.mode === "matched_route_group_page" && id(value.anchorActivityId) && (value.discipline === "run" || value.discipline === "bike")
    && (!Object.prototype.hasOwnProperty.call(value, "geometryPolicy") || value.geometryPolicy === "complete" || value.geometryPolicy === "observed_native")
    && (!Object.prototype.hasOwnProperty.call(value, "cursor") || opaque(value.cursor));
}
function summary(value: unknown, now: number, year = false): value is MatchedRouteMetricSummary {
  if (!exact(value, ["memberCount", "knownMetricCount", "rankEligibleCount", "fastestActivityIds", "trend", ...(year ? ["year"] : [])])) return false;
  const s = value as unknown as MatchedRouteMetricSummary;
  if (!count(s.memberCount, 6) || s.memberCount < 1 || !count(s.knownMetricCount, s.memberCount) || !count(s.rankEligibleCount, s.knownMetricCount)
    || !dense(s.fastestActivityIds, s.rankEligibleCount) || s.fastestActivityIds.some(value => !id(value)) || new Set(s.fastestActivityIds).size !== s.fastestActivityIds.length
    || (s.rankEligibleCount === 0 ? s.fastestActivityIds.length !== 0 : s.fastestActivityIds.length === 0)
    || s.fastestActivityIds.some((value, index) => index > 0 && value <= s.fastestActivityIds[index - 1]!)) return false;
  const t = s.trend;
  if (!record(t) || t.basis !== "canonical_avg_speed_kph" || t.count !== s.rankEligibleCount) return false;
  return t.state === "available" ? exact(t, ["state", "basis", "count", "window", "slopePerDay"]) && t.count >= 2
    && exact(t.window, ["fromInclusive", "toInclusive"]) && epoch(t.window.fromInclusive) && epoch(t.window.toInclusive)
    && t.window.toInclusive > t.window.fromInclusive && t.window.toInclusive <= now && typeof t.slopePerDay === "number" && Number.isFinite(t.slopePerDay)
    : t.state === "insufficient" && exact(t, ["state", "basis", "count", "reason"]) && (t.reason === "insufficient_distinct_dates" || t.reason === "non_finite");
}
function canonical(value: unknown, request: ActivityMatchedRouteGroupRequest, startTime: number) {
  if (!record(value) || typeof value.state !== "string" || !exact(value, value.state === "available"
    ? ["state", "reason", "metricsRevision", "version", "discipline", "startTime", "computedAt", "avgSpeedKph", "inputCoverage", "sourceLayer"] : ["state", "reason", "metricsRevision"])) return false;
  if (value.state === "available" && (typeof value.discipline !== "string" || typeof value.inputCoverage !== "string" || typeof value.sourceLayer !== "string")) return false;
  if (value.state !== "available" && typeof value.reason !== "string") return false;
  return validCanonicalAverage(value, { includeCanonicalAverage: true, discipline: request.discipline, startTime });
}
export function validateActivityMatchedRouteGroupResponse(value: unknown, request: ActivityMatchedRouteGroupRequest, now = Date.now()): ActivityMatchedRouteGroupResponse {
  const invalid = (): never => { throw new Error("invalid_matched_route_group_response"); };
  if (!validActivityMatchedRouteGroupRequest(request) || !exact(value, ["mode", "anchorActivityId", "discipline", "state", "readTime", "expiresAt", "groupToken", "nextCursor", "scope", "coverage", "omittedCounts", "members", "summary", "io"])) invalid();
  const r = value as ActivityMatchedRouteGroupResponse, observed = request.geometryPolicy === "observed_native";
  const geometry = observed ? "observed_gap_free_coverage_unproven" : "observed_complete_gap_free";
  if (r.mode !== request.mode || r.anchorActivityId !== request.anchorActivityId || r.discipline !== request.discipline || !timestamp(r.readTime)
    || matchedRouteReadTimeMs(r.readTime) > now || r.expiresAt !== r.readTime.seconds * 1000 + Math.floor(r.readTime.nanoseconds / 1e6) + limits.ttlMs
    || !["available", "index_missing", "anchor_unsupported", "changed_input", "expired", "budget_partial"].includes(r.state)
    || r.groupToken !== null && !opaque(r.groupToken) || r.nextCursor !== null && (!opaque(r.nextCursor) || r.nextCursor === request.cursor || !r.groupToken)) invalid();
  if (r.state !== "expired" && now >= r.expiresAt) throw new Error("matched_route_group_expired");
  if (!exact(r.scope, ["kind", "indexQueryPolicy", "groupPolicy", "descriptorLimit", "validatedLimit"]) || r.scope.kind !== "bounded_owner_stored_index_cohort"
    || r.scope.indexQueryPolicy !== "document_id_first20_v1" || r.scope.groupPolicy !== (observed ? "observed-native-complete-link-v1" : "observed-complete-link-v1") || r.scope.descriptorLimit !== 20 || r.scope.validatedLimit !== 6
    || !exact(r.coverage, ["indexCohort", "sourceValidation", "wholeHistory", "geometry", "gpsAccuracy", "deduplication"])
    || !["exhausted", "descriptor_capped", "not_inspected"].includes(r.coverage.indexCohort)
    || !["complete_in_cohort", "validation_capped", "omitted", "not_inspected"].includes(r.coverage.sourceValidation)
    || ![geometry, "unavailable"].includes(r.coverage.geometry) || r.coverage.wholeHistory !== "unknown" || r.coverage.gpsAccuracy !== "unknown" || r.coverage.deduplication !== "unknown"
    || !exact(r.omittedCounts, ["unsupportedDescriptor", "partialGeometry", "gapGeometry", "changedSource", "validationCap", "nonAnchorCluster"])
    || !Object.values(r.omittedCounts).every(value => count(value, 20)) || r.omittedCounts.nonAnchorCluster > 5
    || !exact(r.io, ["logicalDocuments", "metadataRequests", "descriptorComparisons", "rawDownloads", "writes"])
    || !count(r.io.logicalDocuments, limits.documents) || !count(r.io.metadataRequests, limits.metadata) || !count(r.io.descriptorComparisons, limits.comparedPairs)
    || r.io.rawDownloads !== 0 || r.io.writes !== 0 || !dense(r.members, limits.memberPageSize)) invalid();
  const seen = new Set<string>();
  for (const member of r.members) {
    if (!exact(member, ["activityId", "startTime", "year", "isAnchor", "canonicalAverage", "rankingEligible", "rankingExclusionReason"])
      || !id(member.activityId) || seen.has(member.activityId) || !epoch(member.startTime) || member.startTime > matchedRouteReadTimeMs(r.readTime)
      || member.year !== Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(member.startTime))
      || member.isAnchor !== (member.activityId === request.anchorActivityId) || !canonical(member.canonicalAverage, request, member.startTime)) invalid();
    const m = member.canonicalAverage, exclusion = observed ? "observed_geometry_only" : m.state !== "available" ? "metric_unavailable" : m.inputCoverage !== "complete" ? "partial_terminal"
      : m.avgSpeedKph === null || m.avgSpeedKph <= 0 ? "null_or_zero_speed" : null;
    if (member.rankingExclusionReason !== exclusion || member.rankingEligible !== (exclusion === null)) invalid();
    const previous = r.members[seen.size - 1];
    if (previous && (previous.startTime > member.startTime || previous.startTime === member.startTime && previous.activityId >= member.activityId)) invalid();
    seen.add(member.activityId);
  }
  if (r.summary !== null) {
    const s = r.summary;
    if (!exact(s, ["memberCount", "knownMetricCount", "rankEligibleCount", "fastestActivityIds", "trend", "years"])) invalid();
    const { years: _years, ...counts } = s;
    if (observed && s.rankEligibleCount !== 0 || !summary(counts, matchedRouteReadTimeMs(r.readTime))) invalid();
    if (!r.groupToken || r.coverage.geometry !== geometry || !["available", "budget_partial"].includes(r.state) || s.memberCount < r.members.length || !dense(s.years, 6) || !s.years.length) invalid();
    const years = new Set<number>();
    for (const year of s.years) {
      if (!summary(year, matchedRouteReadTimeMs(r.readTime), true) || !Number.isSafeInteger(year.year) || year.year < 1970 || years.has(year.year)) invalid();
      years.add(year.year);
    }
    if (s.years.some((year, index) => index > 0 && year.year >= s.years[index - 1]!.year)
      || s.years.reduce((sum, year) => sum + year.memberCount, 0) !== s.memberCount || s.years.reduce((sum, year) => sum + year.knownMetricCount, 0) !== s.knownMetricCount
      || s.years.reduce((sum, year) => sum + year.rankEligibleCount, 0) !== s.rankEligibleCount || !r.members.length || r.nextCursor && r.members.length !== 5
      || !request.cursor && r.members.length === s.memberCount && r.nextCursor !== null || !request.cursor && r.members.length < s.memberCount && r.nextCursor === null) invalid();
  } else if (r.members.length || r.nextCursor || r.state === "available") invalid();
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 64 * 1024) invalid();
  return r;
}
export async function loadActivityMatchedRouteGroups(services: FirebaseServices, uid: string, request: ActivityMatchedRouteGroupRequest) {
  const current = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!current()) throw new Error("account_changed");
  if (!observedRouteAvailable() || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("matched_route_group_unsupported");
  if (!validActivityMatchedRouteGroupRequest(request)) throw new Error("invalid_matched_route_group_request");
  await services.ensureAppCheckReady(); if (!current()) throw new Error("account_changed");
  const response = await httpsCallable<ActivityMatchedRouteGroupRequest, unknown>(services.functions, "getActivityStreams")(request);
  if (!current()) throw new Error("account_changed");
  return validateActivityMatchedRouteGroupResponse(response.data, request);
}
/** 같은 조회 시점의 제한된 그룹만 수동 페이지로 연결한다. */
export function validateMatchedRouteGroupAppend(pages: readonly ActivityMatchedRouteGroupResponse[], response: ActivityMatchedRouteGroupResponse) {
  const invalid = (): never => { throw new Error("matched_route_group_continuity"); };
  const first = pages[0], previous = pages[pages.length - 1];
  if (pages.length >= 2) invalid();
  if (first && (!previous?.nextCursor || ["groupToken", "summary", "readTime", "expiresAt", "scope", "coverage", "omittedCounts", "state"].some(key => JSON.stringify(first[key as keyof typeof first]) !== JSON.stringify(response[key as keyof typeof response])))) invalid();
  const rows = [...pages.flatMap(page => page.members), ...response.members];
  if (new Set(rows.map(row => row.activityId)).size !== rows.length || rows.some((row, index) => index > 0 && (rows[index - 1]!.startTime > row.startTime || rows[index - 1]!.startTime === row.startTime && rows[index - 1]!.activityId >= row.activityId))) invalid();
  const s = response.summary;
  if (!s) { if (pages.length) invalid(); return; }
  const loadedCountsFit = (members: typeof rows, stats: MatchedRouteMetricSummary) => members.length <= stats.memberCount
    && members.filter(row => row.canonicalAverage.state === "available" && row.canonicalAverage.avgSpeedKph !== null).length <= stats.knownMetricCount
    && members.filter(row => row.rankingEligible).length <= stats.rankEligibleCount;
  if (!loadedCountsFit(rows, s) || rows.some(row => !s.years.some(year => year.year === row.year))
    || s.years.some(year => !loadedCountsFit(rows.filter(row => row.year === year.year), year)) || response.nextCursor && rows.length >= s.memberCount) invalid();
  if (response.nextCursor) return;
  if (rows.length !== s.memberCount || rows.filter(row => row.isAnchor).length !== 1) invalid();
  const verify = (members: typeof rows, stats: MatchedRouteMetricSummary) => {
    const known = members.filter(row => row.canonicalAverage.state === "available" && row.canonicalAverage.avgSpeedKph !== null), eligible = members.filter(row => row.rankingEligible);
    const maximum = eligible.length ? Math.max(...eligible.map(row => row.canonicalAverage.state === "available" ? row.canonicalAverage.avgSpeedKph! : -1)) : null;
    const fastest = eligible.filter(row => row.canonicalAverage.state === "available" && row.canonicalAverage.avgSpeedKph === maximum).map(row => row.activityId).sort();
    return stats.memberCount === members.length && stats.knownMetricCount === known.length && stats.rankEligibleCount === eligible.length && JSON.stringify(stats.fastestActivityIds) === JSON.stringify(fastest);
  };
  if (!verify(rows, s) || s.years.some(year => !verify(rows.filter(row => row.year === year.year), year))) invalid();
}
