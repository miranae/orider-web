import { describe, expect, it } from "vitest";
import { getStravaActivityId } from "./stravaActivity";

describe("getStravaActivityId", () => {
  it("uses explicit numeric stravaActivityId", () => {
    expect(getStravaActivityId({
      id: "legacy-doc",
      source: "strava",
      stravaActivityId: 19213309217,
    })).toBe(19213309217);
  });

  it("uses explicit string stravaActivityId", () => {
    expect(getStravaActivityId({
      id: "legacy-doc",
      source: "strava",
      stravaActivityId: "19213309217",
    })).toBe(19213309217);
  });

  it("falls back to the strava-prefixed activity document id", () => {
    expect(getStravaActivityId({
      id: "strava_19213309217",
      source: "strava",
    })).toBe(19213309217);
  });

  it("does not parse non-Strava activities", () => {
    expect(getStravaActivityId({
      id: "strava_19213309217",
      source: "orider",
    })).toBeNull();
  });
});
