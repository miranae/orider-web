import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareObservedRoutes } from "@shared/observed-route-comparison";
import type { Activity } from "@shared/types";
import { routeResponse } from "../services/activityRouteEvidence.fixture";
import { useObservedRouteComparison } from "./useObservedRouteComparison";
const mocks = vi.hoisted(() => ({ uid: "owner", services: { auth: { currentUser: { uid: "owner", isAnonymous: false } } }, load: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid, isAnonymous: false } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/activityRouteEvidence", async original => ({ ...await original<typeof import("../services/activityRouteEvidence")>(), observedRouteAvailable: () => true, loadActivityRouteEvidence: (...args: unknown[]) => mocks.load(...args) }));
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;
  message: any;
  terminated = false;
  constructor() { workers.push(this); }
  postMessage(message: any) { this.message = message; }
  terminate() { this.terminated = true; }
}
const activity = (id: string) => ({ id, userId: "owner", type: "Run", startTime: 1000, summary: {} }) as Activity;
const first = activity("first"), second = activity("second"), third = activity("third");
beforeEach(() => { mocks.uid = "owner"; mocks.services.auth.currentUser.uid = "owner"; workers.length = 0; mocks.load.mockReset().mockImplementation((_services, _uid, id) => Promise.resolve(routeResponse(id))); vi.stubGlobal("Worker", FakeWorker); });
describe("manual paired route comparison scope", () => {
  it("loads zero on mount/selection and exactly two after explicit action; guards old Worker ABA", async () => {
    const { result, rerender, unmount } = renderHook(({ previous }) => useObservedRouteComparison(first, previous), { initialProps: { previous: second } });
    expect(mocks.load).not.toHaveBeenCalled();
    await act(async () => { await result.current.compare(); });
    expect(mocks.load).toHaveBeenCalledTimes(2);
    const old = workers[0]!, callback = old.onmessage!, message = old.message;
    const value = compareObservedRoutes(message.routes[0], message.routes[1]);
    act(() => callback({ data: { requestId: message.requestId, result: value } }));
    expect(result.current.state).toBe("available");
    rerender({ previous: third }); expect(result.current.result).toBeNull();
    rerender({ previous: second }); expect(result.current.result).toBeNull();
    act(() => callback({ data: { requestId: message.requestId, result: value } }));
    expect(result.current.result).toBeNull(); expect(mocks.load).toHaveBeenCalledTimes(2);
    await act(async () => { await result.current.compare(); });
    expect(mocks.load).toHaveBeenCalledTimes(4);
    const current = workers[1]!; unmount(); expect(current.terminated).toBe(true);
  });
  it("ignores delayed request after ABA and hides private output immediately on account change", async () => {
    let resolve!: (value: unknown) => void;
    mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(({ previous }) => useObservedRouteComparison(first, previous), { initialProps: { previous: second } });
    let request!: Promise<void>;
    act(() => { request = result.current.compare(); });
    rerender({ previous: third }); rerender({ previous: second });
    await act(async () => { resolve(routeResponse()); await request; });
    expect(workers).toHaveLength(0); expect(result.current.state).toBe("idle");
    await act(async () => { await result.current.compare(); });
    const instance = workers[0]!, message = instance.message;
    act(() => instance.onmessage!({ data: { requestId: message.requestId, result: compareObservedRoutes(...message.routes as [any, any]) } }));
    expect(result.current.result).not.toBeNull();
    mocks.uid = "other"; mocks.services.auth.currentUser.uid = "other"; rerender({ previous: second });
    expect(result.current.enabled).toBe(false); expect(result.current.result).toBeNull();
  });
  it("invalidates an observed activity revision immediately without new reads", async () => {
    const source = activity("first");
    const { result, rerender } = renderHook(() => useObservedRouteComparison(source, second));
    await act(async () => { await result.current.compare(); });
    const instance = workers[0]!, message = instance.message;
    act(() => instance.onmessage!({ data: { requestId: message.requestId, result: compareObservedRoutes(...message.routes as [any, any]) } }));
    expect(result.current.result).not.toBeNull();
    source.contentRevision = 2; rerender();
    expect(result.current.result).toBeNull(); expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("does not create Worker or auto retry when one GPS input is pending", async () => {
    mocks.load.mockResolvedValueOnce({ ...routeResponse(), state: "pending", reason: "incomplete_input", route: null });
    const { result } = renderHook(() => useObservedRouteComparison(first, second));
    await act(async () => { await result.current.compare(); });
    expect(result.current.state).toBe("pending"); expect(workers).toHaveLength(0); expect(mocks.load).toHaveBeenCalledTimes(2);
  });
});
