import type { Goal, PlanWeek } from "@shared/types/goal";
import { isRun30Program, type Run30Program } from "../features/training/run30/run30Api";
import { getTrainingSurfaceCache, setTrainingSurfaceCache, trainingSurfaceCacheScope, type TrainingSurfaceCacheKey } from "./trainingSurfaceCache";

export type PlanSnapshot = { goal: Goal | null; weeks: PlanWeek[] };
type SnapshotData = PlanSnapshot | Run30Program | null;
interface Snapshot<T> { savedAt: number; timezone: string; data: T; invalidated: boolean }
const FRESH_MS = 3 * 60_000;
const RETAIN_MS = 24 * 60 * 60_000;
export const planSnapshotKey = (uid: string, sport: string, locale: string): TrainingSurfaceCacheKey => ({ uid, surface: "plan-snapshot", sport, locale });
export const run30SnapshotKey = (uid: string): TrainingSurfaceCacheKey => ({ uid, surface: "run30", sport: "run", locale: "program" });
function day(at: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validData(key: TrainingSurfaceCacheKey, data: unknown): boolean {
  if (key.surface === "run30") {
    if (data === null) return true;
    return isRun30Program(data) && Array.isArray(data.history) && data.history.every(isRecord)
      && data.retryDates.every(date => typeof date === "string")
      && (data.next === null || (isRecord(data.next) && typeof data.next.stage === "number"
        && typeof data.next.localDate === "string" && typeof data.next.status === "string"))
      && Number.isFinite(data.revision) && Number.isFinite(data.totalStages);
  }
  if (!isRecord(data) || !Array.isArray(data.weeks)) return false;
  return (data.goal === null ? data.weeks.length === 0
    : isRecord(data.goal) && typeof data.goal.id === "string" && data.goal.userId === key.uid)
    && data.weeks.every(week => isRecord(week) && typeof week.id === "string" && Array.isArray(week.days)
      && week.days.every(isRecord));
}
/** host 승인이 끝난 사용자/로그인 세대의 성공한 JSON DTO만 재사용한다. */
export function readPlanSnapshot<T extends SnapshotData>(key: TrainingSurfaceCacheKey): (Snapshot<T> & { fresh: boolean; freshUntil: number }) | null {
  if (!trainingSurfaceCacheScope()) return null;
  const cached = getTrainingSurfaceCache<Snapshot<T>>(key);
  const now = Date.now();
  if (!cached || !Number.isFinite(cached.savedAt) || cached.savedAt > now
    || now - cached.savedAt >= RETAIN_MS || !validData(key, cached.data)) return null;
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // 일반 계획의 날짜는 planDate.ts와 같은 KST 정본 계약, Run30는 기기 현지 날짜다.
    const planTimezone = key.surface === "plan-snapshot" ? "Asia/Seoul" : timezone;
    let freshUntil = cached.savedAt + FRESH_MS;
    if (day(now, planTimezone) !== day(freshUntil, planTimezone)) {
      let lower = now;
      while (freshUntil - lower > 1) {
        const middle = Math.floor((lower + freshUntil) / 2);
        if (day(middle, planTimezone) === day(now, planTimezone)) lower = middle;
        else freshUntil = middle;
      }
    }
    return { ...cached, freshUntil, fresh: cached.invalidated !== true && now - cached.savedAt < FRESH_MS
      && cached.timezone === timezone && day(now, planTimezone) === day(cached.savedAt, planTimezone) };
  } catch { return null; }
}
export function writePlanSnapshot<T extends SnapshotData>(key: TrainingSurfaceCacheKey, data: T): void {
  if (!trainingSurfaceCacheScope() || !validData(key, data)) return;
  setTrainingSurfaceCache(key, { data, invalidated: false, savedAt: Date.now(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}
export function invalidatePlanSnapshot(key: TrainingSurfaceCacheKey): void {
  if (!trainingSurfaceCacheScope()) return;
  const cached = getTrainingSurfaceCache<Snapshot<SnapshotData>>(key);
  if (cached) setTrainingSurfaceCache(key, { ...cached, invalidated: true });
}
