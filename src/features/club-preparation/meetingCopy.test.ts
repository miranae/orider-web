// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMeetingRequestId,
  copyClubMeeting,
  meetingRequestId,
  newClubMeeting,
} from "./meetingCopy";
beforeEach(() => localStorage.clear());
describe("실제 모임 새 작성과 복사", () => {
  it("새 작성은 로그인 역할과 시드 참석자를 미리 정하지 않는다", () => {
    const meeting = newClubMeeting();
    expect(meeting.hostId).toBeUndefined();
    expect(meeting.registrations).toEqual([]);
    expect(meeting.title).toBe("");
  });
  it("코스는 재사용하고 소유·신청·공지·날짜 확정은 복사하지 않는다", () => {
    const original = {
      ...newClubMeeting(),
      hostId: "other",
      date: "2026-11-25",
      courseReady: true,
      courseTrack: {
        fileName: "real",
        distanceKm: 1,
        points: [
          { lat: 37, lon: 127 },
          { lat: 37.01, lon: 127 },
        ],
      },
    };
    const copy = copyClubMeeting(original);
    expect(copy.hostId).toBeUndefined();
    expect(copy.date).toBe("");
    expect(copy.courseReady).toBe(false);
    expect(copy.courseTrack).toEqual(original.courseTrack);
    copy.courseTrack!.points[0]!.lat = 38;
    expect(original.courseTrack.points[0]!.lat).toBe(37);
  });
  it("동일 초안 재시도는 요청 ID를 유지하고 사용자·클럽 범위를 나눈다", () => {
    const request = meetingRequestId("user", "club");
    expect(meetingRequestId("user", "club")).toBe(request);
    expect(meetingRequestId("other", "club")).not.toBe(request);
    expect(meetingRequestId("user", "other")).not.toBe(request);
    clearMeetingRequestId("user", "club");
    expect(meetingRequestId("user", "club")).not.toBe(request);
  });
});
