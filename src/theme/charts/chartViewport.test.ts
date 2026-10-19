import { expect, it } from 'vitest';
import { panChartRange } from './chartViewport';

it('uses cumulative displacement from the starting range in both directions and clamps without changing its span', () => {
  expect(panChartRange([2, 6], 25, 100, [0, 10])).toEqual([1, 5]);
  expect(panChartRange([2, 6], -25, 100, [0, 10])).toEqual([3, 7]);
  expect(panChartRange([2, 6], 1000, 100, [0, 10])).toEqual([0, 4]);
  expect(panChartRange([2, 6], -1000, 100, [0, 10])).toEqual([6, 10]);
  expect(panChartRange([2, 6], 25, 0, [0, 10])).toEqual([2, 6]);
});
