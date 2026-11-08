/**
 * 모임 집결 시각 하한 — 서버(orider-g1-web `functions/src/event/club-meetings.ts`
 * `assertClubMeetingStartAllowed`)와 같은 경계다. 서버가 권위 있는 검증이고, 여기서는
 * 저장 전에 같은 규칙으로 막아 사용자가 바로 고칠 수 있게 한다.
 */
export const MEETING_START_GRACE_MS = 30 * 60_000;
/** 서버가 경계 위반 거부에 붙이는 `details.reason`. */
export const MEETING_START_TOO_EARLY_REASON = "club-meeting/start-too-early";

/** 입력한 날짜·시각을 한국 시각(+09:00)으로 해석한 epoch ms. 형식이 틀리면 NaN. */
export function meetingStartMs(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    return Number.NaN;
  return Date.parse(`${date}T${time}:00+09:00`);
}

/** 집결 시각이 지금보다 30분 넘게 과거면 true (정확히 30분 전은 허용). */
export function isMeetingStartTooEarly(
  date: string,
  time: string,
  now: number = Date.now(),
): boolean {
  const start = meetingStartMs(date, time);
  return Number.isFinite(start) && start < now - MEETING_START_GRACE_MS;
}
