import { describe, expect, it } from "vitest";
import {
  SERVER_START_NOT_FUTURE_MESSAGE,
  isMeetingStartNotFuture,
  meetingStartMs,
} from "./meetingSchedule";
import { meetingErrorMessage } from "./meetingMessages";

const kst = (iso: string) => Date.parse(`${iso}+09:00`);

describe("모임 집결 시각 하한 (현재 시각 이하 거부)", () => {
  it("입력을 한국 시각으로 해석한다", () => {
    expect(meetingStartMs("2026-11-08", "10:00")).toBe(kst("2026-11-08T10:00:00"));
    expect(meetingStartMs("2026-11-08", "25:00")).toBeNaN();
    expect(meetingStartMs("garbage", "10:00")).toBeNaN();
  });
  it("현재 시각 정각은 거부한다", () => {
    expect(
      isMeetingStartNotFuture("2026-11-08", "10:00", kst("2026-11-08T10:00:00")),
    ).toBe(true);
  });
  it("과거는 거부한다 (자정을 넘긴 전날 포함)", () => {
    expect(
      isMeetingStartNotFuture("2026-11-08", "09:59", kst("2026-11-08T10:00:00")),
    ).toBe(true);
    expect(
      isMeetingStartNotFuture("2026-11-07", "23:59", kst("2026-11-08T00:00:30")),
    ).toBe(true);
  });
  it("1분 뒤부터는 허용한다", () => {
    expect(
      isMeetingStartNotFuture("2026-11-08", "10:01", kst("2026-11-08T10:00:00")),
    ).toBe(false);
  });
  it("서버의 과거 시각 거부를 구체 문구로 보여준다", () => {
    const error = Object.assign(new Error(SERVER_START_NOT_FUTURE_MESSAGE), {
      code: "functions/invalid-argument",
    });
    expect(meetingErrorMessage(error)).toContain("집결 시각이 이미 지났어요");
    expect(meetingErrorMessage(error, true)).toContain("already passed");
    const other = Object.assign(new Error("모임 일시를 확인해주세요."), {
      code: "functions/invalid-argument",
    });
    expect(meetingErrorMessage(other)).toContain(
      "저장 또는 최신 상태 확인에 실패했어요",
    );
  });
});
