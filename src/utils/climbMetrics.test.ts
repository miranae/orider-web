import { describe, expect, it } from "vitest";
import { buildClimbTableRows, formatClimbEntryTime } from "./climbMetrics";

const fallback = [{
  startKm: 2,
  endKm: 3,
  lengthKm: 1,
  elevationGain: 70,
  avgGrade: 7,
  vam: 840,
  durationSec: 300,
}];

describe("buildClimbTableRows", () => {
  it("uses server ClimbMetric values as the authoritative source", () => {
    expect(buildClimbTableRows([{
      startKm: 5,
      endKm: 7,
      lengthKm: 2,
      elevationGainM: 160,
      avgGrade: 8,
      category: "Cat2",
      durationSec: 600,
      vam: 960,
      avgPower: 280,
      wPerKg: 4.2,
      normalizedPower: 292,
      climbScore: 1600,
    }], fallback)).toEqual([{
      startKm: 5,
      lengthKm: 2,
      elevationGain: 160,
      avgGrade: 8,
      category: "Cat2",
      durationSec: 600,
      entrySec: null,
      vam: 960,
      avgPower: 280,
      wPerKg: 4.2,
    }]);
  });

  it("treats an empty server array as an authoritative no-climbs result", () => {
    expect(buildClimbTableRows([], fallback)).toEqual([]);
  });

  it("falls back to client detection when the server field is missing", () => {
    const expected = [{ ...fallback[0], category: null, entrySec: null, avgPower: null, wPerKg: null }];
    expect(buildClimbTableRows(undefined, fallback)).toEqual(expected);
  });

  it("preserves valid server rows and drops only malformed rows from a mixed array", () => {
    const rows = buildClimbTableRows([
      { startKm: "bad" },
      {
        startKm: 5, lengthKm: 2, elevationGainM: 160, avgGrade: 8,
        category: null, durationSec: 600, vam: 960, avgPower: 0, wPerKg: 0,
      },
    ], fallback);
    expect(rows).toEqual([{
      startKm: 5, lengthKm: 2, elevationGain: 160, avgGrade: 8,
      category: null, durationSec: 600, entrySec: null, vam: 960, avgPower: 0, wPerKg: 0,
    }]);
  });

  it("renders optional invalid server metrics as unavailable without discarding the climb", () => {
    const [row] = buildClimbTableRows([{
      startKm: 5,
      lengthKm: 2,
      elevationGainM: 160,
      avgGrade: 8,
      category: "unexpected",
      durationSec: 0,
      vam: Number.NaN,
      avgPower: -1,
      wPerKg: null,
    }], fallback);
    expect(row).toMatchObject({ category: null, durationSec: null, vam: null, avgPower: null, wPerKg: null });
  });

  it("uses the backend category thresholds only for client fallback rows", () => {
    const rows = buildClimbTableRows(undefined, [
      { ...fallback[0], lengthKm: 1, avgGrade: 8 },
      { ...fallback[0], lengthKm: 2, avgGrade: 8 },
      { ...fallback[0], lengthKm: 4, avgGrade: 8 },
      { ...fallback[0], lengthKm: 8, avgGrade: 8 },
      { ...fallback[0], lengthKm: 10, avgGrade: 8 },
    ]);
    expect(rows.map((row) => row.category)).toEqual(["Cat4", "Cat3", "Cat2", "Cat1", "HC"]);
  });

  it.each([
    ["epoch seconds", 1_720_000_000, [1_720_000_041, 1_720_000_101, 1_720_000_161]],
    ["epoch milliseconds", 1_720_000_000_000, [1_720_000_041_000, 1_720_000_101_000, 1_720_000_161_000]],
  ])("subtracts activity start from %s instead of rebasing to the first sample", (_label, activityStartTime, time) => {
    const [row] = buildClimbTableRows([{
      startKm: 2,
      lengthKm: 1,
      elevationGainM: 70,
      avgGrade: 7,
      category: "Cat4",
      durationSec: 300,
      vam: 840,
      avgPower: 250,
      wPerKg: 3.5,
    }], fallback, {
      distance: [0, 1_000, 2_000],
      time,
      activityStartTime,
      routeOffsetSec: 41,
      routeRecordStartTimeMs: 1_720_000_001_000,
    });

    expect(row?.entrySec).toBe(161);
  });

  it("keeps sparse relative seconds as seconds", () => {
    const [row] = buildClimbTableRows(undefined, fallback, {
      distance: [0, 1_000, 2_000],
      time: [0, 120, 240],
      elapsedDurationSec: 240,
    });

    expect(row?.entrySec).toBe(240);
  });

  it("detects a 10 Hz relative millisecond axis from elapsed duration", () => {
    const [row] = buildClimbTableRows(undefined, fallback, {
      distance: [0, 1_000, 2_000],
      time: [0, 50, 100],
      elapsedDurationSec: 0.1,
    });

    expect(row?.entrySec).toBe(0.1);
  });

  it("defaults relative time to stored-contract seconds without a summary duration", () => {
    const [row] = buildClimbTableRows(undefined, fallback, {
      distance: [0, 1_000, 2_000],
      time: [0, 120, 240],
    });

    expect(row?.entrySec).toBe(240);
  });

  it("keeps the legacy activity-relative fallback when FIT record startTimeMs is absent", () => {
    const [row] = buildClimbTableRows(undefined, fallback, {
      distance: [0, 1_000, 2_000],
      time: [0, 60, 120],
      elapsedDurationSec: 161,
      routeOffsetSec: 41,
    });

    expect(row?.entrySec).toBe(161);
  });

  it("anchors relative FIT route time to the first timestamped record", () => {
    const activityStartMs = Date.parse("2026-07-12T22:38:32+09:00");
    const firstRecordMs = Date.parse("2026-07-12T22:38:33+09:00");
    const routeStartMs = firstRecordMs + 41_000;
    expect(routeStartMs).toBe(Date.parse("2026-07-12T22:39:14+09:00"));

    const [row] = buildClimbTableRows(undefined, fallback, {
      distance: [0, 1_000, 2_000],
      time: [0, 60, 120],
      activityStartTime: activityStartMs,
      elapsedDurationSec: 162,
      routeOffsetSec: 41,
      routeRecordStartTimeMs: firstRecordMs,
    });

    expect(row?.entrySec).toBe(162);
  });

  it("preserves pauses present in the relative time axis", () => {
    const [row] = buildClimbTableRows(undefined, fallback, {
      distance: [0, 1_000, 1_000, 2_000],
      time: [0, 60, 180, 240],
      elapsedDurationSec: 300,
    });

    expect(row?.entrySec).toBe(240);
  });

  it("calculates the same entry time for client fallback climbs", () => {
    const [row] = buildClimbTableRows(undefined, fallback, {
      distance: [0, 1_000, 2_000, 3_000],
      time: [0, 60_000, 120_000, 180_000],
      elapsedDurationSec: 180,
    });

    expect(row?.entrySec).toBe(120);
    expect(row?.durationSec).toBe(300);
    expect(row?.startKm).toBe(2);
  });

  it("uses the first sample that reaches startKm and returns null when the target is not reached", () => {
    const [mapped] = buildClimbTableRows(undefined, fallback, {
      distance: [0, 900, 2_100],
      time: [0, 30, 90],
    });
    const [notReached] = buildClimbTableRows(undefined, fallback, {
      distance: [0, 900, 1_900],
      time: [0, 30, 60],
    });
    const [missing] = buildClimbTableRows(undefined, fallback, { distance: [0, 2_000] });

    expect(mapped?.entrySec).toBe(90);
    expect(notReached?.entrySec).toBeNull();
    expect(missing?.entrySec).toBeNull();
  });
});

describe("formatClimbEntryTime", () => {
  it("formats epoch seconds and milliseconds as the same browser-local clock time", () => {
    const startSec = 1_720_000_000;
    const entrySec = 120;
    const expected = new Intl.DateTimeFormat("ko", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date((startSec + entrySec) * 1000));

    expect(formatClimbEntryTime(startSec, entrySec, "ko")).toBe(expected);
    expect(formatClimbEntryTime(startSec * 1000, entrySec, "ko")).toBe(expected);
  });

  it.each([
    [null, 120],
    [0, 120],
    [Number.NaN, 120],
    [1_720_000_000, null],
    [1_720_000_000, -1],
  ])("returns null for invalid start/entry values", (startTime, entrySec) => {
    expect(formatClimbEntryTime(startTime, entrySec, "en")).toBeNull();
  });
});
