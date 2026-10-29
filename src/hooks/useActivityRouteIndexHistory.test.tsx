import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRouteIndexPageResponse } from "@shared/activity-route-index-page";
import { useActivityRouteIndexHistory } from "./useActivityRouteIndexHistory";
const mocks = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null,
  services: { auth: { currentUser: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null } }, available: true, load: vi.fn(),
  observer: null as null | ((user: { uid: string; isAnonymous: boolean } | null) => void) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_: unknown, callback: typeof mocks.observer) => { mocks.observer = callback; return vi.fn(); } }));
vi.mock("../services/activityRouteEvidence", () => ({ observedRouteAvailable: () => mocks.available }));
vi.mock("../services/activityRouteIndexPage", () => ({ ROUTE_INDEX_SCAN_CAP: 5000, validActivityRouteIndexPageRequest: () => true, loadActivityRouteIndexPage: mocks.load }));
const now = 1791792000000;
const page = (more = false): ActivityRouteIndexPageResponse => ({ mode: "route_index_page", anchorActivityId: "anchor", state: "no_forward_candidates_in_scanned_page", reason: null,
  readTime: { seconds: now / 1000, nanoseconds: 0 }, expiresAt: now + 1800000, searchScope: { kind: "stored_index_start_latitude_band", queryPolicyVersion: "start-latitude-band-v1" },
  scannedCount: 1, pageScannedCount: 1, queryFetchedCount: more ? 2 : 1, geometryPrefilteredCount: 0, sourceValidatedCount: 0, exhausted: !more, scanCapReached: false, candidates: [], omitted: [],
  nextCursor: more ? { readTime: { seconds: now / 1000, nanoseconds: 0 }, anchorPrivateSourceRevision: "a".repeat(64), policyVersion: "observed-route-index-v1", queryPolicyVersion: "start-latitude-band-v1", after: { startLatitude: 37, activityId: "candidate" }, scannedCount: 1, requestBinding: "b".repeat(64) } : null,
  io: { documents: 10, metadata: 0, writes: 0, rawDownloads: 0 }, limitations: ["direct_anchor_only", "scanned_page_only", "source_geo_quality_unknown", "gcs_firestore_non_atomic"] });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); mocks.user = { uid: "owner", isAnonymous: false }; mocks.services = { auth: { currentUser: { ...mocks.user } } }; mocks.available = true; mocks.load.mockReset().mockResolvedValue(page()); });
afterEach(() => vi.useRealTimers());
describe("manual route index history privacy", () => {
  it("has no initial or scope-change call; one click is one page and concurrent clicks are ignored", async () => {
    let resolve!: (value: ActivityRouteIndexPageResponse) => void; mocks.load.mockImplementation(() => new Promise(r => { resolve = r; }));
    const hook = renderHook(({ head }) => useActivityRouteIndexHistory("owner", "anchor", "run", head), { initialProps: { head: "one" } });
    expect(mocks.load).not.toHaveBeenCalled(); let first!: Promise<void>;
    act(() => { first = hook.result.current.start(); void hook.result.current.start(); });
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(mocks.services, "owner", { mode: "route_index_page", anchorActivityId: "anchor", discipline: "run" });
    await act(async () => { resolve(page()); await first; }); expect(hook.result.current.pages).toHaveLength(1);
    hook.rerender({ head: "two" }); expect(hook.result.current.pages).toEqual([]); expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("hides accepted data immediately on anchor/head ABA and discards older late responses", async () => {
    const resolvers: Array<(value: ActivityRouteIndexPageResponse) => void> = []; mocks.load.mockImplementation(() => new Promise(r => resolvers.push(r)));
    const hook = renderHook(({ id, head }) => useActivityRouteIndexHistory("owner", id, "bike", head), { initialProps: { id: "A", head: "one" } });
    let old!: Promise<void>; act(() => { old = hook.result.current.start(); });
    hook.rerender({ id: "B", head: "one" }); hook.rerender({ id: "A", head: "one" });
    await act(async () => { resolvers[0]!(page()); await old; }); expect(hook.result.current.pages).toEqual([]);
    await act(async () => { const newer = hook.result.current.start(); resolvers[1]!(page()); await newer; }); expect(hook.result.current.pages).toHaveLength(1);
    hook.rerender({ id: "A", head: "two" }); expect(hook.result.current.pages).toEqual([]); expect(hook.result.current.status).toBe("idle");
  });
  it("SDK account ABA clears results even when activity/context owner are unchanged", async () => {
    const hook = renderHook(() => useActivityRouteIndexHistory("owner", "anchor", "run", "head"));
    await act(async () => hook.result.current.start()); expect(hook.result.current.pages).toHaveLength(1);
    act(() => { mocks.services.auth.currentUser = { uid: "other", isAnonymous: false }; mocks.observer!(mocks.services.auth.currentUser); mocks.services.auth.currentUser = { uid: "owner", isAnonymous: false }; mocks.observer!(mocks.services.auth.currentUser); });
    expect(hook.result.current.pages).toEqual([]); expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("uses the full returned cursor only for a manual next page and preserves partial data on transient failure", async () => {
    mocks.load.mockResolvedValueOnce(page(true)).mockRejectedValueOnce(new Error("network"));
    const hook = renderHook(() => useActivityRouteIndexHistory("owner", "anchor", "run", "head"));
    await act(async () => hook.result.current.start()); expect(hook.result.current.status).toBe("partial"); expect(mocks.load).toHaveBeenCalledTimes(1);
    await act(async () => hook.result.current.loadMore()); expect(hook.result.current.status).toBe("error"); expect(hook.result.current.pages).toHaveLength(1);
    expect(mocks.load.mock.calls[1]![2].cursor).toEqual(page(true).nextCursor);
    mocks.load.mockResolvedValueOnce({ ...page(), scannedCount: 2 }); await act(async () => hook.result.current.loadMore()); expect(hook.result.current.status).toBe("complete");
  });
  it("expires without reads, clears changed input, and requires a new explicit start", async () => {
    const hook = renderHook(() => useActivityRouteIndexHistory("owner", "anchor", "run", "head"));
    await act(async () => hook.result.current.start()); act(() => vi.advanceTimersByTime(1800000));
    expect(hook.result.current.status).toBe("expired"); expect(hook.result.current.pages).toEqual([]); expect(mocks.load).toHaveBeenCalledTimes(1);
    mocks.load.mockResolvedValueOnce({ ...page(), state: "changed_input", reason: "changed_input" }); await act(async () => hook.result.current.start());
    expect(hook.result.current.status).toBe("invalidated"); expect(hook.result.current.pages).toEqual([]);
  });
  it("discards a response after unmount and refuses anonymous/foreign context without calls", async () => {
    let resolve!: (value: ActivityRouteIndexPageResponse) => void; mocks.load.mockImplementation(() => new Promise(r => { resolve = r; }));
    const hook = renderHook(() => useActivityRouteIndexHistory("owner", "anchor", "bike", "head")); let pending!: Promise<void>; act(() => { pending = hook.result.current.start(); }); hook.unmount(); await act(async () => { resolve(page()); await pending; });
    mocks.user = { uid: "other", isAnonymous: false }; const foreign = renderHook(() => useActivityRouteIndexHistory("owner", "anchor", "bike", "head"));
    expect(foreign.result.current.available).toBe(false); await act(async () => foreign.result.current.start()); expect(mocks.load).toHaveBeenCalledTimes(1);
  });
});

 it("clears same-UID replaced-session pages and rejects its pending response", async () => {
  const view = renderHook(() => useActivityRouteIndexHistory("owner", "anchor", "bike", "head"));
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
  const view = renderHook(() => useActivityRouteIndexHistory("owner", "anchor", "bike", "head"));
  await act(async () => { await view.result.current.start(); });
  act(() => window.dispatchEvent(new Event("orider:activity-content-changed")));
  expect(view.result.current.pages).toEqual([]); expect(view.result.current.status).toBe("invalidated");
 });
