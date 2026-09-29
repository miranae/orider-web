import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Goal, PlanDay, PlanWeek } from "@shared/types/goal";
import { resolveRunPlanTarget, useRunPlanTarget } from "./useRunPlanTarget";
const day: PlanDay = { date: Date.parse("2026-10-01T00:00:00+09:00"), dayOfWeek: 4, workout: "easyRun", plannedTSS: 20, plannedDurationMin: 30, completed: false, skipped: false };
const goal = { id: "goal-1", userId: "owner", discipline: "run", status: "active" } as Goal;
const weeks = [{ id: "week-02", weekNumber: 2, phase: "base", startDate: day.date, plannedTSS: 20, days: [day] }] as PlanWeek[];
const params = () => new URLSearchParams({ sport: "run", goalId: goal.id, weekId: weeks[0]!.id, dayIndex: "0", date: "2026-10-01" });
describe("exact read-only running plan target", () => {
  it("resolves the exact owned scheduled day and shared effective facts", () => {
    expect(resolveRunPlanTarget(params(), "owner", goal, weeks)).toMatchObject({ weekIndex: 0, session: { goalId: goal.id, weekId: "week-02", dayIndex: 0, localDate: "2026-10-01", durationMin: 30 } });
  });
  it.each(["goalId", "weekId", "dayIndex", "date", "sport"])("rejects missing or mismatched %s without selecting another day", key => {
    const missing = params(); missing.delete(key);
    expect(resolveRunPlanTarget(missing, "owner", goal, weeks)).toBeNull();
    const mismatch = params(); mismatch.set(key, "wrong");
    expect(resolveRunPlanTarget(mismatch, "owner", goal, weeks)).toBeNull();
  });
  it("rejects public, fulfilled, malformed and non-running references", () => {
    expect(resolveRunPlanTarget(params(), "other", goal, weeks)).toBeNull();
    expect(resolveRunPlanTarget(params(), undefined, goal, weeks)).toBeNull();
    expect(resolveRunPlanTarget(params(), "owner", { ...goal, status: "abandoned" }, weeks)).toBeNull();
    expect(resolveRunPlanTarget(params(), "owner", { ...goal, discipline: "bike" }, weeks)).toBeNull();
    for (const patch of [{ completed: true }, { skipped: true }, { actualActivityId: "finished" }, { adjustedDurationMin: 0 }, { executionWorkoutOverride: "tempoRun" as const }]) {
      expect(resolveRunPlanTarget(params(), "owner", goal, [{ ...weeks[0]!, days: [{ ...day, ...patch }] }])).toBeNull();
    }
  });
  it("keeps missing or malformed saved day arrays neutral", () => {
    for (const days of [undefined, { 0: day }]) {
      const malformed = [{ ...weeks[0]!, days }] as unknown as PlanWeek[];
      expect(resolveRunPlanTarget(params(), "owner", goal, malformed)).toBeNull();
    }
    const onWeekOffset = vi.fn();
    const input = [{ id: "week-broken", days: undefined }, ...weeks] as PlanWeek[];
    const { result } = renderHook(() => useRunPlanTarget(params(), "owner", false, goal, input, false, null, () => false, onWeekOffset));
    expect(result.current.session).toBeNull();
    expect(result.current.unavailable).toBe(true);
    expect(onWeekOffset).not.toHaveBeenCalled();
  });
  it("closes old-owner preview immediately, handles query errors neutrally and never writes", () => {
    const onWeekOffset = vi.fn();
    const today = () => false;
    const { result, rerender } = renderHook(({ uid, loading, error }) => useRunPlanTarget(params(), uid, false, goal, weeks, loading, error, today, onWeekOffset), { initialProps: { uid: "owner", loading: false, error: null as unknown } });
    expect(result.current.session?.goalId).toBe(goal.id);
    act(() => result.current.close());
    expect(result.current.session).toBeNull();
    rerender({ uid: "other", loading: false, error: null });
    expect(result.current.session).toBeNull();
    expect(result.current.unavailable).toBe(true);
    rerender({ uid: "owner", loading: true, error: null });
    expect(result.current.session).toBeNull();
    expect(result.current.unavailable).toBe(false);
    rerender({ uid: "owner", loading: false, error: new Error("read failed") });
    expect(result.current.session).toBeNull();
    expect(result.current.unavailable).toBe(true);
  });
});
