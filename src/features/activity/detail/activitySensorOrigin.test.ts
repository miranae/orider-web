import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  deriveStreamSensorSummary,
} from "./activityDetailDerived";

const relativeTime = Array.from({ length: 20 }, (_, index) => index);

function streamsWithOrigin(routeTime: number[], timeOriginEpochMs: number) {
  return {
    time: routeTime,
    sensorStreamsV1: {
      version: 1,
      timeUnit: "relative_seconds",
      resolutionSeconds: 1,
      timeOriginEpochMs,
      time: relativeTime,
      watts: Array(20).fill(200),
    },
  };
}

describe("SensorStreamsV1 origin provenance", () => {
  it("accepts the app epoch-second origin when the first retained sample starts at second one", () => {
    const activityStartTime = 1_786_271_559_903;
    const streams = {
      time: [0, 1, 2],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_786_271_560_000,
        time: [1, 2, 3],
        heartrate: [140, 145, 150],
        watts: [180, 190, 200],
      },
    };

    expect(deriveStreamSensorSummary(streams as never, undefined, activityStartTime)).toMatchObject({
      heartRateSource: "sensorStreamsV1",
      powerSource: "sensorStreamsV1",
      hasRejectedHeartRateStream: false,
      hasRejectedPowerStream: false,
    });
    expect(buildActivityAnalysisProjection(streams as never, undefined, activityStartTime))
      .toMatchObject({
        heartRate: { values: streams.sensorStreamsV1.heartrate, time: [1, 2, 3] },
        power: { values: streams.sensorStreamsV1.watts, time: [1, 2, 3] },
      });
  });

  it.each([
    ["inside boundary", 999, true],
    ["exact boundary", 1_000, false],
    ["beyond boundary", 1_001, false],
  ])("applies the V1 epoch-second origin tolerance at the %s", (_case, offsetMs, accepted) => {
    const activityStartTime = 1_700_000_000_000;
    const streams = {
      time: [0, 1, 2],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: activityStartTime + offsetMs,
        time: [1, 2, 3],
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
  });

  it("falls back to trustworthy legacy sensors when V1 origin provenance conflicts", () => {
    const activityStartTime = 1_700_000_000_000;
    const streams = {
      time: [0, 1, 2],
      heartrate: [150, 155, 160],
      watts: [200, 210, 220],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: activityStartTime + 10_000,
        time: [0, 1, 2],
        heartrate: [140, 145, 150],
        watts: [180, 190, 200],
      },
    };

    const summary = deriveStreamSensorSummary(streams as never, undefined, activityStartTime);
    expect(summary).toMatchObject({
      heartRateSource: "heartrate",
      powerSource: "watts",
      hasRejectedHeartRateStream: false,
      hasRejectedPowerStream: false,
      rejections: [
        { channel: "heart_rate", source: "sensorStreamsV1", reason: "origin_mismatch" },
        { channel: "power", source: "sensorStreamsV1", reason: "origin_mismatch" },
      ],
    });
  });

  it("keeps duration-mismatched V1 channels fail-closed even with valid legacy sensors", () => {
    const activityStartTime = 1_700_000_000_000;
    const streams = {
      time: Array.from({ length: 20 }, (_, index) => index),
      heartrate: Array(20).fill(155),
      watts: Array(20).fill(210),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: activityStartTime,
        time: Array.from({ length: 60 }, (_, index) => index),
        heartrate: Array(60).fill(145),
        watts: Array(60).fill(190),
      },
    };

    const summary = deriveStreamSensorSummary(streams as never, undefined, activityStartTime);
    expect(summary).toMatchObject({
      heartRateSource: null,
      powerSource: null,
      hasRejectedHeartRateStream: true,
      hasRejectedPowerStream: true,
      rejections: [
        { channel: "heart_rate", source: "sensorStreamsV1", reason: "duration_mismatch" },
        { channel: "power", source: "sensorStreamsV1", reason: "duration_mismatch" },
      ],
    });
    expect(buildActivityAnalysisProjection(streams as never, undefined, activityStartTime))
      .toMatchObject({ heartRate: undefined, power: undefined });
  });

  it("fails closed when V1 origin conflicts and the legacy sensors are untrustworthy", () => {
    const activityStartTime = 1_700_000_000_000;
    const streams = {
      time: Array.from({ length: 60 }, (_, index) => index),
      heartrate: [150, Number.NaN],
      watts: [200, -1],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: activityStartTime + 60_000,
        time: Array.from({ length: 60 }, (_, index) => index),
        heartrate: Array(60).fill(150),
        watts: Array(60).fill(200),
      },
    };

    expect(deriveStreamSensorSummary(streams as never, undefined, activityStartTime)).toMatchObject({
      heartRateSource: null,
      powerSource: null,
      hasRejectedHeartRateStream: true,
      hasRejectedPowerStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never, undefined, activityStartTime))
      .toMatchObject({ heartRate: undefined, power: undefined });
  });

  it("uses activity start instead of a delayed first GPS fix", () => {
    const activityStartMs = 1_700_000_000_000;
    const delayedRoute = relativeTime.map((seconds) => activityStartMs + 5_000 + seconds * 1000);

    expect(deriveStreamSensorSummary(
      streamsWithOrigin(delayedRoute, activityStartMs) as never,
      undefined,
      activityStartMs,
    )?.powerSource).toBe("sensorStreamsV1");
  });

  it("does not let a matching GPS fix override a conflicting activity start", () => {
    const activityStartMs = 1_700_000_000_000;
    const routeStartMs = activityStartMs + 60_000;
    const route = relativeTime.map((seconds) => routeStartMs + seconds * 1000);
    const summary = deriveStreamSensorSummary(
      streamsWithOrigin(route, routeStartMs) as never,
      undefined,
      activityStartMs,
    )!;

    expect(summary.powerSource).toBeNull();
    expect(summary.rejections).toContainEqual(expect.objectContaining({ reason: "origin_mismatch" }));
  });

  it("falls back to an absolute route origin when activity start is absent", () => {
    const routeStartMs = 1_700_000_000_000;
    const route = relativeTime.map((seconds) => routeStartMs + seconds * 1000);

    expect(deriveStreamSensorSummary(
      streamsWithOrigin(route, routeStartMs) as never,
    )?.powerSource).toBe("sensorStreamsV1");
    expect(deriveStreamSensorSummary(
      streamsWithOrigin(route, routeStartMs + 10_000) as never,
    )?.rejections).toContainEqual(expect.objectContaining({ reason: "origin_mismatch" }));
  });

  it("keeps the first retained sensor bucket correlated with a delayed GPS fix when activity start is absent", () => {
    const originMs = 1_700_000_000_000;
    const delayedRelativeTime = relativeTime.map((seconds) => seconds + 5);
    const delayedRoute = relativeTime.map((seconds) => originMs + 5_000 + seconds * 1000);
    const streams = streamsWithOrigin(delayedRoute, originMs);
    streams.sensorStreamsV1.time = delayedRelativeTime;

    expect(deriveStreamSensorSummary(streams as never)?.powerSource).toBe("sensorStreamsV1");
  });

  it("accepts self-contained V1 origin metadata when only a relative route exists", () => {
    expect(deriveStreamSensorSummary(
      streamsWithOrigin(relativeTime, 1_700_000_000_000) as never,
    )?.powerSource).toBe("sensorStreamsV1");
  });
});
