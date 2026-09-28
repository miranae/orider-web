import { describe, expect, it } from "vitest";
import { getStravaActivityId } from "./stravaActivity";

describe("getStravaActivityId", () => {
  it.each(["0", "9007199254740993", "9".repeat(400)])("rejects unsafe explicit string %s and document aliases", value => {
    expect(getStravaActivityId({ id: "legacy-doc", source: "strava", stravaActivityId: value })).toBeNull();
    expect(getStravaActivityId({ id: `strava_${value}`, source: "strava" })).toBeNull();
    expect(getStravaActivityId({ id: "strava_0019213309217", source: "strava", stravaActivityId: value })).toBe(19213309217);
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])("rejects unsafe numeric %s", stravaActivityId => {
    expect(getStravaActivityId({ id: "legacy-doc", source: "strava", stravaActivityId })).toBeNull();
  });
  it.each(["0019213309217", String(Number.MAX_SAFE_INTEGER)])("preserves valid string and alias %s", value => {
    expect(getStravaActivityId({ id: "legacy-doc", source: "strava", stravaActivityId: value })).toBe(Number(value));
    expect(getStravaActivityId({ id: `strava_${value}`, source: "strava" })).toBe(Number(value));
  });
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
