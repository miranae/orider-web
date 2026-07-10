import type { Activity } from "@shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface ConsistencyStreakSummary {
  streakWeeks: number;
  activeDays90d: number;
  activeWeeks90d: number;
  score90d: number;
  thisWeekCount: number;
  needsThisWeek: number;
}

function kstDayOrdinal(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

function kstWeekStartOrdinal(ms: number): number {
  const ordinal = kstDayOrdinal(ms);
  const day = new Date(ordinal * DAY_MS).getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return ordinal - daysSinceMonday;
}

export function computeConsistencyStreak(
  activities: Activity[],
  nowMs = Date.now(),
): ConsistencyStreakSummary | null {
  const windowStart = kstDayOrdinal(nowMs - 90 * DAY_MS);
  const currentWeek = kstWeekStartOrdinal(nowMs);
  const activeDays = new Set<number>();
  const activeWeeks = new Set<number>();

  for (const activity of activities ?? []) {
    if (!activity?.summary || !Number.isFinite(activity.startTime)) continue;
    const day = kstDayOrdinal(activity.startTime);
    if (day < windowStart || day > kstDayOrdinal(nowMs)) continue;
    activeDays.add(day);
    activeWeeks.add(kstWeekStartOrdinal(activity.startTime));
  }

  if (activeWeeks.size === 0) return null;

  const thisWeekCount = Array.from(activeDays).filter((day) => day >= currentWeek && day < currentWeek + 7).length;
  const anchorWeek = activeWeeks.has(currentWeek) ? currentWeek : currentWeek - 7;
  let streakWeeks = 0;
  for (let week = anchorWeek; week >= currentWeek - 12 * 7; week -= 7) {
    if (!activeWeeks.has(week)) break;
    streakWeeks += 1;
  }

  const activeDays90d = activeDays.size;
  const activeWeeks90d = activeWeeks.size;
  const score90d = Math.round(
    Math.min(50, (activeDays90d / 90) * 50) +
    Math.min(30, (activeWeeks90d / 13) * 30) +
    Math.min(20, (streakWeeks / 13) * 20),
  );

  return {
    streakWeeks,
    activeDays90d,
    activeWeeks90d,
    score90d,
    thisWeekCount,
    needsThisWeek: thisWeekCount > 0 ? 0 : 1,
  };
}

export const CONSISTENCY_STREAK_LOOKBACK_MS = 90 * DAY_MS + WEEK_MS;
