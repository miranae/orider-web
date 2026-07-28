import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  buildSampledData,
  getAvailableOverlays,
  selectActivityHeartRateStream,
  selectActivityPowerStream,
} from "./activityDetailDerived";

const context = {
  legacyDurationSec: 3,
  explicitDurationSec: 3,
  activityStartTime: 1_700_000_000_000,
};

function streamsWithExplicit(version: unknown, channel: "watts" | "heartrate", value: unknown) {
  return {
    distance: [0, 1, 2],
    time: [0, 1, 2],
    watts: [200, 210, 220],
    heartrate: [140, 150, 160],
    sensorStreamsV1: {
      version,
      timeUnit: "relative_seconds",
      resolutionSeconds: 1,
      timeOriginEpochMs: 1_700_000_000_000,
      time: [0, 1, 2],
      [channel]: value,
    },
  };
}

describe("invalid sensorStreamsV1 version authority", () => {
  it.each([undefined, "1", 2, "tampered"])(
    "rejects measured power for version %j without falling back",
    (version) => {
      const streams = streamsWithExplicit(version, "watts", [0, 210, 220]);
      const selected = selectActivityPowerStream(streams as never, context);

      expect(selected).toMatchObject({
        source: null,
        hasCandidate: true,
        rejection: { channel: "power", source: "sensorStreamsV1", reason: "invalid_metadata" },
      });
      expect(buildActivityAnalysisProjection(streams as never, context)?.streams.watts).toBeUndefined();
      expect(getAvailableOverlays(buildSampledData(streams as never, context)).map(({ key }) => key))
        .not.toContain("power");
    },
  );

  it.each([undefined, "1", 2, "tampered"])(
    "rejects measured heart rate for version %j without falling back",
    (version) => {
      const streams = streamsWithExplicit(version, "heartrate", [140, 150, 160]);
      const selected = selectActivityHeartRateStream(streams as never, context);

      expect(selected).toMatchObject({
        source: null,
        hasRejectedMeasurement: true,
        rejection: { channel: "heart_rate", source: "sensorStreamsV1", reason: "invalid_metadata" },
      });
      expect(buildActivityAnalysisProjection(streams as never, context)?.streams.heartrate).toBeUndefined();
      expect(getAvailableOverlays(buildSampledData(streams as never, context)).map(({ key }) => key))
        .not.toContain("hr");
    },
  );

  it.each([
    ["power", "watts", "not-an-array"],
    ["power", "watts", Object.assign(new Array(3), { 1: 200 })],
    ["heart rate", "heartrate", "not-an-array"],
    ["heart rate", "heartrate", Object.assign(new Array(3), { 1: 150 })],
  ] as const)("classifies malformed %s on an unsupported version as metadata rejection", (_name, channel, value) => {
    const streams = streamsWithExplicit(99, channel, value);
    const selected = channel === "watts"
      ? selectActivityPowerStream(streams as never, context)
      : selectActivityHeartRateStream(streams as never, context);

    expect(selected.rejection).toMatchObject({ source: "sensorStreamsV1", reason: "invalid_metadata" });
  });

  it.each([undefined, null, [], [null, null, null]])(
    "allows power fallback when invalid-version power is genuinely unmeasured: %j",
    (value) => {
      expect(selectActivityPowerStream(
        streamsWithExplicit(99, "watts", value) as never,
        context,
      ).source).toBe("watts");
    },
  );

  it.each([undefined, null, [], [null, null, null]])(
    "allows heart-rate fallback when invalid-version heart rate is genuinely unmeasured: %j",
    (value) => {
      expect(selectActivityHeartRateStream(
        streamsWithExplicit(99, "heartrate", value) as never,
        context,
      ).source).toBe("heartrate");
    },
  );

  it("keeps channel authority independent on the same invalid payload", () => {
    const streams = streamsWithExplicit(99, "watts", [200, 210, 220]);
    streams.sensorStreamsV1.heartrate = [null, null, null];

    expect(selectActivityPowerStream(streams as never, context).source).toBeNull();
    expect(selectActivityHeartRateStream(streams as never, context).source).toBe("heartrate");
  });

  it("does not let an override bypass an attempted invalid-version power channel", () => {
    const streams = streamsWithExplicit("tampered", "watts", [0, 210, 220]);
    expect(selectActivityPowerStream(streams as never, {
      ...context,
      powerOverride: { source: "virtualPowerOverride", time: streams.time },
    })).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "invalid_metadata" },
    });
  });
});
