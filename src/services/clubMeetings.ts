import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "./firebase";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { Meeting, MeetingTeam } from "../features/club-preparation/domain";
export interface MeetingDiscordView {
  available: boolean;
  isHost: boolean;
  linked: boolean;
  state: "none" | "preparing" | "ready" | "closing" | "closed";
  inviteUrl: string | null;
  channelUrl: string | null;
  serverInviteUrl: string | null;
  expiresAt: number | null;
}
export type ClubMeeting = Meeting & { kindName?: string };
export interface ClubMeetingSnapshot {
  runtimeWindow?: { opensAtMs: number; closesAtMs: number } | null;
  eventId: string;
  groupId: string;
  rideStatus?: "OPEN" | "LIVE" | "FINISHED" | "CANCELLED";
  completion?: {
    state: "ready" | "processing";
    riders?: {uid: string; displayName: string; status: "FINISHED" | "DNF" | "RESULT_PENDING" | "NO_RECORDING"; durationMs: number | null}[];
    summary: {totalParticipants: number; finishedCount: number; pendingCount: number; dnfCount: number} | null;
    own?: {status: string; verified: boolean; durationMs: number | null};
  };
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
type MeetingServices = Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady">;
export function createClubMeetingsApi(services?: MeetingServices) {
  async function call<Request, Response>(name: string, request: Request): Promise<Response> {
    const provider = services ?? { functions, ensureAppCheckReady };
    const viewer = services?.auth.currentUser;
    const current = () => !services || services.auth.currentUser === viewer;
    await provider.ensureAppCheckReady();
    if (!current()) throw new Error("account_changed");
    const response = await httpsCallable<Request, Response>(provider.functions, name)(request);
    if (!current()) throw new Error("account_changed");
    return response.data;
  }
const createClubMeeting = (
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
const updateClubMeeting = (
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
const getClubMeetingSnapshot = (eventId: string) =>
  call<{ eventId: string }, ClubMeetingSnapshot>("getClubMeetingSnapshot", {
    eventId,
  });
const listClubMeetings = (groupId: string, cursor?: string) =>
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
const setClubMeetingRecruitment = (
  eventId: string,
  mode: "open" | "waitlist" | "closed",
) => call("setClubMeetingRecruitment", { eventId, mode });
const cancelClubMeeting = (eventId: string, reason: string) =>
  call("cancelClubMeeting", { eventId, reason });
const clubMeetingAttendance = (
  eventId: string,
  action: MeetingAttendanceAction,
  travel?: { joinId?: string; outbound?: string; inbound?: string },
) => call("clubMeetingAttendance", { eventId, action, ...travel });
const publishClubMeetingNotice = (
  eventId: string,
  title: string,
  body: string,
) => call("publishClubMeetingNotice", { eventId, title, body });
const confirmClubMeetingNotice = (eventId: string, noticeId: string) =>
  call("confirmClubMeetingNotice", { eventId, noticeId });

/** 조편성은 최신 참석 명단과 revision을 서버에서 검증한 뒤 저장한다. */
const saveClubMeetingTeams = (request: {
  eventId: string;
  expectedRevision: number;
  teams: MeetingTeam[];
}) =>
  call<typeof request, { revision: number }>(
    "saveClubMeetingTeams",
    JSON.parse(JSON.stringify(request)) as typeof request,
  );

/** 호스트 권한과 최신 revision은 서버가 확인한다. 개인 주행 시작/종료를 대신하지 않는다. */
const finishClubMeeting = (eventId: string, expectedRevision: number) =>
  call<{eventId: string; expectedRevision: number}, {success: true}>("finishClubMeeting", {eventId, expectedRevision});

const getClubMeetingDiscord = (eventId: string) => call<{eventId: string}, MeetingDiscordView>("getClubMeetingDiscord", {eventId});
const openClubMeetingDiscord = (eventId: string) => call<{eventId: string}, MeetingDiscordView>("openClubMeetingDiscord", {eventId});
const closeClubMeetingDiscord = (eventId: string) => call<{eventId: string}, MeetingDiscordView>("closeClubMeetingDiscord", {eventId});
return { getClubMeetingDiscord, openClubMeetingDiscord, closeClubMeetingDiscord, createClubMeeting, updateClubMeeting, getClubMeetingSnapshot, listClubMeetings, setClubMeetingRecruitment, cancelClubMeeting, clubMeetingAttendance, publishClubMeetingNotice, confirmClubMeetingNotice, saveClubMeetingTeams, finishClubMeeting };
}

// Resolve live default bindings when a request starts, after Firebase initialization.
export const { createClubMeeting, updateClubMeeting, getClubMeetingSnapshot, listClubMeetings, setClubMeetingRecruitment, cancelClubMeeting, clubMeetingAttendance, publishClubMeetingNotice, confirmClubMeetingNotice, saveClubMeetingTeams, finishClubMeeting } = createClubMeetingsApi();
