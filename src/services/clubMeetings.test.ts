import { describe, expect, it, vi } from "vitest";
import {
  clubMeetingAuthoring,
  createClubMeeting,
  finishClubMeeting,
  updateClubMeeting,
  saveClubMeetingTeams,
} from "./clubMeetings";
import { newClubMeeting } from "../features/club-preparation/meetingCopy";
const api = vi.hoisted(() => ({ call: vi.fn(), ready: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => api.call) }));
vi.mock("./firebase", () => ({
  functions: {},
  ensureAppCheckReady: api.ready,
}));
describe("서버 모임 작성 계약", () => {
  it("소유자·신청·모집상태를 작성payload에서 제외하고 같은 요청 ID로 생성한다", async () => {
    api.call.mockResolvedValue({ data: { eventId: "server-created" } });
    const meeting = {
      ...newClubMeeting(),
      id: "forged",
      hostId: "forged-host",
      recruitment: "closed" as const,
      status: "cancelled" as const,
    };
    const authoring = clubMeetingAuthoring(meeting);
    expect(authoring).not.toHaveProperty("id");
    expect(authoring).not.toHaveProperty("hostId");
    expect(authoring).not.toHaveProperty("registrations");
    expect(authoring).not.toHaveProperty("notices");
    expect(authoring).not.toHaveProperty("status");
    expect(authoring).not.toHaveProperty("recruitment");
    await createClubMeeting("club", meeting, "stable-request");
    expect(api.call).toHaveBeenLastCalledWith({
      groupId: "club",
      meeting: authoring,
      requestId: "stable-request",
    });
    await updateClubMeeting("server-created", meeting, 4);
    expect(api.call).toHaveBeenLastCalledWith({
      eventId: "server-created",
      meeting: authoring,
      expectedRevision: 4,
    });
    expect(api.ready).toHaveBeenCalled();
  });
  it("서버 상한보다 큰 코스를 요청 전에 거절한다", () => {
    expect(() =>
      clubMeetingAuthoring({
        ...newClubMeeting(),
        description: "가".repeat(240000),
      }),
    ).toThrow("club-meeting/payload-limit");
    const geometry = Array.from({ length: 2001 }, () => ({
      lat: 37,
      lon: 127,
    }));
    expect(() =>
      clubMeetingAuthoring({
        ...newClubMeeting(),
        segments: Array.from({ length: 10 }, (_, i) => ({
          id: `seg-${i}`,
          name: "section",
          mode: "함께",
          instruction: "",
          source: "public-catalog",
          geometry,
        })),
      }),
    ).toThrow("club-meeting/payload-limit");
  });
});

it("조편성 저장은 revision을 보내며 미설정 정원·조장은 undefined 없이 전송한다", async () => {
  api.call.mockResolvedValue({ data: { revision: 6 } });
  await saveClubMeetingTeams({
    eventId: "meeting",
    expectedRevision: 5,
    teams: [
      {
        id: "team-1",
        name: "1조",
        capacity: undefined,
        leaderId: undefined,
        memberIds: ["member"],
      },
    ],
  });
  expect(api.call).toHaveBeenLastCalledWith({
    eventId: "meeting",
    expectedRevision: 5,
    teams: [{ id: "team-1", name: "1조", memberIds: ["member"] }],
  });
});

it("모임 마무리는 서버 권한 검사에 ID와 revision만 전달한다", async()=>{api.call.mockResolvedValue({data:{success:true}});await finishClubMeeting("meeting",9);expect(api.ready).toHaveBeenCalled();expect(api.call).toHaveBeenLastCalledWith({eventId:"meeting",expectedRevision:9});});
