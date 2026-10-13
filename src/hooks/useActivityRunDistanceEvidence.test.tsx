import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { manualDistanceEpoch, manualDistanceFixture } from "../services/activityRunDistanceEvidence.fixture";
import { useActivityRunDistanceEvidence } from "./useActivityRunDistanceEvidence";
const mocks = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, services: { auth: { currentUser: { uid: "owner", isAnonymous: false } } }, available: true, load: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/activityRunDistanceEvidence", () => ({ loadActivityRunDistanceEvidence: mocks.load, manualRunDistanceAvailable: () => mocks.available }));
const activity = { id: "ride", userId: "owner", type: "Run", startTime: manualDistanceEpoch } as Activity;
beforeEach(() => { mocks.user = { uid: "owner", isAnonymous: false }; mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } }; mocks.available = true; mocks.load.mockReset().mockResolvedValue(manualDistanceFixture()); });
describe("manual distance snapshot lifecycle", () => {
  it("starts0, suppresses duplicate inflight requests and refreshes with accepted revision only manually", async () => {
    let resolve!: (r: ReturnType<typeof manualDistanceFixture>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = renderHook(() => useActivityRunDistanceEvidence(activity, "metrics"));
    expect(mocks.load).not.toHaveBeenCalled();
    let first!: Promise<void>; act(() => { first = view.result.current.inspect(); });
    await act(async () => { await view.result.current.inspect(); }); expect(mocks.load).toHaveBeenCalledOnce();
    await act(async () => { resolve(manualDistanceFixture()); await first; }); expect(view.result.current.state).toBe("available");
    await act(async () => { await view.result.current.inspect(); });
    expect(mocks.load.mock.calls[1]![3]).toBe("a".repeat(64)); expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it.each(["activity", "context-account", "auth-account", "metrics", "head", "services"])("hides synchronously and discards ABA late results on %s", async axis => {
    let resolve!: (r: ReturnType<typeof manualDistanceFixture>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = renderHook(({ id, metrics, head }) => useActivityRunDistanceEvidence({ ...activity, id, contentRevision: head }, metrics), { initialProps: { id: "ride", metrics: "old", head: 1 } });
    const oldServices = mocks.services;
    let pending!: Promise<void>; act(() => { pending = view.result.current.inspect(); });
    if (axis === "services") mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } };
    if (axis === "context-account") mocks.user = { uid: "other", isAnonymous: false };
    if (axis === "auth-account") mocks.services.auth.currentUser.uid = "other";
    view.rerender({ id: axis === "activity" ? "other" : "ride", metrics: axis === "metrics" ? "new" : "old", head: axis === "head" ? 2 : 1 });
    expect(view.result.current.response).toBeNull();
    mocks.user = { uid: "owner", isAnonymous: false }; mocks.services = oldServices; mocks.services.auth.currentUser.uid = "owner";
    view.rerender({ id: "ride", metrics: "old", head: 1 });
    await act(async () => { resolve(manualDistanceFixture()); await pending; });
    expect(view.result.current.response).toBeNull(); expect(view.result.current.state).toBe("idle"); expect(mocks.load).toHaveBeenCalledOnce();
  });
  it("clears settled evidence immediately on metadata change without another read", async () => {
    const view = renderHook(({ identity }) => useActivityRunDistanceEvidence(activity, identity), { initialProps: { identity: "old" } });
    await act(async () => { await view.result.current.inspect(); });
    view.rerender({ identity: "new" }); expect(view.result.current.response).toBeNull(); expect(mocks.load).toHaveBeenCalledOnce();
  });
  it("adopts changed-input revision for the next explicit CTA with no automatic retry", async () => {
    mocks.load.mockResolvedValueOnce({ mode: "run_distance_evidence", activityId: "ride", state: "changed_input", reason: "changed_input", distanceInputRevision: "b".repeat(64), sourceLayer: "raw_parts", evidence: null });
    const view = renderHook(() => useActivityRunDistanceEvidence(activity, "old"));
    await act(async () => { await view.result.current.inspect(); }); expect(view.result.current.state).toBe("changed_input"); expect(mocks.load).toHaveBeenCalledOnce();
    await act(async () => { await view.result.current.inspect(); }); expect(mocks.load.mock.calls[1]![3]).toBe("b".repeat(64));
  });
  it("remains manual in StrictMode and hides public/nonrun/anonymous activities", async () => {
    const view = renderHook(() => useActivityRunDistanceEvidence(activity, "old"), { wrapper: StrictMode });
    await act(async () => { await view.result.current.inspect(); }); expect(view.result.current.state).toBe("available");
    view.unmount();
    mocks.user = null; const other = renderHook(() => useActivityRunDistanceEvidence(activity, "old"));
    await act(async () => { await other.result.current.inspect(); }); expect(other.result.current.available).toBe(false); expect(mocks.load).toHaveBeenCalledOnce();
  });
});

it("clears settled evidence for an actual authenticated account change even when activity owner stays constant", async () => {
  const view = renderHook(() => useActivityRunDistanceEvidence(activity, "same"));
  await act(async () => { await view.result.current.inspect(); }); expect(view.result.current.response).not.toBeNull();
  mocks.user = { uid: "other", isAnonymous: false }; mocks.services.auth.currentUser.uid = "other";
  view.rerender(); expect(view.result.current.response).toBeNull(); expect(view.result.current.available).toBe(false);
  mocks.user = { uid: "owner", isAnonymous: false }; mocks.services.auth.currentUser.uid = "owner";
  view.rerender(); expect(view.result.current.response).toBeNull(); expect(mocks.load).toHaveBeenCalledOnce();
});
it("ignores an unmounted late promise and gates anonymous/nonrun/foreign owners without reads", async () => {
  let resolve!: (r: ReturnType<typeof manualDistanceFixture>) => void;
  mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = renderHook(() => useActivityRunDistanceEvidence(activity, "same"));
  let pending!: Promise<void>; act(() => { pending = view.result.current.inspect(); }); view.unmount();
  await act(async () => { resolve(manualDistanceFixture()); await pending; });
  for (const change of ["anonymous", "nonrun", "foreign"] as const) {
    mocks.user = { uid: "owner", isAnonymous: change === "anonymous" };
    const candidate = change === "nonrun" ? { ...activity, type: "Ride" } : change === "foreign" ? { ...activity, userId: "other" } : activity;
    const blocked = renderHook(() => useActivityRunDistanceEvidence(candidate, "same"));
    expect(blocked.result.current.available).toBe(false); await act(async () => { await blocked.result.current.inspect(); }); blocked.unmount();
  }
  expect(mocks.load).toHaveBeenCalledOnce();
});
