import { beforeEach, expect, it, vi } from "vitest";
import { BIKE_DISTANCE_TARGETS } from "@shared/activity-bike-distance-evidence";
import type { CyclingSnapshotReadResponse as Read } from "@shared/types/stage-cycling-snapshot-effort-preferences";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { cyclingSnapshotWriteRequest, loadCyclingSnapshotPreference, saveCyclingSnapshotPreference, validateCyclingSnapshotRead, validateCyclingSnapshotWrite } from "./stageCyclingSnapshotEffortPreference";
const mocks = vi.hoisted(() => ({ stage: true, call: vi.fn(), invoke: vi.fn(), listener: null as null | ((u: unknown) => void), unsub: vi.fn() }));
vi.mock("./stageActivityPowerDuration", () => ({ stageActivityPowerAvailable: () => mocks.stage }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.call }));
vi.mock("firebase/auth", () => ({ onIdTokenChanged: (_auth: unknown, listener: (u: unknown) => void) => { mocks.listener = listener; return mocks.unsub; } }));
import { snapshotFixture } from "./stageCyclingSnapshotEffortPreference.fixture";

beforeEach(() => { mocks.stage = true; mocks.call.mockReset().mockReturnValue(mocks.invoke); mocks.invoke.mockReset().mockResolvedValue({ data: snapshotFixture() }); mocks.unsub.mockReset(); });
it("keeps canonical legacy separate from current derived records and all13 exact targets including miles", () => {
  const v = snapshotFixture(); expect(validateCyclingSnapshotRead(v, v.activityId)).toBe(v); expect(v.efforts.map(r => r.target)).toEqual([...BIKE_DISTANCE_TARGETS]);
  const request = cyclingSnapshotWriteRequest(v, "10km", "abcdefghijklmnop"); expect(request).toEqual({ ...v.efforts[1]!.excludeBinding, idempotencyKey: "abcdefghijklmnop" });
  const result = { version: 1 as const, scope: "explicit_selected_stage_snapshot" as const, outcome: "stored_pending_analysis_refresh" as const, activityId: v.activityId, activityIncarnation: v.activityIncarnation, preferenceRevision: 1, target: "10km" as const, excluded: true, globalRecords: "unchanged" as const, aggregateEffect: "not_applied" as const };
  expect(validateCyclingSnapshotWrite(result, request)).toBe(result);
  expect(() => validateCyclingSnapshotWrite({ ...result, preferenceRevision: 2 }, request)).toThrow();
});
it("allows only server-bound restoration when snapshot is missing", () => {
  const v = snapshotFixture(); v.snapshotState = "missing"; v.snapshotBinding = { exists: false, createTime: "missing", updateTime: "missing", contentHash: "f".repeat(64), derivedRevision: null }; v.provenance = null; v.excludedTargets = ["10km"];
  const old = v.efforts[1]!.excludeBinding!;
  v.efforts = v.efforts.map(r => ({ ...r, originalElapsedSeconds: null, exactElapsedSeconds: null, effectiveElapsedSeconds: null, excluded: r.target === "10km", excludeBinding: null, restoreBinding: r.target === "10km" ? { ...old, excluded: false, expectedSnapshotBinding: v.snapshotBinding, expectedSourceAuthorityRevision: null } : null }));
  expect(validateCyclingSnapshotRead(v, v.activityId)).toBe(v); expect(cyclingSnapshotWriteRequest(v, "10km", "abcdefghijklmnop").excluded).toBe(false);
  expect(() => cyclingSnapshotWriteRequest(v, "80km", "abcdefghijklmnop")).toThrow();
});
it.each([
  (v: Read) => { v.efforts.reverse(); }, (v: Read) => { delete v.efforts[0]; },
  (v: Read) => { v.excludedTargets = Array(1); }, (v: Read) => { v.excludedTargets = ["10km", "10km"]; },
  (v: Read) => { v.efforts[1]!.exactElapsedSeconds = NaN; }, (v: Read) => { v.efforts[1]!.exactElapsedSeconds = Infinity; },
  (v: Read) => { v.efforts[1]!.originalElapsedSeconds = 0; }, (v: Read) => { v.efforts[1]!.effectiveElapsedSeconds = 1; },
  (v: Read) => { v.efforts[1]!.excludeBinding!.expectedSnapshotBinding = { ...v.snapshotBinding, contentHash: "f".repeat(64) }; },
  (v: Read) => { v.efforts[1]!.excludeBinding!.expectedSourceRevision = "e".repeat(64); },
  (v: Read) => { v.efforts[1]!.excludeBinding!.expectedSourceAuthorityRevision = ["a".repeat(64)] as never; },
  (v: Read) => { v.snapshotState = "missing"; }, (v: Read) => { v.provenance = null; },
  (v: Read) => { v.readTimes.source.nanoseconds = 1e9; }, (v: Read) => { Object.assign(v.provenance!, { future: true }); },
  (v: Read) => { v.aggregateEffect = "applied" as never; }, (v: Read) => { Object.assign(v, { future: true }); },
])("rejects malformed scalar, dense targets and full CAS/provenance %#", mutate => { const v = snapshotFixture(); mutate(v); expect(() => validateCyclingSnapshotRead(v, v.activityId)).toThrow(); });
const services = () => { const app = {}; return { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices; };
it("uses only new reader/writer with read1/write1 and no old prefetch", async () => {
  const s = services(), v = snapshotFixture(); await loadCyclingSnapshotPreference(s, "owner", v.activityId);
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith(s.functions, "getStageCyclingSnapshotEffortPreference"); expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith({ version: 1, activityId: v.activityId, sourceBasis: "stage_snapshot_v1" });
  mocks.invoke.mockResolvedValueOnce({ data: { version: 1, scope: "explicit_selected_stage_snapshot", outcome: "stored_pending_analysis_refresh", activityId: v.activityId, activityIncarnation: v.activityIncarnation, preferenceRevision: 1, target: "10km", excluded: true, globalRecords: "unchanged", aggregateEffect: "not_applied" } });
  await saveCyclingSnapshotPreference(s, "owner", v, "10km", "abcdefghijklmnop"); expect(mocks.invoke).toHaveBeenCalledTimes(2); expect(mocks.call).toHaveBeenLastCalledWith(s.functions, "setStageCyclingSnapshotEffortPreference"); expect(mocks.unsub).toHaveBeenCalledTimes(2);
});
it("blocks production and an Auth A-B-A event during AppCheck without API calls", async () => {
  const s = services(); mocks.stage = false; await expect(loadCyclingSnapshotPreference(s, "owner", "ride")).rejects.toThrow("api_unavailable"); mocks.stage = true;
  vi.mocked(s.ensureAppCheckReady).mockImplementationOnce(async () => { mocks.listener!({ uid: "other" }); mocks.listener!(s.auth.currentUser); });
  await expect(loadCyclingSnapshotPreference(s, "owner", "ride")).rejects.toThrow("account_changed"); expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.unsub).toHaveBeenCalledOnce();
});
it("discards a late response after native user replacement without exposing it", async () => {
  const s = services(); mocks.invoke.mockImplementationOnce(async () => { Object.assign(s.auth, { currentUser: { uid: "owner", isAnonymous: false } }); return { data: snapshotFixture() }; });
  await expect(loadCyclingSnapshotPreference(s, "owner", "fixture_bike_a")).rejects.toThrow("account_changed");
});
