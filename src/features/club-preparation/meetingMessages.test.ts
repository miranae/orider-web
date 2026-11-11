import { describe, expect, it } from "vitest";
import { meetingErrorMessage } from "./meetingMessages";

describe("모임 저장 오류 문구", () => {
  const venueRequired = { code: "functions/invalid-argument", details: { reason: "club-meeting/venue-required" } };
  it("실내 실외 미선택 사유를 구체 문구로 안내한다", () => {
    expect(meetingErrorMessage(venueRequired)).toContain("실내 모임인지 실외 모임인지 선택해주세요.");
    expect(meetingErrorMessage(venueRequired, true)).toContain("indoor or outdoor");
  });
  it("사유가 없는 형식 오류는 기존 일반 문구를 쓴다", () => {
    expect(meetingErrorMessage({ code: "functions/invalid-argument" })).toContain("저장 또는 최신 상태 확인에 실패했어요.");
  });
});
