import type { Meeting } from "./domain";
/** 복사할 때 소유자·참가자·개최일 확정을 이어받지 않는다. */
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
export function copyClubMeeting(meeting: Meeting): Meeting {
  return {
    ...structuredClone(meeting),
    id: "new",
    hostId: undefined,
    teams: [],
    date: "",
    time: meeting.time,
    courseReady: false,
    weather: "",
    status: "open",
    recruitment: undefined,
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
