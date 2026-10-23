import type { Activity } from "@shared/types";
import type { PlanDay, PlanWeek } from "@shared/types/goal";
import { computePlanLoadComparison, getPlanLoadRangeBounds } from "./planLoadComparison";
const ms = (day: string) => Date.parse(`${day}T00:00:00+09:00`);
const now = ms("2026-10-23") + 12 * 3600000;
const range = { start: "2026-10-22", end: "2026-10-24" };
const day = (date: string, plannedTSS: number, extra: Partial<PlanDay> = {}): PlanDay => ({ date: ms(date), dayOfWeek: 0, workout: "z2", plannedTSS, plannedDurationMin: 60, completed: false, skipped: false, ...extra });
const weeks = (...days: PlanDay[]): PlanWeek[] => [{ id: "week", weekNumber: 1, phase: "base", startDate: days[0]?.date ?? now, plannedTSS: 999, days }];
const activity = (id: string, date: string, tss: number | undefined, extra: Record<string, unknown> = {}): Activity => ({ id, userId: "owner", source: "orider", type: "Ride", startTime: ms(date) + 3600000, summary: { ridingTimeMillis: 0 }, ...(tss === undefined ? {} : { tss }), ...extra } as unknown as Activity);

it("compares adjusted prescriptions including skipped workouts and unlinked actual activities without capping", () => {
  const result = computePlanLoadComparison(weeks(day("2026-10-22", 100, { adjustedTSS: 50, skipped: true, actualTSS: 999 }), day("2026-10-23", 30), day("2026-10-24", 20)),
    [activity("ride", "2026-10-22", 120)], range, "bike", now);
  expect(result.summary).toMatchObject({ plannedTss: 100, actualTss: 120, ratioPct: 120, deltaTss: 20 });
  expect(result.days[0]).toMatchObject({ plannedTss: 50, actualTss: 120, ratioPct: 240 });
  expect(result.days[2]).toMatchObject({ actualTss: null, ratioPct: null, deltaTss: null, future: true });
});
it("preserves KST boundaries, today cutoff and zero denominator without inventing a completion rate", () => {
  const rows = [activity("before", "2026-10-22", 50, { startTime: ms("2026-10-22") - 1 }), activity("exact", "2026-10-22", 30, { startTime: ms("2026-10-22") }), activity("future-time", "2026-10-23", 50, { startTime: now + 1 })];
  const result = computePlanLoadComparison(weeks(day("2026-10-22", 999, { workout: "rest" })), rows, range, "bike", now);
  expect(result.summary).toMatchObject({ plannedTss: 0, actualTss: 30, ratioPct: null, deltaTss: 30 });
  expect(computePlanLoadComparison([], [], { start: "2026-10-24", end: "2026-10-24" }, "bike", now).summary).toMatchObject({ actualTss: null, ratioPct: null, deltaTss: null });
});
it("marks estimates and refuses exact totals, ratios or deltas when any accepted activity has unknown TSS", () => {
  const estimate = activity("estimate", "2026-10-22", undefined, { summary: { ridingTimeMillis: 3600000 } });
  const unknown = activity("unknown", "2026-10-23", undefined);
  const result = computePlanLoadComparison(weeks(day("2026-10-22", 40), day("2026-10-23", 50)), [estimate, unknown], range, "bike", now);
  expect(result.days[0]).toMatchObject({ actualTss: 42, estimated: true });
  expect(result.summary).toMatchObject({ actualTss: null, ratioPct: null, deltaTss: null, estimated: true, unknownCount: 1 });
});
it("selects physical representatives before date and discipline filtering", () => {
  const fragment = activity("fragment", "2026-10-22", 10, { endTime: ms("2026-10-22") + 2 * 3600000, stravaTwinActivityId: 123 });
  const full = activity("strava_123", "2026-10-21", 100, { source: "strava", stravaActivityId: 123, startTime: ms("2026-10-22") - 3600000, endTime: ms("2026-10-22") + 2 * 3600000 });
  expect(computePlanLoadComparison([], [fragment, full], range, "bike", now).summary.actualTss).toBe(0);
  const run = activity("run", "2026-10-22", 40, { type: "Run" });
  const result = computePlanLoadComparison(weeks(day("2026-10-22", 50), day("2026-10-22", 20, { workout: "easyRun" })), [run], range, "run", now);
  expect(result.summary).toMatchObject({ actualTss: 40, plannedTss: 70 });
});
it("rejects invalid dates, inverted ranges and windows longer than 366 days", () => {
  expect(getPlanLoadRangeBounds({ start: "2026-02-30", end: "2026-03-01" })).toBeNull();
  expect(getPlanLoadRangeBounds({ start: "2026-10-23", end: "2026-10-22" })).toBeNull();
  expect(getPlanLoadRangeBounds({ start: "2026-01-01", end: "2027-01-02" })).toBeNull();
  expect(getPlanLoadRangeBounds({ start: "2026-01-01", end: "2027-01-01" })?.dayCount).toBe(366);
});


it("uses accepted final Strava load once, while candidate snapshots remain individual plan evidence", () => {
  const plan = day("2026-10-22", 65, { probableTSS: 100, probableActivityId: "strava_123", actualTSS: 100 } as Partial<PlanDay>);
  const full = activity("strava_123", "2026-10-22", 100, { source: "strava", stravaActivityId: 123, endTime: ms("2026-10-22") + 3 * 3600000,
    serverDerivedLoad: { schemaVersion: 1, userId: "owner", inputBinding: "synthetic-binding", streamTss: 219.920647 }, summary: { tss: 100, ridingTimeMillis: 8106000, distance: 52000 } });
  const twin = activity("fragment", "2026-10-22", 50, { stravaTwinActivityId: 123, endTime: full.endTime, summary: { ridingTimeMillis: 8106000, distance: 52000 } });
  const result = computePlanLoadComparison(weeks(plan), [twin, full], { start: "2026-10-22", end: "2026-10-22" }, "bike", now);
  expect(result.summary).toMatchObject({ plannedTss: 65, actualTss: 220, deltaTss: 155, plannedDayCount: 1 });
  expect(result.summary.ratioPct).toBeCloseTo(220 / 65 * 100);
  expect(result.days[0]?.activityIds).toEqual(["strava_123"]);
  expect(plan.completed).toBe(false);
  expect(plan.probableTSS).toBe(100);
});

it("distinguishes missing plans from explicit zero-load rest without suppressing unlinked actuals", () => {
  const period = { start: "2026-10-22", end: "2026-10-22" };
  const actual = [activity("unlinked", "2026-10-22", 30)];
  expect(computePlanLoadComparison([], actual, period, "bike", now).summary).toMatchObject({ plannedDayCount: 0, plannedTss: null, actualTss: 30, ratioPct: null, deltaTss: null });
  expect(computePlanLoadComparison(weeks(day("2026-10-22", 0, {workout:"rest"})), actual, period, "bike", now).summary).toMatchObject({ plannedDayCount: 1, plannedTss: 0, actualTss: 30, ratioPct: null, deltaTss: 30 });
});
