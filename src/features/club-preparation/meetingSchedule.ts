/**
 * 모임 집결 시각 하한 — 서버(orider-g1-web `functions/src/event/club-meetings.ts`
 * `createClubMeeting`/`updateClubMeeting`)와 같은 경계다: 시각이 현재 이하이면 거부하고
 * 미래만 허용한다. 서버가 권위 있는 검증이고, 여기서는 저장 전에 같은 규칙으로 막아
 * 사용자가 바로 고칠 수 있게 한다.
 */
/** 서버가 과거 시각을 거부할 때 쓰는 메시지(`invalid-argument`, `details` 없음). */
export const SERVER_START_NOT_FUTURE_MESSAGE = "미래의 출발 시각을 선택해주세요.";

/** 입력한 날짜·시각을 한국 시각(+09:00)으로 해석한 epoch ms. 형식이 틀리면 NaN. */
export function meetingStartMs(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    return Number.NaN;
  return Date.parse(`${date}T${time}:00+09:00`);
}

/** 집결 시각이 현재 시각 이하이면 true (미래만 허용). */
export function isMeetingStartNotFuture(
  date: string,
  time: string,
  now: number = Date.now(),
): boolean {
  const start = meetingStartMs(date, time);
  return Number.isFinite(start) && start <= now;
}
