import { expect, it } from "vitest";
import type { Activity, ActivityStreams } from "@shared/types";
import { markRawPartStreams, markVerifiedStreamCadence, readStreamCadenceUnit } from "../services/activityStreamSource";
import { applyVerifiedCadenceUnit, prepareActivityFileStreams } from "./prepareActivityFileStreams";
import { generateTcx } from "./exportTcx";

it("writes each GPS observation at its own time and offsets sensor samples from the actual activity start", () => {
  const startTime = Date.parse("2026-11-19T07:00:00Z");
  const origin = startTime + 30_000;
  const revision = "a".repeat(64);
  const activity = { startTime, type: "Run", summary: { ridingTimeMillis: 60_000 } } as Activity;
  const streams = markVerifiedStreamCadence(markRawPartStreams({
    time: [0, 1, 2], cadence: [170, null, 172],
    activityRouteGeometryV1: {
      version: 1, timingBasis: "elapsed", originEpochMs: origin + 250, timeOrigin: "relative_to_first_gps_observation",
      routeInputRevision: revision, time: [0, 0.5, 2], latlng: [[37, 127], [38, 128], [39, 129]],
    },
  } as unknown as ActivityStreams, revision, origin), revision, "spm");

  const fileStreams = prepareActivityFileStreams(activity, streams, "tcx");
  expect(fileStreams.time).toEqual([30, 30.25, 30.75, 31, 32, 32.25]);
  expect(fileStreams.latlng?.[1]).toEqual([37, 127]);
  expect(fileStreams.latlng?.[2]).toEqual([38, 128]);
  expect(fileStreams.cadence?.[0]).toBe(170);
  expect(fileStreams.cadence?.[2]).toBeUndefined();
  expect(fileStreams.cadence?.[4]).toBe(172);
  const xml = generateTcx(activity, fileStreams, readStreamCadenceUnit(fileStreams));
  expect(xml).toContain("2026-11-19T07:00:30.250Z");
  expect(xml).toContain("2026-11-19T07:00:30.750Z");
  expect(xml).toContain("<ext:RunCadence>85</ext:RunCadence>");
  expect(xml).toContain("<ext:RunCadence>86</ext:RunCadence>");

  const fit = prepareActivityFileStreams(activity, streams, "fit");
  expect(fit.time).toEqual([30, 31, 32]);
  expect(fit.cadence?.[0]).toBe(170);
  expect(fit.latlng?.[0]).toEqual([37, 127]);
  expect(fit.latlng?.[1]).toEqual([38, 128]);
  expect(fit.cadence?.[2]).toBe(172);
  expect(fit.latlng?.[2]).toEqual([39, 129]);
});


it("matches epoch-based displayed samples to the cadence grid without moving the displayed origin", () => {
  const startTime = 1_790_000_000_000;
  const activity = { startTime } as Activity;
  const displayed = { time: [startTime + 30_000], heartrate: [150], cadence: [180] } as ActivityStreams;
  const revision = "b".repeat(64);
  const canonical = markVerifiedStreamCadence(
    markRawPartStreams({ time: [0], cadence: [180] } as ActivityStreams, revision, startTime + 30_000), revision, "spm");
  const merged = applyVerifiedCadenceUnit(activity, displayed, canonical);
  expect(merged.time).toEqual(displayed.time);
  expect(merged.heartrate).toEqual([150]);
  expect(merged.cadence).toEqual([180]);
  expect(readStreamCadenceUnit(merged)).toBe("spm");
});


it("uses the activity start for timed TCX lap boundaries even when the first sample is late", () => {
  const startTime = Date.parse("2026-11-19T07:00:00Z");
  const activity = { startTime, type: "Run", summary: { ridingTimeMillis: 120_000 } } as Activity;
  const source = markRawPartStreams({
    time: Array.from({ length: 41 }, (_, index) => index),
    laps: [{ durationMs: 60_000, distanceKm: 1 }, { durationMs: 60_000, distanceKm: 1 }],
  } as ActivityStreams, "c".repeat(64), startTime + 30_000);
  const xml = generateTcx(activity, prepareActivityFileStreams(activity, source, "tcx"), "spm");
  const [, firstLap, secondLap] = xml.split(/<Lap StartTime="/u);
  expect(firstLap).toContain("2026-11-19T07:01:00.000Z");
  expect(firstLap).not.toContain("2026-11-19T07:01:01.000Z");
  expect(secondLap).toContain("2026-11-19T07:01:01.000Z");
});

it("keeps trailing TCX observations outside a lap with a recorded end", () => {
  const startTime = Date.parse("2026-11-19T07:00:00Z");
  const activity = { startTime, type: "Run", summary: { ridingTimeMillis: 125_000 } } as Activity;
  const source = markRawPartStreams({
    time: Array.from({ length: 126 }, (_, index) => index),
    laps: [{ durationMs: 120_000, distanceKm: 1, startTimeMs: startTime, endTimeMs: startTime + 120_000 }],
  } as ActivityStreams, "d".repeat(64), startTime);
  const xml = generateTcx(activity, prepareActivityFileStreams(activity, source, "tcx"), "spm");
  const [, recorded, tail] = xml.split(/<Lap StartTime="/u);
  expect(recorded).toContain("2026-11-19T07:02:00.000Z");
  expect(recorded).not.toContain("2026-11-19T07:02:01.000Z");
  expect(tail).toContain("2026-11-19T07:02:01.000Z");
  expect(tail).toContain("<TotalTimeSeconds>4</TotalTimeSeconds>");
  expect(tail).toContain("2026-11-19T07:02:05.000Z");
});


it("keeps gap observations separate without fabricating a lap distance", () => {
  const startTime = Date.parse("2026-11-19T07:00:00Z");
  const activity = { startTime, type: "Run", summary: { ridingTimeMillis: 120_000 } } as Activity;
  const time = Array.from({ length: 121 }, (_, index) => index);
  const distance = time.map(index => index === 59 ? 1000 : index === 85 ? 1100 : null);
  const source = markRawPartStreams({
    time, distance,
    laps: [
      { durationMs: 60_000, distanceKm: 1, startTimeMs: startTime, endTimeMs: startTime + 60_000 },
      { durationMs: 30_000, distanceKm: 1, startTimeMs: startTime + 90_000, endTimeMs: startTime + 120_000 },
    ],
  } as unknown as ActivityStreams, "e".repeat(64), startTime);
  const xml = generateTcx(activity, prepareActivityFileStreams(activity, source, "tcx"), "spm");
  const [, first, gap, second] = xml.split(/<Lap StartTime="/u);
  expect(first).toContain("2026-11-19T07:01:00.000Z");
  expect(gap).toContain("2026-11-19T07:01:15.000Z");
  expect(gap).toContain("<DistanceMeters>NaN</DistanceMeters>");
  expect(second).not.toContain("2026-11-19T07:01:15.000Z");
  expect(second).toContain("2026-11-19T07:01:30.000Z");
});


it("uses stored native lap boundaries with an ordinary unmarked relative stream", () => {
  const startTime = Date.parse("2026-11-19T07:00:00Z");
  const activity = { startTime, type: "Run", summary: {} } as Activity;
  const streams = {
    userId: "owner", time: [0, 60, 75, 90, 120],
    laps: [
      { startTimeMs: startTime, endTimeMs: startTime + 60_000, durationMs: 60_000 },
      { startTimeMs: startTime + 90_000, endTimeMs: startTime + 120_000, durationMs: 30_000 },
    ],
  } as ActivityStreams;
  const xml = generateTcx(activity, streams, "spm");
  const [, first, gap, last] = xml.split(/<Lap StartTime="/u);
  expect(first).toMatch(/^2026-11-19T07:00:00.000Z/u);
  expect(gap).toMatch(/^2026-11-19T07:01:15.000Z/u);
  expect(last).toMatch(/^2026-11-19T07:01:30.000Z/u);
});
