import { describe, expect, it } from "vitest";
import { canEditActivityMemo } from "./activityMemoEditable";

describe("활동 메모 직접 수정 대상", () => {
  it("O-Rider 기록과 Strava 가져온 활동 모두 메모를 고칠 수 있다", () => {
    expect(canEditActivityMemo("orider")).toBe(true);
    expect(canEditActivityMemo("strava")).toBe(true);
  });
  it("그 밖의 출처는 서버가 편집을 거부하므로 편집 버튼을 두지 않는다", () => {
    for (const source of ["garmin", "fit", undefined, null, ""]) expect(canEditActivityMemo(source)).toBe(false);
  });
});
