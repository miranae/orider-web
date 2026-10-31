import { describe, expect, it } from "vitest";
import { captureStravaSummary, stravaRecordOf, formatStravaRecord } from "./stravaRecord";
import { withActivityPresentation } from "./activityPresentation";
import type { Activity } from "../types";
describe("Strava source evidence", () => {
  it("keeps zero values, omits unavailable fields, rejects invalid numbers and ignores arbitrary payload data", () => {
    expect(captureStravaSummary({ distance: 0, max_speed: Infinity, average_watts: -1, average_temp: -5, calories: 3086, access_token: "never-copy" }))
      .toEqual({ version: 1, distance: 0, max_speed: null, average_watts: null, average_temp: -5, calories: 3086 });
  });
  it("does not mistake legacy estimated calories and TSS for Strava source evidence", () => {
    const source = stravaRecordOf({ source: "strava", summary: { calories: 2362, tss: 180, normalizedPower: 144, maxSpeed: 60.4 } });
    expect(source?.calories).toBeNull(); expect(source?.weighted_average_watts).toBe(144);
    expect(formatStravaRecord(source!, "ko")).not.toMatch(/2362|180|NP/);
    expect(stravaRecordOf({ source: "orider" })).toBeNull();
  });
  it("retains provider summaries when a calculated display projection exists", () => {
    const activity = { source: "strava", summary: { maxSpeed: 60.4, elevationGain: 645 }, activityPresentationV1: {
      version: 1, activityRevision: null, contentSelectedRevision: null, summary: { maxSpeed: 54.2, elevationGain: 638 }, thumbnailTrack: "", mapImageUrl: null,
    } } as unknown as Activity;
    expect(withActivityPresentation(activity).summary.maxSpeed).toBe(60.4);
    expect(withActivityPresentation({ ...activity, source: "orider" }).summary.maxSpeed).toBe(54.2);
  });
});

it("ignores leftover per-metric hiding fields because visibility is the only privacy control (P1)", () => {
  const legacy = { source: "strava", hideHr: true, hidePower: true, stravaSummaryV1: {
    version: 1, average_watts: 200, weighted_average_watts: 220, kilojoules: 1000,
    average_heartrate: 140, max_heartrate: 180, suffer_score: 200, distance: 30000 } };
  const r = stravaRecordOf(legacy);
  expect(r?.average_watts).toBe(200); expect(r?.average_heartrate).toBe(140); expect(r?.kilojoules).toBe(1000);
  expect(r?.distance).toBe(30000);
});
