import type { Meeting } from "./domain";
/** 새 모임 초안 — 소유자·참가자·개최일을 미리 정하지 않는다. 기존 모임 복사는 옛 코스 경로가 따라와 없앴다(2026-11-15). */
export function newClubMeeting(): Meeting {
  return {
    id: "new",
    kindId: "flash",
    title: "",
    date: "",
    time: "08:00",
    place: "",
    capacity: 12,
    pace: "",
    description: "",
    courseReady: false,
    fee: 0,
    joins: [{ id: "main", place: "", time: "08:00" }],
    parking: "",
    weather: "",
    status: "open",
    registrations: [],
    notices: [],
  };
}
export function meetingRequestId(uid: string, groupId: string): string {
  const key = `orider.club-meeting.request.v1.${encodeURIComponent(uid)}.${encodeURIComponent(groupId)}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}
export function clearMeetingRequestId(uid: string, groupId: string): void {
  localStorage.removeItem(
    `orider.club-meeting.request.v1.${encodeURIComponent(uid)}.${encodeURIComponent(groupId)}`,
  );
}
