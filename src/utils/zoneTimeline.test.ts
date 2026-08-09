import { describe, expect, it } from "vitest";
import { buildZoneTimeline, resolveZoneTimelineAxis } from "./zoneTimeline";

describe("buildZoneTimeline", () => {
  it("assigns samples into deterministic effort-time buckets", () => {
    const timeline = buildZoneTimeline([100, 200, 300, 400], [0, 10, 20, 30], (value) => Math.ceil(value / 100), undefined, 4);
    expect(timeline).toEqual([
      { zone: 1, segments: [{ zone: 1, durationSec: 10 }], startSec: 0, endSec: 10, durationSec: 10 },
      { zone: 2, segments: [{ zone: 2, durationSec: 10 }], startSec: 10, endSec: 20, durationSec: 10 },
      { zone: 3, segments: [{ zone: 3, durationSec: 10 }], startSec: 20, endSec: 30, durationSec: 10 },
      { zone: 4, segments: [{ zone: 4, durationSec: 10 }], startSec: 30, endSec: 40, durationSec: 10 },
    ]);
  });

  it("uses supplied moving durations so a pause is not added to a zone", () => {
    const timeline = buildZoneTimeline([100, 200], [0, 600], (value) => value === 100 ? 1 : 2, { durationsSec: [10, 10] }, 2);
    expect(timeline).toEqual([
      { zone: 1, segments: [{ zone: 1, durationSec: 10 }], startSec: 0, endSec: 10, durationSec: 10 },
      { zone: 2, segments: [{ zone: 2, durationSec: 10 }], startSec: 10, endSec: 20, durationSec: 10 },
    ]);
  });

  it("places a pause-contaminated stream continuously across the moving-time axis", () => {
    const timeline = buildZoneTimeline(
      [100, 200],
      [0, 600],
      (value) => value === 100 ? 1 : 2,
      { durationsSec: [10, 10] },
      32,
      { sourceStartSec: 0, sourceEndSec: 20, durationSec: 20 },
    );
    expect(timeline.slice(0, 16).every((bucket) => bucket.zone === 1)).toBe(true);
    expect(timeline.slice(16).every((bucket) => bucket.zone === 2)).toBe(true);
    expect(timeline.some((bucket) => bucket.zone == null)).toBe(false);
  });

  it("splits trusted samples across their full effort-time intervals", () => {
    const axis = resolveZoneTimelineAxis([
      { values: [100, 200], time: [0, 10], timing: { durationsSec: [10, 10] } },
    ], 20)!;
    const timeline = buildZoneTimeline(
      [100, 200],
      [0, 10],
      (value) => value === 100 ? 1 : 2,
      { durationsSec: [10, 10] },
      32,
      axis,
    );
    expect(timeline.slice(0, 16).every((bucket) => bucket.zone === 1)).toBe(true);
    expect(timeline.slice(16).every((bucket) => bucket.zone === 2)).toBe(true);
    expect(timeline.some((bucket) => bucket.zone == null)).toBe(false);
  });

  it("returns no timeline for missing streams and leaves invalid samples unclassified", () => {
    expect(buildZoneTimeline(undefined, undefined, () => 1)).toEqual([]);
    expect(buildZoneTimeline([], [], () => 1)).toEqual([]);
    expect(buildZoneTimeline([Number.NaN], [0], () => 1, { durationsSec: [10] }, 1)).toEqual([{
      zone: null,
      segments: [{ zone: null, durationSec: 10 }],
      startSec: 0,
      endSec: 10,
      durationSec: 10,
    }]);
  });

  it("uses one shared effort axis and preserves a later power stream's leading gap as no data", () => {
    const axis = resolveZoneTimelineAxis([
      { values: [1, 2], time: [0, 60], timing: { durationsSec: [30, 30] } },
      { values: [3, 3], time: [30, 60], timing: { durationsSec: [30, 30] } },
    ], 60)!;

    const heartRate = buildZoneTimeline([1, 2], [0, 60], (value) => value, { durationsSec: [30, 30] }, 2, axis);
    const power = buildZoneTimeline([3, 3], [30, 60], (value) => value, { durationsSec: [30, 30] }, 2, axis);
    expect(power).toEqual([
      { zone: null, segments: [{ zone: null, durationSec: 30 }], startSec: 0, endSec: 30, durationSec: 30 },
      { zone: 3, segments: [{ zone: 3, durationSec: 30 }], startSec: 30, endSec: 60, durationSec: 30 },
    ]);
    expect(heartRate.map(({ startSec, endSec }) => ({ startSec, endSec })))
      .toEqual(power.map(({ startSec, endSec }) => ({ startSec, endSec })));
  });

  it("keeps an explicit intermediate sensor gap unclassified on a summary moving-time axis", () => {
    const timeline = buildZoneTimeline(
      [100, 200, 300, 400],
      [0, 10, 40, 50],
      (value) => Math.ceil(value / 100),
      { durationsSec: [10, 10, 10, 10], segmentStarts: [true, false, true, false] },
      6,
      { sourceStartSec: 0, sourceEndSec: 50, durationSec: 80 },
    );

    expect(timeline.map((bucket) => bucket.zone)).toEqual([1, 2, null, null, 3, 4]);
    expect(timeline.every((bucket) => bucket.durationSec === 80 / 6)).toBe(true);
  });

  it("keeps the trailing portion unclassified when a stream ends before the shared axis", () => {
    const timeline = buildZoneTimeline(
      [100, 200],
      [0, 10],
      (value) => Math.ceil(value / 100),
      { durationsSec: [10, 10] },
      4,
      { sourceStartSec: 0, sourceEndSec: 20, durationSec: 40 },
    );

    expect(timeline.map((bucket) => bucket.zone)).toEqual([1, 2, null, null]);
  });

  it("lets a longer missing-value interval win its bucket over a shorter zone sample", () => {
    const timeline = buildZoneTimeline(
      [Number.NaN, 200],
      [0, 1],
      () => 3,
      { durationsSec: [9, 1] },
      1,
    );
    expect(timeline[0]).toMatchObject({ zone: null, durationSec: 10 });
  });

  it("retains every zone's proportional duration within a bucket", () => {
    const timeline = buildZoneTimeline(
      [100, 300, 100],
      [0, 2, 7],
      (value) => Math.ceil(value / 100),
      { durationsSec: [2, 5, 3] },
      1,
    );

    expect(timeline[0]).toEqual({
      zone: 1,
      segments: [
        { zone: 1, durationSec: 5 },
        { zone: 3, durationSec: 5 },
      ],
      startSec: 0,
      endSec: 10,
      durationSec: 10,
    });
  });

  it("makes a partially uncovered bucket visibly no-data instead of filling it with a zone", () => {
    const timeline = buildZoneTimeline(
      [100, 100],
      [10, 15],
      () => 1,
      { durationsSec: [5, 5] },
      1,
      { sourceStartSec: 0, sourceEndSec: 20, durationSec: 20 },
    );

    expect(timeline[0]?.segments).toEqual([
      { zone: null, durationSec: 15 },
      { zone: 1, durationSec: 5 },
    ]);
  });
});
