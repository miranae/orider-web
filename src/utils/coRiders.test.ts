import { describe, expect, it } from "vitest";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";
import { selectActualCoRiders } from "./coRiders";

function activity(overrides: Parameters<typeof createMockActivity>[0]) {
  return createMockActivity({
    groupRideId: "orider_6835c14b-b58b-4281-98f0-355103032ebf",
    visibility: "everyone",
    ...overrides,
  });
}

function confirmed<T extends ReturnType<typeof activity>>(item: T, peerUserIds: string[]): T {
  return {
    ...item,
    groupRideMatchState: "confirmed",
    groupRideMatchVersion: 3,
    groupRideConfirmedPeerUserIds: peerUserIds,
  };
}

const nearRoute = "37.5000,127.0000;37.5010,127.0010;37.5020,127.0020;37.5030,127.0030";
const farRoute = "35.1000,129.0000;35.1010,129.0010;35.1020,129.0020;35.1030,129.0030";

describe("selectActualCoRiders", () => {
  it("keeps only actual outdoor ride companions from a mixed groupRideId bucket", () => {
    const base = confirmed(activity({
      id: "strava_19213309217",
      userId: "bok",
      nickname: "Bok Lee",
      type: "Ride",
      startTime: 1_783_424_283_000,
      endTime: 1_783_424_640_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 1_725.1, ridingTimeMillis: 357_000 }),
    }), ["outdoor-rider", "long-rider", "actual-rider"]);

    const candidates = [
      confirmed(activity({
        id: "strava_19212521831",
        userId: "rider-before",
        nickname: "라선오 short before",
        type: "Ride",
        startTime: 1_783_418_917_000,
        endTime: 1_783_421_216_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 6_074.8, ridingTimeMillis: 2_299_000 }),
      }), ["bok"]),
      confirmed(activity({
        id: "strava_19212957902",
        userId: "runner",
        nickname: "백주목 (Felt)",
        type: "Run",
        startTime: 1_783_420_703_000,
        endTime: 1_783_422_955_000,
        summary: createMockSummary({ distance: 5_924.5, ridingTimeMillis: 1_985_000 }),
      }), ["bok"]),
      confirmed(activity({
        id: "strava_19213317898",
        userId: "outdoor-rider",
        nickname: "Rider",
        type: "Ride",
        startTime: 1_783_417_075_000,
        endTime: 1_783_424_547_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 30_475.8, ridingTimeMillis: 5_139_000 }),
      }), ["bok"]),
      confirmed(activity({
        id: "strava_19213331821",
        userId: "bok",
        nickname: "Bok Lee",
        type: "Ride",
        startTime: 1_783_424_730_000,
        endTime: 1_783_424_743_000,
        summary: createMockSummary({ distance: 37.1, ridingTimeMillis: 13_000 }),
      }), ["bok"]),
      confirmed(activity({
        id: "strava_19213754526",
        userId: "virtual-rider",
        nickname: "HS Sim",
        type: "VirtualRide",
        startTime: 1_783_423_537_000,
        endTime: 1_783_426_542_000,
        summary: createMockSummary({ distance: 19_352.8, ridingTimeMillis: 3_005_000 }),
      }), ["bok"]),
      confirmed(activity({
        id: "strava_19213877728",
        userId: "weight",
        nickname: "강경보",
        type: "WeightTraining",
        startTime: 1_783_425_302_000,
        endTime: 1_783_426_892_000,
        summary: createMockSummary({ distance: 0, ridingTimeMillis: 1_590_000 }),
      }), ["bok"]),
      confirmed(activity({
        id: "strava_19214405972",
        userId: "long-rider",
        nickname: "최동훈",
        type: "Ride",
        startTime: 1_783_420_134_000,
        endTime: 1_783_429_451_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 50_290.8, ridingTimeMillis: 8_073_000 }),
      }), ["bok"]),
      confirmed(activity({
        id: "strava_19215757019",
        userId: "actual-rider",
        nickname: "라선오",
        type: "Ride",
        startTime: 1_783_421_333_000,
        endTime: 1_783_426_871_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 42_910, ridingTimeMillis: 5_538_000 }),
      }), ["bok"]),
    ];

    expect(selectActualCoRiders(base, candidates).map((r) => r.nickname)).toEqual([
      "최동훈",
      "라선오",
      "Rider",
    ]);
  });

  it("keeps the best overlapping activity per rider", () => {
    const base = confirmed(activity({
      id: "strava_19215757019",
      userId: "main",
      nickname: "라선오",
      type: "Ride",
      startTime: 1_783_421_333_000,
      endTime: 1_783_426_871_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 42_910, ridingTimeMillis: 5_538_000 }),
    }), ["bok"]);

    const candidates = [
      confirmed(activity({
        id: "strava_19213309217",
        userId: "bok",
        nickname: "Bok Lee",
        type: "Ride",
        startTime: 1_783_424_283_000,
        endTime: 1_783_424_640_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 1_725.1, ridingTimeMillis: 357_000 }),
      }), ["main"]),
      confirmed(activity({
        id: "strava_19213518317",
        userId: "bok",
        nickname: "Bok Lee",
        type: "Ride",
        startTime: 1_783_424_952_000,
        endTime: 1_783_425_525_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 3_815.8, ridingTimeMillis: 573_000 }),
      }), ["main"]),
    ];

    expect(selectActualCoRiders(base, candidates).map((r) => r.id)).toEqual(["strava_19213518317"]);
  });

  it("trusts synchronized confirmation instead of re-matching lossy thumbnail routes", () => {
    const base = confirmed(activity({
      id: "strava_19221688731",
      userId: "hong",
      nickname: "홍숙희",
      type: "Ride",
      startTime: 1_783_466_484_000,
      endTime: 1_783_467_760_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 7_747.4, ridingTimeMillis: 1_276_000 }),
    }), ["haju"]);

    const candidates = [
      confirmed(activity({
        id: "strava_19221771829",
        userId: "haju",
        nickname: "하주대디",
        type: "Ride",
        startTime: 1_783_467_216_000,
        endTime: 1_783_468_313_000,
        thumbnailTrack: farRoute,
        summary: createMockSummary({ distance: 4_126.7, ridingTimeMillis: 821_000 }),
      }), ["hong"]),
    ];

    expect(selectActualCoRiders(base, candidates).map((item) => item.id)).toEqual([
      "strava_19221771829",
    ]);
  });

  it("does not require another rider's private stream or thumbnail in the browser", () => {
    const base = confirmed(activity({
      id: "strava_19227561443",
      userId: "main",
      nickname: "최동훈",
      type: "Ride",
      startTime: 1_783_540_339_000,
      endTime: 1_783_546_504_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 33_461, ridingTimeMillis: 6_165_000 }),
    }), ["haju"]);

    const candidates = [
      confirmed(activity({
        id: "strava_19226431879",
        userId: "haju",
        nickname: "하주대디",
        type: "Ride",
        startTime: 1_783_540_685_000,
        endTime: 1_783_541_345_000,
        thumbnailTrack: undefined,
        summary: createMockSummary({ distance: 3_556, ridingTimeMillis: 660_000 }),
      }), ["main"]),
    ];

    expect(selectActualCoRiders(base, candidates).map((item) => item.id)).toEqual([
      "strava_19226431879",
    ]);
  });

  it("hides legacy matches that did not verify route proximity at the same time", () => {
    const base = activity({
      id: "strava_19347739641",
      userId: "main",
      nickname: "라선오",
      type: "Ride",
      startTime: 1_783_680_000_000,
      endTime: 1_783_686_000_000,
      thumbnailTrack: nearRoute,
      groupRideMatchState: "confirmed",
      groupRideMatchVersion: 2,
      groupRideConfirmedPeerUserIds: ["yonghwan"],
      summary: createMockSummary({ distance: 42_000, ridingTimeMillis: 6_000_000 }),
    });
    const candidate = activity({
      id: "strava_19346537144",
      userId: "yonghwan",
      nickname: "이용환",
      type: "Ride",
      startTime: 1_783_679_000_000,
      endTime: 1_783_681_000_000,
      thumbnailTrack: nearRoute,
      groupRideMatchState: "confirmed",
      groupRideMatchVersion: 2,
      groupRideConfirmedPeerUserIds: ["main"],
      summary: createMockSummary({ distance: 20_000, ridingTimeMillis: 2_000_000 }),
    });

    expect(selectActualCoRiders(base, [candidate])).toEqual([]);
  });

  it("shows only v3 synchronized matches confirmed reciprocally", () => {
    const base = confirmed(activity({
      id: "base",
      userId: "main",
      nickname: "Main",
      type: "Ride",
      startTime: 1_000_000,
      endTime: 1_600_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 2_000, ridingTimeMillis: 600_000 }),
    }), ["reciprocal", "one-sided"]);
    const reciprocal = confirmed(activity({
      id: "reciprocal",
      userId: "reciprocal",
      nickname: "Reciprocal",
      type: "Ride",
      startTime: 1_000_000,
      endTime: 1_600_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 2_000, ridingTimeMillis: 600_000 }),
    }), ["main"]);
    const oneSided = confirmed(activity({
      id: "one-sided",
      userId: "one-sided",
      nickname: "One-sided",
      type: "Ride",
      startTime: 1_000_000,
      endTime: 1_600_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 2_000, ridingTimeMillis: 600_000 }),
    }), []);

    expect(selectActualCoRiders(base, [reciprocal, oneSided]).map((item) => item.id)).toEqual([
      "reciprocal",
    ]);
  });
});
