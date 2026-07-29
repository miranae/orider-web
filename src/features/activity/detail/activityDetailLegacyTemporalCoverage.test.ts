import { describe, expect, it, vi } from "vitest";

import {
  buildActivityAnalysisProjection,
  buildSampledData,
  deriveStreamSensorSummary,
  getAvailableOverlays,
} from "./activityDetailDerived";
import {
  createSensorRejectionLogState,
  reportSensorRejectionsOnce,
} from "./activitySensorRejectionLogging";

function valuesAt(length: number, indexes: readonly number[], value: number): number[] {
  const values = Array(length).fill(0);
  for (const index of indexes) values[index] = value;
  return values;
}

function spreadIndexes(length: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.round(index * (length - 1) / (count - 1)));
}

describe("activity detail legacy temporal coverage integration", () => {
  it("accepts report-like counts only when they represent the whole trusted session", () => {
    const length = 1_077;
    const time = Array.from({ length }, (_, index) => index);
    const distance = Array.from({ length }, (_, index) => index * 5);
    const spread = {
      time,
      distance,
      heartrate: valuesAt(length, spreadIndexes(length, 54), 150),
      cadence: valuesAt(length, spreadIndexes(length, 228), 85),
    };
    const clustered = {
      time,
      distance,
      heartrate: valuesAt(length, Array.from({ length: 54 }, (_, index) => 400 + index), 150),
      cadence: valuesAt(length, Array.from({ length: 228 }, (_, index) => 400 + index), 85),
    };

    expect(deriveStreamSensorSummary(spread as never)).toMatchObject({
      averageHeartRate: 150,
      averageCadence: 85,
      hasRejectedHeartRateStream: false,
      hasRejectedCadenceStream: false,
    });
    expect(deriveStreamSensorSummary(clustered as never)).toMatchObject({
      averageHeartRate: null,
      averageCadence: null,
      hasRejectedHeartRateStream: true,
      hasRejectedCadenceStream: true,
      rejections: [
        expect.objectContaining({ channel: "heart_rate", reason: "insufficient_measurements" }),
        expect.objectContaining({ channel: "cadence", reason: "insufficient_measurements" }),
      ],
    });
    expect(buildActivityAnalysisProjection(clustered as never)?.streams).toMatchObject({
      heartrate: undefined,
      cadence: undefined,
    });
    expect(getAvailableOverlays(buildSampledData(clustered as never)).map(({ key }) => key))
      .not.toEqual(expect.arrayContaining(["hr", "cadence"]));
  });

  it("logs temporal rejection without forwarding sensor values", () => {
    const length = 100;
    const summary = deriveStreamSensorSummary({
      time: Array.from({ length }, (_, index) => index),
      heartrate: valuesAt(length, [40, 41, 42], 187),
    } as never)!;
    const logger = vi.fn();

    reportSensorRejectionsOnce("activity-temporal", summary.rejections, createSensorRejectionLogState(), logger);

    expect(logger).toHaveBeenCalledWith(
      "ActivityPage.sensorStreamRejected.heart_rate.insufficient_measurements",
      expect.any(Error),
      expect.objectContaining({
        activityId: "activity-temporal",
        channel: "heart_rate",
        reason: "insufficient_measurements",
        channelLength: length,
      }),
    );
    expect(JSON.stringify(logger.mock.calls)).not.toContain("187");
  });

  it.each([
    [0, Number.NaN, 2],
    [0, 1, 1],
    [0, 2, 1],
  ])("rejects fully positive sensors when aligned distance accompanies malformed time %j", (time) => {
    const streams = {
      time,
      distance: [0, 1, 2],
      heartrate: [150, 151, 152],
      cadence: [80, 81, 82],
    };

    expect(deriveStreamSensorSummary(streams as never)).toMatchObject({
      hasHeartRateStream: false,
      hasCadenceStream: false,
      hasRejectedHeartRateStream: true,
      hasRejectedCadenceStream: true,
      averageHeartRate: null,
      averageCadence: null,
    });
    expect(buildActivityAnalysisProjection(streams as never)?.streams).toMatchObject({
      heartrate: undefined,
      cadence: undefined,
    });
  });
});
