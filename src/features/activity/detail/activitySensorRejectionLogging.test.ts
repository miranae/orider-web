import { describe, expect, it, vi } from "vitest";

import {
  createSensorRejectionLogState,
  reportSensorRejectionsOnce,
} from "./activitySensorRejectionLogging";

describe("activity sensor rejection logging", () => {
  it("logs each bounded activity/channel/reason combination only once", () => {
    const logger = vi.fn();
    const state = createSensorRejectionLogState();
    const rejection = {
      channel: "power" as const,
      source: "sensorStreamsV1" as const,
      reason: "invalid_axis" as const,
      axisLength: 7_200,
      channelLength: 3_600,
    };

    reportSensorRejectionsOnce("activity-1", [rejection], state, logger);
    reportSensorRejectionsOnce("activity-1", [rejection], state, logger);

    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(
      "ActivityPage.sensorStreamRejected.power.invalid_axis",
      expect.objectContaining({ message: "Rejected activity sensor stream" }),
      {
        activityId: "activity-1",
        channel: "power",
        sensorSource: "sensorStreamsV1",
        reason: "invalid_axis",
        axisLength: 7_200,
        channelLength: 3_600,
      },
    );
  });

  it("never forwards raw sensor arrays or values", () => {
    const logger = vi.fn();
    const state = createSensorRejectionLogState();
    const rawSentinel = "PRIVATE_SENSOR_VALUE_987654";

    reportSensorRejectionsOnce("a".repeat(256), [{
      channel: "heart_rate",
      source: "legacy",
      reason: "invalid_channel",
      axisLength: Number.POSITIVE_INFINITY,
      channelLength: -12,
      rawValues: [rawSentinel],
      time: [rawSentinel],
    } as never], state, logger);

    const [, error, context] = logger.mock.calls[0]!;
    expect((context as { activityId: string }).activityId).toHaveLength(128);
    expect(context).toEqual({
      activityId: "a".repeat(128),
      channel: "heart_rate",
      sensorSource: "legacy",
      reason: "invalid_channel",
      axisLength: undefined,
      channelLength: 0,
    });
    expect(JSON.stringify({ error: (error as Error).message, context })).not.toContain(rawSentinel);
  });

  it("resets dedupe for a different activity without growing unbounded", () => {
    const logger = vi.fn();
    const state = createSensorRejectionLogState();
    const rejection = {
      channel: "cadence" as const,
      source: "legacy" as const,
      reason: "insufficient_coverage" as const,
    };

    reportSensorRejectionsOnce("activity-1", [rejection], state, logger);
    reportSensorRejectionsOnce("activity-2", [rejection], state, logger);

    expect(logger).toHaveBeenCalledTimes(2);
    expect(state.activityId).toBe("activity-2");
    expect(state.keys.size).toBe(1);
  });
});
