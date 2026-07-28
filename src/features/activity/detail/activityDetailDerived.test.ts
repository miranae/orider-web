import { describe, expect, it } from "vitest";

import {
  buildChartOverlays,
  buildActivityAnalysisProjection,
  buildActivitySensorSelectionContext,
  buildSampledData,
  buildSummaryStats,
  deriveStreamSensorSummary,
  getAvailableOverlays,
  getChartHighlightRange,
  getSegmentEfforts,
  getStreamPhotos,
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
    distance: [0, 100, 200], time: [0, 1, 2],
    altitude: [10, 20, 15],
    velocity_smooth: [0, 5, 10],
    heartrate: [130, 140, 150],
    watts: [0, 210, 220],
    cadence: [80, 85, 88],
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
      .toEqual({ avg: (210 + 220) / 2, max: 220 });
  });

  it("rejects HR/cadence measurements clustered in one session fragment", () => {
    const longStreams = {
      distance: Array.from({ length: 601 }, (_, index) => index), time: Array.from({ length: 601 }, (_, index) => index),
      altitude: Array.from({ length: 601 }, (_, index) => index === 301 ? 999 : 10),
      heartrate: Array.from({ length: 601 }, (_, index) => index === 301 ? 190 : index === 302 ? 150 : 0),
      cadence: Array.from({ length: 601 }, (_, index) => index === 301 ? 110 : index === 302 ? 90 : 0),
    };

    const summary = deriveStreamSensorSummary(longStreams as never);
    const sampled = buildSampledData(longStreams as never);
    expect(summary).toMatchObject({
      averageHeartRate: null,
      maxHeartRate: null,
      averageCadence: null,
      maxCadence: null,
      hasCadenceStream: false,
      hasRejectedCadenceStream: true,
    });
    expect(buildSummaryStats(longStreams as never, summary)).toMatchObject({
      maxElev: 999,
      overlays: {},
    });
    expect(getAvailableOverlays(sampled).map(({ key }) => key))
      .not.toEqual(expect.arrayContaining(["hr", "cadence"]));
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
      hasRejectedHeartRateStream: true,
      heartRateSource: null,
      averageHeartRate: null,
      maxHeartRate: null,
      hasCadenceStream: false,
      hasRejectedCadenceStream: true,
      averageCadence: null,
      maxCadence: null,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: undefined },
      heartRate: undefined,
    });
  });

  it("rejects truncated legacy sensors using indoor summary duration without route time or distance", () => {
    const streams = {
      watts: Array(60).fill(200),
      heartrate: Array(60).fill(150),
      cadence: Array(60).fill(85),
    };

    expect(deriveStreamSensorSummary(streams as never, 3_600)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
      hasCadenceStream: false,
      hasRejectedCadenceStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never, 3_600)).toMatchObject({
      streams: { watts: undefined, heartrate: undefined, cadence: undefined },
    });
  });

  it("accepts full-length 1 Hz legacy sensors without treating a 2 Hz route axis as seconds", () => {
    const streams = {
      velocity_smooth: Array(7_200).fill(8),
      watts: Array(3_600).fill(200),
      heartrate: Array(3_600).fill(150),
      cadence: Array(3_600).fill(85),
    };

    expect(deriveStreamSensorSummary(streams as never, 3_600)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
      hasCadenceStream: true,
      hasRejectedCadenceStream: false,
      averagePower: 200,
      averageHeartRate: 150,
      averageCadence: 85,
    });
    expect(buildActivityAnalysisProjection(streams as never, 3_600)).toMatchObject({
      streams: {
        watts: streams.watts,
        heartrate: streams.heartrate,
        cadence: streams.cadence,
      },
    });
  });

  it("keeps validated mismatched legacy sensors out of the chart when no route clock exists", () => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 3_600_000,
      elapsedTimeMillis: 5_400_000,
    } as never, 1_700_000_000_000);
    const streams = {
      distance: Array.from({ length: 7_200 }, (_, index) => index * 4),
      velocity_smooth: Array(7_200).fill(8),
      watts: Array(3_600).fill(200),
      heartrate: Array(3_600).fill(150),
      cadence: Array(3_600).fill(85),
    };

    expect(context).toEqual({
      legacyDurationSec: 3_600,
      explicitDurationSec: 5_400,
      activityStartTime: 1_700_000_000_000,
    });
    expect(deriveStreamSensorSummary(streams as never, context)).toMatchObject({
      hasPowerStream: true,
      hasHeartRateStream: true,
      hasCadenceStream: true,
      rejections: [],
    });
    expect(buildActivityAnalysisProjection(streams as never, context)).toMatchObject({
      streams: {
        watts: streams.watts,
        heartrate: streams.heartrate,
        cadence: streams.cadence,
      },
    });
    const chartOverlays = getAvailableOverlays(buildSampledData(streams as never, context))
      .map((overlay) => overlay.key);
    expect(chartOverlays).not.toEqual(expect.arrayContaining(["power", "hr", "cadence"]));
    expect(getAvailableOverlays(buildSampledData(streams as never)).map((overlay) => overlay.key))
      .not.toEqual(expect.arrayContaining(["power", "hr", "cadence"]));
  });

  it("keeps explicit V1 on wall-clock duration while legacy sensors use riding duration", () => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 3_600_000,
      elapsedTimeMillis: 5_400_000,
    } as never, 1_700_000_000_000);
    const makeStreams = (length: number) => ({
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: Array.from({ length }, (_, index) => index),
        heartrate: Array(length).fill(150),
        watts: Array(length).fill(200),
      },
    });

    expect(deriveStreamSensorSummary(makeStreams(3_600) as never, context)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
    });
    expect(deriveStreamSensorSummary(makeStreams(5_400) as never, context)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
    });
  });

  it.each([
    ["metadata", { timeUnit: "milliseconds" }, "invalid_metadata"],
    ["axis", { time: [0, 1] }, "invalid_axis"],
    ["channel", { watts: [200, Number.NaN, 220] }, "invalid_channel"],
  ])("classifies corrupt explicit power %s without retaining raw samples", (_case, override, reason) => {
    const streams = {
      time: [0, 1, 2],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [140, 141, 142],
        watts: [200, 210, 220],
        ...override,
      },
    };

    const rejection = deriveStreamSensorSummary(streams as never)?.rejections
      .find((candidate) => candidate.channel === "power");
    expect(rejection).toMatchObject({
      channel: "power",
      source: "sensorStreamsV1",
      reason,
    });
    expect(Object.keys(rejection ?? {})).not.toEqual(expect.arrayContaining(["values", "time"]));
  });

  it("uses every validated route axis when summary duration is unavailable", () => {
    const base = {
      velocity_smooth: Array(100).fill(8),
      distance: Array(80).fill(0),
    };

    expect(deriveStreamSensorSummary({
      ...base,
      watts: Array(94).fill(200),
      heartrate: Array(94).fill(150),
      cadence: Array(94).fill(85),
    } as never)).toMatchObject({
      hasPowerStream: false,
      hasHeartRateStream: false,
      hasCadenceStream: false,
    });
    expect(deriveStreamSensorSummary({
      ...base,
      watts: Array(95).fill(200),
      heartrate: Array(95).fill(150),
      cadence: Array(95).fill(85),
    } as never)).toMatchObject({
      hasPowerStream: true,
      hasHeartRateStream: true,
      hasCadenceStream: true,
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
      hasRejectedHeartRateStream: true,
      heartRateSource: null,
      averageHeartRate: null,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: undefined },
      heartRate: undefined,
    });
  });

  it("normalizes malformed persisted numeric arrays before analysis", () => {
    const streams = {
      altitude: { malformed: true },
      distance: "0,10,20",
      time: withSparseSlot([0, 1, 2], 1),
      velocity_smooth: "5,6,7",
      cadence: [80, null, 90],
    };

    expect(buildActivityAnalysisProjection(streams as never)?.streams).toMatchObject({
      altitude: undefined,
      distance: undefined,
      time: undefined,
      velocity_smooth: undefined,
      cadence: undefined,
      heartrate: undefined,
      watts: undefined,
      watts_calc: undefined,
    });
  });

  it("keeps valid persisted analysis arrays including negative altitude", () => {
    const streams = {
      altitude: [-5, 0, 10],
      distance: [0, 10, 20],
      time: [0, 1, 2],
      velocity_smooth: [0, 5, 6],
      cadence: [75, 80, 90],
    };

    expect(buildActivityAnalysisProjection(streams as never)?.streams).toMatchObject(streams);
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
      hasRejectedHeartRateStream: true,
      heartRateSource: null,
      averageHeartRate: null,
    });
    expect(deriveStreamSensorSummary({ ...base, cadence: malformed } as never)).toMatchObject({
      hasCadenceStream: false,
      hasRejectedCadenceStream: true,
      averageCadence: null,
    });
  });

  it.each([
    ["missing", undefined, false],
    ["null", null, false],
    ["empty", [], false],
    ["non-array", { bpm: 140 }, true],
    ["untrusted nonempty", [140], true],
  ])("tracks %s legacy heart-rate presence as rejected=%s", (_case, heartrate, rejected) => {
    expect(deriveStreamSensorSummary({
      distance: Array.from({ length: 20 }, (_, index) => index),
      time: Array.from({ length: 20 }, (_, index) => index),
      heartrate,
    } as never)).toMatchObject({
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: rejected,
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

  it("suppresses sparse legacy power and excludes legacy zero sentinels once coverage is reliable", () => {
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
    expect(covered).toMatchObject({ averagePower: 200, maxPower: 200, hasReliablePower: true });
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
      averagePower: 200,
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
    expect(shortSummary).toMatchObject({ averagePower: 200, maxPower: 200, hasReliablePower: true });
    expect(buildActivityAnalysisProjection(short as never)?.streams.watts).toEqual(short.watts);

    const coastHeavy = {
      time: Array.from({ length: 100 }, (_, index) => index),
      watts: [...Array(10).fill(250), ...Array(90).fill(0)],
    };
    expect(deriveStreamSensorSummary(coastHeavy as never))
      .toMatchObject({ averagePower: 250, maxPower: 250, hasReliablePower: true });
  });

  it("prefers explicit sensor streams and preserves measured zero watts", () => {
    const explicitStreams = {
      time: [0, 1, 2],
      heartrate: [20, 20],
      watts: Array(100).fill(0),
      watts_calc: [300, 300, 300],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [140, 150, 160],
        watts: [0, 0, 200],
      },
    };
    const summary = deriveStreamSensorSummary(explicitStreams as never);

    expect(summary).toMatchObject({
      heartRateSource: "sensorStreamsV1",
      averageHeartRate: 150,
      maxHeartRate: 160,
      averagePower: 200 / 3,
      maxPower: 200,
      hasReliablePower: true,
    });
    expect(buildActivityAnalysisProjection(explicitStreams as never)).toMatchObject({
      streams: { heartrate: undefined, watts: undefined },
      heartRate: { values: [140, 150, 160], time: [0, 1, 2], complete: true },
      power: { values: [0, 0, 200], time: [0, 1, 2], complete: true },
    });
    expect(getAvailableOverlays(buildSampledData({
      ...explicitStreams,
      distance: [0, 10],
      altitude: [1, 2],
    } as never)).map((overlay) => overlay.key)).not.toEqual(expect.arrayContaining(["hr", "power"]));
  });

  it("rejects a one-minute V1 sensor slice for a one-hour route", () => {
    const streams = {
      time: Array.from({ length: 3_600 }, (_, index) => index),
      distance: Array.from({ length: 3_600 }, (_, index) => index * 10),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: Array.from({ length: 60 }, (_, index) => index),
        heartrate: Array(60).fill(150),
        watts: Array(60).fill(200),
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      averageHeartRate: null,
      averagePower: null,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      heartRate: undefined,
      power: undefined,
    });
  });

  it("accepts V1 sensor coverage at the 95-percent activity boundary", () => {
    const explicitLength = 3_420;
    const streams = {
      time: Array.from({ length: 3_600 }, (_, index) => index),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: Array.from({ length: explicitLength }, (_, index) => index),
        heartrate: Array(explicitLength).fill(150),
        watts: Array(explicitLength).fill(200),
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
      hasPowerStream: true,
      hasRejectedPowerStream: false,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      heartRate: { complete: true },
      power: { complete: true },
    });
  });

  it.each([
    ["exact lower boundary", 3_600, undefined, 3_420, true],
    ["below lower boundary", 3_600, undefined, 3_419, false],
    ["exact upper boundary", 3_600, undefined, 3_780, true],
    ["above upper boundary", 3_600, undefined, 3_781, false],
    ["clearly overlong stream", 3_600, undefined, 4_000, false],
    ["short activity lower rounding", 10, undefined, 9, true],
    ["short activity upper rounding", 10, undefined, 11, true],
    ["short activity outside rounding", 10, undefined, 12, false],
    ["fractional short activity rounding", 10.1, undefined, 11, true],
    ["fractional short activity below rounding", 10.1, undefined, 9, false],
    ["fractional short activity outside rounding", 10.1, undefined, 12, false],
    ["one-sample lower endpoint rounding", 2, undefined, 1, true],
    ["one-sample upper endpoint rounding", 2, undefined, 3, true],
    ["larger summary wins disagreement", 4_000, 3_600, 3_600, false],
    ["larger route wins disagreement", 3_600, 4_000, 3_600, false],
    ["matches conservative disagreement duration", 4_000, 3_600, 4_000, true],
  ])("applies bidirectional V1 duration coverage for %s", (
    _case,
    summaryDurationSec,
    routeLength,
    explicitLength,
    accepted,
  ) => {
    const streams = {
      ...(routeLength == null
        ? {}
        : { time: Array.from({ length: routeLength }, (_, index) => index) }),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: Array.from({ length: explicitLength }, (_, index) => index),
        heartrate: Array(explicitLength).fill(150),
        watts: Array(explicitLength).fill(200),
      },
    };

    expect(deriveStreamSensorSummary(streams as never, summaryDurationSec)).toMatchObject({
      hasHeartRateStream: accepted,
      hasRejectedHeartRateStream: !accepted,
      hasPowerStream: accepted,
      hasRejectedPowerStream: !accepted,
    });
    expect(buildActivityAnalysisProjection(streams as never, summaryDurationSec))
      .toMatchObject(accepted
        ? { heartRate: { complete: true }, power: { complete: true } }
        : { heartRate: undefined, power: undefined });
  });

  it("rejects complete V1 sensors when no route clock or summary duration exists", () => {
    const streams = {
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [140, 145, 150],
        watts: [180, 190, 200],
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
      hasPowerStream: false,
      hasRejectedPowerStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      heartRate: undefined,
      power: undefined,
    });
  });

  it.each([
    ["without summary evidence", undefined, false],
    ["with a positive one-second summary", 1, true],
  ])("handles a one-timestamp route %s", (_case, summaryDurationSec, accepted) => {
    const streams = {
      time: [0],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0],
        heartrate: [150],
        watts: [200],
      },
    };

    expect(deriveStreamSensorSummary(streams as never, summaryDurationSec)).toMatchObject({
      hasHeartRateStream: accepted,
      hasRejectedHeartRateStream: !accepted,
      hasPowerStream: accepted,
      hasRejectedPowerStream: !accepted,
    });
    expect(buildActivityAnalysisProjection(streams as never, summaryDurationSec))
      .toMatchObject(accepted
        ? { heartRate: { complete: true }, power: { complete: true } }
        : { heartRate: undefined, power: undefined });
  });

  it.each([
    ["relative route with epoch seconds", [0, 1, 2], 1_700_000_000, 1_700_000_000_000, true],
    ["no duration evidence with epoch milliseconds", undefined, 1_700_000_000_000, 1_700_000_000_000, false],
    ["relative route with mismatched activity start", [0, 1, 2], 1_700_000_010, 1_700_000_000_000, false],
    ["missing origin", [0, 1, 2], 1_700_000_000, undefined, false],
    ["zero origin", [0, 1, 2], 1_700_000_000, 0, false],
    ["negative origin", [0, 1, 2], 1_700_000_000, -1, false],
    ["fractional origin", [0, 1, 2], 1_700_000_000, 1_700_000_000_000.5, false],
  ])("validates V1 origin for %s", (_case, routeTime, activityStartTime, origin, accepted) => {
    const streams = {
      ...(routeTime ? { time: routeTime } : {}),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: origin,
        time: [0, 1, 2],
        heartrate: [140, 145, 150],
        watts: [180, 190, 200],
      },
    };

    expect(deriveStreamSensorSummary(streams as never, undefined, activityStartTime)).toMatchObject({
      hasHeartRateStream: accepted,
      hasRejectedHeartRateStream: !accepted,
      hasPowerStream: accepted,
      hasRejectedPowerStream: !accepted,
    });
    expect(buildActivityAnalysisProjection(streams as never, undefined, activityStartTime))
      .toMatchObject(accepted
        ? { heartRate: { complete: true }, power: { complete: true } }
        : { heartRate: undefined, power: undefined });
  });

  it("prefers the activity start when the first absolute GPS fix is delayed", () => {
    const activityStartSec = 1_700_000_000, routeStartSec = activityStartSec + 5;
    const streams = {
      time: [routeStartSec, routeStartSec + 1, routeStartSec + 2],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: activityStartSec * 1000,
        time: [0, 1, 2],
        heartrate: [140, 145, 150],
        watts: [180, 190, 200],
      },
    };

    expect(deriveStreamSensorSummary(streams as never, undefined, activityStartSec)).toMatchObject({
      hasHeartRateStream: true,
      hasPowerStream: true,
    });
  });

  it("rejects otherwise complete V1 sensors when an absolute route start disproves their origin", () => {
    const routeStartSec = 1_700_000_000;
    const streams = {
      time: Array.from({ length: 100 }, (_, index) => routeStartSec + index),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: routeStartSec * 1000 + 600_000,
        time: Array.from({ length: 100 }, (_, index) => index),
        heartrate: Array(100).fill(150),
        watts: Array(100).fill(200),
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
      hasPowerStream: false,
      hasRejectedPowerStream: true,
    });
  });

  it("never treats a distance-only route count as explicit V1 duration evidence", () => {
    const makeStreams = (length: number) => ({
      distance: Array.from({ length: 100 }, (_, index) => index * 10),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: Array.from({ length }, (_, index) => index),
        heartrate: Array(length).fill(150),
        watts: Array(length).fill(200),
      },
    });

    expect(deriveStreamSensorSummary(makeStreams(94) as never)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
    });
    expect(deriveStreamSensorSummary(makeStreams(95) as never)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
    });
    expect(deriveStreamSensorSummary(makeStreams(100) as never, 100)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
    });
    expect(deriveStreamSensorSummary(makeStreams(95) as never, 3_600)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
    });
  });

  it("fails V1 closed for a 2 Hz route channel when no clock or summary exists", () => {
    const explicitLength = 3_600;
    const streams = {
      velocity_smooth: Array(7_200).fill(8),
      distance: Array(7_200).fill(0),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: Array.from({ length: explicitLength }, (_, index) => index),
        heartrate: Array(explicitLength).fill(150),
        watts: Array(explicitLength).fill(200),
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
      hasPowerStream: false,
      hasRejectedPowerStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      heartRate: undefined,
      power: undefined,
    });
  });

  it("uses elapsed duration from a valid 2 Hz route clock without treating its count as seconds", () => {
    const explicitLength = 3_600;
    const routeLength = 7_200;
    const streams = {
      time: Array.from({ length: routeLength }, (_, index) => index / 2),
      velocity_smooth: Array(routeLength).fill(8),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: Array.from({ length: explicitLength }, (_, index) => index),
        heartrate: Array(explicitLength).fill(150),
        watts: Array(explicitLength).fill(200),
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
      hasPowerStream: true,
      hasRejectedPowerStream: false,
    });
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
        heartrate: [null, null, null],
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
    ["unsafe integer", [0, 1, 1e308]],
    ["repeated max-safe integer", [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]],
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
    expect(sampled.every((point) => point.power === null)).toBe(true);
  });

  it.each([
    ["empty", []],
    ["short", [0, 1]],
    ["non-finite", [0, Number.POSITIVE_INFINITY, 2]],
    ["non-monotonic", [0, 2, 2]],
    ["unsafe integer", [0, 1, 1e308]],
    ["repeated max-safe integer", [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]],
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
    expect(sampled.every((point) => point.heartRate === null)).toBe(true);
  });

  it.each([
    ["missing timeUnit", undefined, 1, [0, 1, 2]],
    ["wrong timeUnit", "milliseconds", 1, [0, 1, 2]],
    ["missing resolution", "relative_seconds", undefined, [0, 1, 2]],
    ["wrong resolution", "relative_seconds", 2, [0, 1, 2]],
    ["irregular millisecond-like time", "relative_seconds", 1, [0, 1000, 2000]],
  ])("rejects measured V1 power with %s", (_case, timeUnit, resolutionSeconds, explicitTime) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      watts_calc: [300, 310, 320],
      sensorStreamsV1: {
        version: 1,
        timeUnit,
        resolutionSeconds,
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
  });

  it.each([
    ["missing timeUnit", undefined, 1, [0, 1, 2]],
    ["wrong timeUnit", "milliseconds", 1, [0, 1, 2]],
    ["missing resolution", "relative_seconds", undefined, [0, 1, 2]],
    ["wrong resolution", "relative_seconds", 2, [0, 1, 2]],
    ["irregular millisecond-like time", "relative_seconds", 1, [0, 1000, 2000]],
  ])("rejects measured V1 heart rate with %s", (_case, timeUnit, resolutionSeconds, explicitTime) => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      heartrate: [150, 155, 160],
      sensorStreamsV1: {
        version: 1,
        timeUnit,
        resolutionSeconds,
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
  });

  it("allows legacy fallback when V1 has no measured channels despite invalid metadata", () => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      heartrate: [150, 155, 160],
      watts_calc: [300, 310, 320],
      sensorStreamsV1: {
        version: 1,
        time: [0, 1000, 2000],
        heartrate: [null, null, null],
        watts: [null, null, null],
      },
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      heartRateSource: "heartrate",
      powerSource: "watts_calc",
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: streams.heartrate, watts_calc: streams.watts_calc },
      heartRate: undefined,
      power: undefined,
    });
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
    expect(buildSampledData(streams as never).every((point) => point.power === null)).toBe(true);
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
      time: [0, 1, 2],
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

  it("rejects sparse legacy heart rate when trusted time is empty", () => {
    const streams = {
      time: [],
      heartrate: [0, 140, 150, 0],
    };

    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
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

    expect(buildActivityAnalysisProjection(streams as never)).toEqual({ streams });
  });

  it("falls back to watts_calc when measured watts is an empty stub", () => {
    const streams = { watts: [], watts_calc: [0, 100, 200] };
    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasPowerStream: true,
      hasReliablePower: true,
      averagePower: 150,
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
      distance: Array.from({ length: 21 }, (_, index) => index), time: Array.from({ length: 21 }, (_, index) => index),
      watts: [200, ...Array(20).fill(0)],
      watts_calc: Array.from({ length: 21 }, (_, index) => 150 + index),
    };

    const sampled = buildSampledData(streams as never);
    expect(sampled.map((point) => point.power)).toEqual(streams.watts_calc);
    expect(getAvailableOverlays(sampled).map((overlay) => overlay.key)).toContain("power");
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

  it.each([null, { malformed: true }, "10,20,30"])(
    "keeps sensor stats without throwing when persisted chart arrays are %j",
    (malformedArray) => {
      const streams = {
        distance: [0, 10, 20],
        altitude: malformedArray,
        velocity_smooth: malformedArray,
        heartrate: [140, 150, 160],
      };
      const summary = deriveStreamSensorSummary(streams as never);

      expect(() => buildSummaryStats(streams as never, summary)).not.toThrow();
      expect(buildSummaryStats(streams as never, summary)).toEqual({
        minElev: 0,
        maxElev: 0,
        overlays: { hr: { avg: 150, max: 160 } },
      });
    },
  );
  it("lets an owner preview override explicit sensor power", () => {
    const streams = {
      time: [0, 1], watts: [120, 130],
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
    const context = buildActivitySensorSelectionContext(
      undefined, undefined, { source: "virtualPowerOverride", time: [0, 1] },
    );
    expect(deriveStreamSensorSummary(streams as never, context)).toMatchObject({
      powerSource: "virtualPowerOverride",
      averagePower: 125,
      hasRejectedPowerStream: false,
    });
    expect(buildActivityAnalysisProjection(streams as never, context)).toMatchObject({
      streams: { watts: [120, 130], watts_calc: undefined },
      power: { values: [120, 130], time: [0, 1], complete: true },
    });
  });
  it("fails a malformed owner override closed instead of falling back to persisted power", () => {
    const streams = {
      time: [0, 1],
      watts: [120],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1],
        watts: [200, 210],
      },
    };
    const context = buildActivitySensorSelectionContext(
      undefined, undefined, { source: "virtualPowerOverride", time: [0, 1] },
    );
    expect(deriveStreamSensorSummary(streams as never, context)).toMatchObject({
      powerSource: null,
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      rejections: [expect.objectContaining({ source: "virtualPowerOverride", reason: "invalid_axis" })],
    });
    expect(buildActivityAnalysisProjection(streams as never, context)).toMatchObject({
      streams: { watts: undefined, watts_calc: undefined },
      power: undefined,
    });
  });
  it("preserves explicit sensor timestamps and marks missing channels incomplete", () => {
    const streams = {
      time: Array.from({ length: 20 }, (_, index) => index),
      heartrate: [150, 151, 152],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: Array.from({ length: 20 }, (_, index) => index),
        heartrate: [null, ...Array(19).fill(140)],
        watts: [...Array(19).fill(200), null],
      },
    };
    const projection = buildActivityAnalysisProjection(streams as never);

    expect(deriveStreamSensorSummary(streams as never)?.heartRateSource).toBe("sensorStreamsV1");
    expect(projection?.streams.heartrate).toBeUndefined();
    expect(projection?.heartRate).toMatchObject({
      values: Array(19).fill(140), time: Array.from({ length: 19 }, (_, index) => index + 1), complete: false, wholeSessionCoverageAccepted: true, timeOriginEpochMs: 1_700_000_000_000,
    });
    expect(projection?.power).toMatchObject({
      values: Array(19).fill(200), time: Array.from({ length: 19 }, (_, index) => index), complete: false, wholeSessionCoverageAccepted: true, timeOriginEpochMs: 1_700_000_000_000,
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
