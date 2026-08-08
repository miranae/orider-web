import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  selectActivityHeartRateStream,
  selectActivityPowerStream,
} from "./activityDetailDerived";

const ORIGIN_EPOCH_MS = 1_700_000_000_000;

/**
 * The uploader thins sensor samples to fit the inline stream budget, and auto-pause
 * or a sensor dropout removes slots on its own. Both leave a V1 axis whose retained
 * seconds are exact but no longer contiguous.
 */
function sparseStreams(axis: readonly number[], routeLength = axis[axis.length - 1]! + 1) {
  return {
    distance: Array.from({ length: routeLength }, (_, index) => index * 10),
    time: Array.from({ length: routeLength }, (_, index) => index),
    sensorStreamsV1: {
      version: 1,
      timeUnit: "relative_seconds",
      resolutionSeconds: 1,
      timeOriginEpochMs: ORIGIN_EPOCH_MS,
      time: [...axis],
      heartrate: axis.map(() => 140),
      watts: axis.map(() => 200),
    },
  };
}

describe("sparse V1 sensor axis", () => {
  it("accepts an axis with missing seconds while the retained slots describe the span", () => {
    const streams = sparseStreams([0, 1, 2, 4, 5, 6, 8, 9]);

    const power = selectActivityPowerStream(streams as never);
    expect(power.source).toBe("sensorStreamsV1");
    expect(power.rejection).toBeUndefined();
    expect(power.finiteValues).toHaveLength(8);

    const heartRate = selectActivityHeartRateStream(streams as never);
    expect(heartRate.source).toBe("sensorStreamsV1");
    expect(heartRate.rejection).toBeUndefined();
  });

  it("breaks the measured runs at every axis gap", () => {
    const projection = buildActivityAnalysisProjection(sparseStreams([0, 1, 2, 4, 5, 6, 8, 9]) as never);

    // 구멍은 null 값과 똑같이 미측정 시간이다 — 끊지 않으면 롤링 윈도우가 일시정지를
    // 사이에 둔 두 구간을 하나의 연속 노력으로 이어붙인다.
    expect(projection?.power).toMatchObject({
      time: [0, 1, 2, 4, 5, 6, 8, 9],
      segmentStarts: [true, false, false, true, false, false, true, false],
    });
    expect(projection?.heartRate?.segmentStarts).toEqual(
      [true, false, false, true, false, false, true, false],
    );
  });

  it("keeps durationsSec, its sum and fullSessionDurationSec self-consistent", () => {
    const projection = buildActivityAnalysisProjection(sparseStreams([0, 1, 2, 4, 5, 6, 8, 9]) as never);
    const power = projection?.power;

    expect(power?.durationsSec).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(power?.durationsSec?.reduce((sum, value) => sum + value, 0))
      .toBe(power?.fullSessionDurationSec);
    expect(power?.fullSessionDurationSec).toBe(8);
  });

  it("leaves a contiguous axis as a single run", () => {
    const projection = buildActivityAnalysisProjection(sparseStreams([0, 1, 2, 3, 4]) as never);

    expect(projection?.power).toMatchObject({
      fullSessionDurationSec: 5,
      segmentStarts: [true, false, false, false, false],
    });
  });

  it("accepts an axis exactly at the coverage boundary and rejects one slot below", () => {
    // span 9, 남은 초 5 → 5 >= 4.5 수용. 같은 span 에 4 슬롯이면 4 < 4.5 거절.
    expect(selectActivityPowerStream(sparseStreams([0, 2, 4, 6, 8], 9) as never).source)
      .toBe("sensorStreamsV1");
    expect(selectActivityPowerStream(sparseStreams([0, 2, 4, 8], 9) as never)).toMatchObject({
      source: null,
      rejection: { reason: "sparse_axis" },
    });
  });

  it("rejects an axis whose retained seconds no longer cover the span", () => {
    const streams = sparseStreams([0, 5, 10, 15], 20);

    expect(selectActivityPowerStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "sparse_axis", axisLength: 4, channelLength: 4 },
    });
    expect(selectActivityHeartRateStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "sparse_axis" },
    });
  });

  it("still rejects a descending axis as malformed", () => {
    const streams = sparseStreams([0, 2, 1, 4], 5);

    expect(selectActivityPowerStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "invalid_axis" },
    });
  });

  it("still rejects a repeated timestamp as malformed", () => {
    const streams = sparseStreams([0, 1, 1, 2], 4);

    expect(selectActivityPowerStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "invalid_axis" },
    });
  });
});
