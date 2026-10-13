import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { snapshotFixture } from "../services/stageCyclingSnapshotEffortPreference.fixture";
const fixture = { original: { response: snapshotFixture() }, excludedMutation: {} };
import { useStageCyclingSnapshotEffortPreference } from "./useStageCyclingSnapshotEffortPreference";
const mocks = vi.hoisted(() => ({ uid: "owner", anonymous: false, available: true, services: { auth: { currentUser: { uid: "owner", isAnonymous: false } } }, listener: null as null | ((u: unknown) => void), load: vi.fn(), save: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid, isAnonymous: mocks.anonymous } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/stageCyclingDistanceEffortPreference", async importOriginal => ({ ...await importOriginal<object>(), stageCyclingPreferenceAvailable: () => mocks.available }));
vi.mock("firebase/auth", () => ({ onIdTokenChanged: (_: unknown, fn: (u: unknown) => void) => { mocks.listener = fn; return () => {}; } }));
vi.mock("../services/stageCyclingSnapshotEffortPreference", async importOriginal => ({ ...await importOriginal<object>(), stageCyclingPreferenceAvailable: () => mocks.available, loadCyclingSnapshotPreference: mocks.load, saveCyclingSnapshotPreference: mocks.save }));
const activity = { id: "fixture_bike_a", userId: "owner", type: "Ride", startTime: 1000 } as Activity;
beforeEach(() => { mocks.uid = "owner"; mocks.anonymous = false; mocks.available = true; mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } }; mocks.load.mockReset().mockResolvedValue(fixture.original.response); mocks.save.mockReset().mockResolvedValue(fixture.excludedMutation); });
it("reads and saves only on explicit actions and discards bindings after save without automatic refresh", async () => {
  const view = renderHook(() => useStageCyclingSnapshotEffortPreference(activity));
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => { await view.result.current.inspect(); });
  expect(mocks.load).toHaveBeenCalledExactlyOnceWith(mocks.services, "owner", activity.id);
  await act(async () => { await view.result.current.save("10km"); });
  expect(mocks.save).toHaveBeenCalledWith(mocks.services, "owner", fixture.original.response, "10km", expect.stringMatching(/^[A-Za-z0-9_-]{16,100}$/));
  expect(view.result.current.read).toBeNull(); expect(view.result.current.saved).toBe(true);
  await act(async () => { await view.result.current.save("50miles"); }); expect(mocks.save).toHaveBeenCalledOnce(); expect(mocks.load).toHaveBeenCalledOnce();
  await act(async () => { await view.result.current.inspect(); }); expect(mocks.load).toHaveBeenCalledTimes(2);
});
it.each(["functions/failed-precondition", "functions/unavailable"])("clears all eligibility after %s until a manual fresh read", async code => {
  const view = renderHook(() => useStageCyclingSnapshotEffortPreference(activity));
  await act(async () => { await view.result.current.inspect(); }); mocks.save.mockRejectedValueOnce({ code });
  await act(async () => { await view.result.current.save("10km"); });
  expect(view.result.current.read).toBeNull(); expect(view.result.current.failure).toBe(code.endsWith("failed-precondition") ? "changed" : "error");
  await act(async () => { await view.result.current.save("10km"); }); expect(mocks.save).toHaveBeenCalledOnce(); expect(mocks.load).toHaveBeenCalledOnce();
});
it("hides late activity and metric-context A-B-A results with zero automatic requests", async () => {
  let resolve!: (value: unknown) => void;
  mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = renderHook(({ current, scope }) => useStageCyclingSnapshotEffortPreference(current, scope), { initialProps: { current: activity, scope: "a" } });
  let pending!: Promise<void>; act(() => { pending = view.result.current.inspect(); });
  view.rerender({ current: { ...activity, id: "other" }, scope: "b" }); view.rerender({ current: activity, scope: "a" });
  await act(async () => { resolve(fixture.original.response); await pending; }); expect(view.result.current.read).toBeNull(); expect(mocks.load).toHaveBeenCalledOnce();
  await act(async () => { await view.result.current.inspect(); });
  mocks.save.mockImplementationOnce(() => new Promise(done => { resolve = done; })); act(() => { pending = view.result.current.save("10km"); });
  view.rerender({ current: activity, scope: "b" }); view.rerender({ current: activity, scope: "a" });
  await act(async () => { resolve(fixture.excludedMutation); await pending; }); expect(view.result.current.saved).toBe(false); expect(view.result.current.read).toBeNull();
});
it("blocks foreign/anonymous/deleted/nonbike and invalid-ID activity contexts", async () => {
  const view = renderHook(({ current }) => useStageCyclingSnapshotEffortPreference(current), { initialProps: { current: activity } });
  for (const current of [{ ...activity, userId: "foreign" }, { ...activity, deletedAt: 1 }, { ...activity, type: "Run" }, { ...activity, id: "_bad" }]) {
    view.rerender({ current }); expect(view.result.current.available).toBe(false); await act(async () => { await view.result.current.inspect(); });
  }
  mocks.anonymous = true; view.rerender({ current: activity }); expect(view.result.current.available).toBe(false);
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});

it("invalidates native Auth A-B-A and five-minute read expiry without automatic calls", async () => {
  const view = renderHook(() => useStageCyclingSnapshotEffortPreference(activity));
  await act(async () => { await view.result.current.inspect(); });
  act(() => { mocks.listener!({ uid: "other" }); mocks.listener!(mocks.services.auth.currentUser); });
  expect(view.result.current.read).toBeNull();
  vi.useFakeTimers();
  await act(async () => { await view.result.current.inspect(); });
  const oldSave = view.result.current.save;
  act(() => { vi.advanceTimersByTime(300001); });
  expect(view.result.current.read).toBeNull();
  await act(async () => { await oldSave("10km"); await view.result.current.save("10km"); });
  expect(mocks.load).toHaveBeenCalledTimes(2); expect(mocks.save).not.toHaveBeenCalled(); vi.useRealTimers();
});

it("issues a fresh UUID for each manually re-inspected save", async () => {
  const view = renderHook(() => useStageCyclingSnapshotEffortPreference(activity));
  for (let i = 0; i < 2; i++) {
    await act(async () => { await view.result.current.inspect(); });
    await act(async () => { await view.result.current.save("10km"); });
  }
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.save.mock.calls[0]![4]).not.toBe(mocks.save.mock.calls[1]![4]);
  expect(mocks.load).toHaveBeenCalledTimes(2);
});
