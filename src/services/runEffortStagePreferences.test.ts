import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEffortStageMutationRequest } from "@shared/types/run-effort-stage-preferences";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { runEffortStageFailure, setRunEffortStagePreference, validRunEffortStageMutation, validRunEffortStageOverlay, validateRunEffortStageMutationResponse } from "./runEffortStagePreferences";
import { stageRunEffortFixture } from "./trainingAnalysisPeriods.fixture";
const mocks = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.call }));
const request: RunEffortStageMutationRequest = { activityId: "a", target: "5km", excluded: true, expectedPreferenceRevision: 0, expectedMetricsRevision: "100:1", expectedActivityIncarnation: "90:1", idempotencyKey: "fixed-request-key-1234" };
const response = () => ({ version: 1 as const, scope: "stage_readtime_overlay" as const, outcome: "stored_pending_analysis_refresh" as const, activityId: "a", activityIncarnation: "90:1", preferenceRevision: 1, target: "5km" as const, excluded: true });
beforeEach(() => { resetRuntimeConfigForTests({ appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" }); mocks.call.mockReset().mockResolvedValue({ data: response() }); });
describe("explicit distance preference write", () => {
  it("requires exact allowlisted target and CAS/idempotency inputs", () => {
    expect(validRunEffortStageMutation(request)).toBe(true);
    for (const patch of [{ target: "3km" }, { excluded: 1 }, { expectedPreferenceRevision: -1 }, { expectedMetricsRevision: "missing" }, { expectedActivityIncarnation: "missing" }, { idempotencyKey: "short" }, { extra: true }]) expect(validRunEffortStageMutation({ ...request, ...patch } as any)).toBe(false);
    const result = response(); expect(validateRunEffortStageMutationResponse(result, request)).toBe(result);
    expect(() => validateRunEffortStageMutationResponse({ ...result, scope: "global" } as any, request)).toThrow();
    expect(() => validateRunEffortStageMutationResponse({ ...result, preferenceRevision: 2 }, request)).toThrow();
  });
  it("enforces owner, nonanonymous identity, same SDK app and App Check around the call", async () => {
    const app = {}, auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
    const services = { auth, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: vi.fn() } as any;
    await setRunEffortStagePreference(services, "owner", request); expect(mocks.call).toHaveBeenCalledWith(request);
    auth.currentUser.isAnonymous = true; await expect(setRunEffortStagePreference(services, "owner", request)).rejects.toThrow("account_changed");
    auth.currentUser.isAnonymous = false; auth.currentUser.uid = "other"; await expect(setRunEffortStagePreference(services, "owner", request)).rejects.toThrow("account_changed");
    auth.currentUser.uid = "owner"; services.ensureAppCheckReady.mockImplementationOnce(async () => { auth.currentUser.uid = "other"; });
    await expect(setRunEffortStagePreference(services, "owner", request)).rejects.toThrow("account_changed");
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
  it.each(["source_unverified_after_stage_write", "source_changed_after_stage_write"])("keeps durable pending outcome for %s", reason => {
    expect(runEffortStageFailure({ code: "functions/failed-precondition", details: { reason, storedOutcome: "stored_pending_analysis_refresh" } })).toEqual({ kind: reason.includes("unverified") ? "source_unverified" : "source_changed", storedOutcome: "stored_pending_analysis_refresh" });
    expect(runEffortStageFailure({ code: "functions/deadline-exceeded" })).toEqual({ kind: "unknown", storedOutcome: null });
    expect(runEffortStageFailure({ code: "functions/failed-precondition" })).toEqual({ kind: "rejected", storedOutcome: null });
  });
  it("requires server scope and current source binding, preserving a genuine missing source as unavailable", () => {
    const overlay = stageRunEffortFixture().periods[0]!.running!.stageEffortOverlay!;
    expect(validRunEffortStageOverlay(overlay, 1)).toBe(true);
    expect(validRunEffortStageOverlay({ ...overlay, scope: "global" }, 1)).toBe(false);
    const missing = structuredClone(overlay); missing.preferenceBindings[0]!.metricsRevision = null; missing.preferenceBindings[0]!.mutationReady = false;
    expect(validRunEffortStageOverlay(missing, 1)).toBe(true);
    missing.preferenceBindings[0]!.mutationReady = true; expect(validRunEffortStageOverlay(missing, 1)).toBe(false);
  });
});
