import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import { loadPowerCurvePeriods, utcPowerCurvePeriod, validatePowerCurvePeriodsResponse } from "./powerCurvePeriods";
const mocks = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.call) }));
const request = { unit: "W" as const, periods: [{ fromInclusive: 1000, toExclusive: 10000 }] };
export const response = (): PowerCurvePeriodsResponse => ({ version: 1, discipline: "bike", unit: "W", asOf: 20000, inputDigest: "a".repeat(64), periods: [{ ...request.periods[0]!, status: "complete", points: [{ durationSeconds: 300, watts: 250.3, sourceActivityId: "ride", startTime: 2000, source: "strava_api", cohortEligible: false, metricsRevision: "123:456" }], coverage: { scannedActivityCount: 1, candidateActivityCount: 1, candidateCountKnown: true, includedActivityCount: 1, pendingActivityCount: 0, missingActivityCount: 0, incompleteActivityCount: 0, ineligibleActivityCount: 0, skippedActivityCount: 0, truncated: false, scanLimit: 1000 } }] });
beforeEach(() => mocks.call.mockReset().mockResolvedValue({ data: response() }));
describe("powerCurvePeriods contract", () => {
  it("uses UTC boundaries and inclusively selected end date, clamping today to now", () => {
    const now = Date.UTC(2026, 9, 10, 12);
    expect(utcPowerCurvePeriod("2026-03-08", "2026-03-09", now)).toEqual({ fromInclusive: Date.UTC(2026, 2, 8), toExclusive: Date.UTC(2026, 2, 10) });
    expect(utcPowerCurvePeriod("2026-10-01", "2026-10-10", now)?.toExclusive).toBe(now);
    for (const [from, through] of [["2026-02-30", "2026-03-01"], ["2026-10-11", "2026-10-11"], ["2026-10-02", "2026-10-01"]]) expect(utcPowerCurvePeriod(from!, through!, now)).toBeNull();
  });
  it.each(["period", "unit", "source", "revision", "watts", "coverage", "status", "constructor", "toString"])("rejects incorrect %s without converting to fake ready results", field => {
    const data = response();
    if (field === "period") data.periods[0]!.toExclusive++;
    if (field === "unit") (data as any).unit = "W/kg";
    if (field === "source") data.periods[0]!.points[0]!.source = "unknown";
    if (field === "revision") data.periods[0]!.points[0]!.metricsRevision = "missing";
    if (field === "watts") data.periods[0]!.points[0]!.watts = 0;
    if (field === "coverage") data.periods[0]!.coverage.pendingActivityCount = 1;
    if (field === "status") data.periods[0]!.status = "partial";
    if (field === "constructor" || field === "toString") (data.periods[0]!.points[0] as any).durationSeconds = field;
    expect(() => validatePowerCurvePeriodsResponse(data, request)).toThrow();
  });
  it.each([1e100, Number.MAX_SAFE_INTEGER, NaN, Infinity, -1, 20000.5, 9999])("rejects nonrepresentable or inconsistent snapshot time %s before rendering", asOf => {
    const data = response(); data.asOf = asOf;
    expect(() => validatePowerCurvePeriodsResponse(data, request)).toThrow("invalid_power_curve_periods_response");
  });
  it("accepts an integer snapshot time at the exact requested upper bound", () => {
    const data = response(); data.asOf = request.periods[0]!.toExclusive;
    expect(validatePowerCurvePeriodsResponse(data, request)).toBe(data);
    expect(() => new Date(data.asOf).toISOString()).not.toThrow();
  });
  it("enforces current owner and App Check before calling, and catches an account switch during request", async () => {
    const auth = { currentUser: { uid: "owner", isAnonymous: false } };
    const services = { auth, functions: {}, ensureAppCheckReady: vi.fn() } as any;
    await loadPowerCurvePeriods(services, "owner", request);
    expect(services.ensureAppCheckReady).toHaveBeenCalledTimes(1); expect(mocks.call).toHaveBeenCalledWith(request);
    auth.currentUser.uid = "other";
    await expect(loadPowerCurvePeriods(services, "owner", request)).rejects.toThrow("account_changed");
    auth.currentUser.uid = "owner";
    mocks.call.mockImplementationOnce(async () => { auth.currentUser.uid = "other"; return { data: response() }; });
    await expect(loadPowerCurvePeriods(services, "owner", request)).rejects.toThrow("account_changed");
  });
});

describe("optional dense power observations", () => {
  const dense = () => ({ algorithmVersion: "power-duration-grid-v1" as const, gridVersion: 1 as const, timingBasis: "sample_owned_elapsed" as const, scope: "observed_power_candidates" as const,
    fromInclusive: 1000, toExclusive: 10000, partial: false, scanTruncated: false, inputCandidateCount: 1,
    counts: { available: 1, missing: 0, pending: 0, incomplete: 0, malformed: 0, unavailable: 0 },
    unavailableReasonCounts: { incomplete_input: 0, virtual_power: 0, unknown_provenance: 0, unaligned_elapsed_axis: 0, missing_power: 0, input_limit: 0 },
    points: [{ durationSeconds: 300, maxAveragePowerW: 0, sourceActivityId: "ride", startTime: 2000, parentRevision: "opaque-revision", provenance: "direct_file" as const, observedActivityCount: 1 }] });
  it("accepts optional absence unchanged and zero measured watts without changing old points", () => {
    const old = response(), data = response(); data.periods[0]!.powerDurationObservations = dense();
    expect(validatePowerCurvePeriodsResponse(old, request)).toBe(old);
    expect(validatePowerCurvePeriodsResponse(data, request)).toBe(data);
    expect(data.periods[0]!.points).toEqual(old.periods[0]!.points);
  });
  it("keeps dense partial independent of old11 status", () => {
    const data = response(), value = dense();
    value.counts.available = 0; value.counts.missing = 1; value.points = []; value.partial = true;
    data.periods[0]!.powerDurationObservations = value;
    expect(validatePowerCurvePeriodsResponse(data, request)).toBe(data);
    expect(data.periods[0]!.status).toBe("complete");
  });
  it.each(["null", "version", "basis", "scope", "bounds", "counts", "n", "nan", "negative", "duration", "duplicate", "hole", "source", "revision", "date", "partial", "truncated", "unknown"])("fails closed for malformed optional %s", field => {
    const data = response(), value: any = dense(); data.periods[0]!.powerDurationObservations = value;
    if (field === "null") data.periods[0]!.powerDurationObservations = null as any;
    if (field === "version") value.gridVersion = 2;
    if (field === "basis") value.timingBasis = "moving";
    if (field === "scope") value.scope = "all";
    if (field === "bounds") value.toExclusive++;
    if (field === "counts") value.counts.available = 2;
    if (field === "n") value.points[0].observedActivityCount = 2;
    if (field === "nan") value.points[0].maxAveragePowerW = NaN;
    if (field === "negative") value.points[0].maxAveragePowerW = -1;
    if (field === "duration") value.points[0].durationSeconds = 12345;
    if (field === "duplicate") value.points.push(value.points[0]);
    if (field === "hole") delete value.points[0];
    if (field === "source") value.points[0].provenance = "virtual";
    if (field === "revision") value.points[0].parentRevision = "";
    if (field === "date") value.points[0].startTime = 10000;
    if (field === "partial") value.partial = true;
    if (field === "truncated") value.scanTruncated = true;
    if (field === "unknown") value.growth = 12;
    expect(() => validatePowerCurvePeriodsResponse(data, request)).toThrow("invalid_power_curve_periods_response");
  });
});
