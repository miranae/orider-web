import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALE_THRESHOLD_MS } from "@shared/training/staleness";
import { nextFitnessClockDelay, useFitnessClock } from "./useFitnessClock";

afterEach(() => vi.useRealTimers());

describe("useFitnessClock", () => {
  it("ticks at the next local midnight so rolling windows are recalculated", () => {
    vi.useFakeTimers();
    const beforeMidnight = new Date(2026, 6, 14, 23, 59, 59, 900);
    vi.setSystemTime(beforeMidnight);
    const { result } = renderHook(() => useFitnessClock());

    act(() => vi.advanceTimersByTime(100));

    expect(result.current).toBe(beforeMidnight.getTime() + 100);
  });

  it("schedules an earlier refresh when UserFitness reaches the shared stale threshold", () => {
    const now = new Date(2026, 6, 14, 10, 0, 0).getTime();
    const updatedAt = now - STALE_THRESHOLD_MS + 5_000;

    expect(nextFitnessClockDelay(now, updatedAt)).toBe(5_001);
  });

  it("advances immediately when UserFitness or the activity refresh key changes without accumulating timers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 14, 10, 0, 0));
    const { result, rerender } = renderHook(
      ({ updatedAt, refreshKey }) => useFitnessClock(updatedAt, refreshKey),
      { initialProps: { updatedAt: 1_000, refreshKey: "1:1000" } },
    );
    const initial = result.current;

    act(() => {
      vi.setSystemTime(new Date(2026, 6, 14, 10, 5, 0));
      rerender({ updatedAt: 1_000, refreshKey: "2:2000" });
    });
    const afterActivity = result.current;

    act(() => {
      vi.setSystemTime(new Date(2026, 6, 14, 10, 10, 0));
      rerender({ updatedAt: 2_000, refreshKey: "2:2000" });
    });

    expect(afterActivity).toBeGreaterThan(initial);
    expect(result.current).toBeGreaterThan(afterActivity);
    expect(vi.getTimerCount()).toBe(1);
  });
});
