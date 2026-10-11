import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { manualBikeDistanceFixture, manualBikeDistanceEpoch } from "./activityBikeDistanceEvidence.fixture";
import { loadActivityBikeDistanceEvidence, validateActivityBikeDistanceEvidence } from "./activityBikeDistanceEvidence";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
const mocks = vi.hoisted(() => ({ callable: vi.fn(), call: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
const stage = { appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" };
beforeEach(() => { resetRuntimeConfigForTests(stage); mocks.call.mockReset().mockResolvedValue({ data: manualBikeDistanceFixture() }); mocks.callable.mockReset().mockReturnValue(mocks.call); });
describe("manual single-activity distance facts", () => {
  it("accepts measured12000m10km fractional anchor, empty facts and API16000m without speed computation", () => {
    const r = manualBikeDistanceFixture(); expect(validateActivityBikeDistanceEvidence(r, "ride", undefined, manualBikeDistanceEpoch)).toBe(r);
    if (r.state !== "available") throw new Error("fixture");
    r.sourceLayer = r.evidence.sourceLayer = "api_streams";
    const f = r.evidence.facts[0]!; f.exactElapsedSec = 750; f.elapsedSec = 750; f.endFraction = 10000 / 16000; f.endTimeSec = f.endOffsetSec = 780; r.evidence.observedEndOffsetSec = 1230;
    expect(validateActivityBikeDistanceEvidence(r, "ride")).toBe(r);
    r.evidence.facts = []; expect(validateActivityBikeDistanceEvidence(r, "ride")).toBe(r);
  });
  it.each(["activity", "revision", "layer", "origin", "duration", "N", "targets", "coverage", "quality", "meters", "rounding", "exact", "index", "fraction", "zero-window-fraction", "offset", "bounds", "order", "hole", "inherited", "null", "nonfinite"])("rejects invalid %s", fault => {
    const r = manualBikeDistanceFixture(); if (r.state !== "available") throw new Error("fixture");
    const e = r.evidence, f = e.facts[0]!;
    if (fault === "activity") e.activityId = "foreign";
    if (fault === "revision") e.distanceInputRevision = "b".repeat(64);
    if (fault === "layer") e.sourceLayer = "api_streams";
    if (fault === "origin") e.originEpochMs++;
    if (fault === "duration") e.durationSec = 31;
    if (fault === "N") e.inputPointCount = 100001;
    if (fault === "targets") e.targetsVersion = 2 as 1;
    if (fault === "coverage") e.coverage = "complete" as "unknown";
    if (fault === "quality") e.quality = "good" as "unknown";
    if (fault === "meters") f.distanceM = 9999;
    if (fault === "rounding") f.elapsedSec = 1001;
    if (fault === "exact") f.exactElapsedSec = 1;
    if (fault === "index") f.endBeforeIndex = 1;
    if (fault === "fraction") f.endFraction = 1.1;
    if (fault === "zero-window-fraction") f.endFraction = 0;
    if (fault === "offset") f.startOffsetSec++;
    if (fault === "bounds") f.endTimeSec = f.endOffsetSec = 50;
    if (fault === "order") e.facts.push({ ...f });
    if (fault === "hole") e.facts = Array(1);
    if (fault === "inherited") { delete e.facts[0]; Object.setPrototypeOf(e.facts, Object.assign(Object.create(Array.prototype), { 0: f })); }
    if (fault === "null") e.facts[0] = null as unknown as typeof f;
    if (fault === "nonfinite") f.exactElapsedSec = Infinity;
    expect(() => validateActivityBikeDistanceEvidence(r, "ride", undefined, manualBikeDistanceEpoch)).toThrow("invalid_bike_distance_evidence");
  });
  it("enforces state/reason attribution and expected revision only for available facts", () => {
    expect(() => validateActivityBikeDistanceEvidence(manualBikeDistanceFixture(), "ride", "b".repeat(64))).toThrow();
    const base = { mode: "bike_distance_evidence", activityId: "ride", distanceInputRevision: "b".repeat(64), sourceLayer: "raw_parts", evidence: null };
    for (const [state, reason] of [["pending", "incomplete_input"], ["changed_input", "changed_input"], ["unavailable", "unknown_axis"]]) expect(validateActivityBikeDistanceEvidence({ ...base, state, reason }, "ride", "a".repeat(64)).state).toBe(state);
    expect(() => validateActivityBikeDistanceEvidence({ ...base, state: "pending", reason: "changed_input" }, "ride")).toThrow();
  });
  it("uses authenticated AppCheck existing callable only on explicit service invocation", async () => {
    const app = {}, services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn() } as unknown as FirebaseServices;
    expect(mocks.call).not.toHaveBeenCalled();
    await loadActivityBikeDistanceEvidence(services, "owner", "ride", "a".repeat(64), manualBikeDistanceEpoch);
    expect(services.ensureAppCheckReady).toHaveBeenCalledOnce(); expect(mocks.callable).toHaveBeenCalledWith(services.functions, "getActivityStreams");
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith({ activityId: "ride", mode: "bike_distance_evidence", expectedDistanceInputRevision: "a".repeat(64) });
    resetRuntimeConfigForTests({ ...stage, appEnvironment: "production" });
    await expect(loadActivityBikeDistanceEvidence(services, "owner", "ride")).rejects.toThrow("bike_distance_not_supported");
    expect(mocks.call).toHaveBeenCalledOnce();
  });
});

it("accepts all13 fixed SI targets in canonical order, including80km distinct50miles", () => {
  const response = manualBikeDistanceFixture(); if (response.state !== "available") throw new Error("fixture");
  const meters = [8046.72, 10000, 16093.44, 20000, 30000, 40000, 50000, 80000, 80467.2, 90000, 100000, 160934.4, 180000];
  const keys = ["5miles", "10km", "10miles", "20km", "30km", "40km", "50km", "80km", "50miles", "90km", "100km", "100miles", "180km"] as const;
  const e = response.evidence, anchor = e.facts[0]!;
  e.durationSec = 20030; e.observedEndOffsetSec = 20030;
  e.facts = keys.map((distance, index) => { const exact = meters[index]! / 10; return { ...anchor, distance, distanceM: meters[index]!, exactElapsedSec: exact, elapsedSec: Math.round(exact), endFraction: meters[index]! / 200000, endTimeSec: 30 + exact, endOffsetSec: 30 + exact }; });
  expect(validateActivityBikeDistanceEvidence(response, "ride")).toBe(response);
  expect(e.facts[7]!.distanceM).toBe(80000); expect(e.facts[8]!.distanceM).toBe(80467.2);
  e.facts[8]!.distanceM = 80000; expect(() => validateActivityBikeDistanceEvidence(response, "ride")).toThrow();
});
it("rejects actual sparse slot deletion, RUN mode/version and responses exceeding4MiB", () => {
  const response = manualBikeDistanceFixture(); if (response.state !== "available") throw new Error("fixture");
  delete response.evidence.facts[0]; expect(() => validateActivityBikeDistanceEvidence(response, "ride")).toThrow();
  expect(() => validateActivityBikeDistanceEvidence({ ...manualBikeDistanceFixture(), mode: "run_distance_evidence" }, "ride")).toThrow();
  const id = "a".repeat(4 * 1024 * 1024);
  expect(() => validateActivityBikeDistanceEvidence({ mode: "bike_distance_evidence", activityId: id, distanceInputRevision: null, state: "unavailable", reason: "missing_distance", sourceLayer: null, evidence: null }, id)).toThrow();
});
it("stops before the callable if authentication changes during AppCheck readiness", async () => {
  const app = {}, auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
  const services = { auth, functions: { app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn(async () => { auth.currentUser.uid = "other"; }) } as unknown as FirebaseServices;
  await expect(loadActivityBikeDistanceEvidence(services, "owner", "ride")).rejects.toThrow("account_changed");
  expect(mocks.call).not.toHaveBeenCalled();
});
