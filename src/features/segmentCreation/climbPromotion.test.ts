import { describe, expect, it } from "vitest";
import {
  buildClimbSegmentProposalPath,
  readClimbPromotionRange,
  resolveClimbPromotionIndices,
} from "./climbPromotion";

describe("climb segment promotion", () => {
  it("builds a climb proposal URL without losing special activity ids", () => {
    expect(buildClimbSegmentProposalPath("strava_12/한강", { startKm: 1.25, endKm: 2.75 }))
      .toBe("/segment/create?activityId=strava_12%2F%ED%95%9C%EA%B0%95&startKm=1.25&endKm=2.75&category=climb");
  });

  it("reads only complete forward climb ranges", () => {
    expect(readClimbPromotionRange(new URLSearchParams("startKm=1.2&endKm=2.8")))
      .toEqual({ startKm: 1.2, endKm: 2.8 });
    expect(readClimbPromotionRange(new URLSearchParams("startKm=3&endKm=2"))).toBeNull();
    expect(readClimbPromotionRange(new URLSearchParams("startKm=nope&endKm=2"))).toBeNull();
  });

  it("maps metric distances to the nearest stream points", () => {
    expect(resolveClimbPromotionIndices(
      [0, 450, 980, 1520, 2010, 2490, 3020],
      { startKm: 1, endKm: 2.5 },
    )).toEqual({ startIndex: 2, endIndex: 5 });
  });

  it("rejects ranges that cannot produce a forward segment", () => {
    expect(resolveClimbPromotionIndices([], { startKm: 1, endKm: 2 })).toBeNull();
    expect(resolveClimbPromotionIndices([1000, 900], { startKm: 0.9, endKm: 1 })).toBeNull();
  });
});
