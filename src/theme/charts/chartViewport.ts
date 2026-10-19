export type ChartRange = readonly [number, number];

/** 시작 시점의 범위와 plot 폭에 누적 픽셀 차이를 대응시킨다. 변경된 scale은 사용하지 않는다. */
export function panChartRange(start: ChartRange, deltaPixels: number, plotWidth: number, bounds: ChartRange): [number, number] {
  if (!Number.isFinite(deltaPixels) || !Number.isFinite(plotWidth) || plotWidth <= 0) return [start[0], start[1]];
  const span = Math.min(start[1] - start[0], bounds[1] - bounds[0]);
  const left = Math.max(bounds[0], Math.min(start[0] - deltaPixels * span / plotWidth, bounds[1] - span));
  return [left, left + span];
}
