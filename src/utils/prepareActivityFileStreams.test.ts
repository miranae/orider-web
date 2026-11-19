import { expect, it } from "vitest";
import type { Activity, ActivityStreams } from "@shared/types";
import { markRawPartStreams, markVerifiedStreamCadence, readStreamCadenceUnit } from "../services/activityStreamSource";
import { applyVerifiedCadenceUnit, prepareActivityFileStreams } from "./prepareActivityFileStreams";
import { generateTcx, prepareTcxExport } from "./exportTcx";

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
    heartrate: Array(41).fill(150),
    laps: [{ durationMs: 60_000, distanceKm: 1 }, { durationMs: 60_000, distanceKm: 1 }],
  } as ActivityStreams, "c".repeat(64), startTime + 30_000);
  const xml = generateTcx(activity, prepareActivityFileStreams(activity, source, "tcx"), "spm");
  const [, firstLap, secondLap] = xml.split(/<Lap StartTime="/u);
  expect(firstLap).toContain("2026-11-19T07:01:00.000Z");
  expect(firstLap).not.toContain("2026-11-19T07:01:01.000Z");
  expect(secondLap).toContain("2026-11-19T07:01:01.000Z");
});

it("keeps recorded intervals or the full timeline without allocating distance to a cooldown", () => {
  const startTime = Date.parse("2026-11-19T07:00:00Z");
  const activity = { startTime, type: "Run", summary: { ridingTimeMillis: 90_000, elapsedTimeMillis: 125_000, distance: 1100 } } as Activity;
  const time = Array.from({ length: 126 }, (_, index) => index);
  const source = markRawPartStreams({
    time, heartrate: time.map(() => 150),
    laps: [
      { durationMs: 60_000, distanceKm: 0.5, startTimeMs: startTime, endTimeMs: startTime + 60_000 },
      { durationMs: 30_000, distanceKm: 0.5, endTimeMs: startTime + 120_000 },
    ],
  } as ActivityStreams, "d".repeat(64), startTime);
  const prepared = prepareTcxExport(activity, prepareActivityFileStreams(activity, source, "tcx"), "spm");
  expect(prepared.hasUnassigned).toBe(true);
  const [, first, second] = prepared.render("recorded").split(/<Lap StartTime="/u);
  expect(first).toContain("<DistanceMeters>500</DistanceMeters>");
  expect(second).toContain("<DistanceMeters>500</DistanceMeters>");
  expect(second).toContain("2026-11-19T07:01:15.000Z");
  expect(second).not.toContain("2026-11-19T07:02:05.000Z");
  const full = prepared.render("activity");
  expect(full.match(/<Lap StartTime="/gu)).toHaveLength(1);
  expect(full).toContain("<DistanceMeters>1100</DistanceMeters>");
  expect(full).toContain("2026-11-19T07:02:05.000Z");
});

it("does not infer paused time from an end-only lap", () => {
  const startTime = Date.parse("2026-11-19T07:00:00Z");
  const activity = { startTime, type: "Run", summary: {} } as Activity;
  const streams = {
    userId: "owner", time: [0, 60, 75, 90, 120].map(time => startTime + time * 1000), heartrate: [150, 150, 150, 150, 150],
    laps: [
      { startTimeMs: startTime, endTimeMs: startTime + 60_000, durationMs: 60_000 },
      { endTimeMs: startTime + 120_000, durationMs: 30_000 },
    ],
  } as ActivityStreams;
  const xml = generateTcx(activity, streams, "spm");
  const [, first, last] = xml.split(/<Lap StartTime="/u);
  expect(first).toMatch(/^2026-11-19T07:00:00.000Z/u);
  expect(last).toMatch(/^2026-11-19T07:01:00.000Z/u);
  expect(last).toContain("2026-11-19T07:01:15.000Z");
});

it("keeps recorded laps when only blank grid slots follow the last observation", () => {
  const startTime = Date.parse("2026-11-19T07:00:00Z");
  const activity = { startTime, type: "Run", summary: { distance: 1100 } } as Activity;
  const source = markRawPartStreams({
    time: [0, 1, 2, 3], heartrate: [150, 150, null, null],
    laps: [{ durationMs: 1000, distanceKm: 1, startTimeMs: startTime, endTimeMs: startTime + 1000 }],
  } as unknown as ActivityStreams, "d".repeat(64), startTime);
  const xml = generateTcx(activity, prepareActivityFileStreams(activity, source, "tcx"), "spm");
  expect(xml).toContain("<DistanceMeters>1000</DistanceMeters>");
  expect(xml).not.toContain("2026-11-19T07:00:03.000Z");
});


it("exports a speed-only observation in a recorded indoor lap", () => {
  const startTime = 1_790_000_000_000;
  const activity = { startTime, type: "Run", summary: {} } as Activity;
  const xml = generateTcx(activity, {
    userId: "owner", time: [0, 1], velocity_smooth: [2.7, 3.1],
    laps: [{ startTimeMs: startTime, endTimeMs: startTime + 1000, durationMs: 1000 }],
  } as ActivityStreams);
  expect(xml).toContain("<ext:Speed>2.7</ext:Speed>");
  expect(xml).toContain("<ext:Speed>3.1</ext:Speed>");
});


it("keeps recorded laps or all gap observations according to the requested TCX edition", () => {
  const startTime = 1_790_000_000_000;
  const activity = { startTime, type: "Run", summary: {
    ridingTimeMillis: 9000, elapsedTimeMillis: 15_000, distance: 120,
  } } as Activity;
  const streams = {
    userId: "owner", time: [0, 5, 7, 10, 12, 15].map(time => startTime + time * 1000), heartrate: [150, 150, 150, 150, 150, 150],
    laps: [
      { startTimeMs: startTime, endTimeMs: startTime + 5000, durationMs: 5000, distanceKm: 0.05 },
      { startTimeMs: startTime + 10_000, endTimeMs: startTime + 12_000, durationMs: 2000, distanceKm: 0.05 },
    ],
  } as ActivityStreams;
  const prepared = prepareTcxExport(activity, streams, "spm");
  const recorded = prepared.render("recorded");
  expect(recorded.match(/<Lap StartTime="/gu)).toHaveLength(2);
  expect(recorded.match(/<DistanceMeters>50<\/DistanceMeters>/gu)).toHaveLength(2);
  expect(recorded).not.toContain(new Date(startTime + 7000).toISOString());
  const full = prepared.render("activity");
  expect(full).toContain("<DistanceMeters>120</DistanceMeters>");
  expect(full).toContain("<TotalTimeSeconds>15</TotalTimeSeconds>");
  expect(full).toContain(new Date(startTime + 7000).toISOString());
  expect(full).toContain(new Date(startTime + 15_000).toISOString());
});


it("preserves recorded distances even when there is no activity distance for the final points", () => {
  const startTime = 1_790_000_000_000;
  const activity = { startTime, type: "Run", summary: {} } as Activity;
  const streams = {
    userId: "owner", time: [0, 30, 60, 61].map(time => startTime + time * 1000), heartrate: [150, 150, 150, 150],
    laps: [
      { startTimeMs: startTime, endTimeMs: startTime + 30_000, durationMs: 30_000, distanceKm: 1 },
      { startTimeMs: startTime + 30_000, endTimeMs: startTime + 60_000, durationMs: 30_000, distanceKm: 1 },
    ],
  } as ActivityStreams;
  const xml = generateTcx(activity, streams, "spm");
  expect(xml.match(/<Lap StartTime="/gu)).toHaveLength(2);
  expect(xml.match(/<DistanceMeters>1000<\/DistanceMeters>/gu)).toHaveLength(2);
  const prepared = prepareTcxExport(activity, streams, "spm");
  expect(prepared.hasUnassigned).toBe(true);
  expect(prepared.canExportAllAsTcx).toBe(false);
  expect(xml).not.toContain("<DistanceMeters>NaN</DistanceMeters>");
});


it("keeps moving-time legacy samples separate from native elapsed lap clocks", () => {
  const startTime = 1_790_000_000_000;
  const activity = { startTime, type: "Run", summary: {} } as Activity;
  const streams = {
    userId: "owner", time: [0, 60, 61, 90, 120], heartrate: [150, 150, 150, 150, 150],
    laps: [
      { startTimeMs: startTime, endTimeMs: startTime + 60_000, durationMs: 60_000 },
      { startTimeMs: startTime + 120_000, endTimeMs: startTime + 180_000, durationMs: 60_000 },
    ],
  } as ActivityStreams;
  const prepared = prepareTcxExport(activity, streams, "spm");
  const [, , second] = prepared.render("recorded").split(/<Lap StartTime="/u);
  expect(prepared.hasUnassigned).toBe(false);
  expect(second).toContain(new Date(startTime + 61_000).toISOString());
});

it("uses recorded activity endpoints when the elapsed summary is absent", () => {
  const startTime = 1_790_000_000_000;
  const activity = { startTime, endTime: startTime + 600_000, type: "Run", summary: {
    distance: 1000, ridingTimeMillis: 300_000,
  } } as Activity;
  const streams = { userId: "owner", time: [0, 300], laps: [{ durationMs: 1000 }] } as ActivityStreams;
  const xml = prepareTcxExport(activity, streams, "spm").render("activity");
  expect(xml).toContain("<TotalTimeSeconds>600</TotalTimeSeconds>");
});


it("does not slide adjacent duration-only laps by a sample interval on a verified clock", () => {
  const startTime = 1_790_000_000_000;
  const activity = { startTime, type: "Run", summary: {} } as Activity;
  const time = Array.from({ length: 122 }, (_, index) => index);
  const streams = markRawPartStreams({
    time, heartrate: time.map(() => 150),
    laps: [{ durationMs: 60_000 }, { durationMs: 60_000 }],
  } as ActivityStreams, "f".repeat(64), startTime);
  const prepared = prepareTcxExport(activity, prepareActivityFileStreams(activity, streams, "tcx"));
  const [, , second] = prepared.render("recorded").split(/<Lap StartTime="/u);
  expect(second).toMatch(new RegExp(new Date(startTime + 60_000).toISOString()));
  expect(second).not.toContain(new Date(startTime + 121_000).toISOString());
  expect(prepared.hasUnassigned).toBe(true);
});


it("keeps sparse observation gaps from moving verified duration-only lap boundaries", () => {
  const startTime = 1_790_000_000_000;
  const activity = { startTime, type: "Run", summary: {} } as Activity;
  const time = Array.from({ length: 131 }, (_, index) => index);
  const streams = markRawPartStreams({
    time, heartrate: time.map(index => [30, 125, 130].includes(index) ? 150 : null),
    laps: [{ durationMs: 60_000 }, { durationMs: 60_000 }],
  } as unknown as ActivityStreams, "f".repeat(64), startTime);
  const exportFile = prepareTcxExport(activity, prepareActivityFileStreams(activity, streams, "tcx"));
  expect(exportFile.hasUnassigned).toBe(true);
  expect(exportFile.canExportAllAsTcx).toBe(false);
  const [, , second] = exportFile.render("recorded").split(/<Lap StartTime="/u);
  expect(second).toContain(new Date(startTime + 60_000).toISOString());
  expect(second).not.toContain(new Date(startTime + 125_000).toISOString());
});


it("anchors a no-lap raw TCX file to its actual observation window when elapsed time is absent", () => {
  const startTime = 1_790_000_000_000;
  const activity = { startTime, type: "Run", summary: { distance: 500, ridingTimeMillis: 60_000 } } as Activity;
  const time = Array.from({ length: 61 }, (_, index) => index);
  const streams = markRawPartStreams({ time, heartrate: time.map(() => 150) } as ActivityStreams, "f".repeat(64), startTime + 30_000);
  const tcx = generateTcx(activity, prepareActivityFileStreams(activity, streams, "tcx"));
  expect(tcx).toContain(`<Lap StartTime="${new Date(startTime + 30_000).toISOString()}">`);
  expect(tcx).toContain("<TotalTimeSeconds>60</TotalTimeSeconds>");
  expect(tcx).toContain(new Date(startTime + 90_000).toISOString());
  expect(tcx).toContain("Activity elapsed time is unavailable.");
});
