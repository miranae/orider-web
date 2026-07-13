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
});
