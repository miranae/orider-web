import { expect, it } from "vitest";
import type { Activity, ActivityStreams } from "@shared/types";
import { markRawPartStreams, markVerifiedStreamCadence, readStreamCadenceUnit } from "../services/activityStreamSource";
import { addVerifiedCadenceToExport, prepareActivityFileStreams } from "./prepareActivityFileStreams";
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
  const displayed = markVerifiedStreamCadence({ time: [startTime + 30_000], heartrate: [150] } as ActivityStreams, "b".repeat(64), null);
  const canonical = markRawPartStreams({ time: [0], cadence: [180] } as ActivityStreams, "b".repeat(64), startTime + 30_000);
  const merged = addVerifiedCadenceToExport(activity, displayed, canonical);
  expect(merged.time).toEqual([30]);
  expect(merged.heartrate).toEqual([150]);
  expect(merged.cadence).toEqual([180]);
});
