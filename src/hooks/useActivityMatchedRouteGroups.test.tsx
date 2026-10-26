import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityMatchedRouteGroupResponse } from "@shared/activity-matched-route-groups";
import { useActivityMatchedRouteGroups } from "./useActivityMatchedRouteGroups";
const mocks = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null,
  services: { auth: { currentUser: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null } }, available: true, load: vi.fn(),
  observer: null as null | ((user: { uid: string; isAnonymous: boolean } | null) => void) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_: unknown, callback: typeof mocks.observer) => { mocks.observer = callback; return vi.fn(); } }));
vi.mock("../services/activityRouteEvidence", () => ({ observedRouteAvailable: () => mocks.available }));
vi.mock("../services/activityMatchedRouteGroups", async importOriginal => ({ ...(await importOriginal<typeof import("../services/activityMatchedRouteGroups")>()), loadActivityMatchedRouteGroups: mocks.load }));
const now = 1791792000000;
const page = (more = false, final = false): ActivityMatchedRouteGroupResponse => {
  const total = more || final ? 6 : 1, summary = { memberCount: total, knownMetricCount: 0, rankEligibleCount: 0, fastestActivityIds: [], trend: { state: "insufficient", basis: "canonical_avg_speed_kph", count: 0, reason: "insufficient_distinct_dates" }, years: [{ year: 2026, memberCount: total, knownMetricCount: 0, rankEligibleCount: 0, fastestActivityIds: [], trend: { state: "insufficient", basis: "canonical_avg_speed_kph", count: 0, reason: "insufficient_distinct_dates" } }] };
  return { mode: "matched_route_group_page", anchorActivityId: "anchor", discipline: "run", state: "available", readTime: { seconds: now / 1000, nanoseconds: 0 }, expiresAt: now + 1800000, groupToken: "mrgg1." + "a".repeat(40), nextCursor: more ? "mrgg1." + "b".repeat(40) : null,
    summary, members: Array.from({ length: more ? 5 : 1 }, (_, offset) => { const index = final ? 5 : offset; return { activityId: index ? `record-${index}` : "anchor", startTime: now - 1000000 + index * 1000, year: 2026, isAnchor: !index, canonicalAverage: { state: "pending", reason: "metrics_pending", metricsRevision: null }, rankingEligible: false, rankingExclusionReason: "metric_unavailable" }; }),
    scope: {}, coverage: {}, omittedCounts: {} } as unknown as ActivityMatchedRouteGroupResponse;
};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); mocks.user = { uid: "owner", isAnonymous: false }; mocks.services = { auth: { currentUser: { ...mocks.user } } }; mocks.available = true; mocks.load.mockReset().mockResolvedValue(page()); });
afterEach(() => vi.useRealTimers());
describe("manual matched route group privacy", () => {
  it("has no initial or scope-change call; one click is one page and concurrent clicks are ignored", async () => {
    let resolve!: (value: ActivityMatchedRouteGroupResponse) => void; mocks.load.mockImplementation(() => new Promise(r => { resolve = r; }));
    const hook = renderHook(({ head }) => useActivityMatchedRouteGroups("owner", "anchor", "run", head), { initialProps: { head: "one" } });
    expect(mocks.load).not.toHaveBeenCalled(); let first!: Promise<void>;
    act(() => { first = hook.result.current.start(); void hook.result.current.start(); });
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(mocks.services, "owner", { mode: "matched_route_group_page", anchorActivityId: "anchor", discipline: "run" });
    await act(async () => { resolve(page()); await first; }); expect(hook.result.current.pages).toHaveLength(1);
    hook.rerender({ head: "two" }); expect(hook.result.current.pages).toEqual([]); expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("hides accepted data immediately on anchor/head ABA and discards older late responses", async () => {
    const resolvers: Array<(value: ActivityMatchedRouteGroupResponse) => void> = []; mocks.load.mockImplementation(() => new Promise(r => resolvers.push(r)));
    const hook = renderHook(({ id, head }) => useActivityMatchedRouteGroups("owner", id, "bike", head), { initialProps: { id: "A", head: "one" } });
    let old!: Promise<void>; act(() => { old = hook.result.current.start(); });
    hook.rerender({ id: "B", head: "one" }); hook.rerender({ id: "A", head: "one" });
    await act(async () => { resolvers[0]!(page()); await old; }); expect(hook.result.current.pages).toEqual([]);
    await act(async () => { const newer = hook.result.current.start(); resolvers[1]!(page()); await newer; }); expect(hook.result.current.pages).toHaveLength(1);
    hook.rerender({ id: "A", head: "two" }); expect(hook.result.current.pages).toEqual([]); expect(hook.result.current.status).toBe("idle");
  });
  it("SDK account ABA clears results even when activity/context owner are unchanged", async () => {
    const hook = renderHook(() => useActivityMatchedRouteGroups("owner", "anchor", "run", "head"));
    await act(async () => hook.result.current.start()); expect(hook.result.current.pages).toHaveLength(1);
    act(() => { mocks.services.auth.currentUser = { uid: "other", isAnonymous: false }; mocks.observer!(mocks.services.auth.currentUser); mocks.services.auth.currentUser = { uid: "owner", isAnonymous: false }; mocks.observer!(mocks.services.auth.currentUser); });
    expect(hook.result.current.pages).toEqual([]); expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("uses the full returned cursor only for a manual next page and preserves partial data on transient failure", async () => {
    mocks.load.mockResolvedValueOnce(page(true)).mockRejectedValueOnce(new Error("network"));
    const hook = renderHook(() => useActivityMatchedRouteGroups("owner", "anchor", "run", "head"));
    await act(async () => hook.result.current.start()); expect(hook.result.current.status).toBe("partial"); expect(mocks.load).toHaveBeenCalledTimes(1);
    await act(async () => hook.result.current.loadMore()); expect(hook.result.current.status).toBe("error"); expect(hook.result.current.pages).toHaveLength(1);
    expect(mocks.load.mock.calls[1]![2].cursor).toEqual(page(true).nextCursor);
    mocks.load.mockResolvedValueOnce(page(false, true)); await act(async () => hook.result.current.loadMore()); expect(hook.result.current.status).toBe("complete");
  });
  it("rejects a later page with changed group token and clears partial results", async () => {
    mocks.load.mockResolvedValueOnce(page(true)).mockResolvedValueOnce({ ...page(false, true), groupToken: "mrgg1." + "c".repeat(40) });
    const hook = renderHook(() => useActivityMatchedRouteGroups("owner", "anchor", "run", "head"));
    await act(async () => hook.result.current.start()); await act(async () => hook.result.current.loadMore());
    expect(hook.result.current.status).toBe("invalidated"); expect(hook.result.current.pages).toEqual([]); expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("expires without reads, clears changed input, and requires a new explicit start", async () => {
    const hook = renderHook(() => useActivityMatchedRouteGroups("owner", "anchor", "run", "head"));
    await act(async () => hook.result.current.start()); act(() => vi.advanceTimersByTime(1800000));
    expect(hook.result.current.status).toBe("expired"); expect(hook.result.current.pages).toEqual([]); expect(mocks.load).toHaveBeenCalledTimes(1);
    mocks.load.mockResolvedValueOnce({ ...page(), state: "changed_input" }); await act(async () => hook.result.current.start());
    expect(hook.result.current.status).toBe("invalidated"); expect(hook.result.current.pages).toEqual([]);
  });
  it("discards a response after unmount and refuses anonymous/foreign context without calls", async () => {
    let resolve!: (value: ActivityMatchedRouteGroupResponse) => void; mocks.load.mockImplementation(() => new Promise(r => { resolve = r; }));
    const hook = renderHook(() => useActivityMatchedRouteGroups("owner", "anchor", "bike", "head")); let pending!: Promise<void>; act(() => { pending = hook.result.current.start(); }); hook.unmount(); await act(async () => { resolve(page()); await pending; });
    mocks.user = { uid: "other", isAnonymous: false }; const foreign = renderHook(() => useActivityMatchedRouteGroups("owner", "anchor", "bike", "head"));
    expect(foreign.result.current.available).toBe(false); await act(async () => foreign.result.current.start()); expect(mocks.load).toHaveBeenCalledTimes(1);
  });
});

it('changes policy scope without fetching and discards a late response from the old policy', async () => {
  let resolve!: (value: ActivityMatchedRouteGroupResponse) => void;
  mocks.load.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const hook = renderHook(({ observed }) => useActivityMatchedRouteGroups('owner', 'anchor', 'run', 'head', observed ? 'observed_native' : 'complete'), { initialProps: { observed: false } });
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.start(); });
  hook.rerender({ observed: true });
  await act(async () => { resolve(page()); await pending; });
  expect(hook.result.current.pages).toEqual([]);
  expect(mocks.load).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.start());
  expect(mocks.load.mock.calls[1]![2]).toMatchObject({ geometryPolicy: 'observed_native' });
});

it('keeps observed policy on each explicitly requested page', async () => {
  mocks.load.mockResolvedValueOnce(page(true)).mockResolvedValueOnce(page(false, true));
  const hook = renderHook(() => useActivityMatchedRouteGroups('owner', 'anchor', 'run', 'head', 'observed_native'));
  await act(async () => hook.result.current.start());
  await act(async () => hook.result.current.loadMore());
  expect(mocks.load.mock.calls.map(call => call[2].geometryPolicy)).toEqual(['observed_native', 'observed_native']);
  expect(mocks.load.mock.calls[1]![2].cursor).toBe(page(true).nextCursor);
});

 it("clears same-UID replaced-session pages and rejects its pending response", async () => {
  const view = renderHook(() => useActivityMatchedRouteGroups("owner", "anchor", "bike", "head"));
  await act(async () => { await view.result.current.start(); });
  expect(view.result.current.pages).toHaveLength(1);
  let resolve!: (value: ReturnType<typeof page>) => void;
  mocks.load.mockImplementation(() => new Promise(r => { resolve = r; }));
  let pending!: Promise<void>; act(() => { pending = view.result.current.start(); });
  act(() => { mocks.services.auth.currentUser = { uid: "owner", isAnonymous: false }; mocks.observer?.(mocks.services.auth.currentUser); });
  expect(view.result.current.pages).toEqual([]);
  await act(async () => { resolve(page()); await pending; });
  expect(view.result.current.pages).toEqual([]);
  expect(view.result.current.status).toBe("idle");
 });
 it("invalidates accepted results after an activity edit", async () => {
  const view = renderHook(() => useActivityMatchedRouteGroups("owner", "anchor", "bike", "head"));
  await act(async () => { await view.result.current.start(); });
  act(() => window.dispatchEvent(new Event("orider:activity-content-changed")));
  expect(view.result.current.pages).toEqual([]); expect(view.result.current.status).toBe("invalidated");
 });

it("reports an unconfigured backend as unavailable rather than invalidated", async () => {
  mocks.load.mockResolvedValueOnce(page(true)).mockRejectedValueOnce({ code: "functions/failed-precondition", details: { reason: "route_backend_unavailable" } });
  const hook = renderHook(() => useActivityMatchedRouteGroups("owner", "anchor", "bike", "head"));
  await act(async () => hook.result.current.start());
  await act(async () => hook.result.current.loadMore());
  expect(hook.result.current.status).toBe("unsupported");
  expect(hook.result.current.pages).toEqual([]);
  expect(mocks.load).toHaveBeenCalledTimes(2);
});
