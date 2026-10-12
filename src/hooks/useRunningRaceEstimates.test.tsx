import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { racePreviewFixture } from "../services/runningRaceEstimatesStage.fixture";
import { stageRunEffortFixture } from "../services/trainingAnalysisPeriods.fixture";
import { useRunningRaceEstimates } from "./useRunningRaceEstimates";
const mocks = vi.hoisted(() => ({ uid: "owner", anonymous: false, services: {}, call: vi.fn(), read: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid, isAnonymous: mocks.anonymous } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/runningRaceEstimatesStage", () => ({ runningRaceEstimatesAvailable: () => true, loadRunningRaceEstimates: mocks.call }));
vi.mock("../services/trainingAnalysisPeriods", () => ({ loadTrainingAnalysisPeriods: mocks.read }));
beforeEach(() => { mocks.uid = "owner"; mocks.anonymous = false; mocks.services = {}; mocks.call.mockReset().mockResolvedValue(racePreviewFixture()); mocks.read.mockReset().mockResolvedValue(stageRunEffortFixture()); });
it("does not fetch on mount or draft changes; foreign and anonymous calls remain blocked", async () => {
  const view = renderHook(key => useRunningRaceEstimates("owner", key), { initialProps: "a" });
  expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled(); view.rerender("b");
  mocks.uid = "foreign"; view.rerender("b"); await act(async () => { await view.result.current.preview(racePreviewFixture().snapshot.inputs); await view.result.current.discover(2); });
  mocks.uid = "owner"; mocks.anonymous = true; view.rerender("b"); await act(async () => { await view.result.current.history(3); });
  expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it("ignores late results across draft and owner A→B→A and local lookup cancellation", async () => {
  let resolve!: (value: unknown) => void; mocks.call.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const view = renderHook(key => useRunningRaceEstimates("owner", key), { initialProps: "a" });
  let pending!: Promise<void>; act(() => { pending = view.result.current.preview(racePreviewFixture().snapshot.inputs); });
  view.rerender("b"); view.rerender("a"); await act(async () => { resolve(racePreviewFixture()); await pending; }); expect(view.result.current.response).toBeNull();
  await act(async () => { await view.result.current.preview(racePreviewFixture().snapshot.inputs); });
  mocks.uid = "other"; view.rerender("a"); mocks.uid = "owner"; view.rerender("a"); expect(view.result.current.response).toBeNull();
  mocks.call.mockReturnValueOnce(new Promise(done => { resolve = done; })); act(() => { pending = view.result.current.history(1); });
  act(() => { view.result.current.cancel(); }); await act(async () => { resolve({ mode: "history_page" }); await pending; }); expect(view.result.current.response).toBeNull();
});
it("uses genuine bounded source bindings with no extra reads and fences owner source ABA", async () => {
  const view = renderHook(() => useRunningRaceEstimates("owner", "a"));
  await act(async () => { await view.result.current.discover(12); });
  const request = mocks.read.mock.lastCall![2]; expect(request).toMatchObject({ discipline: "run", includeExpandedRunDistances: true, includeStageRunEffortPreferences: true });
  expect(request.periods[0].toExclusive - request.periods[0].fromInclusive).toBe(12 * 7 * 86400000);
  expect(view.result.current.sources!.choices[0]!.input).toMatchObject({ activityId: "a", target: "5k", expectedMetricsRevision: "100:1", expectedActivityIncarnation: "90:1", expectedPreferenceRevision: 0 });
  mocks.uid = "other"; view.rerender(); mocks.uid = "owner"; view.rerender(); expect(view.result.current.sources).toBeNull();
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("preserves a stable save request across retries and blocks duplicate/conflicting requests", async () => {
  const view = renderHook(() => useRunningRaceEstimates("owner", "a")); await act(async () => { await view.result.current.preview(racePreviewFixture().snapshot.inputs); });
  let reject!: (reason: unknown) => void; mocks.call.mockReturnValueOnce(new Promise((_done, fail) => { reject = fail; }));
  act(() => { view.result.current.save(); view.result.current.save(); }); expect(mocks.call).toHaveBeenCalledTimes(2);
  const request = mocks.call.mock.calls[1]![2]; expect(request.mode).toBe("save_snapshot");
  await act(async () => { reject({ code: "functions/deadline-exceeded" }); }); expect(view.result.current.savingUnknown).toBe(true);
  await act(async () => { await view.result.current.history(6); await view.result.current.discover(24); }); expect(mocks.call).toHaveBeenCalledTimes(2); expect(mocks.read).not.toHaveBeenCalled();
  mocks.call.mockResolvedValueOnce({ mode: "save_snapshot", snapshot: { ...racePreviewFixture().snapshot, snapshotId: "a".repeat(64) }, outcome: "idempotent_historical_replay" });
  await act(async () => { view.result.current.retrySave(); }); expect(mocks.call).toHaveBeenLastCalledWith(mocks.services, "owner", request); expect(view.result.current.pendingSave).toBe(false);
});
it("distinguishes confirmed stored snapshot/account-unverified errors without private response", async () => {
  const view = renderHook(() => useRunningRaceEstimates("owner", "a")); await act(async () => { await view.result.current.preview(racePreviewFixture().snapshot.inputs); });
  mocks.call.mockRejectedValueOnce({ code: "functions/failed-precondition", details: { reason: "account_unverified_after_stage_snapshot", storedOutcome: "snapshot_stored" } });
  await act(async () => { view.result.current.save(); }); expect(view.result.current.storedAccountUnverified).toBe(true); expect(view.result.current.response).toBeNull();
  act(() => { view.result.current.dismissSave(); }); expect(view.result.current.pendingSave).toBe(false); expect(view.result.current.storedAccountUnverified).toBe(true);
});

it("ends local save waiting without losing the pending request and ignores its late private result", async () => {
  const view = renderHook(() => useRunningRaceEstimates("owner", "a")); await act(async () => { await view.result.current.preview(racePreviewFixture().snapshot.inputs); });
  let resolve!: (response: unknown) => void; mocks.call.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  act(() => { view.result.current.save(); }); const request = mocks.call.mock.lastCall![2];
  act(() => { view.result.current.cancel(); }); expect(view.result.current.pendingSave).toBe(true); expect(view.result.current.savingUnknown).toBe(true); expect(view.result.current.busy).toBeNull();
  await act(async () => { resolve({ mode: "save_snapshot", snapshot: racePreviewFixture().snapshot }); }); expect(view.result.current.response).toBeNull();
  mocks.call.mockResolvedValueOnce({ mode: "save_snapshot", snapshot: { ...racePreviewFixture().snapshot, snapshotId: "a".repeat(64) }, outcome: "idempotent_historical_replay" });
  await act(async () => { view.result.current.retrySave(); }); expect(mocks.call).toHaveBeenLastCalledWith(mocks.services, "owner", request);
});
