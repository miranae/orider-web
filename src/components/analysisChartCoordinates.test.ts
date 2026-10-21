import { analysisCoordinates, analysisDomain, analysisPlotPoints, nearestAnalysisIndex, orderedChartRange } from "./analysisChartCoordinates";
it("preserves duplicate distance and raw sample indices across distance/time axis changes", () => {
  const data = [{ distance: 0 }, { distance: 100 }, { distance: 100 }, { distance: 300 }];
  expect(analysisCoordinates(data, [0, 30, 60, 90], true, false).values).toEqual([0, 0.5, 1, 1.5]);
  expect(analysisCoordinates(data, undefined, false, false).values).toEqual([0, 0.1, 0.1, 0.3]);
  expect(analysisCoordinates(data, [0, 30, 30, 90], true, false).elapsed).toBe(false);
  expect(analysisDomain([0, 0.1, 0.1, 0.3], [1, 2])).toEqual([0, 0.3]);
  expect(nearestAnalysisIndex([0, 0.5, 1, 1.5], 1)).toBe(2);
  expect(orderedChartRange([3, 1], 4)).toEqual([1, 3]);
});
it("retains nulls and measured zeros and visibly breaks unobserved intervals", () => {
  const points = analysisPlotPoints([0, 1, 2, 20, 21], [0, 100, null, 250, 0]);
  expect(points.filter(point => point.sourceIndex !== null).map(point => point.y)).toEqual([0, 100, null, 250, 0]);
  expect(points.find(point => point.sourceIndex === null)).toEqual({ x: 11, y: null, sourceIndex: null });
});
