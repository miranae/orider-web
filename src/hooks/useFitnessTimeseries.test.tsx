import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(() => vi.fn()),
  doc: vi.fn(() => ({ path: "users/user-1/fitness/timeseries_bike" })),
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  onSnapshot: mocks.onSnapshot,
}));

vi.mock("../contexts/FirebaseServicesContext", () => ({
  useFirebaseServices: () => ({ firestore: { name: "test" } }),
}));

vi.mock("../services/errorLogger", () => ({
  logClientError: vi.fn(),
}));

import { useFitnessTimeseries } from "./useFitnessTimeseries";

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
