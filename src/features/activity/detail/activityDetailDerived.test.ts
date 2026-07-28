import { describe, expect, it } from "vitest";

import {
  buildChartOverlays,
  buildActivityAnalysisProjection,
  buildSampledData,
  buildSummaryStats,
  deriveStreamSensorSummary,
  getAvailableOverlays,
  getChartHighlightRange,
  getSegmentEfforts,
  getStreamPhotos,
} from "./activityDetailDerived";

describe("activityDetailDerived", () => {
  const streams = {
    distance: [0, 100, 200],
    altitude: [10, 20, 15],
    velocity_smooth: [0, 5, 10],
    heartrate: [0, 140, 150],
    watts: [0, 210, 220],
    cadence: [0, 85, 88],
    latlng: [[37, 127], [37.1, 127.1], [37.2, 127.2]],
    segment_efforts: [
      { id: "b", startIndex: 2, endIndex: 3 },
      { id: "a", startIndex: 0, endIndex: 1 },
    ],
    photos: [{ id: "p1", url: "https://example.com/p.webp", caption: null, location: [37, 127] }],
  };

  it("samples streams and derives overlay stats", () => {
    const sampled = buildSampledData(streams as never);
    const sensorSummary = deriveStreamSensorSummary(streams as never);

    expect(sampled).toHaveLength(3);
    expect(sampled[1]).toMatchObject({ distance: 100, altitude: 20, speed: 18, heartRate: 140, power: 210 });
    expect(getAvailableOverlays(sampled).map((cfg) => cfg.key)).toEqual(["speed", "hr", "power", "cadence"]);
    expect(buildSummaryStats(streams as never, sensorSummary)?.overlays.power).toBeUndefined();
  });

  it("excludes missing HR/cadence zeros and derives extrema from the full stream", () => {
    const longStreams = {
      distance: Array.from({ length: 601 }, (_, index) => index),
      altitude: Array.from({ length: 601 }, (_, index) => index === 301 ? 999 : 10),
      heartrate: Array.from({ length: 601 }, (_, index) => index === 301 ? 190 : index === 302 ? 150 : 0),
      cadence: Array.from({ length: 601 }, (_, index) => index === 301 ? 110 : index === 302 ? 90 : 0),
    };

    const summary = deriveStreamSensorSummary(longStreams as never);
    const sampled = buildSampledData(longStreams as never);
    expect(summary).toMatchObject({
      averageHeartRate: 170,
      maxHeartRate: 190,
      averageCadence: 100,
      maxCadence: 110,
    });
    expect(buildSummaryStats(longStreams as never, summary)).toMatchObject({
      maxElev: 999,
      overlays: { hr: { avg: 170, max: 190 }, cadence: { avg: 100, max: 110 } },
    });
    expect(sampled.some((point) => point.altitude === 999 && point.heartRate === 190 && point.cadence === 110)).toBe(true);
  });

  it("suppresses sparse legacy power but includes real zero watts once coverage is reliable", () => {
    const sparse = deriveStreamSensorSummary({
      distance: Array.from({ length: 200 }, (_, index) => index),
      watts: [250, 300, 350, ...Array(197).fill(0)],
    } as never);
    expect(sparse).toMatchObject({ averagePower: null, maxPower: null, hasReliablePower: false });

    const stillSparse = deriveStreamSensorSummary({
      distance: Array.from({ length: 200 }, (_, index) => index),
      watts: [...Array(10).fill(200), ...Array(190).fill(0)],
    } as never);
    expect(stillSparse).toMatchObject({ averagePower: null, maxPower: null, hasReliablePower: false });

    const covered = deriveStreamSensorSummary({
      distance: Array.from({ length: 200 }, (_, index) => index),
      watts: [...Array(40).fill(200), ...Array(160).fill(0)],
    } as never);
    expect(covered).toMatchObject({ averagePower: 40, maxPower: 200, hasReliablePower: true });
  });

  it("prefers explicit sensor stream null semantics and preserves measured zero watts", () => {
    const explicitStreams = {
      heartrate: [20, 20],
      watts: Array(100).fill(0),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [140, null, 160],
        watts: [null, 0, 200],
      },
    };
    const summary = deriveStreamSensorSummary(explicitStreams as never);

    expect(summary).toMatchObject({
      averageHeartRate: 150,
      maxHeartRate: 160,
      averagePower: 100,
      maxPower: 200,
      hasReliablePower: true,
    });
    expect(buildActivityAnalysisProjection(explicitStreams as never, summary)).toMatchObject({
      streams: { heartrate: undefined, watts: undefined },
      heartRate: undefined,
      power: { values: [0, 200], time: [0, 1] },
    });
    expect(getAvailableOverlays(buildSampledData({
      ...explicitStreams,
      distance: [0, 10],
      altitude: [1, 2],
    } as never)).map((overlay) => overlay.key)).not.toEqual(expect.arrayContaining(["hr", "power"]));
  });

  it("never forwards a 5/1077 sparse legacy power stream to analysis", () => {
    const streams = {
      distance: Array.from({ length: 1_077 }, (_, index) => index),
      watts: [200, 210, 220, 230, 240, ...Array(1_072).fill(0)],
    };
    const summary = deriveStreamSensorSummary(streams as never);
    const projection = buildActivityAnalysisProjection(streams as never, summary);

    expect(summary?.hasReliablePower).toBe(false);
    expect(projection?.streams.watts).toBeUndefined();
    expect(projection?.power).toBeUndefined();
  });

  it("removes legacy missing-heart-rate zeros before analysis", () => {
    const streams = {
      time: [0, 1, 2, 3],
      heartrate: [0, 140, 0, 160],
    };
    const summary = deriveStreamSensorSummary(streams as never);

    expect(buildActivityAnalysisProjection(streams as never, summary)).toMatchObject({
      streams: { heartrate: undefined },
      heartRate: undefined,
    });
  });

  it("keeps dense legacy HR and power on their shared axis", () => {
    const streams = {
      time: Array.from({ length: 30 }, (_, index) => index),
      heartrate: [0, ...Array.from({ length: 29 }, (_, index) => 140 + index)],
      watts: Array.from({ length: 30 }, (_, index) => 100 + index),
    };
    const summary = deriveStreamSensorSummary(streams as never);

    expect(buildActivityAnalysisProjection(streams as never, summary)).toEqual({ streams });
  });

  it("falls back to watts_calc when measured watts is an empty stub", () => {
    const streams = { watts: [], watts_calc: [0, 100, 200] };
    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasPowerStream: true,
      hasReliablePower: true,
      averagePower: 100,
      maxPower: 200,
    });
  });

  it("lets an owner preview override explicit sensor power", () => {
    const streams = {
      watts: [120, 130],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1],
        heartrate: [140, 141],
        watts: [200, 210],
      },
    };
    const summary = deriveStreamSensorSummary(streams as never);
    expect(buildActivityAnalysisProjection(streams as never, summary, true)).toMatchObject({
      streams: { watts: [120, 130], watts_calc: undefined },
      power: undefined,
    });
  });

  it("sorts segments, maps highlight ranges, and reads stream photos", () => {
    expect(getSegmentEfforts(streams as never).map((segment) => segment.id)).toEqual(["a", "b"]);
    expect(getChartHighlightRange({ id: "s", startIndex: 1, endIndex: 2 } as never, streams as never)).toEqual([1, 2]);
    expect(getStreamPhotos(streams as never)[0]?.id).toBe("p1");
  });

  it("builds chart overlay datasets", () => {
    const sampled = buildSampledData(streams as never);
    const overlays = buildChartOverlays(
      getAvailableOverlays(sampled),
      new Set(["speed"]),
      sampled,
      (label) => `overlay.${label}`,
    );

    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ label: "overlay.speed (km/h)", yAxisID: "ySpeed" });
  });
});
