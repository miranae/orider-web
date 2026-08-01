import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  buildActivitySensorSelectionContext,
  deriveStreamSensorSummary,
} from "./activityDetailDerived";

const LENGTH = 3_127;
const DURATION_MS = 3_605_722;
const ORIGIN_MS = Date.UTC(2026, 6, 30, 10, 0, 0);

function productionLikeTime(): number[] {
  const time = Array.from(
    { length: LENGTH },
    (_, index) => ORIGIN_MS + Math.round(index * DURATION_MS / (LENGTH - 1)),
  );
  time[3_067] = time[3_066]!;
  return time;
}

function selectionContext(time: readonly number[]) {
  return buildActivitySensorSelectionContext(
    { ridingTimeMillis: DURATION_MS, elapsedTimeMillis: DURATION_MS },
    ORIGIN_MS,
    { source: "virtualPowerOverride", time: [...time] },
  );
}

describe("legacy activity axes with an isolated duplicate timestamp", () => {
  it("keeps broad cadence while sparse heart-rate and persisted power remain rejected", () => {
    const time = productionLikeTime();
    const cadence = Array(LENGTH).fill(75);
    cadence.fill(0, 0, 22);
    cadence.fill(0, 3_065);
    const watts = Array(LENGTH).fill(0);
    watts[154] = 6;

    const streams = {
      time,
      distance: Array.from({ length: LENGTH }, (_, index) => index * 5),
      cadence,
      heartrate: Array(LENGTH).fill(0),
      watts,
    };
    const context = buildActivitySensorSelectionContext(
      { ridingTimeMillis: DURATION_MS, elapsedTimeMillis: DURATION_MS },
      ORIGIN_MS,
    );

    expect(deriveStreamSensorSummary(streams as never, context)).toMatchObject({
      hasCadenceStream: true,
      hasRejectedCadenceStream: false,
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
      hasPowerStream: false,
      hasRejectedPowerStream: true,
    });
    const projection = buildActivityAnalysisProjection(streams as never, context)!;
    expect(projection.streams).toMatchObject({
      cadence,
      heartrate: undefined,
      watts: undefined,
    });
    expect(projection.streams.time).toHaveLength(LENGTH);
    expect(projection.streams.time![3_067]).toBe(time[3_067]! + 1);
    expect(projection.streams.time!.at(-1)).toBe(time.at(-1));
  });

  it("accepts a matching virtual-power override without changing sample alignment", () => {
    const time = productionLikeTime();
    const watts = Array(LENGTH).fill(125);
    const summary = deriveStreamSensorSummary({ time, watts } as never, selectionContext(time));

    expect(summary).toMatchObject({
      powerSource: "virtualPowerOverride",
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      averagePower: 125,
    });
    const projection = buildActivityAnalysisProjection({ time, watts } as never, selectionContext(time))!;
    expect(projection.power?.values).toEqual(watts);
    expect(projection.power?.time).toHaveLength(LENGTH);
    expect(projection.power?.time[3_067]).toBeCloseTo((time[3_067]! - ORIGIN_MS) / 1000 + 0.001, 9);
    expect(projection.power?.time.at(-1)).toBe((time.at(-1)! - ORIGIN_MS) / 1000);
  });

  it.each([
    ["decreasing", [0, 2, 1, 3]],
    ["all equal", [1, 1, 1, 1]],
    ["repeated plateau", [0, 1, 1, 1, 2]],
    ["mixed units", [ORIGIN_MS, ORIGIN_MS + 1_000, 2]],
  ])("continues to reject a %s axis", (_label, time) => {
    expect(deriveStreamSensorSummary({ time, watts: Array(time.length).fill(125) } as never, {
      legacyDurationSec: 4,
      powerOverride: { source: "virtualPowerOverride", time },
    })).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      rejections: [expect.objectContaining({ reason: "invalid_axis" })],
    });
  });
});
