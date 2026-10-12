import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { coveredFixture, coveredRequest } from "../services/stageCyclingDistanceCoveredRankings.fixture";
import { useStageCyclingDistanceEffortPreference } from "./useStageCyclingDistanceEffortPreference";
import { useStageCyclingSnapshotEffortPreference } from "./useStageCyclingSnapshotEffortPreference";
import { useStageCyclingDistanceCoveredRankings } from "./useStageCyclingDistanceCoveredRankings";
import { invalidateCyclingCoveredPreferences } from "../services/stageCyclingDistanceCoveredRankings";
const mocks = vi.hoisted(() => ({ services: { auth: { currentUser: { uid: "owner", isAnonymous: false } } }, listener: null as null | ((user: unknown) => void), load: vi.fn(), preferenceRead: vi.fn(), preferenceSave: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner", isAnonymous: false } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/stageCyclingDistanceEffortPreference", async original => ({ ...await original<object>(), stageCyclingPreferenceAvailable: () => true, loadCyclingPreference: mocks.preferenceRead, saveCyclingPreference: mocks.preferenceSave }));
vi.mock("../services/stageCyclingDistanceCoveredRankings", async original => ({ ...await original<object>(), loadCyclingCoveredRankings: mocks.load }));
vi.mock("../services/stageCyclingSnapshotEffortPreference", () => ({ loadCyclingSnapshotPreference: mocks.preferenceRead, saveCyclingSnapshotPreference: mocks.preferenceSave }));
vi.mock("firebase/auth", () => ({ onIdTokenChanged: (_: unknown, listener: (user: unknown) => void) => { mocks.listener = listener; return () => {}; } }));
const activity = { id: "native", userId: "owner", type: "Ride", startTime: 2000 } as Activity;
beforeEach(() => { mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } }; mocks.load.mockReset().mockResolvedValue(coveredFixture()); mocks.preferenceRead.mockReset().mockResolvedValue({}); mocks.preferenceSave.mockReset().mockResolvedValue({}); });
it("mount and selection changes make zero requests; 10 then 20 replaces the whole response", async () => {
  const view = renderHook(({ head }) => useStageCyclingDistanceCoveredRankings(activity, coveredRequest, head), { initialProps: { head: "a" } });
  expect(mocks.load).not.toHaveBeenCalled();
  await act(async () => { await view.result.current.confirm(10); }); expect(view.result.current.response?.rows).toHaveLength(3);
  mocks.load.mockResolvedValueOnce(coveredFixture("10km", 20));
  await act(async () => { await view.result.current.confirm(20); });
  expect(view.result.current.response?.requestScope.profile).toBe(20); expect(view.result.current.response?.rows).toHaveLength(3);
  view.rerender({ head: "b" }); expect(view.result.current.response).toBeNull(); expect(mocks.load).toHaveBeenCalledTimes(2);
});
it("cancelled10 cannot overwrite completed20", async () => {
  let resolve!: (value: unknown) => void;
  mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = renderHook(() => useStageCyclingDistanceCoveredRankings(activity, coveredRequest, "a"));
  let pending!: Promise<void>; act(() => { pending = view.result.current.confirm(10); });
  act(() => { view.result.current.cancel(); });
  mocks.load.mockResolvedValueOnce(coveredFixture(undefined, 20)); await act(async () => { await view.result.current.confirm(20); });
  await act(async () => { resolve(coveredFixture()); await pending; }); expect(view.result.current.response?.requestScope.profile).toBe(20);
});
it("selection A-B-A discards late replies without automatic retry", async () => {
  let resolve!: (value: unknown) => void; mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = renderHook(({ head }) => useStageCyclingDistanceCoveredRankings(activity, coveredRequest, head), { initialProps: { head: "a" } });
  let pending!: Promise<void>; act(() => { pending = view.result.current.confirm(10); });
  view.rerender({ head: "b" }); view.rerender({ head: "a" });
  await act(async () => { resolve(coveredFixture()); await pending; }); expect(view.result.current.response).toBeNull(); expect(mocks.load).toHaveBeenCalledOnce();
});
it("Auth token epoch and SDK user replacement invalidate, including sameUID ABA", async () => {
  const view = renderHook(() => useStageCyclingDistanceCoveredRankings(activity, coveredRequest, "a"));
  await act(async () => { await view.result.current.confirm(10); });
  act(() => { mocks.listener!(mocks.services.auth.currentUser); mocks.listener!({ uid: "other", isAnonymous: false }); mocks.listener!(mocks.services.auth.currentUser); });
  expect(view.result.current.response).toBeNull(); expect(mocks.load).toHaveBeenCalledOnce();
  await act(async () => { await view.result.current.confirm(10); });
  mocks.services.auth.currentUser = { uid: "owner", isAnonymous: false }; view.rerender(); expect(view.result.current.response).toBeNull();
});
it("only matchingowner preference success invalidates, with zero added requests", async () => {
  const view = renderHook(() => useStageCyclingDistanceCoveredRankings(activity, coveredRequest, "a"));
  await act(async () => { await view.result.current.confirm(10); });
  act(() => { invalidateCyclingCoveredPreferences("other"); }); expect(view.result.current.response).not.toBeNull();
  act(() => { invalidateCyclingCoveredPreferences("owner"); }); expect(view.result.current.status).toBe("invalidated"); expect(view.result.current.response).toBeNull(); expect(mocks.load).toHaveBeenCalledOnce();
});
it("failures clear the cohort and wait for manual retry", async () => {
  const view = renderHook(() => useStageCyclingDistanceCoveredRankings(activity, coveredRequest, "a"));
  await act(async () => { await view.result.current.confirm(10); }); mocks.load.mockRejectedValueOnce(new Error("changed"));
  await act(async () => { await view.result.current.confirm(20); }); expect(view.result.current.response).toBeNull(); expect(view.result.current.status).toBe("error"); expect(mocks.load).toHaveBeenCalledTimes(2);
});

it.each(["canonical", "snapshot"])("successful selected %s save invalidates the aggregate without auto-query", basis => {
  return (async () => {
    const view = renderHook(() => ({ aggregate: useStageCyclingDistanceCoveredRankings(activity, coveredRequest, "a"), selected: basis === "canonical" ? useStageCyclingDistanceEffortPreference(activity) : useStageCyclingSnapshotEffortPreference(activity) }));
    await act(async () => { await view.result.current.aggregate.confirm(10); await view.result.current.selected.inspect(); });
    expect(view.result.current.aggregate.response).not.toBeNull();
    await act(async () => { await view.result.current.selected.save("10km"); });
    expect(view.result.current.aggregate.response).toBeNull(); expect(view.result.current.aggregate.status).toBe("invalidated");
    expect(mocks.load).toHaveBeenCalledOnce(); expect(mocks.preferenceRead).toHaveBeenCalledOnce(); expect(mocks.preferenceSave).toHaveBeenCalledOnce();
  })();
});
it.each(["canonical", "snapshot"])("failed selected %s save does not announce successful aggregate invalidation", async basis => {
  mocks.preferenceSave.mockRejectedValueOnce(new Error("failed"));
  const view = renderHook(() => ({ aggregate: useStageCyclingDistanceCoveredRankings(activity, coveredRequest, "a"), selected: basis === "canonical" ? useStageCyclingDistanceEffortPreference(activity) : useStageCyclingSnapshotEffortPreference(activity) }));
  await act(async () => { await view.result.current.aggregate.confirm(10); await view.result.current.selected.inspect(); });
  await act(async () => { await view.result.current.selected.save("10km"); });
  expect(view.result.current.aggregate.response).not.toBeNull(); expect(view.result.current.aggregate.status).toBe("ready"); expect(mocks.load).toHaveBeenCalledOnce(); expect(mocks.preferenceSave).toHaveBeenCalledOnce();
});
