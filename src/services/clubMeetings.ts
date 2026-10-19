import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "./firebase";
import type { Meeting, MeetingTeam } from "../features/club-preparation/domain";
export type ClubMeeting = Meeting & { kindName?: string };
export interface ClubMeetingSnapshot {
  eventId: string;
  groupId: string;
  revision: number;
  isHost: boolean;
  meeting: ClubMeeting;
  members: { id: string; name: string }[];
}
export type ClubMeetingListItem = ClubMeetingSnapshot & {
  participantCount: number;
  waitingCount: number;
};
export type MeetingAttendanceAction =
  "join" | "cancel" | "leave-waitlist" | "accept-offer" | "travel";
async function call<Request, Response>(
  name: string,
  request: Request,
): Promise<Response> {
  await ensureAppCheckReady();
  return (await httpsCallable<Request, Response>(functions, name)(request))
    .data;
}
/** 참가자·권한·현재 모집 상태는 서버가 결정한다. 작성 필드만 보낸다. */
export function clubMeetingAuthoring(meeting: ClubMeeting) {
  const {
    kindId,
    kindName,
    title,
    date,
    time,
    place,
    capacity,
    pace,
    description,
    courseReady,
    fee,
    joins,
    parking,
    weather,
    courseInfoVersion,
    distanceKm,
    elevationGainM,
    courseHighlights,
    courseStops,
    courseTrack,
    segments,
    courseSource,
    courseCheckpoints,
  } = meeting;
  const authoring = JSON.parse(
    JSON.stringify({
      kindId,
      kindName,
      title,
      date,
      time,
      place,
      capacity,
      pace,
      description,
      courseReady,
      fee,
      joins,
      parking,
      weather,
      courseInfoVersion,
      distanceKm,
      elevationGainM,
      courseHighlights,
      courseStops,
      courseTrack,
      segments,
      courseSource,
      courseCheckpoints,
    }),
  ) as Omit<
    ClubMeeting,
    | "id"
    | "hostId"
    | "registrations"
    | "notices"
    | "status"
    | "recruitment"
    | "teams"
  >;
  const count =
    (courseTrack?.points.length ?? 0) +
    (courseTrack?.elevationProfile?.length ?? 0) +
    (segments ?? []).reduce(
      (sum, segment) =>
        sum +
        (segment.geometry?.length ?? 0) +
        (segment.elevationProfile?.length ?? 0),
      0,
    );
  if (
    count > 20000 ||
    new TextEncoder().encode(JSON.stringify(authoring)).length > 700 * 1024
  )
    throw new Error("club-meeting/payload-limit");
  return authoring;
}
export const createClubMeeting = (
  groupId: string,
  meeting: ClubMeeting,
  requestId: string,
) =>
  call<
    {
      groupId: string;
      meeting: ReturnType<typeof clubMeetingAuthoring>;
      requestId: string;
    },
    { eventId: string }
  >("createClubMeeting", {
    groupId,
    meeting: clubMeetingAuthoring(meeting),
    requestId,
  });
export const updateClubMeeting = (
  eventId: string,
  meeting: ClubMeeting,
  expectedRevision: number,
) =>
  call<
    {
      eventId: string;
      meeting: ReturnType<typeof clubMeetingAuthoring>;
      expectedRevision: number;
    },
    { revision: number }
  >("updateClubMeeting", {
    eventId,
    meeting: clubMeetingAuthoring(meeting),
    expectedRevision,
  });
export const getClubMeetingSnapshot = (eventId: string) =>
  call<{ eventId: string }, ClubMeetingSnapshot>("getClubMeetingSnapshot", {
    eventId,
  });
export const listClubMeetings = (groupId: string, cursor?: string) =>
  call<
    { groupId: string; cursor?: string },
    { meetings: ClubMeetingListItem[]; nextCursor: string | null }
  >("listClubMeetings", { groupId, ...(cursor ? { cursor } : {}) }).then(
    (result) => {
      if (!Array.isArray(result?.meetings))
        throw new Error("Invalid club meeting list");
      return result;
    },
  );
export const setClubMeetingRecruitment = (
  eventId: string,
  mode: "open" | "waitlist" | "closed",
) => call("setClubMeetingRecruitment", { eventId, mode });
export const cancelClubMeeting = (eventId: string, reason: string) =>
  call("cancelClubMeeting", { eventId, reason });
export const clubMeetingAttendance = (
  eventId: string,
  action: MeetingAttendanceAction,
  travel?: { joinId?: string; outbound?: string; inbound?: string },
) => call("clubMeetingAttendance", { eventId, action, ...travel });
export const publishClubMeetingNotice = (
  eventId: string,
  title: string,
  body: string,
) => call("publishClubMeetingNotice", { eventId, title, body });
export const confirmClubMeetingNotice = (eventId: string, noticeId: string) =>
  call("confirmClubMeetingNotice", { eventId, noticeId });

/** 조편성은 최신 참석 명단과 revision을 서버에서 검증한 뒤 저장한다. */
export const saveClubMeetingTeams = (request: {
  eventId: string;
  expectedRevision: number;
  teams: MeetingTeam[];
}) =>
  call<typeof request, { revision: number }>(
    "saveClubMeetingTeams",
    JSON.parse(JSON.stringify(request)) as typeof request,
  );
