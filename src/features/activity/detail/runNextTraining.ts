import type { Goal, IntervalBlock, PlanDay, PlanWeek, WorkoutKind } from "@shared/types/goal";
import { planDayKey, planDayStartMs } from "@shared/training/planDate";
import { usesEffectiveExecutionPrescription } from "@shared/training/effectiveExecutionPrescription";
import type { TodayTrainingDecisionProjection } from "../../../services/trainingDecisionContract";

export interface RunNextTrainingSession {
  goalId: string;
  weekId: string;
  dayIndex: number;
  localDate: string;
  date: number;
  workout: WorkoutKind;
  title: string | null;
  durationMin: number;
  steps: Array<Pick<IntervalBlock, "label" | "durationMin">> | null;
  source: "persisted-plan" | "canonical-today";
}
const runKinds = new Set<WorkoutKind>(["easyRun", "tempoRun", "intervalRun", "longRun", "recoveryRun", "stridesRun", "progressRun", "threshRun", "raceRun"]);

/** 저장된 계획의 실행 구성이 확인된 경우에만 읽는다. 러닝에 사이클 파워 목표를 전달하지 않는다. */
export function toRunNextTrainingSession(goalId: string, week: PlanWeek, dayIndex: number): RunNextTrainingSession | null {
  if (!goalId || !week.id || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return null;
  const day: (PlanDay & { executionStatus?: unknown; probableActivityId?: unknown }) | undefined = week.days?.[dayIndex];
  if (!day || !Number.isFinite(day.date) || planDayStartMs(day.date) !== day.date || !runKinds.has(day.workout) || day.completed !== false || day.skipped !== false || day.actualActivityId || day.probableActivityId || (day.executionStatus != null && day.executionStatus !== "scheduled")) return null;
  if (day.executionWorkoutOverride != null && day.executionWorkoutOverride !== day.workout) return null;
  const durationMin = day.adjustedDurationMin ?? day.plannedDurationMin;
  if (!Number.isFinite(durationMin) || durationMin <= 0) return null;
  const replaced = usesEffectiveExecutionPrescription(day, week.adjustmentReason);
  const intervals = !replaced && Array.isArray(day.intervals) && day.intervals.length > 0
    && day.intervals.every(step => step != null && typeof step === "object" && ["WU", "Z1", "Z2", "Z3", "Z4", "Z5", "R", "CD"].includes(step.label) && Number.isFinite(step.durationMin) && step.durationMin > 0)
    && Math.abs(day.intervals.reduce((sum, step) => sum + step.durationMin, 0) - durationMin) < 0.01 ? day.intervals : null;
  return { goalId, weekId: week.id, dayIndex, date: day.date, localDate: planDayKey(day.date), workout: day.workout,
    title: !replaced && typeof day.workoutName === "string" && day.workoutName.trim() ? day.workoutName.trim() : null,
    durationMin, steps: intervals?.map(({ label, durationMin: stepDuration }) => ({ label, durationMin: stepDuration })) ?? null,
    source: "persisted-plan" };
}

function matchesCurrentToday(session: RunNextTrainingSession, decision: TodayTrainingDecisionProjection | null, now: number): boolean {
  if (!decision || decision.discipline !== "run" || decision.targetDiscipline !== "run" || decision.sourceState !== "current" || decision.freshness.stale
    || decision.scheduledProjectionValidUntil <= now || decision.healthGate.state === "stop" || decision.planSource?.goalId !== session.goalId) return false;
  let localToday: string;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: decision.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const value = (key: string) => parts.find(part => part.type === key)?.value;
    localToday = `${value("year")}-${value("month")}-${value("day")}`;
  } catch { return false; }
  if (localToday !== session.localDate || decision.localDate !== localToday || decision.asOfDate !== localToday) return false;
  const matches = (ref: TodayTrainingDecisionProjection["scheduledSessions"][number]) => ref.localDate === localToday
    && ref.dayRef.localDate === localToday && ref.dayRef.goalId === session.goalId && ref.dayRef.weekId === session.weekId && ref.dayRef.dayIndex === session.dayIndex;
  const scheduled = decision.scheduledSessions.filter(matches);
  if (scheduled.length !== 1) return false;
  const original = scheduled[0]!;
  const effective = decision.effectiveSessions.find(item => item.sessionId === original.sessionId) ?? original;
  return original.status === "scheduled" && effective.status === "scheduled" && !original.current.completed && !effective.current.completed
    && !original.matchedActivityId && !effective.matchedActivityId && effective.current.workout !== "rest"
    && String(original.current.workout) === session.workout && effective.current.workout === original.current.workout && effective.current.durationMin === original.current.durationMin
    && effective.current.durationMin === session.durationMin;
}

/** 오늘은 현행 정본 세션 상태로 확인하고, 이후 날짜는 저장된 계획으로만 표시한다. */
export function selectRunNextTraining(goal: Goal | null, weeks: PlanWeek[], uid: string, now: number, modernEnabled: boolean,
  decision: TodayTrainingDecisionProjection | null = null): RunNextTrainingSession | null {
  if (!goal || goal.userId !== uid || goal.discipline !== "run" || goal.status !== "active" || !goal.id || !Number.isFinite(now)) return null;
  const today = planDayKey(now);
  const deadline = goal.targetDate ?? goal.eventDate;
  if (!Number.isFinite(deadline) || deadline <= 0) return null;
  const endDate = planDayKey(deadline);
  if (weeks.some(week => !Array.isArray(week.days))) throw new Error("Unverified running plan week");
  const candidates = weeks.flatMap(week => (week.days ?? []).map((_, index) => toRunNextTrainingSession(goal.id, week, index)))
    .filter((session): session is RunNextTrainingSession => session != null && session.localDate >= today && (!endDate || session.localDate <= endDate))
    .sort((left, right) => left.date - right.date || left.dayIndex - right.dayIndex);
  for (const session of candidates) {
    if (session.localDate === today && modernEnabled) {
      if (!matchesCurrentToday(session, decision, now)) continue;
      return { ...session, source: "canonical-today" };
    }
    if (candidates.filter(candidate => candidate.localDate === session.localDate).length !== 1) throw new Error("Ambiguous running plan date");
    return session;
  }
  return null;
}

export function buildRunPlanTarget(session: Pick<RunNextTrainingSession, "goalId" | "weekId" | "dayIndex" | "localDate">) {
  const params = new URLSearchParams({ sport: "run", goalId: session.goalId, weekId: session.weekId,
    dayIndex: String(session.dayIndex), date: session.localDate });
  return { pathname: "/plan", search: `?${params.toString()}` };
}
