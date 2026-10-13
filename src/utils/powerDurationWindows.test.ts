import { describe, expect, it } from "vitest";
import { calculatePowerWindow, maxWeightedAverage, powerDurationGrid, validPowerWindowInput, type AvailablePowerWindowInput } from "./powerDurationWindows";
export const input = (): AvailablePowerWindowInput => ({ state: "available", reason: null, inputRevision: "a".repeat(64), algorithmVersion: "sample-time-weighted-v1", timingBasis: "elapsed", scope: "selected_range", rangeStartElapsedSec: 10, rangeEndElapsedSec: 20, provenance: "orider_native", startsSec: [10, 12, 15], durationsSec: [2, 3, 5], watts: [0, 100, 200], segmentStarts: [true, false, false], longestContinuousSeconds: 10 });
describe("exact sample-owned elapsed power windows", () => {
  it("weights fractional boundaries, includes0W and scans windows ending at boundaries", () => {
    expect(maxWeightedAverage([0, 100, 0], [.25, .25, .25], .5)).toBe(50);
    expect(maxWeightedAverage([0, 100], [10, 1], 10)).toBe(10);
    expect(maxWeightedAverage([800, 0, 0], [.25, 1.25, 1.5], 3)).toBeCloseTo(800 / 12);
    expect(calculatePowerWindow(input(), 10)?.maxPower).toBe(130);
  });
  it("does not cross discontinuities or missing intervals and never compresses time", () => {
    expect(maxWeightedAverage([100, 200], [5, 5], 6, [true, true])).toBeNull();
    expect(maxWeightedAverage([100, Number.NaN, 200], [5, 5, 5], 6)).toBeNull();
    expect(maxWeightedAverage([100, 200], [5, 5], 5, [true, true])).toBe(200);
    const value = input(); value.segmentStarts = [true, true, false]; value.longestContinuousSeconds = 8;
    expect(validPowerWindowInput(value)).toBe(true); expect(calculatePowerWindow(value, 9)).toBeNull();
  });
  it("compares against interval-integral boundary candidates on irregular durations", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const values = Array.from({ length: 9 }, (_, i) => ((seed * 17 + i * 43) % 300));
      const durations = values.map((_, i) => ((seed + i * 3) % 7 + 1) / 4);
      const boundaries = [0]; durations.forEach(value => boundaries.push(boundaries.at(-1)! + value));
      const total = boundaries.at(-1)!;
      for (const window of [.25, 1.75, total]) {
        const starts = boundaries.flatMap(value => [value, value - window]).filter(value => value >= 0 && value + window <= total);
        const expected = Math.max(...starts.map(start => values.reduce((sum, value, i) => sum + value * Math.max(0, Math.min(start + window, boundaries[i + 1]!) - Math.max(start, boundaries[i]!)), 0) / window));
        expect(maxWeightedAverage(values, durations, window)).toBeCloseTo(expected, 8);
      }
    }
  });
  it("retains all existing supported11durations and computes loggrid no more than64", () => {
    const grid = powerDurationGrid(10001.25);
    [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 10001.25].forEach(value => expect(grid).toContain(value));
    expect(grid.length).toBeLessThanOrEqual(64); expect(new Set(grid).size).toBe(grid.length);
    expect(calculatePowerWindow({ ...input(), durationsSec: [7200], startsSec: [10], watts: [250], segmentStarts: [true], longestContinuousSeconds: 7200 }, 5400)?.maxPower).toBe(250);
    expect(powerDurationGrid(0)).toEqual([]); expect(calculatePowerWindow(input(), Number.NaN)).toBeNull();
  });
  it("rejects a4MiB payload even below100kpoints and keeps fractional contiguous boundaries valid", () => {
    const value = input(), n = 100000;
    Object.assign(value, { rangeStartElapsedSec: 0, rangeEndElapsedSec: n + 1, startsSec: Array.from({ length: n }, (_, i) => i + .123456789123), durationsSec: Array(n).fill(1), watts: Array(n).fill(1.234567891234567e200), segmentStarts: Array.from({ length: n }, (_, i) => i === 0), longestContinuousSeconds: n });
    expect(new TextEncoder().encode(JSON.stringify(value)).byteLength).toBeGreaterThan(4 * 1024 * 1024);
    expect(validPowerWindowInput(value)).toBe(false);
    const fractional = { ...input(), startsSec: [10, 10.3], durationsSec: [.3, .7], watts: [0, 100], segmentStarts: [true, false], rangeEndElapsedSec: 11, longestContinuousSeconds: 1 };
    expect(validPowerWindowInput(fractional)).toBe(true); expect(calculatePowerWindow(fractional, 1)?.maxPower).toBeCloseTo(70);
  });
  it.each(["provenance", "axis", "overlap", "gap", "negative", "length", "longest", "cap"])("rejects invalid %s without fallback", kind => {
    const value = input();
    if (kind === "provenance") Object.assign(value, { provenance: "unknown" });
    if (kind === "axis") value.startsSec[0] = 0;
    if (kind === "overlap") value.startsSec[1] = 11;
    if (kind === "gap") value.startsSec[1] = 13;
    if (kind === "negative") value.watts[0] = -1;
    if (kind === "length") value.durationsSec.pop();
    if (kind === "longest") value.longestContinuousSeconds = 20;
    if (kind === "cap") value.watts = Array(100001).fill(0);
    expect(validPowerWindowInput(value)).toBe(false);
  });
});
