import { expect, it } from "vitest";
import { sampleChartSeries as sampleRideChart } from "./seriesSampling";

const raw = Array.from({ length: 12000 }, (_, x) => ({ x, y: x }));
it("reduces 12000 samples to 153 interval sample means at 1400px, with a hard limit", () => {
  const sampled = sampleRideChart(raw, [0, 12000], 1400);
  expect(sampled).toHaveLength(153);
  expect(sampled[0]?.x).toBeCloseTo(12000 / 153 / 2);
  expect(sampled[0]?.y).toBe(39);
  expect(sampleRideChart(raw, [0, 12000], 280)).toHaveLength(29);
  expect(sampleRideChart(raw, [0, 12000], 10000)).toHaveLength(238);
  expect(raw[0]).toEqual({ x: 0, y: 0 });
});
it("restores original detail inside a sufficiently narrow viewport and preserves zero", () => {
  expect(sampleRideChart(raw, [0, 20], 1400)).toEqual(raw.slice(0, 21));
  expect(sampleRideChart(raw.map(point => ({ ...point, y: 0 })), [0, 12000], 280).every(point => point.y === 0)).toBe(true);
});
it("uses common bin centers for records with different sample spacing", () => {
  const first = sampleRideChart(raw, [0, 12000], 280);
  const second = sampleRideChart(raw.filter(point => point.x % 3 === 0), [0, 12000], 280);
  expect(second.map(point => point.x)).toEqual(first.map(point => point.x));
});
it("does not average across nulls, invalid values or missing bins", () => {
  const data = Array.from({ length: 100 }, (_, x) => ({ x, y: x === 15 ? null : x === 25 ? NaN : 10 }));
  const points = sampleRideChart(data, [0, 100], 70);
  expect(points.some(point => point.y === null)).toBe(true);
  const gap = sampleRideChart([...raw.slice(0, 100), { x: 6000, y: null }, ...raw.slice(11900)], [0, 12000], 280);
  expect(gap.slice(1, -1).every(point => point.y === null)).toBe(true);
});
it("preserves invalid coordinate and reversal boundaries without joining disconnected fragments", () => {
  const boundary = sampleRideChart([{ x: 0, y: 0 }, { x: NaN, y: 10 }, { x: 2, y: 20 }], [0, 3], 1400);
  expect(boundary).toEqual([{ x: 0, y: 0 }, { x: 0, y: null }, { x: 2, y: 20 }]);
  const backwards = sampleRideChart([...raw.slice(0, 100), ...raw.slice(0, 100)], [0, 100], 70);
  expect(backwards.every(point => point.y === null)).toBe(true);
});

it("clips continuous sparse edges at viewport boundaries without losing the line", () => {
  expect(sampleRideChart([{ x: 0, y: 100 }, { x: 10, y: 200 }], [4, 6], 1400)).toEqual([{ x: 4, y: 140 }, { x: 6, y: 160 }]);
  expect(sampleRideChart([{ x: 0, y: 100 }, { x: 5, y: null }, { x: 10, y: 200 }], [4, 6], 1400)).toEqual([{ x: 5, y: null }]);
  expect(sampleRideChart([{ x: 0, y: 100 }, { x: NaN, y: 150 }, { x: 10, y: 200 }], [4, 6], 1400)).toEqual([]);
});
it("does not put offscreen anchors into averages or reconnect an offscreen reversal", () => {
  const points = [{ x: -1, y: 100000 }, ...Array.from({ length: 1000 }, (_, x) => ({ x, y: 0 })), { x: 1001, y: 100000 }];
  const sampled = sampleRideChart(points, [-0.5, 1000.5], 1400);
  expect(sampled).toHaveLength(155);
  expect(sampled.slice(1, -1).every(point => point.y === 0)).toBe(true);
  const reverse = sampleRideChart([...raw.slice(0, 100), ...raw.slice(0, 100)], [10, 20], 28);
  expect(reverse.every(point => point.y == null)).toBe(true);
});

it("never attaches a clipped boundary from a disconnected offscreen fragment", () => {
  const points = [{ x: 0, y: 100 }, { x: 10, y: 200 }, { x: NaN, y: null }, { x: 5, y: 50 }, { x: 6, y: 60 }];
  expect(sampleRideChart(points, [4, 7], 1400)).toEqual([{ x: 5, y: 50 }, { x: 6, y: 60 }]);
});

const longRideWithBriefGaps = Array.from({ length: 314 * 60 + 1 }, (_, second) => ({ x: second / 60, y: second > 0 && second % 600 === 0 ? null : 100 }));
it.each([220, 290, 1200])("keeps continuous runs visible around brief gaps at %ipx with the opt-in policy", width => {
  const result = sampleRideChart(longRideWithBriefGaps, [0, 314], width, "preserve-runs");
  expect(result.filter(point => point.y != null).length).toBeGreaterThan(0);
  expect(result.filter(point => point.y === null)).toHaveLength(31);
  expect(result.length).toBeLessThanOrEqual(238 + 3 * 32);
  for (let index = 0; index < result.length - 1; index++) {
    const first = result[index]!, next = result[index + 1]!;
    if (first.y == null || next.y == null) continue;
    expect(longRideWithBriefGaps.some(point => point.y == null && point.x > first.x && point.x < next.x)).toBe(false);
  }
  expect(longRideWithBriefGaps[0]).toEqual({ x: 0, y: 100 });
});
it("retains the existing conservative policy for callers that do not opt in", () => {
  expect(sampleRideChart(longRideWithBriefGaps, [0, 314], 220).every(point => point.y == null)).toBe(true);
});

it("uses two actual run endpoints inside one bin without averaging across the gap", () => {
  const points = Array.from({ length: 101 }, (_, x) => ({ x, y: x === 2 ? null : x < 2 ? 0 : 200 }));
  const sampled = sampleRideChart(points, [0, 100], 70, "preserve-runs");
  expect(sampled.slice(0, 3)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: null }]);
  expect(sampled.slice(3).every(point => point.y === 200)).toBe(true);
  expect(sampled.find(point => point.y === 200)!.x).toBeGreaterThan(2);
});
it("does not manufacture missing bins, singleton line widths or more points than the source", () => {
  const sparse = [{ x: 0, y: 0 }, ...Array.from({ length: 100 }, (_, x) => ({ x: 100 + x, y: 10 }))];
  const sampled = sampleRideChart(sparse, [0, 200], 70, "preserve-runs");
  expect(sampled.every(point => point.y != null)).toBe(true);
  const alternating = Array.from({ length: 1001 }, (_, x) => ({ x, y: x % 2 === 0 ? 0 : null }));
  expect(sampleRideChart(alternating, [0, 1000], 70, "preserve-runs")).toEqual(alternating);
});
it("keeps zoomed boundaries within the viewport, clips only continuous edges and leaves missing/zero intact", () => {
  const narrowed = sampleRideChart(longRideWithBriefGaps, [100.1, 120.1], 220, "preserve-runs");
  expect(narrowed.filter(point => point.y === null)).toHaveLength(2);
  expect(narrowed.every(point => Number.isFinite(point.x) && point.x >= 100.1 && point.x <= 120.1)).toBe(true);
  expect(narrowed.filter(point => point.y != null).every(point => point.y === 100)).toBe(true);
  const original = [{ x: 0, y: 0 }, { x: 1, y: null }, { x: 2, y: 0 }];
  expect(sampleRideChart(original, [0, 2], 220, "preserve-runs")).toEqual(original);
  expect(sampleRideChart([{ x: 0, y: 100 }, { x: 10, y: 200 }], [4, 6], 220, "preserve-runs")).toEqual([{ x: 4, y: 140 }, { x: 6, y: 160 }]);
  expect(sampleRideChart([{ x: 0, y: 100 }, { x: NaN, y: 150 }, { x: 10, y: 200 }], [4, 6], 220, "preserve-runs")).toEqual([]);
});
it("preserves invalid and reversed-coordinate run boundaries when opting in", () => {
  const input = [...raw.slice(0, 100), { x: NaN, y: 10 }, ...raw.slice(0, 100)];
  const sampled = sampleRideChart(input, [0, 100], 70, "preserve-runs");
  const gapIndex = sampled.findIndex(point => point.y === null);
  expect(gapIndex).toBeGreaterThan(0);
  expect(gapIndex).toBeLessThan(sampled.length - 1);
  expect(sampled.every(point => Number.isFinite(point.x))).toBe(true);
});
