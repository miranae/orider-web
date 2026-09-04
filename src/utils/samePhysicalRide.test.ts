import { describe, expect, it } from "vitest";
import {
  dedupeSamePhysicalRides,
  isCrossSourcePhysicalRideDuplicate,
  isOverlappingPhysicalRide,
  isSamePhysicalRide,
  pickPhysicalRideRepresentative,
  type PhysicalRideActivity,
} from "./samePhysicalRide";

/**
 * 이 파일은 앱 정본(`SamePhysicalRide.kt`)의 미러다. 테스트가 없으면 임계가 한쪽에서만
 * 바뀌어도 아무도 모르고, 같은 계정이 플랫폼마다 다른 활동 수를 본다.
 */
const T0 = Date.parse("2026-06-24T10:29:00Z");

const ride = (
  id: string,
  startMin: number,
  distanceKm: number | null,
  movingSec: number | null,
  source: string | null = null,
): PhysicalRideActivity => ({
  id,
  startTime: T0 + startMin * 60_000,
  distanceKm,
  movingSec,
  source,
});

describe("좁은 동일성 판정", () => {
  it("시작·거리·이동시간이 창 안이면 같은 주행", () => {
    expect(isSamePhysicalRide(ride("orider_1", 0, 30, 3600), ride("strava_1", 1, 30.1, 3600))).toBe(true);
  });

  it("시작 시각이 창을 넘으면 다른 주행", () => {
    expect(isSamePhysicalRide(ride("a", 0, 30, 3600), ride("b", 61, 30, 3600))).toBe(false);
  });

  it("거리가 창을 넘으면 다른 주행", () => {
    expect(isSamePhysicalRide(ride("a", 0, 30, 3600), ride("b", 1, 45, 3600))).toBe(false);
  });

  it("이동시간이 창을 넘으면 다른 주행", () => {
    expect(isSamePhysicalRide(ride("a", 0, 30, 3600), ride("b", 1, 30, 7200))).toBe(false);
  });

  it("이동시간을 모르면 불일치로 취급하지 않는다", () => {
    // 모르는 값을 불일치로 보면 중복이 그대로 남는다.
    expect(isSamePhysicalRide(ride("a", 0, 30, null), ride("b", 1, 30, 3600))).toBe(true);
  });
});

describe("겹침 판정", () => {
  it("겹치더라도 평균 속도가 다르면 다른 주행 — 긴 기록을 버리지 않는다", () => {
    // 겹침만 보면 77km 와 3km 를 합치고 대표로 3km 를 남겨 77km 를 버렸다.
    const long = ride("orider_long", 0, 77, 3600, "orider");
    const short = ride("strava_short", 5, 3, 3600, "strava");
    expect(isOverlappingPhysicalRide(long, short)).toBe(false);
    const kept = dedupeSamePhysicalRides([long, short]);
    expect(kept).toHaveLength(2);
    expect(kept.some((row) => row.id === "orider_long")).toBe(true);
  });

  it("1:N 분할은 여전히 잡는다", () => {
    // 분할은 거리·시간이 함께 다르지만 평균 속도는 같다.
    expect(isOverlappingPhysicalRide(
      ride("orider_part", 0, 30, 3600, "orider"),
      ride("strava_whole", 0, 77, 9000, "strava"),
    )).toBe(true);
  });

  it("겹침이 짧으면 다른 주행", () => {
    expect(isOverlappingPhysicalRide(ride("a", 0, 5, 600), ride("b", 9.5, 5, 600))).toBe(false);
  });

  it("이동시간을 모르면 겹침을 판정하지 않는다", () => {
    expect(isOverlappingPhysicalRide(ride("a", 0, 30, null), ride("b", 61, 30, 3600))).toBe(false);
  });
});

describe("교차출처 절", () => {
  it("실기 467km 사례를 잡는다", () => {
    // orider 17:06/77.78km ↔ strava 18:07/70.42km, 둘 다 이동 1시간.
    // 좁은 판정도 겹침도 놓친다(겹침이 음수).
    const orider = ride("orider_x", 0, 77.78, 3600, "orider");
    const strava = ride("strava_x", 61, 70.42, 3600, "strava");
    expect(isSamePhysicalRide(orider, strava)).toBe(false);
    expect(isOverlappingPhysicalRide(orider, strava)).toBe(false);
    expect(isCrossSourcePhysicalRideDuplicate(orider, strava)).toBe(true);
    expect(dedupeSamePhysicalRides([orider, strava]).map((row) => row.id)).toEqual(["strava_x"]);
  });

  it("같은 출처끼리는 발화하지 않는다", () => {
    // 넓은 창을 같은 출처에 적용하면 연속된 별개 주행을 삼킨다.
    const first = ride("orider_1", 0, 40, 3600, "orider");
    const second = ride("orider_2", 80, 41, 3600, "orider");
    expect(isCrossSourcePhysicalRideDuplicate(first, second)).toBe(false);
    expect(dedupeSamePhysicalRides([first, second])).toHaveLength(2);
  });

  it("출처를 모르면 쓰지 않는다", () => {
    expect(isCrossSourcePhysicalRideDuplicate(ride("a", 0, 40, 3600), ride("b", 80, 41, 3600))).toBe(false);
  });

  it("창을 넘거나 거리가 크게 다르면 다른 주행", () => {
    expect(isCrossSourcePhysicalRideDuplicate(
      ride("orider_am", 0, 40, 3600, "orider"), ride("strava_pm", 300, 40, 3600, "strava"),
    )).toBe(false);
    expect(isCrossSourcePhysicalRideDuplicate(
      ride("orider_l", 0, 77, 3600, "orider"), ride("strava_s", 5, 3, 3600, "strava"),
    )).toBe(false);
  });
});

describe("대표 선택", () => {
  it("Strava 를 우선한다", () => {
    const group = [ride("orider_1", 0, 30, 3600, "orider"), ride("strava_1", 1, 30.1, 3600, "strava")];
    expect(pickPhysicalRideRepresentative(group).id).toBe("strava_1");
  });

  it("순서에 의존하지 않는다", () => {
    // 결정형이 아니면 플랫폼마다 다른 활동이 보인다.
    const a = ride("orider_a", 0, 30, 3600, "orider");
    const b = ride("orider_b", 1, 30.1, 3600, "orider");
    expect(pickPhysicalRideRepresentative([a, b]).id).toBe(pickPhysicalRideRepresentative([b, a]).id);
  });

  it("세 벌이 들어와도 한 건으로 묶는다", () => {
    const rows = [
      ride("orider_1", 0, 30, 3600, "orider"),
      ride("strava_1", 1, 30.1, 3600, "strava"),
      ride("hc_1", 1.5, 30.05, 3600, "health_connect"),
    ];
    expect(dedupeSamePhysicalRides(rows)).toHaveLength(1);
  });
});
