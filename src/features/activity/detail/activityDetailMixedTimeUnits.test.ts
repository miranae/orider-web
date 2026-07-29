import { describe, expect, it, vi } from "vitest";

import {
  buildActivityAnalysisProjection,
  buildSampledData,
  deriveStreamSensorSummary,
  expectedActivityDurationSec,
  getAvailableOverlays,
} from "./activityDetailDerived";
import { resolveLegacySensorMeasurementAxis } from "./legacySensorCoverage";
import {
  createSensorRejectionLogState,
  reportSensorRejectionsOnce,
} from "./activitySensorRejectionLogging";

describe("activity detail timestamp-unit consistency", () => {
  it.each([
    ["relative to epoch seconds", [0, 1, 1_700_000_000]],
    ["epoch seconds to milliseconds", [1_700_000_000, 1_700_000_001, 1_700_000_002_000]],
    ["relative threshold transition", [99_999_998, 99_999_999, 100_000_000]],
  ])("rejects a mixed %s route axis", (_case, time) => {
    const heartrate = [140, 141, 142];
    const streams = {
      time,
      distance: [0, 1, 2],
      watts: [200, 210, 220],
      heartrate,
      cadence: [80, 81, 82],
    };
    const summary = deriveStreamSensorSummary(streams as never)!;
    const projection = buildActivityAnalysisProjection(streams as never)!;
    const chart = buildSampledData(streams as never);
    const logger = vi.fn();
    reportSensorRejectionsOnce("mixed-axis", summary.rejections, createSensorRejectionLogState(), logger);

    expect(expectedActivityDurationSec({ time } as never)).toBeUndefined();
    expect(resolveLegacySensorMeasurementAxis({ values: heartrate, routeTime: time })).toBeUndefined();
    expect(summary).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
      hasCadenceStream: false,
      hasRejectedCadenceStream: true,
      averagePower: null,
      averageHeartRate: null,
      averageCadence: null,
    });
    expect(summary.rejections.map(({ channel }) => channel).sort())
      .toEqual(["cadence", "heart_rate", "power"]);
    expect(projection).toMatchObject({
      streams: { watts: undefined, watts_calc: undefined, heartrate: undefined, cadence: undefined },
      power: undefined,
      heartRate: undefined,
    });
    expect(getAvailableOverlays(chart).map(({ key }) => key))
      .not.toEqual(expect.arrayContaining(["power", "hr", "cadence"]));
    for (const rejection of summary.rejections) {
      expect(Object.keys(rejection)).toEqual(expect.arrayContaining(["channel", "source", "reason"]));
      expect(Object.keys(rejection)).not.toEqual(expect.arrayContaining(["time", "values"]));
    }
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain(String(time.at(-1)));
    expect(logged).not.toContain("210");
    expect(logged).not.toContain("141");
    expect(logged).not.toContain("81");
  });

  it.each([
    ["fractional epoch seconds", [631_152_000, 631_152_001.0005, 631_152_002]],
    ["fractional epoch milliseconds", [631_152_000_000, 631_152_001_000.5, 631_152_002_000]],
  ])("rejects %s", (_case, time) => {
    expect(expectedActivityDurationSec({ time } as never)).toBeUndefined();
    expect(resolveLegacySensorMeasurementAxis({ values: [140, 141, 142], routeTime: time }))
      .toBeUndefined();
  });

  it.each([
    ["relative seconds", [0, 1, 2]],
    ["fractional relative seconds", [0, 0.25, 0.5]],
    ["pre-2001 epoch seconds", [631_152_000, 631_152_001, 631_152_002]],
    ["pre-2001 epoch milliseconds", [631_152_000_000, 631_152_001_000, 631_152_002_000]],
  ])("keeps a valid pure %s axis", (_case, time) => {
    const expectedDuration = time[1]! - time[0]! === 0.25 ? 0.75 : 3;
    expect(expectedActivityDurationSec({ time } as never)).toBe(expectedDuration);
    expect(resolveLegacySensorMeasurementAxis({ values: [140, 141, 142], routeTime: time }))
      .toMatchObject(expectedDuration === 3
        ? { time: [0, 1, 2], durationSec: 3, durationsSec: [1, 1, 1] }
        : { time: [0, 0.25, 0.5], durationSec: 0.75, durationsSec: [0.25, 0.25, 0.25] });
  });
});
