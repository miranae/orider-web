import type { PlanDay } from "@shared/types/goal";

/** Read-only projection of saved plan fields; execution/matching writers remain authoritative. */
export interface PlanRecordEntry {
  discipline: "bike" | "run" | "swim";
  workout: PlanDay["workout"];
  plannedTSS: number;
  plannedDurationMin: number;
  actualActivityId?: string;
  actualTSS?: number;
  completed?: boolean;
  skipped?: boolean;
  // These fields may be missing on legacy documents or contain a newer contract value.
  matchMethod?: unknown;
  matchConfidence?: unknown;
  probableActivityId?: unknown;
  probableTSS?: unknown;
  probableMatchMethod?: unknown;
  probableMatchConfidence?: unknown;
  executionStatus?: unknown;
  postponedToLocalDate?: unknown;
}

export type PlanRecordOutcome = "completed" | "partial" | "markedComplete" | "skipped" | "postponed"
  | "rest" | "scheduled" | "today" | "unconfirmed" | "unknown";
export type PlanRecordLinkage = "confirmed" | "probable" | "legacy" | "none" | "unknown";
export interface PlanRecordActivityLink { id: string; kind: "record" | "candidate" }
export interface PlanRecordPresentation {
  outcome: PlanRecordOutcome;
  linkage: PlanRecordLinkage;
  activityLinks: PlanRecordActivityLink[];
  plannedLoad: number | null;
  plannedDurationMin: number | null;
  /** A saved linked load, not a newly computed comparison or completion ratio. */
  actualLoad: number | null;
  candidateLoad: number | null;
  localDate: string | null;
  postponedToLocalDate: string | null;
}

const savedId = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const nonnegative = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
function localDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

function linkageOf(entry: PlanRecordEntry, actualId: string | null, probableId: string | null): PlanRecordLinkage {
  if (!actualId) return probableId ? "probable" : entry.actualActivityId != null ? "unknown" : "none";
  if (entry.matchMethod === "explicit-start" && entry.matchConfidence === "exact"
    || entry.matchMethod === "manual" && entry.matchConfidence === "manual") return "confirmed";
  if (entry.matchConfidence === "probable" || entry.matchMethod === "legacy-time-window") return "probable";
  if (entry.matchMethod == null && entry.matchConfidence == null) return "legacy";
  return "unknown";
}

function outcomeOf(entry: PlanRecordEntry, linkage: PlanRecordLinkage, date: string | null, today: string | null): PlanRecordOutcome {
  // The explicit saved outcome precedes legacy completed/skipped mirrors (partial also mirrors completed=true).
  if (entry.executionStatus === "completed" || entry.executionStatus === "partial"
    || entry.executionStatus === "skipped" || entry.executionStatus === "postponed") return entry.executionStatus;
  if (entry.executionStatus != null) return "unknown";
  if (entry.completed != null && typeof entry.completed !== "boolean"
    || entry.skipped != null && typeof entry.skipped !== "boolean") return "unknown";
  if (entry.completed === true && entry.skipped === true) return "unknown";
  if (entry.skipped === true) return "skipped";
  if (entry.completed === true) return linkage === "confirmed" ? "completed" : "markedComplete";
  if (entry.workout === "rest") return "rest";
  if (!date || !today) return "unknown";
  return date > today ? "scheduled" : date === today ? "today" : "unconfirmed";
}

/** Sharing a date or reaching a load threshold never establishes a plan/activity match. */
export function presentPlanRecord(entry: PlanRecordEntry, context: { date: string; today: string }): PlanRecordPresentation {
  const actualId = savedId(entry.actualActivityId);
  const probableId = savedId(entry.probableActivityId);
  const linkage = linkageOf(entry, actualId, probableId);
  const date = localDate(context.date);
  const today = localDate(context.today);
  const actual = nonnegative(entry.actualTSS);
  const candidate = nonnegative(entry.probableTSS);
  const activityLinks: PlanRecordActivityLink[] = [];
  if (actualId) activityLinks.push({ id: actualId, kind: linkage === "probable" ? "candidate" : "record" });
  // A confirmed saved link supersedes leftover candidate metadata; other ambiguous records retain both entrances.
  if (probableId && linkage !== "confirmed" && probableId !== actualId) activityLinks.push({ id: probableId, kind: "candidate" });
  return {
    outcome: outcomeOf(entry, linkage, date, today), linkage, activityLinks,
    plannedLoad: nonnegative(entry.plannedTSS), plannedDurationMin: nonnegative(entry.plannedDurationMin),
    // Legacy zero may mean "not collected". Only closed authoritative matching pairs establish known zero.
    actualLoad: actualId && linkage !== "probable" && actual != null && (actual > 0 || linkage === "confirmed") ? actual : null,
    candidateLoad: linkage === "probable" ? candidate ?? (actualId ? actual : null) : null,
    localDate: date,
    postponedToLocalDate: entry.executionStatus === "postponed" ? localDate(entry.postponedToLocalDate) : null,
  };
}

/** Day cells share saved evidence semantics; discipline does not affect outcome or linkage. */
export function presentPlanDayRecord(day: PlanDay, context: {date: string; today: string}): PlanRecordPresentation {
  return presentPlanRecord({...day, discipline: "bike"}, context);
}


/** Recorded outcomes close this occurrence; postponement does not create a new plan day.
 * The execution service mirrors partial as completed=true. Never infer an automatic retry.
 */
export function isPendingPlanWorkout(day: PlanDay, context: {date: string; today: string}): boolean {
  if (day.workout === "rest" || day.workout === "goal") return false;
  const outcome = presentPlanDayRecord(day, context).outcome;
  return outcome === "scheduled" || outcome === "today" || outcome === "unconfirmed";
}

/** 읽기 전용 부하 평가. 저장된 실행 결과와 연결은 덮어쓰지 않는다. */
export type PlanLoadEntry = Pick<PlanDay, "workout" | "plannedTSS" | "adjustedTSS" | "actualActivityId"> & { matchMethod?: unknown; matchConfidence?: unknown };
export function planLoadFulfillment(day: PlanLoadEntry, row: { linkedLoads?: Record<string, number>; fulfilledWeek?: unknown } | undefined,
  ready: boolean): "exceeded" | "met" | "week" | null {
  if (!ready) return null;
  const linkage = linkageOf({ ...day, discipline: "bike", plannedDurationMin: 0 }, savedId(day.actualActivityId), null);
  const target = day.adjustedTSS ?? day.plannedTSS;
  const actual = day.actualActivityId ? row?.linkedLoads?.[day.actualActivityId] : undefined;
  if (day.workout !== "rest" && linkage === "confirmed" && typeof actual === "number" && Number.isFinite(target) && target > 0 && actual >= target)
    return actual > target ? "exceeded" : "met";
  return row?.fulfilledWeek ? "week" : null;
}
