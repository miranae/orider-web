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

describe("selectActualCoRiders", () => {
  it("keeps only actual outdoor ride companions from a mixed groupRideId bucket", () => {
    const base = activity({
      id: "strava_19213309217",
      userId: "bok",
      nickname: "Bok Lee",
      type: "Ride",
      startTime: 1_783_424_283_000,
      endTime: 1_783_424_640_000,
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
        summary: createMockSummary({ distance: 50_290.8, ridingTimeMillis: 8_073_000 }),
      }),
      activity({
        id: "strava_19215757019",
        userId: "actual-rider",
        nickname: "라선오",
        type: "Ride",
        startTime: 1_783_421_333_000,
        endTime: 1_783_426_871_000,
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
        summary: createMockSummary({ distance: 1_725.1, ridingTimeMillis: 357_000 }),
      }),
      activity({
        id: "strava_19213518317",
        userId: "bok",
        nickname: "Bok Lee",
        type: "Ride",
        startTime: 1_783_424_952_000,
        endTime: 1_783_425_525_000,
        summary: createMockSummary({ distance: 3_815.8, ridingTimeMillis: 573_000 }),
      }),
    ];

    expect(selectActualCoRiders(base, candidates).map((r) => r.id)).toEqual(["strava_19213518317"]);
  });
});
