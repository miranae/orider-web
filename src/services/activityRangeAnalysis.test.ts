import { deriveHrZoneBoundaries } from "@shared/training/hrZoneTable";
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
  it("accepts legacy threshold context and exact optional historical LTHR boundaries", () => {
    expect(validateRangeResponse(response(), request)).toEqual(response());
    const value = response();
    value.metrics!.context = { mode: "recorded", ftp: null, maxHr: 190, lthr: 170,
      hrZoneBoundaries: deriveHrZoneBoundaries({ lthr: 170, maxHr: 190, sport: "run" }) };
    expect(validateRangeResponse(value, request).metrics!.context.hrZoneBoundaries?.reference).toBe("lthr");
  });
  it("rejects inconsistent or malformed historical boundaries without recomputing a fallback", () => {
    const value = response();
    value.metrics!.context = { mode: "recorded", ftp: null, maxHr: 190, lthr: 170,
      hrZoneBoundaries: deriveHrZoneBoundaries({ lthr: 170, maxHr: 190, sport: "run" }) };
    value.metrics!.context.hrZoneBoundaries!.referenceBpm = 180;
    expect(() => validateRangeResponse(value, request)).toThrow("invalid_range_response");
    value.metrics!.context.hrZoneBoundaries = null;
    value.metrics!.context.lthr = Number.NaN;
    expect(() => validateRangeResponse(value, request)).toThrow("invalid_range_response");
  });

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

function powerInput(): NonNullable<ActivityRangeAnalysisResponse["powerWindowInput"]> {
  return { state: "available", reason: null, inputRevision: revision, algorithmVersion: "sample-time-weighted-v1", scope: "selected_range", timingBasis: "elapsed", rangeStartElapsedSec: 10, rangeEndElapsedSec: 20, provenance: "orider_native", startsSec: [10, 15], durationsSec: [5, 5], watts: [0, 200], segmentStarts: [true, false], longestContinuousSeconds: 10 };
}
function powerResponse() { const value = response(); value.metrics!.powerSource = "measured"; value.powerWindowInput = powerInput(); return value; }
describe("optional selected-range normalized power input", () => {
  it("accepts legacy absence, measured0W and unavailable contracts while preserving one callable", async () => {
    expect(validateRangeResponse(response(), request)).toEqual(response());
    expect(() => validateRangeResponse(powerResponse(), request)).toThrow("invalid_range_response");
    expect(validateRangeResponse(powerResponse(), { ...request, includePowerWindowInput: true }).powerWindowInput).toEqual(powerInput());
    const value = response(); value.powerWindowInput = { inputRevision: revision, algorithmVersion: "sample-time-weighted-v1", scope: "selected_range", timingBasis: "elapsed", rangeStartElapsedSec: 10, rangeEndElapsedSec: 20, state: "unavailable", reason: "unknown_provenance" };
    expect(validateRangeResponse(value, { ...request, includePowerWindowInput: true }).powerWindowInput).toEqual(value.powerWindowInput);
    mocks.call.mockResolvedValueOnce({ data: powerResponse() });
    const services = { auth: { currentUser: { uid: "owner" } }, ensureAppCheckReady: vi.fn(), functions: {} } as unknown as FirebaseServices;
    await loadActivityRangeAnalysis(services, "owner", { ...request, includePowerWindowInput: true });
    expect(mocks.call).toHaveBeenCalledOnce(); expect(mocks.call).toHaveBeenCalledWith({ ...request, includePowerWindowInput: true });
  });
  it.each(["revision", "selection", "provenance", "virtual", "axis", "arrays", "gap", "overlap", "longest", "negative", "cap", "reason"])("rejects malformed %s before rendering or Worker dispatch", kind => {
    const value = powerResponse(); const input = value.powerWindowInput!;
    if (kind === "revision") input.inputRevision = "b".repeat(64);
    if (kind === "selection") input.rangeStartElapsedSec = 0;
    if (input.state === "available") {
      if (kind === "provenance") Object.assign(input, { provenance: "health" });
      if (kind === "virtual") { value.metrics!.powerSource = "virtual"; value.metrics!.isVirtualPower = true; }
      if (kind === "axis") input.startsSec[0] = Number.NaN;
      if (kind === "arrays") Object.assign(input, { watts: {} });
      if (kind === "gap") input.startsSec[1] = 16;
      if (kind === "overlap") input.startsSec[1] = 14;
      if (kind === "longest") input.longestContinuousSeconds = 20;
      if (kind === "negative") input.watts[0] = -1;
      if (kind === "cap") input.watts = Array(100001).fill(200);
      if (kind === "reason") Object.assign(input, { reason: "unknown" });
    }
    expect(() => validateRangeResponse(value, { ...request, includePowerWindowInput: true })).toThrow("invalid_range_response");
  });
});

// Exact compiled synthetic reader response; wire SHA256 ad3cbde2c17f7c150f482f42e830027858714192859e933851e94f9bb7491cde. No operational data.
const compiledElevationWire: ActivityRangeAnalysisResponse = {
  "state": "available",
  "activityId": "ride",
  "selection": {
    "startOffsetSec": 5,
    "endOffsetSec": 35
  },
  "inputRevision": "c07775614db1c7259fb23e142a2790d27cbec7283d319f2e116dcc5d261be418",
  "computedAt": 1791731910501,
  "algorithmVersion": "activity-range-v1",
  "sourceLayer": "raw_parts",
  "inputCoverage": "complete",
  "reason": null,
  "metrics": {
    "elapsedSec": 30,
    "movingSec": null,
    "pauseSec": null,
    "distanceM": null,
    "avgSpeedKph": null,
    "speedBasis": null,
    "paceSecPerKm": null,
    "averagePowerW": 100,
    "normalizedPowerW": 100,
    "averageHr": null,
    "maxHr": null,
    "averageCadence": null,
    "hrZoneSec": null,
    "powerZoneSec": null,
    "averageBasis": "measured_elapsed",
    "channels": {
      "power": {
        "measuredSec": 30,
        "fraction": 1,
        "reason": null
      },
      "heartrate": {
        "measuredSec": 0,
        "fraction": 0,
        "reason": "missing"
      },
      "cadence": {
        "measuredSec": 0,
        "fraction": 0,
        "reason": "missing"
      },
      "speed": {
        "measuredSec": 0,
        "fraction": 0,
        "reason": "missing"
      }
    },
    "diagnostics": {
      "clippedBoundary": false,
      "gaps": false,
      "distanceReason": "unobserved_boundary_or_gap",
      "zonesReason": "heart_rate:recorded_hr_threshold_unavailable;power:recorded_ftp_unavailable"
    },
    "powerSource": "measured",
    "isVirtualPower": false,
    "context": {
      "mode": "unavailable",
      "ftp": null,
      "maxHr": null,
      "lthr": null,
      "hrZoneBoundaries": null
    }
  },
  "elevation": {
    "scope": "selected_observed_range",
    "quality": "unknown",
    "timingBasis": "stored_explicit_activity_elapsed",
    "originalClockVerified": false,
    "declaredActivitySource": "strava",
    "inputRevision": "c07775614db1c7259fb23e142a2790d27cbec7283d319f2e116dcc5d261be418",
    "requestedSelection": {
      "startOffsetSec": 5,
      "endOffsetSec": 35
    },
    "state": "available",
    "reason": null,
    "sourceBasis": "stored_epoch_parts",
    "observedSelection": {
      "startOffsetSec": 10,
      "endOffsetSec": 30
    },
    "boundaryCoverage": "inside_samples",
    "netElevationChangeM": 4,
    "distanceM": 200,
    "netMeanGradePct": 2
  }
};

const elevationRequest = { activityId: "ride", startOffsetSec: 5, endOffsetSec: 35, includeElevation: true as const };
describe("optional stored elevation evidence", () => {
  it("accepts exact compiled reader wire and preserves measured power100 and inside sample bounds", () => {
    const result = validateRangeResponse(compiledElevationWire, elevationRequest);
    expect(result).toBe(compiledElevationWire);
    expect(result.metrics?.averagePowerW).toBe(100);
    expect(result.elevation).toMatchObject({ state: "available", netElevationChangeM: 4, distanceM: 200, netMeanGradePct: 2, originalClockVerified: false, observedSelection: { startOffsetSec: 10, endOffsetSec: 30 } });
  });
  it("preserves legacy response identity and true-only default request bytes with one opted-in call", async () => {
    const old = response(); expect(validateRangeResponse(old, request)).toBe(old);
    expect(validRangeRequest({ ...request, includeElevation: true })).toBe(true);
    expect(validRangeRequest({ ...request, includeElevation: false } as unknown as typeof request)).toBe(false);
    expect(validateRangeResponse(compiledElevationWire, { ...elevationRequest, includeElevation: undefined }).elevation).toBeUndefined();
    mocks.call.mockResolvedValueOnce({ data: compiledElevationWire });
    const services = { auth: { currentUser: { uid: "owner" } }, functions: {}, ensureAppCheckReady: vi.fn() } as unknown as FirebaseServices;
    await loadActivityRangeAnalysis(services, "owner", elevationRequest);
    expect(mocks.call).toHaveBeenCalledOnce(); expect(mocks.call).toHaveBeenCalledWith(elevationRequest);
  });
  it.each([
    { inputRevision: "b".repeat(64) }, { requestedSelection: { startOffsetSec: 6, endOffsetSec: 35 } },
    { observedSelection: { startOffsetSec: 0, endOffsetSec: 30 } }, { observedSelection: { startOffsetSec: 10, endOffsetSec: 36 } },
    { observedSelection: { startOffsetSec: 30, endOffsetSec: 10 } }, { boundaryCoverage: "exact" },
    { netElevationChangeM: NaN }, { distanceM: -1 }, { distanceM: Infinity }, { netMeanGradePct: null }, { netMeanGradePct: 3 },
    { sourceBasis: "raw_parts" }, { originalClockVerified: true }, { timingBasis: "original_activity_elapsed" },
    { declaredActivitySource: new String("strava") }, { quality: "reliable" }, { reason: "input_unavailable" }, { extra: 1 },
  ])("isolates malformed elevation without changing old metrics: %#", patch => {
    const original = structuredClone(compiledElevationWire);
    Object.assign(original.elevation!, patch);
    const result = validateRangeResponse(original, elevationRequest);
    expect(result.elevation).toBeUndefined(); expect(result.metrics).toBe(original.metrics);
    expect(original.elevation).toBeDefined();
  });
  it.each([-4, 0, 4])("preserves signed net change%s and exact arithmetic", netElevationChangeM => {
    const value = structuredClone(compiledElevationWire);
    Object.assign(value.elevation!, { netElevationChangeM, netMeanGradePct: netElevationChangeM / 200 * 100 });
    expect(validateRangeResponse(value, elevationRequest).elevation).toEqual(value.elevation);
  });
  it("preserves zero counter distance with null grade, rejects fabricated zero grade and overflow", () => {
    const value = structuredClone(compiledElevationWire);
    Object.assign(value.elevation!, { distanceM: 0, netMeanGradePct: null });
    expect(validateRangeResponse(value, elevationRequest).elevation).toEqual(value.elevation);
    Object.assign(value.elevation!, { netMeanGradePct: 0 });
    expect(validateRangeResponse(value, elevationRequest).elevation).toBeUndefined();
    Object.assign(value.elevation!, { distanceM: Number.MIN_VALUE, netElevationChangeM: 1e308, netMeanGradePct: 1e308 });
    expect(validateRangeResponse(value, elevationRequest).elevation).toBeUndefined();
  });
  it("keeps available elevation when sensor analysis unavailable, but never accepts pending or changed values", () => {
    const value = { ...compiledElevationWire, state: "unavailable" as const, metrics: null };
    expect(validateRangeResponse(value, elevationRequest).elevation).toEqual(compiledElevationWire.elevation);
    for (const state of ["pending", "changed_input"] as const) expect(validateRangeResponse({ ...value, state }, elevationRequest).elevation).toBeUndefined();
  });
  it("accepts bounded unavailable evidence and treats absent evidence as unknown without failing sensors", () => {
    const base = compiledElevationWire.elevation!;
    const elevation = { scope: base.scope, quality: base.quality, timingBasis: base.timingBasis, originalClockVerified: base.originalClockVerified, declaredActivitySource: null, inputRevision: base.inputRevision, requestedSelection: base.requestedSelection, state: "unavailable" as const, reason: "missing_samples" as const };
    expect(validateRangeResponse({ ...compiledElevationWire, elevation }, elevationRequest).elevation).toEqual(elevation);
    expect(validateRangeResponse(response(), { ...request, includeElevation: true }).metrics).toBeDefined();
  });
});

it.each([{ sourceLayer: "api_streams" as const }, { inputCoverage: "partial" as const }, { inputCoverage: "unknown" as const }])("isolates elevation provenance contradictory to overall stored parts: %#", patch => {
  const value = { ...compiledElevationWire, ...patch };
  const result = validateRangeResponse(value, elevationRequest);
  expect(result.elevation).toBeUndefined(); expect(result.metrics).toBe(value.metrics);
});
