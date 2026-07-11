import { describe, it, expect } from "vitest";
import { seoulWeekStartMs, seoulWeekday, seoulWeekRange, isWithin, WEEK_MS } from "./seoulWeek";

/** KST 벽시계 문자열 → epoch ms (UTC+9). */
const kst = (iso: string) => new Date(`${iso}+09:00`).getTime();

describe("seoulWeekStartMs", () => {
  it("주중 어느 시각이든 그 주 월요일 00:00 KST 를 가리킨다", () => {
    const monday = kst("2026-07-06T00:00:00");
    for (const t of [
      kst("2026-07-06T00:00:00"),
      kst("2026-07-08T13:20:00"),
      kst("2026-07-12T23:59:59"),
    ]) {
      expect(seoulWeekStartMs(t)).toBe(monday);
    }
  });

  it("일요일 자정 직전과 월요일 자정은 서로 다른 주다", () => {
    const sundayLate = kst("2026-07-12T23:59:59");
    const mondayStart = kst("2026-07-13T00:00:00");
    expect(seoulWeekStartMs(sundayLate)).not.toBe(seoulWeekStartMs(mondayStart));
    expect(seoulWeekStartMs(mondayStart)).toBe(mondayStart);
  });

  it("브라우저 로컬 타임존과 무관하게 같은 결과 (UTC 기준 계산)", () => {
    // 2026-07-13 00:30 KST = 2026-07-12 15:30 UTC — UTC 기준으론 아직 일요일이다.
    const justAfterKstMonday = Date.parse("2026-07-12T15:30:00Z");
    expect(seoulWeekStartMs(justAfterKstMonday)).toBe(kst("2026-07-13T00:00:00"));
  });

  it("KST 월요일 00:00 직전(일요일 23:59 KST)은 이전 주로 분류", () => {
    const beforeKstMonday = Date.parse("2026-07-12T14:59:00Z"); // = 07-12 23:59 KST (일)
    expect(seoulWeekStartMs(beforeKstMonday)).toBe(kst("2026-07-06T00:00:00"));
  });
});

describe("seoulWeekday", () => {
  it.each([
    ["2026-07-06T09:00:00", 0], // 월
    ["2026-07-08T09:00:00", 2], // 수
    ["2026-07-12T09:00:00", 6], // 일
  ])("%s → %d", (iso, expected) => {
    expect(seoulWeekday(kst(iso))).toBe(expected);
  });
});

describe("seoulWeekRange", () => {
  const now = kst("2026-07-15T10:00:00"); // 수요일

  it("weeksAgo=0 은 이번 주", () => {
    const r = seoulWeekRange(now, 0);
    expect(r.startMs).toBe(kst("2026-07-13T00:00:00"));
    expect(r.endMs).toBe(r.startMs + WEEK_MS);
  });

  it("weeksAgo=1 은 지난주, 2 는 그 전주", () => {
    expect(seoulWeekRange(now, 1).startMs).toBe(kst("2026-07-06T00:00:00"));
    expect(seoulWeekRange(now, 2).startMs).toBe(kst("2026-06-29T00:00:00"));
  });

  it("범위는 시작 포함·끝 배타", () => {
    const r = seoulWeekRange(now, 1);
    expect(isWithin(r.startMs, r)).toBe(true);
    expect(isWithin(r.endMs - 1, r)).toBe(true);
    expect(isWithin(r.endMs, r)).toBe(false);
  });

  it("인접한 두 주는 겹치지 않고 빈틈도 없다", () => {
    const last = seoulWeekRange(now, 1);
    const prev = seoulWeekRange(now, 2);
    expect(prev.endMs).toBe(last.startMs);
  });
});
