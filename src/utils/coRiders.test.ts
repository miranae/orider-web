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

const nearRoute = "37.5000,127.0000;37.5010,127.0010;37.5020,127.0020;37.5030,127.0030";
const farRoute = "35.1000,129.0000;35.1010,129.0010;35.1020,129.0020;35.1030,129.0030";

describe("selectActualCoRiders", () => {
  it("keeps only actual outdoor ride companions from a mixed groupRideId bucket", () => {
    const base = activity({
      id: "strava_19213309217",
      userId: "bok",
      nickname: "Bok Lee",
      type: "Ride",
      startTime: 1_783_424_283_000,
      endTime: 1_783_424_640_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 1_725.1, ridingTimeMillis: 357_000 }),
    });

    const candidates = [
      activity({
        id: "strava_19212521831",
        userId: "rider-before",
        nickname: "라선오 short before",
        type: "Ride",
        startTime: 1_783_418_917_000,
        endTime: 1_783_421_216_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 6_074.8, ridingTimeMillis: 2_299_000 }),
      }),
      activity({
        id: "strava_19212957902",
        userId: "runner",
        nickname: "백주목 (Felt)",
        type: "Run",
        startTime: 1_783_420_703_000,
        endTime: 1_783_422_955_000,
        summary: createMockSummary({ distance: 5_924.5, ridingTimeMillis: 1_985_000 }),
      }),
      activity({
        id: "strava_19213317898",
        userId: "outdoor-rider",
        nickname: "Rider",
        type: "Ride",
        startTime: 1_783_417_075_000,
        endTime: 1_783_424_547_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 30_475.8, ridingTimeMillis: 5_139_000 }),
      }),
      activity({
        id: "strava_19213331821",
        userId: "bok",
        nickname: "Bok Lee",
        type: "Ride",
        startTime: 1_783_424_730_000,
        endTime: 1_783_424_743_000,
        summary: createMockSummary({ distance: 37.1, ridingTimeMillis: 13_000 }),
      }),
      activity({
        id: "strava_19213754526",
        userId: "virtual-rider",
        nickname: "HS Sim",
        type: "VirtualRide",
        startTime: 1_783_423_537_000,
        endTime: 1_783_426_542_000,
        summary: createMockSummary({ distance: 19_352.8, ridingTimeMillis: 3_005_000 }),
      }),
      activity({
        id: "strava_19213877728",
        userId: "weight",
        nickname: "강경보",
        type: "WeightTraining",
        startTime: 1_783_425_302_000,
        endTime: 1_783_426_892_000,
        summary: createMockSummary({ distance: 0, ridingTimeMillis: 1_590_000 }),
      }),
      activity({
        id: "strava_19214405972",
        userId: "long-rider",
        nickname: "최동훈",
        type: "Ride",
        startTime: 1_783_420_134_000,
        endTime: 1_783_429_451_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 50_290.8, ridingTimeMillis: 8_073_000 }),
      }),
      activity({
        id: "strava_19215757019",
        userId: "actual-rider",
        nickname: "라선오",
        type: "Ride",
        startTime: 1_783_421_333_000,
        endTime: 1_783_426_871_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 42_910, ridingTimeMillis: 5_538_000 }),
      }),
    ];

    expect(selectActualCoRiders(base, candidates).map((r) => r.nickname)).toEqual([
      "최동훈",
      "라선오",
      "Rider",
    ]);
  });

  it("keeps the best overlapping activity per rider", () => {
    const base = activity({
      id: "strava_19215757019",
      userId: "main",
      nickname: "라선오",
      type: "Ride",
      startTime: 1_783_421_333_000,
      endTime: 1_783_426_871_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 42_910, ridingTimeMillis: 5_538_000 }),
    });

    const candidates = [
      activity({
        id: "strava_19213309217",
        userId: "bok",
        nickname: "Bok Lee",
        type: "Ride",
        startTime: 1_783_424_283_000,
        endTime: 1_783_424_640_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 1_725.1, ridingTimeMillis: 357_000 }),
      }),
      activity({
        id: "strava_19213518317",
        userId: "bok",
        nickname: "Bok Lee",
        type: "Ride",
        startTime: 1_783_424_952_000,
        endTime: 1_783_425_525_000,
        thumbnailTrack: nearRoute,
        summary: createMockSummary({ distance: 3_815.8, ridingTimeMillis: 573_000 }),
      }),
    ];

    expect(selectActualCoRiders(base, candidates).map((r) => r.id)).toEqual(["strava_19213518317"]);
  });

  it("rejects time-overlapping riders when thumbnail routes are far apart", () => {
    const base = activity({
      id: "strava_19221688731",
      userId: "hong",
      nickname: "홍숙희",
      type: "Ride",
      startTime: 1_783_466_484_000,
      endTime: 1_783_467_760_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 7_747.4, ridingTimeMillis: 1_276_000 }),
    });

    const candidates = [
      activity({
        id: "strava_19221771829",
        userId: "haju",
        nickname: "하주대디",
        type: "Ride",
        startTime: 1_783_467_216_000,
        endTime: 1_783_468_313_000,
        thumbnailTrack: farRoute,
        summary: createMockSummary({ distance: 4_126.7, ridingTimeMillis: 821_000 }),
      }),
    ];

    expect(selectActualCoRiders(base, candidates)).toEqual([]);
  });

  it("rejects candidates when either route cannot be confirmed", () => {
    const base = activity({
      id: "strava_19227561443",
      userId: "main",
      nickname: "최동훈",
      type: "Ride",
      startTime: 1_783_540_339_000,
      endTime: 1_783_546_504_000,
      thumbnailTrack: nearRoute,
      summary: createMockSummary({ distance: 33_461, ridingTimeMillis: 6_165_000 }),
    });

    const candidates = [
      activity({
        id: "strava_19226431879",
        userId: "haju",
        nickname: "하주대디",
        type: "Ride",
        startTime: 1_783_540_685_000,
        endTime: 1_783_541_345_000,
        thumbnailTrack: undefined,
        summary: createMockSummary({ distance: 3_556, ridingTimeMillis: 660_000 }),
      }),
    ];

    expect(selectActualCoRiders(base, candidates)).toEqual([]);
  });
});
