// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMeetingRequestId,
  meetingRequestId,
  newClubMeeting,
} from "./meetingCopy";
beforeEach(() => localStorage.clear());
describe("실제 모임 새 작성", () => {
  it("새 작성은 로그인 역할과 시드 참석자를 미리 정하지 않는다", () => {
    const meeting = newClubMeeting();
    expect(meeting.hostId).toBeUndefined();
    expect(meeting.registrations).toEqual([]);
    expect(meeting.title).toBe("");
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
