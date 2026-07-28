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
  streamPowerReplacesSavedSummary,
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
    expect(buildSummaryStats(streams as never, sensorSummary)?.overlays.power)
      .toEqual({ avg: (210 + 220) / 3, max: 220 });
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
      watts: [...Array(9).fill(200), ...Array(191).fill(0)],
    } as never);
    expect(stillSparse).toMatchObject({ averagePower: null, maxPower: null, hasReliablePower: false });

    const covered = deriveStreamSensorSummary({
      distance: Array.from({ length: 200 }, (_, index) => index),
      watts: [...Array(40).fill(200), ...Array(160).fill(0)],
    } as never);
    expect(covered).toMatchObject({ averagePower: 40, maxPower: 200, hasReliablePower: true });
  });

  it("rejects legacy power containing non-finite samples", () => {
    const streams = {
      distance: Array.from({ length: 200 }, (_, index) => index),
      watts: [...Array(10).fill(200), ...Array(190).fill(Number.NaN)],
    };
    const summary = deriveStreamSensorSummary(streams as never);
    const projection = buildActivityAnalysisProjection(streams as never);
    const sampled = buildSampledData(streams as never);

    expect(summary).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      averagePower: null,
      maxPower: null,
      powerSource: null,
    });
    expect(projection?.streams.watts).toBeUndefined();
    expect(getAvailableOverlays(sampled).map((overlay) => overlay.key)).not.toContain("power");
  });

  it("accepts a fully valid legacy stream at the five-percent boundary", () => {
    const streams = {
      distance: Array.from({ length: 200 }, (_, index) => index),
      watts: [...Array(10).fill(200), ...Array(190).fill(0)],
    };
    const summary = deriveStreamSensorSummary(streams as never);

    expect(summary).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      powerSource: "watts",
      averagePower: 10,
      maxPower: 200,
    });
  });

  it("rejects power truncated against the activity axis and falls back to complete watts_calc", () => {
    const base = {
      distance: Array.from({ length: 200 }, (_, index) => index),
      time: Array.from({ length: 200 }, (_, index) => index),
      watts: Array(10).fill(200),
    };
    const rejectedSummary = deriveStreamSensorSummary(base as never);
    expect(rejectedSummary).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      powerSource: null,
    });
    expect(buildActivityAnalysisProjection(base as never)?.streams.watts).toBeUndefined();

    const withFallback = { ...base, watts_calc: Array(200).fill(175) };
    const fallbackSummary = deriveStreamSensorSummary(withFallback as never);
    const fallbackProjection = buildActivityAnalysisProjection(withFallback as never);
    const sampled = buildSampledData(withFallback as never);
    expect(fallbackSummary).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      powerSource: "watts_calc",
      averagePower: 175,
      maxPower: 175,
    });
    expect(fallbackProjection?.streams).toMatchObject({ watts: undefined, watts_calc: withFallback.watts_calc });
    expect(sampled.every((point) => point.power === 175)).toBe(true);
  });

  it("keeps short or coast-heavy legacy power at backend-consistent coverage", () => {
    const short = {
      time: Array.from({ length: 20 }, (_, index) => index),
      watts: [...Array(8).fill(200), ...Array(12).fill(0)],
    };
    const shortSummary = deriveStreamSensorSummary(short as never);
    expect(shortSummary).toMatchObject({ averagePower: 80, maxPower: 200, hasReliablePower: true });
    expect(buildActivityAnalysisProjection(short as never)?.streams.watts).toEqual(short.watts);

    const coastHeavy = {
      time: Array.from({ length: 100 }, (_, index) => index),
      watts: [...Array(10).fill(250), ...Array(90).fill(0)],
    };
    expect(deriveStreamSensorSummary(coastHeavy as never))
      .toMatchObject({ averagePower: 25, maxPower: 250, hasReliablePower: true });
  });

  it("prefers explicit sensor stream null semantics and preserves measured zero watts", () => {
    const explicitStreams = {
      heartrate: [20, 20],
      watts: Array(100).fill(0),
      watts_calc: [300, 300, 300],
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
    expect(buildActivityAnalysisProjection(explicitStreams as never)).toMatchObject({
      streams: { heartrate: undefined, watts: undefined },
      heartRate: undefined,
      power: { values: [0, 200], time: [1, 2], complete: false },
    });
    expect(getAvailableOverlays(buildSampledData({
      ...explicitStreams,
      distance: [0, 10],
      altitude: [1, 2],
    } as never)).map((overlay) => overlay.key)).not.toEqual(expect.arrayContaining(["hr", "power"]));
  });

  it("falls back to valid virtual power when sensorStreamsV1 only measured heart rate", () => {
    const streams = {
      distance: [0, 10, 20],
      watts_calc: [150, 160, 170],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [140, 141, 142],
        watts: [null, null, null],
      },
    };
    const summary = deriveStreamSensorSummary(streams as never);

    expect(summary).toMatchObject({
      powerSource: "watts_calc",
      averagePower: 160,
      maxPower: 170,
      averageHeartRate: 141,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { watts: undefined, watts_calc: streams.watts_calc },
      power: undefined,
    });
    expect(buildSampledData(streams as never).map((point) => point.power)).toEqual(streams.watts_calc);
  });

  it.each([5, 6])("never forwards a %i/1077 sparse legacy power stream to analysis", (positiveCount) => {
    const values = Array.from({ length: positiveCount }, (_, index) => 200 + index * 10);
    const streams = {
      distance: Array.from({ length: 1_077 }, (_, index) => index),
      watts: [...values, ...Array(1_077 - positiveCount).fill(0)],
    };
    const summary = deriveStreamSensorSummary(streams as never);
    const projection = buildActivityAnalysisProjection(streams as never);

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

    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: undefined },
      heartRate: undefined,
    });
  });

  it("uses an index axis to repair sparse legacy heart rate when time is empty", () => {
    const streams = {
      time: [],
      heartrate: [0, 140, 150, 0],
    };

    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: undefined },
      heartRate: { values: [140, 150], time: [1, 2], complete: false },
    });
  });

  it("keeps dense legacy HR and power on their shared axis", () => {
    const streams = {
      time: Array.from({ length: 30 }, (_, index) => index),
      heartrate: [0, ...Array.from({ length: 29 }, (_, index) => 140 + index)],
      watts: Array.from({ length: 30 }, (_, index) => 100 + index),
    };
    const summary = deriveStreamSensorSummary(streams as never);

    expect(buildActivityAnalysisProjection(streams as never)).toEqual({ streams });
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

  it("falls back to valid watts_calc when measured watts is a non-empty zero-filled stub", () => {
    const streams = {
      time: Array.from({ length: 20 }, (_, index) => index),
      watts: Array(20).fill(0),
      watts_calc: Array(20).fill(175),
    };
    const summary = deriveStreamSensorSummary(streams as never);
    const projection = buildActivityAnalysisProjection(streams as never);

    expect(summary).toMatchObject({
      hasPowerStream: true,
      hasReliablePower: true,
      hasRejectedPowerStream: false,
      powerSource: "watts_calc",
      averagePower: 175,
      maxPower: 175,
    });
    expect(projection?.streams).toMatchObject({ watts: undefined, watts_calc: streams.watts_calc });
    const sampled = buildSampledData({
      ...streams,
      distance: Array.from({ length: 20 }, (_, index) => index),
    } as never);
    expect(sampled.every((point) => point.power === 175)).toBe(true);
    expect(getAvailableOverlays(sampled).map((overlay) => overlay.key)).toContain("power");
  });

  it("uses valid watts_calc for the chart when measured watts is sparse", () => {
    const streams = {
      distance: Array.from({ length: 21 }, (_, index) => index),
      watts: [200, ...Array(20).fill(0)],
      watts_calc: Array.from({ length: 21 }, (_, index) => 150 + index),
    };

    const sampled = buildSampledData(streams as never);
    expect(sampled.map((point) => point.power)).toEqual(streams.watts_calc);
    expect(getAvailableOverlays(sampled).map((overlay) => overlay.key)).toContain("power");
  });

  it("only replaces saved power metadata for rejected or mismatched streams", () => {
    const explicit = deriveStreamSensorSummary({
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [140, 141, 142],
        watts: [200, 210, 220],
      },
    } as never);
    const legacy = deriveStreamSensorSummary({ watts: [100, 100, 200] } as never);
    const rejected = deriveStreamSensorSummary({ watts: [200, ...Array(20).fill(0)] } as never);

    expect(streamPowerReplacesSavedSummary(explicit, { averagePower: 210, maxPower: 220 })).toBe(false);
    expect(streamPowerReplacesSavedSummary(legacy, { averagePower: 400 / 3, maxPower: 200 })).toBe(false);
    expect(streamPowerReplacesSavedSummary(legacy, { averagePower: 133, maxPower: 200 })).toBe(false);
    expect(streamPowerReplacesSavedSummary(explicit, { averagePower: 120, maxPower: 300 })).toBe(true);
    expect(streamPowerReplacesSavedSummary(rejected, { averagePower: 10, maxPower: 200 })).toBe(true);
  });

  it("keeps sensor overlay stats for indoor streams without altitude", () => {
    const streams = {
      distance: [0, 10, 20],
      heartrate: [140, 150, 160],
      watts: [200, 210, 220],
      cadence: [80, 85, 90],
    };
    const summary = deriveStreamSensorSummary(streams as never);

    expect(buildSummaryStats(streams as never, summary)).toEqual({
      minElev: 0,
      maxElev: 0,
      overlays: {
        hr: { avg: 150, max: 160 },
        power: { avg: 210, max: 220 },
        cadence: { avg: 85, max: 90 },
      },
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
    expect(buildActivityAnalysisProjection(streams as never, true)).toMatchObject({
      streams: { watts: [120, 130], watts_calc: undefined },
      power: undefined,
    });
  });

  it("preserves explicit sensor timestamps and marks missing channels incomplete", () => {
    const streams = {
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [null, 140, 141],
        watts: [200, 210, null],
      },
    };
    const projection = buildActivityAnalysisProjection(streams as never);

    expect(projection?.heartRate).toEqual({ values: [140, 141], time: [1, 2], complete: false });
    expect(projection?.power).toEqual({ values: [200, 210], time: [0, 1], complete: false });
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
