import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  deriveStreamSensorSummary,
} from "./activityDetailDerived";
import { calculateWorkKj } from "../../../utils/advancedMetrics";
import { calculateNP } from "../../../utils/powerMetrics";
import { calculatePowerCurve } from "../../../utils/powerCurve";
import { calculatePowerZoneDistribution } from "../../../utils/zoneAnalysis";

const time = Array.from({ length: 100 }, (_, index) => index);
const zeroAndPower = [...Array(60).fill(0), ...Array(40).fill(200)];

describe("activity power zero provenance", () => {
  it.each(["watts", "watts_calc"] as const)(
    "preserves zero-watt coasting after legacy %s passes its reliability gate",
    (source) => {
      const streams = { time, [source]: zeroAndPower };
      const summary = deriveStreamSensorSummary(streams as never)!;
      const projection = buildActivityAnalysisProjection(streams as never)!;

      expect(summary).toMatchObject({
        powerSource: source,
        averagePower: 80,
        maxPower: 200,
      });
      expect(projection.power).toMatchObject({
        values: zeroAndPower,
        complete: true,
        wholeSessionCoverageAccepted: true,
      });
      const timing = {
        durationsSec: projection.power?.durationsSec,
        segmentStarts: projection.power?.segmentStarts,
      };
      expect(projection.power?.segmentStarts?.filter(Boolean)).toHaveLength(1);
      expect(calculateWorkKj(zeroAndPower, time, timing)).toBe(8);
      expect(calculateNP(zeroAndPower, time, timing)).toBeCloseTo(138.8863, 4);
      expect(calculatePowerZoneDistribution(zeroAndPower, 250, time, timing)
        .reduce((seconds, zone) => seconds + zone.seconds, 0)).toBe(100);
      expect(calculatePowerCurve(zeroAndPower, time, timing))
        .toContainEqual({ durationSeconds: 60, maxPower: 133 });
    },
  );

  it("preserves the same zero watts as measured coasting in SensorStreamsV1", () => {
    const activityStartTime = 1_700_000_000_000;
    const streams = {
      time,
      watts: Array(100).fill(300),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: activityStartTime,
        time,
        watts: zeroAndPower,
      },
    };
    const context = {
      activityStartTime,
      explicitDurationSec: 100,
      legacyDurationSec: 100,
    };
    const summary = deriveStreamSensorSummary(streams as never, context)!;
    const projection = buildActivityAnalysisProjection(streams as never, context)!;

    expect(summary).toMatchObject({
      powerSource: "sensorStreamsV1",
      averagePower: 80,
      maxPower: 200,
    });
    expect(projection.power).toMatchObject({
      values: zeroAndPower,
      complete: true,
    });
  });
});
