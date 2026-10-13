import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SegmentGapResponse, SegmentGapRef } from "@shared/segment-distance-time-gap";
const m = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false }, auth: { currentUser: { uid: "owner", isAnonymous: false } }, load: vi.fn(), call: vi.fn(), ready: vi.fn(), listener: null as null | ((u: { uid: string; isAnonymous: boolean }) => void) }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => m.call }));
vi.mock("../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" }) }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_a: unknown, cb: typeof m.listener) => { m.listener = cb; return () => {}; } }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: m.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => {
  const app = {}, services = { auth: Object.assign(m.auth, { app }), functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: m.ready };
  return { useFirebaseServices: () => services };
});
vi.mock("../services/segmentDistanceTimeGap", () => ({ segmentGapAvailable: () => true, loadSegmentDistanceTimeGap: m.load }));
import { useSegmentDistanceTimeGap } from "./useSegmentDistanceTimeGap";
const pair: [SegmentGapRef, SegmentGapRef] = [{ activityId: "a", effortId: "ea" }, { activityId: "b", effortId: "eb" }];
const response = { state: "unavailable", reason: "missing_cache", pairRevision: "a".repeat(64), comparison: null } as SegmentGapResponse;
const deferred = () => { let resolve!: (r: SegmentGapResponse) => void; const promise = new Promise<SegmentGapResponse>(r => { resolve = r; }); return { resolve, promise }; };
describe("manual owner pair privacy", () => {
  beforeEach(() => { m.load.mockReset(); m.call.mockReset(); m.ready.mockReset(); m.user = { uid: "owner", isAnonymous: false }; m.auth.currentUser = { uid: "owner", isAnonymous: false }; });
  it("mount/selection make zero calls; one explicit request suppresses duplicates", async () => {
    const d = deferred(); m.load.mockReturnValue(d.promise);
    const h = renderHook(({ value }) => useSegmentDistanceTimeGap("s", value, "head1"), { initialProps: { value: null as typeof pair | null } });
    h.rerender({ value: pair }); expect(m.load).not.toHaveBeenCalled();
    let pending!: Promise<void>; act(() => { pending = h.result.current.inspect(); void h.result.current.inspect(); }); expect(m.load).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(response); await pending; }); expect(h.result.current.response).toBe(response);
  });
  it("pair A-B-A hides before effects and cannot adopt older pending result", async () => {
    const old = deferred(), latest = deferred(); m.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const h = renderHook(({ value }) => useSegmentDistanceTimeGap("s", value, "head1"), { initialProps: { value: pair } });
    let p!: Promise<void>; act(() => { p = h.result.current.inspect(); });
    h.rerender({ value: [pair[0], { activityId: "c", effortId: "ec" }] }); h.rerender({ value: pair }); expect(h.result.current.response).toBeNull();
    let newer!: Promise<void>; act(() => { newer = h.result.current.inspect(); });
    await act(async () => { old.resolve(response); await p; }); expect(h.result.current.state).toBe("loading");
    await act(async () => { latest.resolve(response); await newer; }); expect(h.result.current.response).toBe(response);
  });
  it("SDK auth ABA clears result even if React owner identity remains the same", async () => {
    m.load.mockResolvedValue(response); const h = renderHook(() => useSegmentDistanceTimeGap("s", pair, "head"));
    await act(async () => { await h.result.current.inspect(); }); expect(h.result.current.response).toBe(response);
    act(() => { m.auth.currentUser = { uid: "other", isAnonymous: false }; m.listener?.(m.auth.currentUser); });
    expect(h.result.current.response).toBeNull();
    act(() => { m.auth.currentUser = { uid: "owner", isAnonymous: false }; m.listener?.(m.auth.currentUser); }); expect(h.result.current.response).toBeNull(); expect(m.load).toHaveBeenCalledTimes(1);
  });
  it("head changes and unmount discard late results with no automatic retry", async () => {
    const d = deferred(); m.load.mockReturnValue(d.promise);
    const h = renderHook(({ head }) => useSegmentDistanceTimeGap("s", pair, head), { initialProps: { head: "old" } });
    let p!: Promise<void>; act(() => { p = h.result.current.inspect(); }); h.rerender({ head: "new" }); expect(h.result.current.response).toBeNull(); h.unmount();
    await act(async () => { d.resolve(response); await p; }); expect(m.load).toHaveBeenCalledTimes(1);
  });
  it("uses changed revision only on the next explicit action", async () => {
    m.load.mockResolvedValue({ ...response, state: "changed_input", reason: "changed_input" });
    const h = renderHook(() => useSegmentDistanceTimeGap("s", pair, "head")); await act(async () => { await h.result.current.inspect(); });
    expect(m.load).toHaveBeenCalledTimes(1); await act(async () => { await h.result.current.inspect(); }); expect(m.load.mock.calls[1]![2]).toMatchObject({ expectedPairRevision: "a".repeat(64) });
  });
  it.each(["pair", "head", "unmount"])("rejects a saved retired callback before transport after %s", kind => {
    const h = renderHook(({ value, head }) => useSegmentDistanceTimeGap("s", value, head), { initialProps: { value: pair, head: "old" } });
    const retired = h.result.current.inspect;
    if (kind === "unmount") h.unmount();
    else h.rerender({ value: kind === "pair" ? [pair[0], { activityId: "c", effortId: "ec" }] : pair, head: kind === "head" ? "new" : "old" });
    act(() => { void retired(); }); expect(m.load).not.toHaveBeenCalled(); expect(m.call).not.toHaveBeenCalled();
  });
  it.each(["pair", "head", "unmount"])("actual service preflight cannot dispatch after delayed App Check and %s retirement", async kind => {
    const service = await vi.importActual<typeof import("../services/segmentDistanceTimeGap")>("../services/segmentDistanceTimeGap");
    m.load.mockImplementation(service.loadSegmentDistanceTimeGap);
    let release!: () => void; m.ready.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    const h = renderHook(({ value, head }) => useSegmentDistanceTimeGap("s", value, head), { initialProps: { value: pair, head: "old" } });
    let pending!: Promise<void>; act(() => { pending = h.result.current.inspect(); }); expect(m.ready).toHaveBeenCalledTimes(1);
    if (kind === "unmount") h.unmount();
    else h.rerender({ value: kind === "pair" ? [pair[0], { activityId: "c", effortId: "ec" }] : pair, head: kind === "head" ? "new" : "old" });
    await act(async () => { release(); await pending; });
    expect(m.call).not.toHaveBeenCalled(); expect(m.ready).toHaveBeenCalledTimes(1);
  });
});
