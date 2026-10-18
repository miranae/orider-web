import type { Goal, PlanWeek } from "@shared/types/goal";

export type DailyLoadPoint = { date: string; totalLoad: number; unknownCount?: number; stale?: boolean; pending?: boolean; known?: boolean };

/** 날짜는 생산자의 UTC 또는 local 날짜 문자열이다. asOf도 같은 날짜 근거여야 한다. */
export function calendarLoadDays(points: DailyLoadPoint[], asOf: string, days: number) {
  const parse = (date: string) => {
    const value = Date.parse(`${date}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value)
      && new Date(value).toISOString().slice(0, 10) === date ? value : null;
  };
  const today = parse(asOf);
  const result = Array.from({ length: days }, () => ({ load: 0, known: false, unknown: 0 }));
  if (today === null) return result;
  const seen = new Set<number>();
  for (const point of points) {
    const date = parse(point.date);
    if (date === null) continue;
    const offset = (today - date) / 86_400_000;
    if (!Number.isInteger(offset) || offset < 0 || offset >= days) continue;
    const row = result[offset]!;
    if (seen.has(offset)) { row.known = false; row.load = 0; row.unknown = 1; continue; }
    seen.add(offset);
    const valid = Number.isFinite(point.totalLoad) && point.totalLoad >= 0
      && (point.unknownCount === undefined || (Number.isInteger(point.unknownCount) && point.unknownCount >= 0))
      && !point.stale && !point.pending;
    row.load = valid ? point.totalLoad : 0;
    row.unknown = valid ? point.unknownCount ?? 0 : 1;
    row.known = valid && row.unknown === 0 && point.known !== false;
  }
  return result;
}

export function buildFitnessWeeklyInsight({ ctlDelta, ctl, atl, tsb, dailyData, asOf, dateBasis, ready = true }: {
  ctlDelta: number; ctl: number; atl: number; tsb: number;
  dailyData: DailyLoadPoint[]; asOf: string; dateBasis: "utc" | "zone" | "local" | "mixed"; ready?: boolean;
}) {
  const days = calendarLoadDays(dateBasis === "mixed" ? [] : dailyData, asOf, 14);
  const current = days.slice(0, 7);
  const previous = days.slice(7);
  const sum = (rows: typeof days) => {
    const value = rows.reduce((total, day) => total + day.load, 0);
    return Number.isFinite(value) ? Math.round(value) : null;
  };
  const thisWeek = sum(current);
  const previousWeek = sum(previous);
  const complete = ready && days.every(day => day.known) && thisWeek !== null && previousWeek !== null;
  const change = complete && previousWeek > 0 ? ((thisWeek - previousWeek) / previousWeek) * 100 : null;
  const loadChangePct = change !== null && Number.isFinite(change) ? Math.round(change) : null;
  const recommendation = !complete || ![ctlDelta, ctl, atl, tsb].every(Number.isFinite) ? null
    : tsb < -20 ? "recover"
    : thisWeek === 0 ? "restart"
    : ctlDelta > 0 && atl <= ctl * 1.25 ? "interval" : "maintain";
  return { thisWeek: current.some(day => day.known || day.load > 0) ? thisWeek : null,
    previousWeek: previous.some(day => day.known || day.load > 0) ? previousWeek : null, loadChangePct, recommendation, complete,
    missingDays: days.filter(day => !day.known).length, dateBasis, asOf };
}

export function computePlanCompliancePct(weeks: PlanWeek[]): number | null {
  let planned = 0;
  let actual = 0;
  for (const week of weeks.slice(-4)) {
    for (const day of week.days) {
      if (day.workout === "rest" || day.workout === "goal") continue;
      const target = day.adjustedTSS ?? day.plannedTSS;
      if (target <= 0) continue;
      planned += target;
      if (day.completed) actual += Math.min(day.actualTSS ?? target, target);
      else if (day.skipped) actual += 0;
    }
  }
  if (planned <= 0) return null;
  return Math.round((actual / planned) * 100);
}

export function findLatestAdjustedWeek(weeks: PlanWeek[]): PlanWeek | null {
  return [...weeks]
    .filter((week) => week.adjustmentFactor != null)
    .sort((a, b) => (b.adjustedAt ?? b.startDate) - (a.adjustedAt ?? a.startDate))[0] ?? null;
}

export function buildPlanAdjustmentInsight(goal: Goal | null, weeks: PlanWeek[]) {
  const adjustedWeek = findLatestAdjustedWeek(weeks);
  const compliancePct = computePlanCompliancePct(weeks);
  if (!goal?.lastAdjustmentKind && !adjustedWeek) return null;

  const factor = adjustedWeek?.adjustmentFactor ?? null;
  const changePct = factor != null ? Math.round(Math.abs(1 - factor) * 100) : null;
  const direction = factor == null ? goal?.lastAdjustmentKind ?? "factor" : factor < 1 ? "down" : "up";

  return {
    compliancePct,
    changePct,
    direction,
    reason: adjustedWeek?.adjustmentReason ?? null,
  };
}
