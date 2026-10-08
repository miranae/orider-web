import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFitnessCurves } from "./useFitnessCurves";

interface Snapshot {
  exists: () => boolean;
  data: () => unknown;
  metadata: { fromCache: boolean };
}
const mocks = vi.hoisted(() => ({
  subscriptions: [] as Array<{
    ref: string; next: (snapshot: Snapshot) => void; error: () => void; unsubscribe: ReturnType<typeof vi.fn>;
  }>,
  firestore: {}, functions: {},
  initialSnapshot: undefined as Snapshot | undefined,
  ensureAppCheckReady: vi.fn(), callable: vi.fn(), getDoc: vi.fn(), log: vi.fn(),
  doc: vi.fn((_db, ...segments: string[]) => segments.join("/")),
  httpsCallable: vi.fn(),
}));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks }));
vi.mock("../../services/errorLogger", () => ({ logClientError: mocks.log }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.httpsCallable }));
vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  onSnapshot: vi.fn((ref, _options, next, error) => {
    const unsubscribe = vi.fn();
    mocks.subscriptions.push({ ref, next, error, unsubscribe });
    if (mocks.initialSnapshot) next(mocks.initialSnapshot);
    return unsubscribe;
  }),
}));

const empty = { run: { recent28: [], prev28: [] }, swim: { recent28: [], prev28: [] } };
function snapshot(discipline: "run" | "swim", pace?: number): Snapshot {
  return {
    exists: () => true, metadata: { fromCache: false },
    data: () => ({
      version: 1, discipline, windowDays: 56, maxEntries: 256,
      generation: 1, updatedAt: Date.now(), truncated: false,
      entries: pace === undefined ? [] : [{ activityId: "ride", startTime: Date.now(), curve: [
        discipline === "run" ? { durationSec: 60, paceSecPerKm: pace } : { distanceM: 100, paceSecPer100m: pace },
      ] }],
    }),
  };
}
const missing = (fromCache = false): Snapshot => ({
  exists: () => false, data: () => undefined, metadata: { fromCache },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useFitnessCurves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscriptions = [];
    mocks.initialSnapshot = undefined;
    mocks.ensureAppCheckReady.mockResolvedValue(undefined);
    mocks.callable.mockResolvedValue({ data: {} });
    mocks.httpsCallable.mockReturnValue(mocks.callable);
    mocks.getDoc.mockImplementation(async (ref: string) => snapshot(ref.endsWith("pace_run") ? "run" : "swim", 100));
  });

  it("숨김은 구독만 해제하고 같은 owner 커브를 유지하며 복귀 시 최신 값으로 갱신한다", () => {
    const hook = renderHook(({ uid, active }) => useFitnessCurves(uid, active),
      { initialProps: { uid: "owner", active: true } });
    act(() => mocks.subscriptions[0].next(snapshot("run", 300)));
    hook.rerender({ uid: "owner", active: false });
    expect(mocks.subscriptions.every(subscription => subscription.unsubscribe.mock.calls.length === 1)).toBe(true);
    expect(hook.result.current.run.recent28).toEqual([{ durationSec: 60, paceSecPerKm: 300 }]);
    act(() => mocks.subscriptions[0].next(snapshot("run", 200)));
    expect(hook.result.current.run.recent28[0].paceSecPerKm).toBe(300);
    hook.rerender({ uid: "owner", active: true });
    expect(mocks.subscriptions).toHaveLength(4);
    expect(hook.result.current.run.recent28[0].paceSecPerKm).toBe(300);
    act(() => mocks.subscriptions[2].next(snapshot("run", 250)));
    expect(hook.result.current.run.recent28[0].paceSecPerKm).toBe(250);
    hook.rerender({ uid: "owner", active: false });
    hook.rerender({ uid: "other", active: false });
    expect(hook.result.current).toEqual(empty);
    expect(mocks.subscriptions).toHaveLength(4);
    act(() => mocks.subscriptions[2].next(snapshot("run", 100)));
    expect(hook.result.current).toEqual(empty);
    hook.rerender({ uid: "other", active: true });
    expect(mocks.subscriptions).toHaveLength(6);
    expect(mocks.subscriptions[4].ref).toBe("users/other/fitness/pace_run");
  });

  it("숨긴 상태에서 마운트하면 읽기를 시작하지 않는다", () => {
    renderHook(() => useFitnessCurves("owner", false));
    expect(mocks.subscriptions).toHaveLength(0);
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("App Check 대기 중 숨겨지면 불필요한 backfill 호출을 시작하지 않는다", async () => {
    const readiness = deferred<void>();
    mocks.ensureAppCheckReady.mockReturnValue(readiness.promise);
    const hook = renderHook(({ active }) => useFitnessCurves("owner", active),
      { initialProps: { active: true } });
    act(() => mocks.subscriptions[0].next(missing()));
    await waitFor(() => expect(mocks.ensureAppCheckReady).toHaveBeenCalledTimes(1));
    hook.rerender({ active: false });
    await act(async () => readiness.resolve());
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("reads only the two owner curve documents with injected services, and accepts valid empty curves", () => {
    const { result } = renderHook(() => useFitnessCurves("owner"));
    expect(mocks.doc.mock.calls).toEqual([
      [mocks.firestore, "users", "owner", "fitness", "pace_run"],
      [mocks.firestore, "users", "owner", "fitness", "css_swim"],
    ]);
    act(() => {
      mocks.subscriptions[0].next(snapshot("run", 300));
      mocks.subscriptions[1].next(snapshot("swim"));
    });
    expect(result.current.run.recent28).toEqual([{ durationSec: 60, paceSecPerKm: 300 }]);
    expect(result.current.swim).toEqual(empty.swim);
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("calls ensure once when both documents are missing, then explicitly rereads both", async () => {
    const { result } = renderHook(() => useFitnessCurves("owner"));
    act(() => mocks.subscriptions.forEach((subscription) => subscription.next(missing())));
    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledTimes(2));
    expect(mocks.httpsCallable).toHaveBeenCalledWith(mocks.functions, "ensureFitnessCurves");
    expect(mocks.ensureAppCheckReady).toHaveBeenCalledTimes(1);
    expect(mocks.callable).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.run.recent28).toHaveLength(1));
    act(() => mocks.subscriptions.forEach((subscription) => subscription.next(missing())));
    expect(mocks.callable).toHaveBeenCalledTimes(1);
  });

  it("waits for a server absence after an initial cached absence", async () => {
    renderHook(() => useFitnessCurves("owner"));
    act(() => mocks.subscriptions[0].next(missing(true)));
    expect(mocks.callable).not.toHaveBeenCalled();
    act(() => mocks.subscriptions[0].next(missing(false)));
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(1));
  });

  it("shares the callable through StrictMode replay and ignores callbacks after cleanup", async () => {
    mocks.initialSnapshot = missing();
    const { unmount } = renderHook(() => useFitnessCurves("owner"), { reactStrictMode: true });
    expect(mocks.subscriptions).toHaveLength(4);
    expect(mocks.subscriptions.slice(0, 2).every((subscription) => subscription.unsubscribe.mock.calls.length === 1)).toBe(true);
    act(() => mocks.subscriptions.forEach((subscription) => subscription.next(missing())));
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(1));
    unmount();
    act(() => mocks.subscriptions.forEach((subscription) => { subscription.next(missing()); subscription.error(); }));
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.subscriptions.every((subscription) => subscription.unsubscribe.mock.calls.length === 1)).toBe(true);
  });

  it("leaves empty charts and logs privacy-safe failures without retrying", async () => {
    mocks.callable.mockRejectedValue(new Error("private users/owner/path"));
    const { result } = renderHook(() => useFitnessCurves("owner"));
    act(() => mocks.subscriptions[0].next(missing()));
    await waitFor(() => expect(mocks.log).toHaveBeenCalledTimes(1));
    act(() => mocks.subscriptions.forEach((subscription) => subscription.next(missing())));
    expect(result.current).toEqual(empty);
    expect(mocks.callable).toHaveBeenCalledTimes(1);
    expect(mocks.getDoc).not.toHaveBeenCalled();
    expect(mocks.log.mock.calls[0]).toEqual(["useFitnessCurves.ensure", new Error("Fitness curve read failed")]);
  });

  it("does not backfill an invalid existing document", () => {
    const { result } = renderHook(() => useFitnessCurves("owner"));
    act(() => mocks.subscriptions[0].next({ ...snapshot("run"), data: () => ({ version: 9 }) }));
    expect(result.current).toEqual(empty);
    expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("clears the previous account and fences its late callable response", async () => {
    const pending = deferred<unknown>();
    mocks.callable.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ uid }) => useFitnessCurves(uid), { initialProps: { uid: "first" } });
    act(() => {
      mocks.subscriptions[0].next(snapshot("run", 200));
      mocks.subscriptions[1].next(missing());
    });
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(1));
    rerender({ uid: "second" });
    expect(result.current).toEqual(empty);
    act(() => mocks.subscriptions[2].next(snapshot("run", 300)));
    await act(async () => pending.resolve({ data: {} }));
    expect(mocks.getDoc).not.toHaveBeenCalled();
    expect(result.current.run.recent28).toEqual([{ durationSec: 60, paceSecPerKm: 300 }]);
  });

  it("checks the current account after App Check before starting the callable", async () => {
    const pending = deferred<void>();
    mocks.ensureAppCheckReady.mockReturnValueOnce(pending.promise);
    const { rerender } = renderHook(({ uid }) => useFitnessCurves(uid), { initialProps: { uid: "first" } });
    act(() => mocks.subscriptions[0].next(missing()));
    await waitFor(() => expect(mocks.ensureAppCheckReady).toHaveBeenCalledTimes(1));
    rerender({ uid: "second" });
    await act(async () => pending.resolve());
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });

  it("does not replace a newer snapshot with a late explicit reread", async () => {
    const pending = deferred<Snapshot>();
    mocks.getDoc.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useFitnessCurves("owner"));
    act(() => mocks.subscriptions[0].next(missing()));
    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledTimes(2));
    act(() => mocks.subscriptions[0].next(snapshot("run", 250)));
    await act(async () => pending.resolve(snapshot("run", 400)));
    expect(result.current.run.recent28).toEqual([{ durationSec: 60, paceSecPerKm: 250 }]);
  });

  it("returns empty without subscribing when there is no authenticated account", () => {
    const { result } = renderHook(() => useFitnessCurves(null));
    expect(result.current).toEqual(empty);
    expect(mocks.doc).not.toHaveBeenCalled();
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("clears a failed snapshot or reread and logs without passing through private SDK errors", async () => {
    mocks.getDoc.mockRejectedValue(new Error("private users/owner/path"));
    const { result } = renderHook(() => useFitnessCurves("owner"));
    act(() => {
      mocks.subscriptions[0].next(snapshot("run", 250));
      mocks.subscriptions[0].error();
      mocks.subscriptions[1].next(missing());
    });
    await waitFor(() => expect(mocks.log).toHaveBeenCalledTimes(3));
    expect(result.current).toEqual(empty);
    expect(mocks.log.mock.calls.every((call) => call.length === 2 && (call[1] as Error).message === "Fitness curve read failed")).toBe(true);
  });

  it("does not clear a newer snapshot when an earlier explicit reread fails", async () => {
    let reject!: (error: Error) => void;
    mocks.getDoc.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const { result } = renderHook(() => useFitnessCurves("owner"));
    act(() => mocks.subscriptions[0].next(missing()));
    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledTimes(2));
    act(() => {
      mocks.subscriptions[0].next(snapshot("run", 250));
      mocks.subscriptions[1].next(snapshot("swim", 100));
    });
    await act(async () => reject(new Error("private path")));
    expect(result.current.run.recent28).toEqual([{ durationSec: 60, paceSecPerKm: 250 }]);
    expect(result.current.swim.recent28).toEqual([{ distanceM: 100, paceSecPer100m: 100 }]);
    expect(mocks.log).not.toHaveBeenCalled();
  });
});
