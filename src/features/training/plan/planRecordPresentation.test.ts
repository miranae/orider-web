import { describe, expect, it } from "vitest";
import { isPendingPlanWorkout, presentPlanRecord, type PlanRecordEntry } from "./planRecordPresentation";

const base: PlanRecordEntry = { discipline: "bike", workout: "z2", plannedTSS: 50, plannedDurationMin: 60 };
const context = { date: "2026-10-14", today: "2026-10-15" };
const view = (patch: Partial<PlanRecordEntry> = {}) => presentPlanRecord({ ...base, ...patch }, context);

describe("saved plan/record presentation", () => {
  it.each([
    ["partial", true, "partial"], ["completed", false, "completed"], ["skipped", true, "skipped"],
    ["postponed", true, "postponed"], ["new-outcome", true, "unknown"],
  ])("lets explicit outcome %s precede the legacy completed=%s mirror", (executionStatus, completed, expected) => {
    expect(view({ executionStatus, completed: completed as boolean }).outcome).toBe(expected);
  });
  it("distinguishes a manual completion marker from a confirmed activity-backed completion", () => {
    expect(view({ completed: true }).outcome).toBe("markedComplete");
    expect(view({ completed: true, actualActivityId: "ride-1", matchMethod: "manual", matchConfidence: "manual" }).outcome).toBe("completed");
    expect(view({ actualActivityId: "ride-1", matchMethod: "explicit-start", matchConfidence: "exact" }).outcome).toBe("unconfirmed");
  });
  it.each([
    ["2026-10-16", "scheduled"], ["2026-10-15", "today"], ["2026-10-14", "unconfirmed"],
    ["2026-02-31", "unknown"], ["invalid", "unknown"],
  ])("shows date %s without inferring failure or completion", (date, expected) => {
    expect(presentPlanRecord(base, { ...context, date }).outcome).toBe(expected);
  });
  it("keeps saved skipped and postponed states and validates the saved destination date", () => {
    expect(view({ skipped: true }).outcome).toBe("skipped");
    expect(view({ skipped: true, completed: true }).outcome).toBe("unknown");
    expect(view({ executionStatus: "postponed", postponedToLocalDate: "2026-10-17" }).postponedToLocalDate).toBe("2026-10-17");
    expect(view({ executionStatus: "postponed", postponedToLocalDate: "2026-02-31" }).postponedToLocalDate).toBeNull();
  });
  it.each([
    ["explicit-start", "exact"], ["manual", "manual"],
  ])("preserves known zero load for the closed %s / %s matching pair", (matchMethod, matchConfidence) => {
    const result = view({ actualActivityId: "ride-1", actualTSS: 0, matchMethod, matchConfidence });
    expect(result.linkage).toBe("confirmed");
    expect(result.actualLoad).toBe(0);
    expect(result.activityLinks).toEqual([{ id: "ride-1", kind: "record" }]);
  });
  it("does not turn legacy or reprocessed zero into confirmed actual load", () => {
    for (const patch of [
      {}, { executionStatus: "partial" }, { matchMethod: "manual", matchConfidence: "exact" },
      { matchMethod: "future-method", matchConfidence: "exact" },
    ]) {
      expect(view({ actualActivityId: "ride-1", actualTSS: 0, ...patch }).actualLoad).toBeNull();
    }
    expect(view({ actualActivityId: "ride-1", actualTSS: 42 }).actualLoad).toBe(42);
    expect(view({ actualActivityId: "ride-1", actualTSS: 42 }).linkage).toBe("legacy");
  });
  it("keeps probable metadata alongside actualActivityId as a candidate rather than a confirmed result", () => {
    const result = view({ actualActivityId: "legacy-ride", actualTSS: 40, completed: true,
      matchMethod: "legacy-time-window", matchConfidence: "probable", probableActivityId: "new-candidate", probableTSS: 55 });
    expect(result.outcome).toBe("markedComplete");
    expect(result.linkage).toBe("probable");
    expect(result.actualLoad).toBeNull();
    expect(result.candidateLoad).toBe(55);
    expect(result.activityLinks).toEqual([{ id: "legacy-ride", kind: "candidate" }, { id: "new-candidate", kind: "candidate" }]);
  });
  it("keeps same-day candidates separate and supersedes stale candidate metadata only with a confirmed link", () => {
    expect(view({ probableActivityId: "possible-ride", probableTSS: 0 }).candidateLoad).toBe(0);
    expect(view({ probableActivityId: "possible-ride", completed: false }).actualLoad).toBeNull();
    const result = view({ actualActivityId: "ride-1", actualTSS: 0, matchMethod: "manual", matchConfidence: "manual",
      probableActivityId: "old-candidate", probableTSS: 80 });
    expect(result.activityLinks).toEqual([{ id: "ride-1", kind: "record" }]);
    expect(result.candidateLoad).toBeNull();
  });
  it("does not invent values for missing, negative, nonfinite or activity-unlinked load", () => {
    for (const actualTSS of [undefined, NaN, Infinity, -1]) expect(view({ actualActivityId: "ride-1", actualTSS }).actualLoad).toBeNull();
    expect(view({ actualTSS: 50 }).actualLoad).toBeNull();
    expect(view({ plannedTSS: 0, plannedDurationMin: 0 })).toMatchObject({ plannedLoad: 0, plannedDurationMin: 0 });
    expect(view({ plannedTSS: NaN, plannedDurationMin: -1 })).toMatchObject({ plannedLoad: null, plannedDurationMin: null });
  });
});


it("preserves planned rest without asking for execution, while respecting explicit saved outcomes", () => {
  expect(view({ workout: "rest", plannedTSS: 0, plannedDurationMin: 0 }).outcome).toBe("rest");
  expect(view({ workout: "rest", executionStatus: "postponed" }).outcome).toBe("postponed");
  expect(view({ completed: "false" as unknown as boolean }).outcome).toBe("unknown");
});


it("keeps unresolved occurrences eligible but never retries saved outcomes from stale mirror flags", () => {
  const day = { date: Date.parse("2026-10-15T00:00:00+09:00"), dayOfWeek: 0, workout: "z2", plannedTSS: 30, plannedDurationMin: 45, completed: false, skipped: false } as import("@shared/types/goal").PlanDay;
  const ctx = { date: "2026-10-15", today: "2026-10-15" };
  expect(isPendingPlanWorkout(day, ctx)).toBe(true);
  for (const executionStatus of ["completed", "skipped", "postponed", "partial"] as const) {
    expect(isPendingPlanWorkout({ ...day, executionStatus } as typeof day, ctx)).toBe(false);
  }
  expect(isPendingPlanWorkout({ ...day, probableActivityId: "candidate", matchConfidence: "probable" } as typeof day, ctx)).toBe(true);
  expect(isPendingPlanWorkout({ ...day, workout: "rest" }, ctx)).toBe(false);
  expect(isPendingPlanWorkout({ ...day, workout: "goal" }, ctx)).toBe(false);
});
