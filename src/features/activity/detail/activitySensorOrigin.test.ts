import { describe, expect, it } from "vitest";

import { deriveStreamSensorSummary } from "./activityDetailDerived";

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

  it("accepts self-contained V1 origin metadata when only a relative route exists", () => {
    expect(deriveStreamSensorSummary(
      streamsWithOrigin(relativeTime, 1_700_000_000_000) as never,
    )?.powerSource).toBe("sensorStreamsV1");
  });
});
