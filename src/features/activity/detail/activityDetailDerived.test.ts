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

function withSparseSlot(values: number[], missingIndex: number): number[] {
  const sparse = Array<number>(values.length);
  values.forEach((value, index) => {
    if (index !== missingIndex) sparse[index] = value;
  });
  return sparse;
}

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

  it("does not derive sensor summaries from truncated legacy HR or cadence", () => {
    const streams = {
      distance: Array.from({ length: 200 }, (_, index) => index),
      time: Array.from({ length: 200 }, (_, index) => index),
      heartrate: [190, 195],
      cadence: [120],
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasHeartRateStream: false,
      heartRateSource: null,
      averageHeartRate: null,
      maxHeartRate: null,
      hasCadenceStream: false,
      averageCadence: null,
      maxCadence: null,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: undefined },
      heartRate: undefined,
    });
  });

  it("does not project aligned malformed legacy HR even when most samples are positive", () => {
    const streams = {
      distance: Array.from({ length: 20 }, (_, index) => index),
      time: Array.from({ length: 20 }, (_, index) => index),
      heartrate: [...Array(11).fill(190), null, ...Array(8).fill(0)],
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasHeartRateStream: false,
      heartRateSource: null,
      averageHeartRate: null,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: undefined },
      heartRate: undefined,
    });
  });

  it.each([
    ["null", null],
    ["string", "200"],
    ["object", { value: 200 }],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative", -1],
  ])("rejects a %s slot in every legacy sensor channel", (_case, malformedValue) => {
    const base = {
      distance: Array.from({ length: 20 }, (_, index) => index),
      time: Array.from({ length: 20 }, (_, index) => index),
    };
    const malformed = [200, malformedValue, ...Array(18).fill(0)];

    expect(deriveStreamSensorSummary({ ...base, watts: malformed } as never)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      powerSource: null,
    });
    expect(deriveStreamSensorSummary({ ...base, watts_calc: malformed } as never)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      powerSource: null,
    });
    expect(deriveStreamSensorSummary({ ...base, heartrate: malformed } as never)).toMatchObject({
      hasHeartRateStream: false,
      heartRateSource: null,
      averageHeartRate: null,
    });
    expect(deriveStreamSensorSummary({ ...base, cadence: malformed } as never)).toMatchObject({
      hasCadenceStream: false,
      averageCadence: null,
    });
  });

  it("falls back to valid calculated power while rejecting aligned legacy null slots", () => {
    const streams = {
      distance: Array.from({ length: 20 }, (_, index) => index),
      time: Array.from({ length: 20 }, (_, index) => index),
      watts: [200, null, ...Array(18).fill(0)],
      watts_calc: Array(20).fill(175),
      heartrate: [190, null, ...Array(18).fill(0)],
      cadence: [120, null, ...Array(18).fill(0)],
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      powerSource: "watts_calc",
      averagePower: 175,
      maxPower: 175,
      heartRateSource: null,
      averageHeartRate: null,
      averageCadence: null,
    });
    expect(buildActivityAnalysisProjection(streams as never)?.streams).toMatchObject({
      watts: undefined,
      watts_calc: streams.watts_calc,
    });
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
      heartRateSource: "sensorStreamsV1",
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

  it("falls back to valid top-level HR when sensorStreamsV1 has no measured heart rate", () => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      heartrate: [150, 155, 160],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [null, 0, null],
        watts: [200, 210, 220],
      },
    };
    const summary = deriveStreamSensorSummary(streams as never);
    const projection = buildActivityAnalysisProjection(streams as never);

    expect(summary).toMatchObject({
      heartRateSource: "heartrate",
      averageHeartRate: 155,
      maxHeartRate: 160,
      powerSource: "sensorStreamsV1",
    });
    expect(projection).toMatchObject({
      streams: { heartrate: streams.heartrate },
      heartRate: undefined,
      power: { values: [200, 210, 220], time: [0, 1, 2], complete: true },
    });
    expect(buildSampledData(streams as never).map((point) => point.heartRate)).toEqual(streams.heartrate);
  });

  it.each([
    ["empty", []],
    ["short", [0, 1]],
    ["non-finite", [0, Number.NaN, 2]],
    ["non-monotonic", [0, 2, 1]],
  ])("rejects measured V1 power on a %s axis without legacy fallback", (_case, explicitTime) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      watts_calc: [300, 310, 320],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: explicitTime,
        heartrate: [null, null, null],
        watts: [200, 210, 220],
      },
    };
    const summary = deriveStreamSensorSummary(streams as never);
    const projection = buildActivityAnalysisProjection(streams as never);
    const sampled = buildSampledData(streams as never);

    expect(summary).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      powerSource: null,
      averagePower: null,
      maxPower: null,
    });
    expect(projection).toMatchObject({
      streams: { watts: undefined, watts_calc: undefined },
      power: undefined,
    });
    expect(sampled.every((point) => point.power === 0)).toBe(true);
  });

  it.each([
    ["empty", []],
    ["short", [0, 1]],
    ["non-finite", [0, Number.POSITIVE_INFINITY, 2]],
    ["non-monotonic", [0, 2, 2]],
  ])("rejects measured V1 heart rate on a %s axis without legacy fallback", (_case, explicitTime) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      heartrate: [150, 155, 160],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: explicitTime,
        heartrate: [140, 141, 142],
        watts: [null, null, null],
      },
    };
    const summary = deriveStreamSensorSummary(streams as never);
    const projection = buildActivityAnalysisProjection(streams as never);
    const sampled = buildSampledData(streams as never);

    expect(summary).toMatchObject({
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
      heartRateSource: null,
      averageHeartRate: null,
      maxHeartRate: null,
    });
    expect(projection).toMatchObject({ streams: { heartrate: undefined }, heartRate: undefined });
    expect(sampled.every((point) => point.heartRate === 0)).toBe(true);
  });

  it.each([
    ["missing", undefined, "watts_calc", false],
    ["null", null, "watts_calc", false],
    ["object", { value: 200 }, null, true],
    ["string", "200", null, true],
  ])("handles a %s V1 power channel without throwing", (_case, explicitWatts, source, rejected) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      watts_calc: [300, 310, 320],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [null, null, null],
        watts: explicitWatts,
      },
    };

    expect(() => deriveStreamSensorSummary(streams as never)).not.toThrow();
    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      powerSource: source,
      hasRejectedPowerStream: rejected,
    });
    expect(() => buildActivityAnalysisProjection(streams as never)).not.toThrow();
    expect(() => buildSampledData(streams as never)).not.toThrow();
  });

  it.each([
    ["string", "210"],
    ["object", { watts: 210 }],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative", -1],
  ])("rejects V1 power containing a %s slot", (_case, malformedValue) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      watts_calc: [300, 310, 320],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [null, null, null],
        watts: [200, malformedValue, 220],
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      powerSource: null,
      hasRejectedPowerStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { watts: undefined, watts_calc: undefined },
      power: undefined,
    });
  });

  it.each([
    ["a missing middle slot", withSparseSlot([0, 1, 2, 3], 2)],
    ["only holes", Array<number>(4)],
  ])("rejects measured V1 power when time has %s", (_case, explicitTime) => {
    const streams = {
      distance: [0, 10, 20, 30],
      time: [0, 1, 2, 3],
      watts_calc: [300, 310, 320, 330],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: explicitTime,
        heartrate: [null, null, null, null],
        watts: [200, 210, 220, 230],
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      powerSource: null,
      hasRejectedPowerStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { watts: undefined, watts_calc: undefined },
      power: undefined,
    });
    expect(buildSampledData(streams as never).every((point) => point.power === 0)).toBe(true);
  });

  it("rejects a sparse V1 power channel as malformed", () => {
    const sparseWatts = withSparseSlot([200, 210, 220, 230], 2);
    const streams = {
      distance: [0, 10, 20, 30],
      time: [0, 1, 2, 3],
      watts_calc: [300, 310, 320, 330],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2, 3],
        heartrate: [null, null, null, null],
        watts: sparseWatts,
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      powerSource: null,
      hasRejectedPowerStream: true,
    });
    expect(() => buildActivityAnalysisProjection(streams as never)).not.toThrow();
    expect(() => buildSampledData(streams as never)).not.toThrow();
  });

  it("rejects a sparse V1 heart-rate channel as malformed", () => {
    const sparseHeartRate = withSparseSlot([140, 141, 142, 143], 2);
    const streams = {
      distance: [0, 10, 20, 30],
      time: [0, 1, 2, 3],
      heartrate: [150, 155, 160, 165],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2, 3],
        heartrate: sparseHeartRate,
        watts: [null, null, null, null],
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      heartRateSource: null,
      hasRejectedHeartRateStream: true,
    });
    expect(() => buildActivityAnalysisProjection(streams as never)).not.toThrow();
    expect(() => buildSampledData(streams as never)).not.toThrow();
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["object", { seconds: [0, 1, 2] }],
    ["string", "0,1,2"],
  ])("rejects measured V1 power when time is %s", (_case, explicitTime) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      watts_calc: [300, 310, 320],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: explicitTime,
        heartrate: [null, null, null],
        watts: [200, 210, 220],
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      powerSource: null,
      hasRejectedPowerStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { watts: undefined, watts_calc: undefined },
      power: undefined,
    });
    expect(() => buildSampledData(streams as never)).not.toThrow();
  });

  it.each([
    ["missing", undefined, "heartrate", false],
    ["null", null, "heartrate", false],
    ["object", { value: 140 }, null, true],
    ["string", "140", null, true],
  ])("handles a %s V1 heart-rate channel without throwing", (_case, explicitHeartRate, source, rejected) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      heartrate: [150, 155, 160],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: explicitHeartRate,
        watts: [null, null, null],
      },
    };

    expect(() => deriveStreamSensorSummary(streams as never)).not.toThrow();
    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      heartRateSource: source,
      hasRejectedHeartRateStream: rejected,
    });
    expect(() => buildActivityAnalysisProjection(streams as never)).not.toThrow();
    expect(() => buildSampledData(streams as never)).not.toThrow();
  });

  it.each([
    ["string", "141"],
    ["object", { bpm: 141 }],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative", -1],
  ])("rejects V1 heart rate containing a %s slot", (_case, malformedValue) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      heartrate: [150, 155, 160],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [140, malformedValue, 142],
        watts: [null, null, null],
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      heartRateSource: null,
      hasRejectedHeartRateStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: undefined },
      heartRate: undefined,
    });
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["object", { seconds: [0, 1, 2] }],
    ["string", "0,1,2"],
  ])("rejects measured V1 heart rate when time is %s", (_case, explicitTime) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      heartrate: [150, 155, 160],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: explicitTime,
        heartrate: [140, 141, 142],
        watts: [null, null, null],
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      heartRateSource: null,
      hasRejectedHeartRateStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: undefined },
      heartRate: undefined,
    });
    expect(() => buildSampledData(streams as never)).not.toThrow();
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
      heartrate: [150, 151, 152],
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

    expect(deriveStreamSensorSummary(streams as never)?.heartRateSource).toBe("sensorStreamsV1");
    expect(projection?.streams.heartrate).toBeUndefined();
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
