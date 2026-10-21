import type { ActivityStreams } from "@shared/types";
import { activityVisualRangeStats } from "./activityVisualRangeStats";
const origin = 1700000000000;
function fixture(time = Array.from({ length: 20 }, (_, index) => index)) {
  return { userId: "owner", time, distance: time.map((_, index) => index * 100), altitude: time.map((_, index) => index + 10),
    watts: time.map(() => 100), heartrate: time.map(() => 120), cadence: time.map(() => 80), velocity_smooth: time.map(() => 3) } satisfies ActivityStreams;
}
it("uses exact source indices, includes measured zero power and excludes missing HR zero", () => {
  const streams = fixture(); streams.watts[10] = 0; streams.watts[11] = 300; streams.heartrate[9] = 100; streams.heartrate[10] = 0; streams.heartrate[11] = 140;
  const before = structuredClone(streams);
  const stats = activityVisualRangeStats(streams, { legacyDurationSec: 20, explicitDurationSec: 20, activityStartTime: origin }, streams.time, [0, 9, 12, 19], [1, 2]);
  expect(stats?.overlays.power?.avg).toBeCloseTo(400 / 3);
  expect(stats?.overlays.power?.max).toBe(300);
  expect(stats?.overlays.hr?.avg).toBe(120);
  expect(stats?.overlays.hr?.max).toBe(140);
  expect(stats?.minElev).toBe(19); expect(stats?.maxElev).toBe(21);
  expect(streams).toEqual(before);
});
it("weights irregular source times and does not extend the last observed boundary", () => {
  const time = [0, 1, 3, ...Array.from({ length: 17 }, (_, index) => index + 4)];
  const streams = fixture(time); streams.watts[2] = 300; streams.watts[3] = 999;
  const stats = activityVisualRangeStats(streams, { legacyDurationSec: 21, explicitDurationSec: 21, activityStartTime: origin }, time, [0, 1, 3, 19], [1, 2]);
  expect(stats?.overlays.power?.avg).toBeCloseTo(500 / 3); expect(stats?.overlays.power?.max).toBe(300);
});
it("rejects unknown source mapping and does not infer statistics from sparse chart points", () => {
  const streams = fixture();
  expect(activityVisualRangeStats(streams, undefined, streams.time, [-1, 2], [0, 1])).toBeNull();
  expect(activityVisualRangeStats(streams, undefined, null, [0, 19], [0, 1])).toBeNull();
  streams.watts = [100, 200];
  const result = activityVisualRangeStats(streams, { legacyDurationSec: 20, explicitDurationSec: 20 }, streams.time, [0, 19], [0, 1]);
  expect(result?.overlays.power).toBeUndefined();
});
it("keeps explicit sensor timestamps independent of the lower-rate route array", () => {
  const streams = fixture(Array.from({ length: 10 }, (_, index) => index * 2));
  const power = Array(20).fill(100); power[3] = 500;
  const actual = { ...streams, watts: undefined, sensorStreamsV1: { version: 1, timeUnit: "relative_seconds", time: Array.from({ length: 20 }, (_, index) => index), resolutionSeconds: 1, timeOriginEpochMs: origin, watts: power } } as ActivityStreams;
  const result = activityVisualRangeStats(actual, { legacyDurationSec: 20, explicitDurationSec: 20, activityStartTime: origin }, streams.time, [0, 1, 3, 9], [1, 2]);
  expect(result?.overlays.power?.avg).toBe(200); expect(result?.overlays.power?.max).toBe(500);
});

it("uses contributing native sample footprints for maximum when the window starts inside a long slot", () => {
  const streams = fixture(Array.from({ length: 20 }, (_, index) => index / 4));
  const actual = { ...streams, watts: undefined, sensorStreamsV1: { version: 1, timeUnit: "relative_seconds", time: [0, 1, 2, 3, 4], resolutionSeconds: 1, timeOriginEpochMs: origin, watts: [100, 200, 300, 400, 500] } } as ActivityStreams;
  const result = activityVisualRangeStats(actual, { legacyDurationSec: 5, explicitDurationSec: 5, activityStartTime: origin }, streams.time, [0, 1, 2, 19], [1, 2]);
  expect(result?.overlays.power).toEqual({ avg: 100, max: 100 });
});
it("does not hold route samples across long unobserved gaps or invent end observations", () => {
  const time = [0, 1, 2, ...Array.from({ length: 17 }, (_, index) => index + 20)];
  const streams = fixture(time); streams.watts[2] = 999; streams.watts[3] = 300;
  const result = activityVisualRangeStats(streams, { legacyDurationSec: 37, explicitDurationSec: 37, activityStartTime: origin }, time, [0, 1, 4, 19], [1, 2]);
  expect(result?.overlays.power).toEqual({ avg: 200, max: 999 });
});
