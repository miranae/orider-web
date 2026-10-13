import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { manualDistanceFixture, manualDistanceEpoch } from "./activityRunDistanceEvidence.fixture";
import { loadActivityRunDistanceEvidence, validateActivityRunDistanceEvidence } from "./activityRunDistanceEvidence";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
const mocks = vi.hoisted(() => ({ callable: vi.fn(), call: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
const stage = { appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" };
beforeEach(() => { resetRuntimeConfigForTests(stage); mocks.call.mockReset().mockResolvedValue({ data: manualDistanceFixture() }); mocks.callable.mockReset().mockReturnValue(mocks.call); });
describe("manual single-activity distance facts", () => {
  it("accepts server520m400m fractional anchor, empty facts and API640m without pace computation", () => {
    const r = manualDistanceFixture(); expect(validateActivityRunDistanceEvidence(r, "ride", undefined, manualDistanceEpoch)).toBe(r);
    if (r.state !== "available") throw new Error("fixture");
    r.sourceLayer = r.evidence.sourceLayer = "api_streams";
    const f = r.evidence.facts[0]!; f.exactElapsedSec = 3.125; f.elapsedSec = 3; f.endFraction = 400 / 640; f.endTimeSec = f.endOffsetSec = 33.125; r.evidence.observedEndOffsetSec = 35;
    expect(validateActivityRunDistanceEvidence(r, "ride")).toBe(r);
    r.evidence.facts = []; expect(validateActivityRunDistanceEvidence(r, "ride")).toBe(r);
  });
  it.each(["activity", "revision", "layer", "origin", "duration", "N", "targets", "coverage", "quality", "meters", "rounding", "exact", "index", "fraction", "zero-window-fraction", "offset", "bounds", "order", "hole", "inherited", "null", "nonfinite"])("rejects invalid %s", fault => {
    const r = manualDistanceFixture(); if (r.state !== "available") throw new Error("fixture");
    const e = r.evidence, f = e.facts[0]!;
    if (fault === "activity") e.activityId = "foreign";
    if (fault === "revision") e.distanceInputRevision = "b".repeat(64);
    if (fault === "layer") e.sourceLayer = "api_streams";
    if (fault === "origin") e.originEpochMs++;
    if (fault === "duration") e.durationSec = 31;
    if (fault === "N") e.inputPointCount = 100001;
    if (fault === "targets") e.targetsVersion = 3 as 2;
    if (fault === "coverage") e.coverage = "complete" as "unknown";
    if (fault === "quality") e.quality = "good" as "unknown";
    if (fault === "meters") f.distanceM = 399;
    if (fault === "rounding") f.elapsedSec = 3;
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
    expect(() => validateActivityRunDistanceEvidence(r, "ride", undefined, manualDistanceEpoch)).toThrow("invalid_run_distance_evidence");
  });
  it("enforces state/reason attribution and expected revision only for available facts", () => {
    expect(() => validateActivityRunDistanceEvidence(manualDistanceFixture(), "ride", "b".repeat(64))).toThrow();
    const base = { mode: "run_distance_evidence", activityId: "ride", distanceInputRevision: "b".repeat(64), sourceLayer: "raw_parts", evidence: null };
    for (const [state, reason] of [["pending", "incomplete_input"], ["changed_input", "changed_input"], ["unavailable", "unknown_axis"]]) expect(validateActivityRunDistanceEvidence({ ...base, state, reason }, "ride", "a".repeat(64)).state).toBe(state);
    expect(() => validateActivityRunDistanceEvidence({ ...base, state: "pending", reason: "changed_input" }, "ride")).toThrow();
  });
  it("uses authenticated AppCheck existing callable only on explicit service invocation", async () => {
    const app = {}, services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn() } as unknown as FirebaseServices;
    expect(mocks.call).not.toHaveBeenCalled();
    await loadActivityRunDistanceEvidence(services, "owner", "ride", "a".repeat(64), manualDistanceEpoch);
    expect(services.ensureAppCheckReady).toHaveBeenCalledOnce(); expect(mocks.callable).toHaveBeenCalledWith(services.functions, "getActivityStreams");
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith({ activityId: "ride", mode: "run_distance_evidence", expectedDistanceInputRevision: "a".repeat(64) });
    resetRuntimeConfigForTests({ ...stage, appEnvironment: "production" });
    await expect(loadActivityRunDistanceEvidence(services, "owner", "ride")).rejects.toThrow("run_distance_not_supported");
    expect(mocks.call).toHaveBeenCalledOnce();
  });
});
