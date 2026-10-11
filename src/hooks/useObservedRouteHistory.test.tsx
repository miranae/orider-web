import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareObservedRoutes } from "@shared/observed-route-comparison";
import type { RouteWorkerRequest, RouteWorkerResponse } from "../utils/observedRouteComparison.worker";
import { routeResponse } from "../services/activityRouteEvidence.fixture";
import { observedHistoryActivity } from "../features/activity/detail/observedRouteHistory.fixture";
import { useObservedRouteHistory } from "./useObservedRouteHistory";
const mocks = vi.hoisted(() => ({ uid: "owner", anonymous: false, services: { auth: { currentUser: { uid: "owner", isAnonymous: false } } }, load: vi.fn(), listener: null as null | ((user: { uid: string; isAnonymous: boolean } | null) => void) }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: typeof mocks.listener) => { mocks.listener = callback; return () => { mocks.listener = null; }; } }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid, isAnonymous: mocks.anonymous } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/activityRouteEvidence", async original => ({ ...await original<typeof import("../services/activityRouteEvidence")>(), observedRouteAvailable: () => true, loadActivityRouteEvidence: (...args: unknown[]) => mocks.load(...args) }));
const workers: FakeWorker[] = [];
class FakeWorker {
  static automatic = true;
  onmessage: ((event: MessageEvent<RouteWorkerResponse>) => void) | null = null; onerror: (() => void) | null = null; terminated = false; message: RouteWorkerRequest | null = null;
  constructor() { workers.push(this); }
  postMessage(message: RouteWorkerRequest) { this.message = message; queueMicrotask(() => { if (FakeWorker.automatic && !this.terminated) this.onmessage?.({ data: { requestId: message.requestId, result: compareObservedRoutes(...message.routes) } } as MessageEvent<RouteWorkerResponse>); }); }
  terminate() { this.terminated = true; }
}
const anchor = observedHistoryActivity("anchor"), selected = [1, 2, 3].map(i => observedHistoryActivity(`pick${i}`, i));
beforeEach(() => { mocks.uid = "owner"; mocks.anonymous = false; mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } }; mocks.listener = null; workers.length = 0; FakeWorker.automatic = true; mocks.load.mockReset().mockImplementation((_services, _uid, id) => Promise.resolve(routeResponse(id))); vi.stubGlobal("Worker", FakeWorker); });
describe("bounded manual observed route history", () => {
  it("hides completed observations immediately on SDK-owner mismatch or services replacement", async () => {
    const { result, rerender } = renderHook(() => useObservedRouteHistory(anchor, selected, "one"));
    await act(async () => { await result.current.inspect(); }); expect(result.current.rows).toHaveLength(3);
    mocks.services.auth.currentUser.uid = "other"; rerender(); expect(result.current.rows).toHaveLength(0); expect(result.current.ownerAvailable).toBe(false);
    mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } }; rerender(); expect(result.current.rows).toHaveLength(0); expect(mocks.load).toHaveBeenCalledTimes(4);
  });

  it("terminates a pending Worker on unmount and never reads remaining activities", async () => {
    FakeWorker.automatic = false;
    const { result, unmount } = renderHook(() => useObservedRouteHistory(anchor, selected, "one")); let pending!: Promise<void>;
    act(() => { pending = result.current.inspect(); }); await waitFor(() => expect(workers).toHaveLength(1));
    unmount(); await pending; expect(workers[0]!.terminated).toBe(true); expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid Worker output and isolates it without rerunning the kernel on the main thread", async () => {
    FakeWorker.automatic = false;
    const { result } = renderHook(() => useObservedRouteHistory(anchor, selected.slice(0, 1), "one")); let pending!: Promise<void>;
    act(() => { pending = result.current.inspect(); }); await waitFor(() => expect(workers).toHaveLength(1));
    const worker = workers[0]!, request = worker.message!;
    await act(async () => { worker.onmessage!({ data: { requestId: request.requestId, result: { algorithmVersion: "bad" } } } as unknown as MessageEvent<RouteWorkerResponse>); await pending; });
    expect(result.current.rows[0]?.state).toBe("error"); expect(result.current.rows[0]?.result).toBeNull(); expect(worker.terminated).toBe(true);
  });
  it("discards late anchor response after selection ABA without further downloads", async () => {
    let resolve!: (value: unknown) => void; mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(({ picks }) => useObservedRouteHistory(anchor, picks, "one"), { initialProps: { picks: selected } }); let pending!: Promise<void>;
    act(() => { pending = result.current.inspect(); }); rerender({ picks: selected.slice(0, 1) }); rerender({ picks: selected });
    await act(async () => { resolve(routeResponse("anchor")); await pending; });
    expect(result.current.rows).toHaveLength(0); expect(workers).toHaveLength(0); expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("mounts with0calls, reads anchor once/max3 sequentially, suppresses duplicate action and terminates3workers", async () => {
    const { result } = renderHook(() => useObservedRouteHistory(anchor, selected, "metrics1"));
    expect(mocks.load).not.toHaveBeenCalled();
    await act(async () => { await Promise.all([result.current.inspect(), result.current.inspect()]); });
    expect(mocks.load.mock.calls.map(call => call[2])).toEqual(["anchor", "pick1", "pick2", "pick3"]);
    expect(result.current.state).toBe("ready"); expect(result.current.rows).toHaveLength(3); expect(result.current.readCount).toBe(4);
    expect(workers.every(w => w.terminated)).toBe(true); expect(workers).toHaveLength(3);
    await act(async () => { await result.current.inspect(); }); expect(mocks.load).toHaveBeenCalledTimes(8);
  });
  it("isolates individual failure without retry, keeps next pair direct to same anchor", async () => {
    mocks.load.mockImplementation((_s, _u, id) => id === "pick2" ? Promise.reject(new Error("missing")) : Promise.resolve(routeResponse(id)));
    const { result } = renderHook(() => useObservedRouteHistory(anchor, selected, "metrics1"));
    await act(async () => { await result.current.inspect(); });
    expect(result.current.rows.map(row => row.state)).toEqual(["available", "error", "available"]);
    expect(workers.map(w => w.message?.routes.map(r => r.activityId))).toEqual([["anchor", "pick1"], ["anchor", "pick3"]]); expect(mocks.load).toHaveBeenCalledTimes(4);
  });
  it("stops after unavailable anchor, read1 and noncompared selected entries", async () => {
    mocks.load.mockResolvedValue({ ...routeResponse("anchor"), state: "pending", route: null, reason: "incomplete_input" });
    const { result } = renderHook(() => useObservedRouteHistory(anchor, selected, "metrics1")); await act(async () => { await result.current.inspect(); });
    expect(mocks.load).toHaveBeenCalledTimes(1); expect(workers).toHaveLength(0); expect(result.current.readCount).toBe(1); expect(result.current.rows.every(row => row.result === null && row.state === "pending")).toBe(true);
  });
  it("keeps semantically identical objects visible, but sourcehead/metrics/selection ABA invalidates without reads", async () => {
    const { result, rerender } = renderHook(({ a, picks, metric }) => useObservedRouteHistory(a, picks, metric), { initialProps: { a: anchor, picks: selected, metric: "one" } });
    await act(async () => { await result.current.inspect(); });
    rerender({ a: { ...anchor, summary: { ...anchor.summary } }, picks: selected.map(a => ({ ...a, summary: { ...a.summary } })), metric: "one" }); expect(result.current.rows).toHaveLength(3);
    rerender({ a: anchor, picks: [...selected].reverse(), metric: "one" }); expect(result.current.rows).toHaveLength(3); expect(mocks.load).toHaveBeenCalledTimes(4);
    rerender({ a: { ...anchor, contentRevision: 2 }, picks: selected, metric: "one" }); expect(result.current.rows).toHaveLength(0);
    rerender({ a: anchor, picks: selected, metric: "one" }); expect(result.current.rows).toHaveLength(0); expect(mocks.load).toHaveBeenCalledTimes(4);
    await act(async () => { await result.current.inspect(); }); rerender({ a: anchor, picks: selected, metric: "two" }); expect(result.current.rows).toHaveLength(0); expect(mocks.load).toHaveBeenCalledTimes(8);
  });
  it("blocks owner mismatch/anonymous and invalidates auth SDK ABA even before context catches up", async () => {
    let resolve!: (value: unknown) => void; mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(() => useObservedRouteHistory(anchor, selected, "one")); let pending!: Promise<void>; act(() => { pending = result.current.inspect(); });
    act(() => { mocks.services.auth.currentUser.uid = "other"; mocks.listener?.({ uid: "other", isAnonymous: false }); mocks.services.auth.currentUser.uid = "owner"; mocks.listener?.({ uid: "owner", isAnonymous: false }); });
    await act(async () => { resolve(routeResponse("anchor")); await pending; }); expect(workers).toHaveLength(0); expect(result.current.rows).toHaveLength(0); expect(mocks.load).toHaveBeenCalledTimes(1);
    mocks.uid = "other"; rerender(); expect(result.current.ownerAvailable).toBe(false); await act(async () => { await result.current.inspect(); }); expect(mocks.load).toHaveBeenCalledTimes(1);
    mocks.uid = "owner"; mocks.anonymous = true; rerender(); expect(result.current.enabled).toBe(false);
  });
});
