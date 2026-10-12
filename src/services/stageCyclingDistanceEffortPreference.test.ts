import { beforeEach, expect, it, vi } from "vitest";
import type { StageCyclingDistanceEffortPreferenceReadResponse as ReadResponse } from "@shared/types/stage-cycling-distance-effort-preference-reader";
import type { StageCyclingDistanceEffortPreferenceResponse as WriteResponse } from "@shared/types/stage-cycling-distance-effort-preferences";
import fixture from "./stageCyclingDistanceEffortPreference.fixture.json";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { cyclingPreferenceWriteRequest, loadCyclingPreference, saveCyclingPreference, validateCyclingPreferenceRead, validateCyclingPreferenceWrite, validCyclingPreferenceId } from "./stageCyclingDistanceEffortPreference";
const transport = vi.hoisted(() => ({ stage: true, callable: vi.fn(), invoke: vi.fn() }));
vi.mock("./stageActivityPowerDuration", () => ({ stageActivityPowerAvailable: () => transport.stage }));
vi.mock("firebase/functions", () => ({ httpsCallable: transport.callable }));
beforeEach(() => { transport.stage = true; transport.callable.mockReset().mockReturnValue(transport.invoke); transport.invoke.mockReset().mockResolvedValue({ data: fixture.original.response }); });
const read = (key: "original" | "excluded" | "orphaned" | "restored") => structuredClone(fixture[key].response) as ReadResponse;
it.each(["original", "excluded", "orphaned", "restored"] as const)("decodes actual compiled anonymous %s scalar wire", key => {
  const value = read(key); expect(validateCyclingPreferenceRead(value, value.activityId)).toBe(value);
});
it("uses only exact server bindings plus an idempotency key and validates both compiled receipts", () => {
  const exclude = cyclingPreferenceWriteRequest(read("original"), "10km", "abcdefghijklmnop");
  expect(exclude).toEqual({ ...read("original").efforts[1]!.excludeBinding, idempotencyKey: "abcdefghijklmnop" });
  expect(validateCyclingPreferenceWrite(fixture.excludedMutation as WriteResponse, exclude)).toBe(fixture.excludedMutation);
  const restore = cyclingPreferenceWriteRequest(read("orphaned"), "10km", "abcdefghijklmnop");
  expect(restore.excluded).toBe(false); expect(restore.expectedSourceAuthorityRevision).toBeNull();
  expect(validateCyclingPreferenceWrite(fixture.restoredMutation as WriteResponse, restore)).toBe(fixture.restoredMutation);
  expect(() => cyclingPreferenceWriteRequest(read("original"), "5miles", "abcdefghijklmnop")).toThrow();
});
it.each([
  (v: ReadResponse) => { v.aggregateEffect = "applied" as never; },
  (v: ReadResponse) => { v.efforts[1]!.excludeBinding!.expectedMetricsRevision = "3:0"; },
  (v: ReadResponse) => { v.efforts[1]!.effectiveElapsedSeconds = 0; },
  (v: ReadResponse) => { v.efforts[1]!.excludeBinding!.target = "50miles"; },
  (v: ReadResponse) => { v.efforts[1]!.excludeBinding = null; },
  (v: ReadResponse) => { v.efforts.reverse(); },
  (v: ReadResponse) => { v.excludedTargets.push("10km"); },
  (v: ReadResponse) => { v.provenance!.originalClockVerified = true as never; },
  (v: ReadResponse) => { v.readTimes.source.nanoseconds = 1e9; },
  (v: ReadResponse) => { v.provenance = null; },
  (v: ReadResponse) => { v.efforts[1]!.originalElapsedSeconds = 1.5; },
])("rejects altered selection, provenance, exact target or CAS wire %#", mutate => {
  const v = read("original"); mutate(v); expect(() => validateCyclingPreferenceRead(v, v.activityId)).toThrow();
});
it("rejects unknown identities, future fields and forged receipt context", () => {
  expect(validCyclingPreferenceId("a".repeat(160))).toBe(true);
  for (const id of ["a".repeat(161), "_a", "a/b"]) expect(validCyclingPreferenceId(id)).toBe(false);
  expect(() => validateCyclingPreferenceRead(read("original"), "other")).toThrow();
  expect(() => validateCyclingPreferenceRead({ ...read("original"), future: true } as ReadResponse, read("original").activityId)).toThrow();
  const request = cyclingPreferenceWriteRequest(read("original"), "10km", "abcdefghijklmnop");
  expect(() => validateCyclingPreferenceWrite({ ...fixture.excludedMutation, preferenceRevision: 2 } as WriteResponse, request)).toThrow();
});
const services = () => {
  const app = {}, auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
  return { auth, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices;
};
it("preserves existing SDK auth/AppCheck context with explicit read1 and write1 exact bindings", async () => {
  const s = services(); await loadCyclingPreference(s, "owner", fixture.original.response.activityId);
  expect(transport.callable).toHaveBeenCalledWith(s.functions, "getStageCyclingDistanceEffortPreference");
  expect(transport.invoke).toHaveBeenCalledExactlyOnceWith(fixture.original.request);
  transport.invoke.mockResolvedValueOnce({ data: fixture.excludedMutation });
  await saveCyclingPreference(s, "owner", read("original"), "10km", "abcdefghijklmnop");
  expect(transport.callable).toHaveBeenLastCalledWith(s.functions, "setStageCyclingDistanceEffortPreference");
  expect(transport.invoke).toHaveBeenLastCalledWith(cyclingPreferenceWriteRequest(read("original"), "10km", "abcdefghijklmnop"));
  expect(s.ensureAppCheckReady).toHaveBeenCalledTimes(2);
});
it("blocks production, mismatched SDK apps and foreign auth before any callable", async () => {
  const s = services(); transport.stage = false;
  await expect(loadCyclingPreference(s, "owner", "ride")).rejects.toThrow("api_unavailable");
  transport.stage = true; await expect(loadCyclingPreference(s, "other", "ride")).rejects.toThrow("account_changed");
  Object.assign(s.functions, { app: {} }); await expect(loadCyclingPreference(s, "owner", "ride")).rejects.toThrow("api_unavailable");
  expect(transport.callable).not.toHaveBeenCalled();
});
it("checks auth again after AppCheck and hides responses after an account switch", async () => {
  const s = services(); vi.mocked(s.ensureAppCheckReady).mockImplementationOnce(async () => { Object.assign(s.auth.currentUser!, { uid: "other" }); });
  await expect(loadCyclingPreference(s, "owner", "ride")).rejects.toThrow("account_changed"); expect(transport.callable).not.toHaveBeenCalled();
  Object.assign(s.auth.currentUser!, { uid: "owner" }); transport.invoke.mockImplementationOnce(async () => { Object.assign(s.auth.currentUser!, { uid: "other" }); return { data: fixture.original.response }; });
  await expect(loadCyclingPreference(s, "owner", fixture.original.response.activityId)).rejects.toThrow("account_changed");
});

it.each([null, undefined, ["a".repeat(64)], { toString: () => "a".repeat(64) }].map(authority => ({ authority })))("rejects nonliteral authority values without string coercion %#", ({ authority }) => {
  const v = read("original");
  v.efforts[1]!.excludeBinding!.expectedSourceAuthorityRevision = authority as never;
  expect(() => validateCyclingPreferenceRead(v, v.activityId)).toThrow();
});
it.each([[null], Array(1), [undefined], ["10km", "10km"], ["unknown"], ["180km", "10km"], Array(14).fill("10km")].map(targets => ({ targets })))("rejects malformed excludedTargets shape %#", ({ targets }) => {
  const v = read("original"); v.excludedTargets = targets as never;
  expect(() => validateCyclingPreferenceRead(v, v.activityId)).toThrow();
});
