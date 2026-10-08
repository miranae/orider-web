import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  firestore: { name: "test" },
  onSnapshot: vi.fn(() => vi.fn()),
  doc: vi.fn(() => ({ path: "users/user-1/fitness/timeseries_bike" })),
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  onSnapshot: mocks.onSnapshot,
}));

vi.mock("../contexts/FirebaseServicesContext", () => ({
  useFirebaseServices: () => ({ firestore: mocks.firestore }),
}));

vi.mock("../services/errorLogger", () => ({
  logClientError: vi.fn(),
}));

import { useFitnessTimeseries } from "./useFitnessTimeseries";
import { clearTrainingSurfaceCache, prepareTrainingSurfaceCacheOwner, setTrainingSurfaceCache } from "../embedded/trainingSurfaceCache";

describe("useFitnessTimeseries retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onSnapshot.mockImplementation(() => vi.fn());
  });

  it("reload key change unsubscribes the terminal listener and subscribes again", () => {
    const firstUnsubscribe = vi.fn();
    const secondUnsubscribe = vi.fn();
    mocks.onSnapshot
      .mockReturnValueOnce(firstUnsubscribe)
      .mockReturnValueOnce(secondUnsubscribe);
    const { rerender, unmount } = renderHook(
      ({ reloadKey }) => useFitnessTimeseries("user-1", "bike", reloadKey),
      { initialProps: { reloadKey: 0 } },
    );

    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
    rerender({ reloadKey: 1 });

    expect(firstUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(2);
    unmount();
    expect(secondUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("ignores late success and error callbacks from an inactive generation", () => {
    type SnapshotCallback = (snapshot: { exists: () => boolean; data: () => unknown }) => void;
    type ErrorCallback = (error: Error) => void;
    const callbacks: Array<{ success: SnapshotCallback; error: ErrorCallback }> = [];
    mocks.onSnapshot.mockImplementation((_ref, success, error) => {
      callbacks.push({
        success: success as SnapshotCallback,
        error: error as ErrorCallback,
      });
      return vi.fn();
    });
    const hook = renderHook(
      ({ discipline }) => useFitnessTimeseries("user-1", discipline, 0),
      { initialProps: { discipline: "bike" as "bike" | "run" } },
    );
    const staleCallbacks = callbacks.at(-1)!;

    hook.rerender({ discipline: "run" });
    const currentCallbacks = callbacks.at(-1)!;
    expect(currentCallbacks).not.toBe(staleCallbacks);
    act(() => {
      staleCallbacks.success({
        exists: () => true,
        data: () => ({ discipline: "bike", points: [{ date: "stale" }] }),
      });
      staleCallbacks.error(new Error("stale"));
    });
    expect(hook.result.current.timeseries).toBeNull();
    expect(hook.result.current.error).toBeNull();

    hook.unmount();
    act(() => currentCallbacks.success({
      exists: () => true,
      data: () => ({ discipline: "run", points: [{ date: "after-unmount" }] }),
    }));
  });
});


describe("useFitnessTimeseries visibility", () => {
  it("구독 해제 후 캐시를 유지하고 복귀 첫 스냅샷 전에도 차트를 유지한다", () => {
    const unsubscribe = vi.fn();
    type Snapshot = { exists: () => boolean; data: () => unknown };
    const callbacks: Array<(snapshot: Snapshot) => void> = [];
    mocks.onSnapshot.mockImplementation((_ref, success) => {
      callbacks.push(success as (snapshot: Snapshot) => void);
      return unsubscribe;
    });
    const hook = renderHook(({ active }) => useFitnessTimeseries("user-1", "bike", 0, undefined, false, active),
      { initialProps: { active: true } });
    const cached = { discipline: "bike", points: [{ date: "2026-10-08" }] };
    act(() => callbacks.at(-1)!({ exists: () => true, data: () => cached }));
    hook.rerender({ active: false });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(hook.result.current.timeseries).toBe(cached);
    hook.rerender({ active: true });
    expect(hook.result.current.timeseries).toBe(cached);
    expect(hook.result.current.loaded).toBe(true);
    act(() => callbacks.at(-1)!({ exists: () => true, data: () => ({ ...cached, computedAt: 123 }) }));
    expect(hook.result.current.timeseries?.computedAt).toBe(123);
  });

  it("숨은 상태에서 계정이 바뀌면 이전 시계열을 즉시 가린다", () => {
    type Snapshot = { exists: () => boolean; data: () => unknown };
    let callback: (snapshot: Snapshot) => void = () => {};
    mocks.onSnapshot.mockImplementation((_ref, success) => {
      callback = success as typeof callback;
      return vi.fn();
    });
    const hook = renderHook(({ uid, active }) => useFitnessTimeseries(uid, "bike", 0, undefined, false, active),
      { initialProps: { uid: "user-1", active: true } });
    act(() => callback({ exists: () => true, data: () => ({ discipline: "bike", points: [] }) }));
    hook.rerender({ uid: "user-2", active: false });
    expect(hook.result.current.timeseries).toBeNull();
  });
});


it("최초 snapshot 전 캐시만 주입된 상태의 hidden 계정 전환도 이전 데이터를 지운다", () => {
  clearTrainingSurfaceCache();
  prepareTrainingSurfaceCacheOwner("cache-owner-a");
  const cached = { discipline: "bike", points: [{ date: "2026-10-08" }] };
  setTrainingSurfaceCache({ uid: "cache-owner-a", surface: "fitness-timeseries", sport: "bike", locale: "ko" }, { timeseries: cached });
  mocks.onSnapshot.mockImplementation(() => vi.fn());
  const hook = renderHook(({ uid, active }) => useFitnessTimeseries(uid, "bike", 0, "ko", false, active),
    { initialProps: { uid: "cache-owner-a", active: true } });
  expect(hook.result.current.timeseries).toEqual(cached);
  hook.rerender({ uid: "cache-owner-b", active: false });
  expect(hook.result.current.timeseries).toBeNull();
  clearTrainingSurfaceCache();
});
