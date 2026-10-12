import { describe, expect, it } from "vitest";
import { recordedLapElapsedRange, resolveRecordedLapRange } from "./recordedLapRange";
const epoch = 1791375809000;
const context = { source: "orider", activityStartMs: epoch, durationSec: 100 };
const lap = { number: 2, startTimeMs: epoch + 20000, endTimeMs: epoch + 40000, durationMs: 12000, distanceKm: 0.4 };
const time = Array.from({ length: 101 }, (_, index) => epoch + index * 1000);
describe("stored lap boundaries", () => {
  it("uses explicit epoch boundaries including stops, never durationMs or the previous lap", () => {
    expect(resolveRecordedLapRange(lap, context, time)).toEqual({ startOffsetSec: 20, endOffsetSec: 40 });
    expect(resolveRecordedLapRange({ ...lap, number: 99, durationMs: 1 }, context, time)).toEqual({ startOffsetSec: 20, endOffsetSec: 40 });
  });
  it("maps a uniquely matching legacy summary to its original stored lap only", () => {
    const legacy = { number: 2, durationMs: 12000, distanceKm: 0.4 };
    expect(resolveRecordedLapRange(legacy, context, time, [lap])).toEqual({ startOffsetSec: 20, endOffsetSec: 40 });
    expect(resolveRecordedLapRange(legacy, context, time, [lap, lap])).toBeNull();
    expect(resolveRecordedLapRange(legacy, context, time, [{ ...lap, durationMs: 12001 }])).toBeNull();
    expect(resolveRecordedLapRange({ ...lap, endTimeMs: undefined }, context, time, [lap])).toBeNull();
  });
  it.each([{ startTimeMs: undefined, endTimeMs: undefined }, { startTimeMs: 0 }, { endTimeMs: epoch + 19000 },
    { endTimeMs: epoch + 101000 }, { startTimeMs: epoch - 1 }, { startTimeMs: NaN }, { endTimeMs: Infinity }, { endTimeMs: epoch + 40000.5 }])("rejects invalid or missing explicit boundaries %j", delta => {
    expect(recordedLapElapsedRange({ ...lap, ...delta }, context)).toBeNull();
  });
  it("rejects provider/relative clocks, truncated observations, reversed time and gaps", () => {
    expect(resolveRecordedLapRange(lap, { ...context, source: "strava" }, time)).toBeNull();
    expect(resolveRecordedLapRange(lap, context, time.map(value => (value - epoch) / 1000))).toBeNull();
    expect(resolveRecordedLapRange(lap, context, time.slice(21))).toBeNull();
    expect(resolveRecordedLapRange(lap, context, time.slice().reverse())).toBeNull();
    expect(resolveRecordedLapRange(lap, context, time.filter((_, index) => index < 25 || index > 35))).toBeNull();
    const sparse = time.slice(); delete sparse[25];
    expect(resolveRecordedLapRange(lap, context, sparse)).toBeNull();
  });
  it("does not require moving distance or GPS; retains fractional stored millisecond offsets", () => {
    expect(resolveRecordedLapRange({ ...lap, startTimeMs: epoch + 20250, endTimeMs: epoch + 39750 }, context, time))
      .toEqual({ startOffsetSec: 20.25, endOffsetSec: 39.75 });
  });
});
