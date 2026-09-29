import { describe, expect, it } from "vitest";
import type { Goal, PlanDay, PlanWeek } from "@shared/types/goal";
import { planDayStartMs } from "@shared/training/planDate";
import type { TodayTrainingDecisionProjection } from "../../../services/trainingDecisionContract";
import { buildRunPlanTarget, selectRunNextTraining, toRunNextTrainingSession } from "./runNextTraining";
const now = Date.parse("2026-09-30T12:00:00+09:00");
const goal = { id: "run-goal", userId: "owner", discipline: "run", status: "active", eventDate: now + 14 * 86400000 } as Goal;
const day = (offset = 1, overrides: Partial<PlanDay> = {}): PlanDay => ({ date: planDayStartMs(now) + offset * 86400000, dayOfWeek: 4,
 workout: "easyRun", plannedDurationMin: 30, plannedTSS: 30, completed: false, skipped: false, ...overrides });
const week = (days: PlanDay[]): PlanWeek => ({ id: "week-01", weekNumber: 1, phase: "base", startDate: days[0]!.date, plannedTSS: 100, days });
describe("persisted next running plan selector", () => {
 it("selects earliest future planned run without inventing progress from a saved activity", () => {
  const selected = selectRunNextTraining(goal, [week([day(-1), day(3), day(1), day(2, { completed: true })])], "owner", now, true);
  expect(selected).toMatchObject({ localDate: "2026-10-01", dayIndex: 2, durationMin: 30, source: "persisted-plan" });
 });
 it.each([{ discipline: "bike" }, { discipline: undefined }, { userId: "other" }, { status: "completed" }, { eventDate: now - 86400000 }, { eventDate: undefined }])("rejects nonactive/wrong owner/sport/expired goal %j", override => {
  expect(selectRunNextTraining({ ...goal, ...override } as Goal, [week([day()])], "owner", now, false)).toBeNull();
 });
 it("excludes fulfilled, ambiguous, non-running and zero-duration days", () => {
  const days = [day(1, { actualActivityId: "saved-run" }), day(2, { skipped: true }), day(3, { workout: "goal" }), day(4, { workout: "z2" }), day(5, { adjustedDurationMin: 0 })];
  expect(selectRunNextTraining(goal, [week(days)], "owner", now, false)).toBeNull();
  expect(toRunNextTrainingSession(goal.id, week([{ ...day(), executionStatus: "partial" } as PlanDay]), 0)).toBeNull();
  expect(toRunNextTrainingSession(goal.id, week([{ ...day(), probableActivityId: "possible-run" } as PlanDay]), 0)).toBeNull();
 });
 it("uses adjusted time and hides original title/steps after confirmed execution replacement", () => {
  const selected = toRunNextTrainingSession(goal.id, week([day(1, { workout: "recoveryRun", executionWorkoutOverride: "recoveryRun", adjustedDurationMin: 20,
   workoutName: "old hard intervals", intervals: [{ label: "Z5", durationMin: 30, targetPowerW: [250, 300] }] })]), 0);
  expect(selected).toMatchObject({ workout: "recoveryRun", durationMin: 20, title: null, steps: null });
 });
 it("strips cycling power from real interval times and omits inconsistent composition", () => {
  const original = day(1, { workoutName: "imported session", intervals: [{ label: "WU", durationMin: 10, targetPowerW: [100, 150] }, { label: "Z2", durationMin: 20, targetPowerW: [150, 200] }] });
  const selected = toRunNextTrainingSession(goal.id, week([original]), 0);
  expect(selected?.steps).toEqual([{ label: "WU", durationMin: 10 }, { label: "Z2", durationMin: 20 }]);
  expect(JSON.stringify(selected)).not.toContain("targetPowerW");
  expect(toRunNextTrainingSession(goal.id, week([{ ...original, adjustedDurationMin: 25 }]), 0)?.steps).toBeNull();
 });
 it("does not trust today's generic canonical planned kind as the persisted hard run kind", () => {
  const today = day(0, { workout: "intervalRun", workoutName: "hard original" });
  const session = { sessionId: "ss_today", localDate: "2026-09-30", dayRef: { goalId: goal.id, weekId: "week-01", dayIndex: 0, localDate: "2026-09-30" },
   current: { workout: "planned", durationMin: 30, completed: false }, status: "scheduled", matchedActivityId: null };
  const decision = { discipline: "run", targetDiscipline: "run", sourceState: "current", freshness: { stale: false }, healthGate: { state: "clear" }, scheduledProjectionValidUntil: now + 10000,
   timezone: "Asia/Seoul", localDate: "2026-09-30", asOfDate: "2026-09-30", planSource: { goalId: goal.id }, scheduledSessions: [session], effectiveSessions: [session] } as unknown as TodayTrainingDecisionProjection;
  expect(selectRunNextTraining(goal, [week([today])], "owner", now, true, decision)).toBeNull();
  expect(selectRunNextTraining(goal, [week([today, day(1)])], "owner", now, true, decision)?.localDate).toBe("2026-10-01");
 });
 it("requires modern authority for today but permits explicitly persisted legacy planning", () => {
  expect(selectRunNextTraining(goal, [week([day(0)])], "owner", now, true)).toBeNull();
  expect(selectRunNextTraining(goal, [week([day(0)])], "owner", now, false)?.source).toBe("persisted-plan");
 });
 it("builds exact saved-day navigation and rejects malformed boundaries/overrides", () => {
  const session = toRunNextTrainingSession(goal.id, week([day()]), 0)!;
  expect(buildRunPlanTarget(session)).toEqual({ pathname: "/plan", search: "?sport=run&goalId=run-goal&weekId=week-01&dayIndex=0&date=2026-10-01" });
  expect(toRunNextTrainingSession(goal.id, week([day(1, { date: now })]), 0)).toBeNull();
  expect(toRunNextTrainingSession(goal.id, week([day(1, { executionWorkoutOverride: "recoveryRun" })]), 0)).toBeNull();
 });
});

it("does not choose arbitrarily between duplicate saved future days", () => {
 const duplicate = { ...week([day()]), id: "week-overlap" };
 expect(() => selectRunNextTraining(goal, [week([day()]), duplicate], "owner", now, false)).toThrow("Ambiguous running plan date");
});
it("keeps malformed or missing week-day arrays distinct from an empty plan", () => {
 for (const malformed of [{ ...week([day()]), days: {} }, { ...week([day()]), days: undefined }]) {
  expect(() => selectRunNextTraining(goal, [malformed as unknown as PlanWeek], "owner", now, false)).toThrow("Unverified running plan week");
 }
});

it.each([null, {}, "invalid", 12])("omits malformed interval entry %j without throwing the valid saved session", entry => {
 const saved = day(1, { intervals: [entry] as unknown as PlanDay["intervals"] });
 const session = toRunNextTrainingSession(goal.id, week([saved]), 0);
 expect(session).toMatchObject({ workout: "easyRun", durationMin: 30, steps: null });
});
