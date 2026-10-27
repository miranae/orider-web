import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import { currentCanonicalContractFixture } from "./activityRouteEvidence.fixture";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { compiledRouteIndexWire as archivedCompiledWire } from "./activityRouteIndexPage.compiled.fixture";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityRouteIndexPageRequest, ActivityRouteIndexPageResponse } from "@shared/activity-route-index-page";
import { loadActivityRouteIndexPage, routeIndexPositionAfter, validateActivityRouteIndexPageResponse, validActivityRouteIndexPageRequest } from "./activityRouteIndexPage";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), available: true }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.invoke }));
vi.mock("./activityRouteEvidence", async original => ({ ...await original<typeof import("./activityRouteEvidence")>(), observedRouteAvailable: () => mocks.available }));
const compiledWire = currentCanonicalContractFixture(archivedCompiledWire);
const now = 1791792000000;
const request: ActivityRouteIndexPageRequest = { mode: "route_index_page", anchorActivityId: "anchor", discipline: "run" };
// 합성 계약의 반례다. 실제 compiled wire는 백엔드 최종 승인 후 고정한다.
function wire(): ActivityRouteIndexPageResponse {
  return { mode: "route_index_page", anchorActivityId: "anchor", state: "available", reason: null,
    readTime: { seconds: now / 1000, nanoseconds: 0 }, expiresAt: now + 1800000,
    searchScope: { kind: "stored_index_start_latitude_band", queryPolicyVersion: "start-latitude-band-v1" },
    scannedCount: 1, pageScannedCount: 1, queryFetchedCount: 1, geometryPrefilteredCount: 0, sourceValidatedCount: 1,
    nextCursor: null, exhausted: true, scanCapReached: false,
    candidates: [{ activityId: "candidate", startTime: now - 86400000, match: { state: "available", direction: "forward", guidance: "observed_similar", forwardCandidate: true,
      coverage: "not_complete", lengthRatio: 1, forward: { meanSeparationM: 0, p95SeparationM: 0, startSeparationM: 0, endSeparationM: 0 },
      reverse: { meanSeparationM: 100, p95SeparationM: 100, startSeparationM: 100, endSeparationM: 100 }, limitations: ["sample_based", "no_loop_rotation", "coverage_not_complete"] },
      canonicalAverage: { state: "available", reason: null, version: ACTIVITY_METRICS_VERSION, metricsRevision: "a".repeat(64), discipline: "run", startTime: now - 86400000, computedAt: now - 1000, avgSpeedKph: 12, inputCoverage: "complete", sourceLayer: "raw_parts" } }],
    omitted: [], io: { documents: 12, metadata: 1, rawDownloads: 0, writes: 0 }, limitations: ["direct_anchor_only", "scanned_page_only", "source_geo_quality_unknown", "gcs_firestore_non_atomic"] };
}
afterEach(() => { vi.useRealTimers(); mocks.available = true; mocks.invoke.mockReset(); });
describe("route index page strict contract", () => {
  it("preserves thin candidate DTO and known zero/null without summary or coordinates", () => {
    const value = wire(); expect(validateActivityRouteIndexPageResponse(value, request, now)).toBe(value);
    const average = value.candidates[0]!.canonicalAverage;
    if (average.state === "available") { average.avgSpeedKph = 0; expect(validateActivityRouteIndexPageResponse(value, request, now)).toBe(value); average.avgSpeedKph = null; expect(validateActivityRouteIndexPageResponse(value, request, now)).toBe(value); }
  });
  it.each(["hole", "duplicate", "wrong_anchor", "wrong_sport", "old_version", "colon_revision", "nan", "unknown_average", "reverse", "count", "io"])("rejects %s without inventing candidate values", problem => {
    const value = wire(), row = value.candidates[0]!;
    if (problem === "hole") delete value.candidates[0];
    if (problem === "duplicate") { value.candidates.push(row); value.sourceValidatedCount = value.pageScannedCount = value.scannedCount = value.queryFetchedCount = 2; }
    if (problem === "wrong_anchor") value.anchorActivityId = "other";
    if (problem === "wrong_sport" && row.canonicalAverage.state === "available") row.canonicalAverage.discipline = "bike";
    if (problem === "old_version") Object.assign(row.canonicalAverage, { version: 34 });
    if (problem === "colon_revision") Object.assign(row.canonicalAverage, { metricsRevision: "100:1" });
    if (problem === "nan") Object.assign(row.canonicalAverage, { avgSpeedKph: NaN });
    if (problem === "unknown_average") Object.assign(row.canonicalAverage, { distanceKm: 5 });
    if (problem === "reverse") row.match.direction = "reverse";
    if (problem === "count") value.sourceValidatedCount = 0;
    if (problem === "io") Object.assign(value.io, { rawDownloads: 1 });
    expect(() => validateActivityRouteIndexPageResponse(value, request, now)).toThrow("invalid_route_index_page");
  });
  it("accepts changing cursor digest and rejects backwards latitude/id, stale snapshots and cap overflow", () => {
    const value = wire(), cursor = { readTime: value.readTime, anchorPrivateSourceRevision: "b".repeat(64), policyVersion: "observed-route-index-v1" as const,
      queryPolicyVersion: "start-latitude-band-v1" as const, after: { startLatitude: 37, activityId: "A" }, scannedCount: 1, requestBinding: "c".repeat(64) };
    value.scannedCount = 2; value.exhausted = false; value.nextCursor = { ...cursor, scannedCount: 2, after: { startLatitude: 37, activityId: "B" }, requestBinding: "d".repeat(64) };
    const nextRequest = { ...request, cursor };
    expect(validateActivityRouteIndexPageResponse(value, nextRequest, now)).toBe(value);
    value.nextCursor.after.activityId = "A"; expect(() => validateActivityRouteIndexPageResponse(value, nextRequest, now)).toThrow();
    expect(() => validateActivityRouteIndexPageResponse(value, nextRequest, now + 1800000)).toThrow("route_index_expired");
    expect(validActivityRouteIndexPageRequest({ ...request, cursor: { ...cursor, scannedCount: 5000 } }, now)).toBe(false);
    expect(routeIndexPositionAfter({ startLatitude: 37, activityId: "a" }, { startLatitude: 37, activityId: "Z" })).toBe(true);
    expect(routeIndexPositionAfter({ startLatitude: 36, activityId: "z" }, cursor.after)).toBe(false);
  });
  it("does not equate an empty page with exhausted scope and permits unconsumed budget omission", () => {
    const value = wire(); value.state = "budget_partial"; value.reason = "validation_budget_exceeded"; value.candidates = []; value.sourceValidatedCount = 0;
    value.omitted = [{ activityId: "blocked", state: "validation_budget_exceeded" }]; value.exhausted = false;
    expect(validateActivityRouteIndexPageResponse(value, request, now)).toBe(value);
    value.state = "no_forward_candidates_in_scanned_page"; value.reason = null;
    expect(() => validateActivityRouteIndexPageResponse(value, request, now)).toThrow();
  });
  it.each([1000, 999999999])("accepts Admin floor-millisecond expiry for nanos %i while keeping full-precision TTL", nanos => {
    const value = wire(); value.readTime.nanoseconds = nanos;
    value.expiresAt = now + Math.floor(nanos / 1e6) + 1800000;
    const fullClock = now + nanos / 1e6;
    expect(validateActivityRouteIndexPageResponse(value, request, fullClock)).toBe(value);
    value.expiresAt++; expect(() => validateActivityRouteIndexPageResponse(value, request, fullClock)).toThrow("invalid_route_index_page");
    value.expiresAt--; expect(() => validateActivityRouteIndexPageResponse(value, request, fullClock - 1)).toThrow("invalid_route_index_page");
    expect(validateActivityRouteIndexPageResponse(value, request, fullClock + 1800000 - 1)).toBe(value);
    expect(() => validateActivityRouteIndexPageResponse(value, request, fullClock + 1800000)).toThrow("route_index_expired");
  });
  it.each([
    ["inputCoverage", ["partial_terminal"]], ["inputCoverage", { toString: () => "partial_terminal" }],
    ["sourceLayer", ["raw_parts"]], ["sourceLayer", { toString: () => "raw_parts" }],
    ["discipline", ["run"]], ["metricsRevision", "A".repeat(64)], ["metricsRevision", ["a".repeat(64)]],
  ])("rejects coercible or malformed available-average %s", (field, invalidValue) => {
    const value = wire(); Object.assign(value.candidates[0]!.canonicalAverage, { [field as string]: invalidValue });
    expect(() => validateActivityRouteIndexPageResponse(value, request, now)).toThrow("invalid_route_index_page");
  });
  it.each([{ reason: ["missing_metrics"] }, { reason: { toString: () => "missing_metrics" } }])("rejects coercible unavailable reason %j", ({ reason }) => {
    const value = wire(); Object.assign(value.candidates[0]!, { canonicalAverage: { state: "unavailable", reason, metricsRevision: null } });
    expect(() => validateActivityRouteIndexPageResponse(value, request, now)).toThrow("invalid_route_index_page");
  });
  it("calls only the explicit authenticated mode after AppCheck and checks account again", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const app = { options: { projectId: "miranae-orider-g1" } }, auth = { app, currentUser: { uid: "owner", isAnonymous: false } }, ensure = vi.fn().mockResolvedValue(undefined);
    const services = { auth, functions: { region: "asia-northeast3", app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: ensure } as unknown as FirebaseServices;
    mocks.invoke.mockResolvedValue({ data: wire() });
    await loadActivityRouteIndexPage(services, "owner", request); expect(ensure).toHaveBeenCalledOnce(); expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(request);
    ensure.mockImplementation(async () => { auth.currentUser.uid = "other"; });
    await expect(loadActivityRouteIndexPage(services, "owner", request)).rejects.toThrow("account_changed"); expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});

describe("current-version synthetic contract derived from archived compiled reader wire", () => {
  it.each(compiledWire.pages)("accepts $case/$phase and preserves counts, canonical gaps and source metadata", ({ request: compiledRequest, response }) => {
    const request = compiledRequest as ActivityRouteIndexPageRequest;
    const fullClock = response.readTime.seconds * 1000 + response.readTime.nanoseconds / 1e6;
    expect(validateActivityRouteIndexPageResponse(response, request, fullClock)).toBe(response);
    expect(response.io.rawDownloads).toBe(0); expect(response.io.writes).toBe(0);
    expect(response.candidates.length).toBeLessThanOrEqual(response.sourceValidatedCount);
  });
  it("resumes each blocked record without requiring a constant cursor binding", () => {
    for (let index = 0; index < 6; index += 2) {
      const first = compiledWire.pages[index]!, next = compiledWire.pages[index + 1]!;
      const cursor = first.response.nextCursor;
      expect(cursor).not.toBeNull();
      expect(next.request).toHaveProperty("cursor", cursor);
      expect(next.response.scannedCount).toBe(first.response.scannedCount + next.response.pageScannedCount);
      const blocked = first.response.omitted.find(row => row.state === "validation_budget_exceeded");
      expect(next.response.candidates.some(row => row.activityId === blocked?.activityId)).toBe(true);
      expect(next.response.nextCursor?.requestBinding).not.toBe(cursor?.requestBinding);
    }
  });
  it("keeps actual stored partial-terminal inline analysis distinct from unavailable averages", () => {
    const rows = compiledWire.pages.flatMap(page => page.response.candidates);
    expect(rows.some(row => row.canonicalAverage.state === "available" && row.canonicalAverage.inputCoverage === "partial_terminal" && row.canonicalAverage.sourceLayer === "inline_streams")).toBe(true);
    expect(rows.some(row => row.canonicalAverage.state === "unavailable")).toBe(true);
    expect(compiledWire.provenance.ownerRuntimeVerified).toBe(false);
    expect(compiledWire.provenance.actualRawCoverageVerified).toBe(false);
  });
  it.each(["backwards", "snapshot", "counts", "canonical_coercion", "sparse", "scope", "binding"])("rejects current synthetic wire tampering: %s", problem => {
    const fixture = problem === "canonical_coercion" ? compiledWire.pages[0]! : compiledWire.pages[1]!;
    const value = structuredClone(fixture.response), request = structuredClone(fixture.request) as ActivityRouteIndexPageRequest;
    if (problem === "backwards" && value.nextCursor && request.cursor) value.nextCursor.after = { ...request.cursor.after };
    if (problem === "snapshot") value.readTime.nanoseconds += 1000;
    if (problem === "counts") value.scannedCount++;
    if (problem === "canonical_coercion") {
      expect(validateActivityRouteIndexPageResponse(value, request, value.readTime.seconds * 1000 + 1000)).toBe(value);
      const row = value.candidates[0]!;
      expect(row.activityId).toBe("ride00"); expect(row.canonicalAverage.state).toBe("available");
      Object.assign(row.canonicalAverage, { inputCoverage: ["partial_terminal"] });
    }
    if (problem === "sparse") delete value.candidates[0];
    if (problem === "scope") Object.assign(value.searchScope, { kind: "all_history" });
    if (problem === "binding" && value.nextCursor) value.nextCursor.requestBinding = "invalid";
    expect(() => validateActivityRouteIndexPageResponse(value, request, value.readTime.seconds * 1000 + 1000)).toThrow("invalid_route_index_page");
  });
});

 it.each(["appcheck", "response"])("rejects same-UID SDK replacement at %s", async phase => {
  const app = { options: { projectId: "miranae-orider-g1" } }, auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
  const ensure = vi.fn().mockResolvedValue(undefined);
  const sdk = { auth, functions: { region: "asia-northeast3", app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: ensure } as unknown as FirebaseServices;
  if (phase === "appcheck") ensure.mockImplementation(async () => { auth.currentUser = { ...auth.currentUser }; });
  else mocks.invoke.mockImplementation(async () => { auth.currentUser = { ...auth.currentUser }; return { data: {} }; });
  await expect(loadActivityRouteIndexPage(sdk, "owner", request)).rejects.toThrow("account_changed");
  expect(mocks.invoke).toHaveBeenCalledTimes(phase === "appcheck" ? 0 : 1);
 });

beforeEach(() => resetRuntimeConfigForTests({ appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1", firebaseFunctionsRegion: "asia-northeast3", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" }));

it("does not relabel archived index metrics as current canonical output", () => {
 const archived = archivedCompiledWire.pages.find(page => page.response.candidates.some(row => row.canonicalAverage.state === "available"))!;
 expect(() => validateActivityRouteIndexPageResponse(archived.response, archived.request as ActivityRouteIndexPageRequest,
   archived.response.readTime.seconds * 1000 + 1000)).toThrow("invalid_route_index_page");
});
