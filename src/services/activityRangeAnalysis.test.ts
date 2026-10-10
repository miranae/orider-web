import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRangeAnalysisResponse } from "@shared/types/activity-range-analysis";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityRangeAnalysis, validateRangeResponse, validRangeRequest } from "./activityRangeAnalysis";
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
const revision = "a".repeat(64);
const request = { activityId: "ride_a", startOffsetSec: 10, endOffsetSec: 20, expectedInputRevision: revision };
function response(): ActivityRangeAnalysisResponse {
  return { state: "available", activityId: request.activityId, selection: { startOffsetSec: 10, endOffsetSec: 20 },
    inputRevision: revision, computedAt: 1, algorithmVersion: "activity-range-v1", sourceLayer: "raw_parts", inputCoverage: "complete", reason: null,
    metrics: { elapsedSec: 10, movingSec: null, pauseSec: null, distanceM: null, avgSpeedKph: null, speedBasis: null, paceSecPerKm: null,
      averagePowerW: null, normalizedPowerW: null, averageHr: null, maxHr: null, averageCadence: null, hrZoneSec: null, powerZoneSec: null,
      averageBasis: "measured_elapsed", channels: { power: { measuredSec: 0, fraction: 0, reason: "missing" },
        heartrate: { measuredSec: 0, fraction: 0, reason: "missing" }, cadence: { measuredSec: 0, fraction: 0, reason: "missing" }, speed: { measuredSec: 0, fraction: 0, reason: "missing" } },
      diagnostics: { clippedBoundary: true, gaps: true, distanceReason: "missing", zonesReason: "recorded_context_unavailable" },
      powerSource: null, isVirtualPower: false, context: { mode: "unavailable", ftp: null, maxHr: null } } };
}
beforeEach(() => { mocks.call.mockReset().mockResolvedValue({ data: response() }); mocks.callable.mockReset().mockReturnValue(mocks.call); });
describe("activity range callable boundary", () => {
  it("reads the owner-only canonical callable and preserves absent channels, clipping and gaps", async () => {
    const services = { auth: { currentUser: { uid: "owner" } }, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices;
    const result = await loadActivityRangeAnalysis(services, "owner", request);
    expect(mocks.callable).toHaveBeenCalledWith(services.functions, "getActivityRangeAnalysis");
    expect(mocks.call).toHaveBeenCalledWith(request);
    expect(result.metrics?.averagePowerW).toBeNull();
    expect(result.metrics?.diagnostics).toMatchObject({ clippedBoundary: true, gaps: true });
  });
  it("accepts a virtual activity slice with missing power and available non-power channels", () => {
    const value = response();
    value.metrics!.isVirtualPower = true;
    value.metrics!.averageHr = 140;
    value.metrics!.avgSpeedKph = 20;
    value.metrics!.channels.heartrate = { measuredSec: 10, fraction: 1, reason: null };
    value.metrics!.channels.speed = { measuredSec: 10, fraction: 1, reason: null };
    expect(validateRangeResponse(value, request).metrics).toMatchObject({ isVirtualPower: true, powerSource: null, averagePowerW: null, averageHr: 140 });
  });
  it("rejects account changes before AppCheck, between AppCheck and call, or before response", async () => {
    const auth = { currentUser: { uid: "other" } };
    const check = vi.fn().mockResolvedValue(undefined);
    const services = { auth, functions: {}, ensureAppCheckReady: check } as unknown as FirebaseServices;
    await expect(loadActivityRangeAnalysis(services, "owner", request)).rejects.toThrow("account_changed");
    expect(check).not.toHaveBeenCalled();
    auth.currentUser.uid = "owner";
    check.mockImplementationOnce(async () => { auth.currentUser.uid = "other"; });
    await expect(loadActivityRangeAnalysis(services, "owner", request)).rejects.toThrow("account_changed");
    expect(mocks.call).not.toHaveBeenCalled();
    auth.currentUser.uid = "owner";
    mocks.call.mockImplementationOnce(async () => { auth.currentUser.uid = "other"; return { data: response() }; });
    await expect(loadActivityRangeAnalysis(services, "owner", request)).rejects.toThrow("account_changed");
  });
  it("validates finite ordered bounds, seven-day limit, IDs and opaque revision without calls", () => {
    expect(validRangeRequest(request)).toBe(true);
    for (const patch of [{ activityId: "a/b" }, { activityId: undefined }, { startOffsetSec: -1 }, { endOffsetSec: 10 },
      { endOffsetSec: Infinity }, { endOffsetSec: 604801 }, { expectedInputRevision: "computedAt:1" }]) {
      expect(validRangeRequest({ ...request, ...patch } as typeof request)).toBe(false);
    }
  });
  it("rejects mismatched activity/selection/revision and malformed metrics instead of showing available", () => {
    for (const patch of [{ activityId: "other" }, { selection: { startOffsetSec: 11, endOffsetSec: 20 } },
      { inputRevision: "b".repeat(64) }, { algorithmVersion: "other" }, { metrics: null }]) {
      expect(() => validateRangeResponse({ ...response(), ...patch } as ActivityRangeAnalysisResponse, request)).toThrow();
    }
    for (const patch of [{ elapsedSec: 12 }, { averagePowerW: NaN }, { movingSec: 11 }, { powerZoneSec: [2, NaN] },
      { channels: {} }, { powerSource: "virtual", isVirtualPower: false }]) {
      const value = response();
      expect(() => validateRangeResponse({ ...value, metrics: { ...value.metrics, ...patch } } as ActivityRangeAnalysisResponse, request)).toThrow();
    }
  });
  it.each(["pending", "unavailable", "changed_input"] as const)("strips metrics for %s even when a malformed server response includes old values", state => {
    expect(validateRangeResponse({ ...response(), state }, request).metrics).toBeNull();
  });
  it("keeps undeployed callable failures as failures and does not fabricate analysis", async () => {
    const services = { auth: { currentUser: { uid: "owner" } }, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices;
    mocks.call.mockRejectedValueOnce({ code: "functions/not-found" });
    await expect(loadActivityRangeAnalysis(services, "owner", request)).rejects.toMatchObject({ code: "functions/not-found" });
  });
});
