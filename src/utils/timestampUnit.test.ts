import { describe, expect, it } from "vitest";

import {
  buildSampledData,
  deriveStreamSensorSummary,
} from "../features/activity/detail/activityDetailDerived";
import { makeRelSecAt } from "./streamTime";
import { detectTimestampUnit, normalizeEpochMilliseconds } from "./timestampUnit";

const EPOCH_MILLISECONDS = [
  Date.UTC(1990, 0, 1),
  Date.UTC(2000, 0, 1),
  Date.UTC(2001, 0, 1),
  Date.UTC(2026, 6, 29),
];

describe("timestamp unit normalization", () => {
  it.each(EPOCH_MILLISECONDS)("recognizes %i as epoch milliseconds", (epochMs) => {
    expect(detectTimestampUnit(epochMs)).toBe("epoch_ms");
    expect(normalizeEpochMilliseconds(epochMs)).toBe(epochMs);
    expect(normalizeEpochMilliseconds(epochMs)).toBe(epochMs);
  });

  it.each(EPOCH_MILLISECONDS)("recognizes the seconds form of %i", (epochMs) => {
    const epochSec = epochMs / 1000;
    expect(detectTimestampUnit(epochSec)).toBe("epoch_sec");
    expect(normalizeEpochMilliseconds(epochSec)).toBe(epochMs);
    expect(normalizeEpochMilliseconds(epochSec)).toBe(epochMs);
  });

  it("normalizes pre-2001 millisecond route clocks for duration and sensor selection", () => {
    const origin = Date.UTC(1990, 0, 1);
    const relativeTime = Array.from({ length: 40 }, (_, index) => index < 2 ? index : index + 2);
    const time = relativeTime.map((seconds) => origin + seconds * 1000);
    const relSecAt = makeRelSecAt(time);
    expect(time.map((_, index) => relSecAt(index))).toEqual(relativeTime);

    const heartrate = Array(40).fill(100);
    heartrate[1] = 200;

    const summary = deriveStreamSensorSummary({
      time,
      distance: relativeTime.map((seconds) => seconds * 10),
      heartrate,
    } as never);
    expect(summary?.averageHeartRate).toBeCloseTo(4_500 / 42, 8);
    const sampled = buildSampledData({
      time,
      distance: relativeTime.map((seconds) => seconds * 10),
      heartrate,
    } as never);
    expect(sampled).toHaveLength(40);
    expect(sampled[0]?.heartRate).toBe(100);
  });

  // EF 시간가중 테스트는 서버 정본(functions advancedMetrics)으로 옮겨졌다 (#2437).
});
