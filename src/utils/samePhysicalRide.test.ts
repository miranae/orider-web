import { describe, expect, it } from "vitest";
import {
  dedupeSamePhysicalRides,
  groupSamePhysicalRides,
  isSamePhysicalRide,
  physicalRideIdentityKeys,
  physicalRideSourceRank,
  pickPhysicalRideRepresentative,
  type PhysicalRideActivity,
} from "./samePhysicalRide";

/**
 * 이 파일은 앱 정본(`SamePhysicalRide.kt`)의 미러다. 테스트가 없으면 규칙이 한쪽에서만
 * 바뀌어도 아무도 모르고, 같은 계정이 플랫폼마다 다른 활동 수를 본다.
 */
const T0 = Date.parse("2026-06-24T10:29:00Z");
const ride = (
  id: string,
  link: { session?: string | null; strava?: number | null } = {},
  extra: Partial<PhysicalRideActivity> = {},
): PhysicalRideActivity => ({
  id,
  localSessionId: link.session ?? null,
  stravaActivityId: link.strava ?? null,
  startTime: T0,
  distanceKm: 30,
  movingSec: 3600,
  ...extra,
});

describe("식별 키", () => {
  it("접두사를 단다 — 세션 id 와 문서 id 가 우연히 같아도 섞이지 않는다", () => {
    expect(physicalRideIdentityKeys(ride("orider_x", { session: "x", strava: 9 })))
      .toEqual(["doc:orider_x", "session:x", "strava:9"]);
    expect(isSamePhysicalRide(ride("x"), ride("other", { session: "x" }))).toBe(false);
  });

  it("빈 문자열·NaN 은 키가 되지 않는다", () => {
    expect(physicalRideIdentityKeys(ride("a", { session: "", strava: Number.NaN }))).toEqual(["doc:a"]);
  });
});

describe("판정", () => {
  it("링크된 orider·strava 쌍은 같은 주행 — 시각 차는 무관", () => {
    const orider = ride("orider_s1", { session: "s1", strava: 777 }, { source: "orider" });
    const strava = ride("strava_777", { strava: 777 }, { source: "strava", startTime: T0 + 61 * 60_000, distanceKm: 27 });
    expect(isSamePhysicalRide(orider, strava)).toBe(true);
    expect(dedupeSamePhysicalRides([orider, strava]).map((r) => r.id)).toEqual(["strava_777"]);
  });

  it("링크가 없으면 다른 주행 — 시각·거리가 같아도. 모르는 것을 같다고 하지 않는다", () => {
    const orider = ride("orider_s1", { session: "s1" }, { source: "orider" });
    const strava = ride("strava_777", { strava: 777 }, { source: "strava" });
    expect(isSamePhysicalRide(orider, strava)).toBe(false);
    expect(dedupeSamePhysicalRides([orider, strava])).toHaveLength(2);
  });

  it("세 벌(로컬~orider~strava)은 전이적으로 한 건", () => {
    const local = ride("s1", { session: "s1" }, { source: "orider" });
    const orider = ride("orider_s1", { session: "s1", strava: 777 }, { source: "orider" });
    const strava = ride("strava_777", { strava: 777 }, { source: "strava" });
    expect(groupSamePhysicalRides([local, orider, strava])).toHaveLength(1);
  });

  it("같은 세션의 이중 업로드는 한 건", () => {
    expect(dedupeSamePhysicalRides([
      ride("orider_a", { session: "s1" }, { source: "orider" }),
      ride("orider_b", { session: "s1" }, { source: "orider" }),
    ])).toHaveLength(1);
  });
});

describe("대표 선택", () => {
  it("Strava > 헬스 > orider", () => {
    expect(physicalRideSourceRank(ride("a", {}, { source: "strava" }))).toBe(0);
    expect(physicalRideSourceRank(ride("a", {}, { source: "health_connect" }))).toBe(1);
    expect(physicalRideSourceRank(ride("a", {}, { source: "orider" }))).toBe(2);
    expect(physicalRideSourceRank(ride("strava_9"))).toBe(0);
  });

  it("같은 랭크면 부하 → 이동시간 → id, 순서에 의존하지 않는다", () => {
    const a = ride("orider_b", { session: "s" }, { source: "orider" });
    const b = ride("orider_a", { session: "s" }, { source: "orider", hasLoad: true });
    expect(pickPhysicalRideRepresentative([a, b]).id).toBe("orider_a");
    expect(pickPhysicalRideRepresentative([b, a]).id).toBe("orider_a");
    const x = ride("orider_x", { session: "s" }, { source: "orider" });
    const y = ride("orider_y", { session: "s" }, { source: "orider" });
    expect(pickPhysicalRideRepresentative([y, x]).id).toBe("orider_x");
  });

  it("입력 순서를 보존한다", () => {
    const rows = [
      ride("strava_9", { strava: 9 }, { source: "strava" }),
      ride("orider_s1", { session: "s1", strava: 7 }, { source: "orider" }),
      ride("strava_7", { strava: 7 }, { source: "strava" }),
    ];
    expect(dedupeSamePhysicalRides(rows).map((r) => r.id)).toEqual(["strava_9", "strava_7"]);
  });
});
