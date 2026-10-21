import { seoulWeekStartMs, WEEK_MS } from "./seoulWeek";

const DAY_MS = 86400000;
const dayStart = (ms: number) => Math.floor((ms + 9 * 3600000) / DAY_MS) * DAY_MS - 9 * 3600000;

/** 조회한 기간만 증명한다. 기간·행 한도 너머의 빈 주를 추정하지 않는다. */
export function profileWeeklyStreak(timestamps: number[], coveredSince: number, now: number) {
  const currentWeek = seoulWeekStartMs(now);
  const valid = timestamps.filter(time => Number.isFinite(time) && time <= now);
  const weeks = new Set(valid.map(seoulWeekStartMs));
  const days = new Set(valid.map(dayStart));
  let anchor = currentWeek;
  let weeksCount = 0;
  let atLeast = false;
  if (!weeks.has(currentWeek)) {
    if (coveredSince > currentWeek) atLeast = true;
    else anchor -= WEEK_MS; // 이번 주는 아직 운동할 수 있으므로 지난주까지 연속성을 유지한다.
  }
  if (!atLeast) {
    for (let week = anchor; ; week -= WEEK_MS) {
      if (weeks.has(week)) weeksCount += 1;
      else if (week >= coveredSince) break;
      if (week <= coveredSince) { atLeast = true; break; }
    }
  }
  return {
    weeksCount: atLeast && weeksCount === 0 ? null : weeksCount,
    atLeast,
    week: Array.from({ length: 7 }, (_, index) => {
      const timestamp = currentWeek + index * DAY_MS;
      return { timestamp, today: timestamp === dayStart(now), future: timestamp > now,
        active: days.has(timestamp) ? true : timestamp >= coveredSince ? false : null };
    }),
  };
}
