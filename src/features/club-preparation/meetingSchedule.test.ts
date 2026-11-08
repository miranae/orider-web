import { describe, expect, it } from "vitest";
import {
  MEETING_START_GRACE_MS,
  MEETING_START_TOO_EARLY_REASON,
  isMeetingStartTooEarly,
  meetingStartMs,
} from "./meetingSchedule";
import { meetingErrorMessage } from "./meetingMessages";

const kst = (iso: string) => Date.parse(`${iso}+09:00`);

describe("모임 집결 시각 하한 (현재 − 30분)", () => {
  it("입력을 한국 시각으로 해석한다", () => {
    expect(meetingStartMs("2026-11-08", "10:00")).toBe(kst("2026-11-08T10:00:00"));
    expect(meetingStartMs("2026-11-08", "25:00")).toBeNaN();
    expect(meetingStartMs("garbage", "10:00")).toBeNaN();
  });
  it("정확히 30분 전은 허용한다", () => {
    expect(MEETING_START_GRACE_MS).toBe(30 * 60_000);
    expect(
      isMeetingStartTooEarly("2026-11-08", "10:00", kst("2026-11-08T10:30:00")),
    ).toBe(false);
  });
  it("30분하고 1초 지난 시각은 거부한다", () => {
    expect(
      isMeetingStartTooEarly("2026-11-08", "10:00", kst("2026-11-08T10:30:01")),
    ).toBe(true);
  });
  it("자정을 넘긴 과거 날짜도 거부한다", () => {
    expect(
      isMeetingStartTooEarly("2026-11-07", "23:50", kst("2026-11-08T00:30:00")),
    ).toBe(true);
  });
  it("현재·미래는 허용한다", () => {
    const now = kst("2026-11-08T10:00:00");
    expect(isMeetingStartTooEarly("2026-11-08", "10:00", now)).toBe(false);
    expect(isMeetingStartTooEarly("2026-11-09", "07:00", now)).toBe(false);
  });
  it("서버의 하한 위반 사유를 구체 문구로 보여준다", () => {
    const error = Object.assign(new Error("server"), {
      code: "functions/invalid-argument",
      details: { reason: MEETING_START_TOO_EARLY_REASON },
    });
    expect(meetingErrorMessage(error)).toContain("30분 넘게 지났어요");
    expect(meetingErrorMessage(error, true)).toContain("30 minutes in the past");
    expect(
      meetingErrorMessage({ code: "functions/invalid-argument", details: null }),
    ).toContain("저장 또는 최신 상태 확인에 실패했어요");
  });
});
