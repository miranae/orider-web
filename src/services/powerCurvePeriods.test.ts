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
