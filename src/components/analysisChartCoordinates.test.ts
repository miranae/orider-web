import { analysisCoordinates, analysisDomain, analysisPlotPoints, analysisObservedElevationPoints, nearestAnalysisIndex, orderedChartRange } from "./analysisChartCoordinates";
import { rawPartChartStreams } from "../__tests__/fixtures/rawPartChartStreams";
import { markRawPartStreams } from "../services/activityStreamSource";
import { buildSampledData } from "../features/activity/detail/activityDetailDerived";
it("preserves duplicate distance and raw sample indices across distance/time axis changes", () => {
  const data = [{ distance: 0 }, { distance: 100 }, { distance: 100 }, { distance: 300 }];
  expect(analysisCoordinates(data, [0, 30, 60, 90], true, false).values).toEqual([0, 0.5, 1, 1.5]);
  expect(analysisCoordinates(data, undefined, false, false).values).toEqual([0, 0.1, 0.1, 0.3]);
  expect(analysisCoordinates(data, [0, 30, 30, 90], true, false).elapsed).toBe(false);
  expect(analysisDomain([0, 0.1, 0.1, 0.3], [1, 2])).toEqual([0, 0.3]);
  expect(nearestAnalysisIndex([0, 0.5, 1, 1.5], 1)).toBe(2);
  expect(orderedChartRange([3, 1], 4)).toEqual([1, 3]);
});
it("draws observed raw-part altitude at exact source positions and leaves long time gaps open on either axis", () => {
  const streams = markRawPartStreams(rawPartChartStreams(), "a".repeat(64));
  const sampled = buildSampledData(streams);
  const elapsed = sampled.map(point => streams.time![point.sourceIndex!]!);
  const altitude = sampled.map(point => streams.altitude![point.sourceIndex!] ?? null);
  for (const axis of [sampled.map(point => point.distance / 1000), elapsed.map(time => time / 60)]) {
    const points = analysisObservedElevationPoints(axis, altitude, elapsed);
    expect(points.filter(point => point.y != null)).toHaveLength(106);
    expect(points.filter(point => point.sourceIndex === null)).toHaveLength(1);
    const gapIndex = points.findIndex(point => point.sourceIndex === null);
    expect(elapsed[points[gapIndex - 1]!.sourceIndex!]).toBe(120);
    expect(elapsed[points[gapIndex + 1]!.sourceIndex!]).toBe(200);
    expect(points.some((point, index) => index > 0 && point.y != null && points[index - 1]!.y != null)).toBe(true);
    for (const point of points) if (point.sourceIndex != null) {
      expect(point.x).toBe(axis[point.sourceIndex]);
      expect(point.y).toBe(streams.altitude![sampled[point.sourceIndex]!.sourceIndex!]);
    }
  }
});
it("retains nulls and measured zeros and visibly breaks unobserved intervals", () => {
  const points = analysisPlotPoints([0, 1, 2, 20, 21], [0, 100, null, 250, 0]);
  expect(points.filter(point => point.sourceIndex !== null).map(point => point.y)).toEqual([0, 100, null, 250, 0]);
  expect(points.find(point => point.sourceIndex === null)).toEqual({ x: 11, y: null, sourceIndex: null });
});
